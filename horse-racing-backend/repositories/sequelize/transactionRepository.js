'use strict';

/**
 * Sequelize-backed transactionHistory repository.
 * Append-only audit log; we never update or delete rows here.
 */

const path = require('path');
process.env.NODE_PATH = path.resolve(__dirname, '..', '..', 'node_modules');
require('module').Module._initPaths();

const { loadSequelizeModels } = require('../../models/sequelize/index.js');
const { toPlain } = require('./adapter');

let _models = null;
function models() {
    if (!_models) _models = loadSequelizeModels().models;
    return _models;
}

async function createLog(data) {
    const M = models();
    const created = await M.TransactionHistory.create(data);
    return toPlain(created);
}

async function checkExistsByReference(referenceId) {
    const M = models();
    const row = await M.TransactionHistory.findOne({ where: { reference_id: referenceId } });
    return toPlain(row);
}

async function findByUserId(userId, filter = {}, { skip = 0, limit = 20 } = {}) {
    const M = models();
    const rows = await M.TransactionHistory.findAll({
        where: { user_id: userId, ...filter },
        order: [['created_at', 'DESC']],
        offset: skip,
        limit
    });
    return rows.map(toPlain);
}

async function countByUserId(userId, filter = {}) {
    const M = models();
    return M.TransactionHistory.count({ where: { user_id: userId, ...filter } });
}

module.exports = {
    createLog,
    checkExistsByReference,
    findByUserId,
    countByUserId
};