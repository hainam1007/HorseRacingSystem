'use strict';

/**
 * Sequelize-backed wallet repository.
 *
 * Atomic semantics preserved using SQL fragments:
 *   - `upsertWallet` → `Wallet.findOrCreate({ where: { user_id } })`
 *   - `incrementToken` → 2-step: SELECT for balance_before, then
 *     `UPDATE … SET token_balance = token_balance + N` (atomic via SQL).
 *   - `deductTokenIfSufficient` → 2-step: SELECT balance, then conditional
 *     UPDATE only when `token_balance >= amount` (race-safe via WHERE clause).
 */

const path = require('path');
process.env.NODE_PATH = path.resolve(__dirname, '..', '..', 'node_modules');
require('module').Module._initPaths();

const { Op } = require('sequelize');
const { loadSequelizeModels } = require('../../models/sequelize/index.js');
const { toPlain } = require('./adapter');

let _bundle = null;
function bundle() {
    if (!_bundle) _bundle = loadSequelizeModels();
    return _bundle;
}
function models() { return bundle().models; }
function sequelize() { return bundle().sequelize; }

async function upsertWallet(userId) {
    const M = models();
    const [wallet] = await M.Wallet.findOrCreate({
        where: { user_id: userId },
        defaults: { user_id: userId, token_balance: 0 }
    });
    return toPlain(wallet);
}

async function incrementToken(userId, amount) {
    const M = models();
    const current = await M.Wallet.findOne({ where: { user_id: userId } });
    if (!current) return null;

    const balanceBefore = parseFloat(current.token_balance);

    // Atomic increment via SQL fragment (race-safe)
    await M.Wallet.update(
        { token_balance: sequelize().literal(`token_balance + ${Number(amount)}`) },
        { where: { user_id: userId } }
    );

    const updated = await M.Wallet.findOne({ where: { user_id: userId } });
    return {
        balanceBefore,
        balanceAfter: parseFloat(updated.token_balance),
        wallet: toPlain(updated)
    };
}

async function deductTokenIfSufficient(userId, amount) {
    const M = models();
    if (Number(amount) <= 0) throw new Error('amount must be positive');

    const current = await M.Wallet.findOne({ where: { user_id: userId } });
    if (!current || parseFloat(current.token_balance) < Number(amount)) return null;

    const balanceBefore = parseFloat(current.token_balance);

    // Atomic conditional decrement: only succeeds when balance is still >= amount.
    const [affectedCount] = await M.Wallet.update(
        { token_balance: sequelize().literal(`token_balance - ${Number(amount)}`) },
        { where: { user_id: userId, token_balance: { [Op.gte]: Number(amount) } } }
    );

    if (affectedCount === 0) {
        return null;
    }

    const updated = await M.Wallet.findOne({ where: { user_id: userId } });
    return {
        balanceBefore,
        balanceAfter: parseFloat(updated.token_balance),
        wallet: toPlain(updated)
    };
}

module.exports = {
    upsertWallet,
    incrementToken,
    deductTokenIfSufficient
};