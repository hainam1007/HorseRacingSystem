'use strict';

/**
 * Sequelize-backed depositRequest repository.
 *
 * Atomic semantics:
 *   - `markSuccess(orderId, gatewayReferenceId)` uses a conditional UPDATE with
 *     WHERE `status = 'pending'`. Returns null when the order is already
 *     settled (idempotency guard).
 *   - `markFailed` and `rollbackToFailed` use the same pattern.
 */

const path = require('path');
process.env.NODE_PATH = path.resolve(__dirname, '..', '..', 'node_modules');
require('module').Module._initPaths();

const { Op } = require('sequelize');
const { loadSequelizeModels } = require('../../models/sequelize/index.js');
const { toPlain } = require('./adapter');
const { DEPOSIT_REQUEST_STATUS } = require('../../constants/depositStatuses');

let _models = null;
function models() {
    if (!_models) _models = loadSequelizeModels().models;
    return _models;
}

async function createOrder(data) {
    const M = models();
    const created = await M.DepositRequest.create(data);
    return toPlain(created);
}

async function findByOrderId(orderId) {
    const M = models();
    const row = await M.DepositRequest.findOne({ where: { order_id: orderId } });
    return toPlain(row);
}

async function markSuccess(orderId, gatewayReferenceId) {
    const M = models();
    const [affected] = await M.DepositRequest.update(
        {
            status: DEPOSIT_REQUEST_STATUS.SUCCESS,
            gateway_reference_id: gatewayReferenceId
        },
        { where: { order_id: orderId, status: DEPOSIT_REQUEST_STATUS.PENDING } }
    );
    if (affected === 0) return null;
    return findByOrderId(orderId);
}

async function markFailed(orderId, note) {
    const M = models();
    const updateData = { status: DEPOSIT_REQUEST_STATUS.FAILED };
    if (note) updateData.note = note;
    const [affected] = await M.DepositRequest.update(
        updateData,
        { where: { order_id: orderId, status: DEPOSIT_REQUEST_STATUS.PENDING } }
    );
    if (affected === 0) return null;
    return findByOrderId(orderId);
}

async function rollbackToFailed(orderId) {
    const M = models();
    const [affected] = await M.DepositRequest.update(
        {
            status: DEPOSIT_REQUEST_STATUS.FAILED,
            note: 'SYSTEM: Rolled back — token credit or audit log failed after SUCCESS mark'
        },
        { where: { order_id: orderId, status: DEPOSIT_REQUEST_STATUS.SUCCESS } }
    );
    if (affected === 0) return null;
    return findByOrderId(orderId);
}

async function findByUserId(userId, { skip = 0, limit = 20 } = {}) {
    const M = models();
    const rows = await M.DepositRequest.findAll({
        where: { user_id: userId },
        order: [['created_at', 'DESC']],
        offset: skip,
        limit
    });
    return rows.map(toPlain);
}

async function countByUserId(userId) {
    const M = models();
    return M.DepositRequest.count({ where: { user_id: userId } });
}

module.exports = {
    createOrder,
    findByOrderId,
    markSuccess,
    markFailed,
    rollbackToFailed,
    findByUserId,
    countByUserId
};