const { DepositRequest } = require('../models');
const { DEPOSIT_REQUEST_STATUS } = require('../constants/depositStatuses');

/**
 * Persist a new deposit order with PENDING status.
 *
 * @param {object} data - { order_id, user_id, package_id, total_vnd, total_token, payment_method }
 * @returns {Promise<DepositRequest>}
 */
async function createOrder(data) {
  return DepositRequest.create(data);
}

/**
 * Find a deposit order by its internal order_id.
 * Returns null if the order does not exist.
 *
 * @param {string} orderId
 * @returns {Promise<DepositRequest|null>}
 */
async function findByOrderId(orderId) {
  return DepositRequest.findOne({ order_id: orderId });
}

/**
 * Atomically mark an order as SUCCESS and record the gateway's transaction reference.
 * Only transitions orders that are currently PENDING — if the order is already in a
 * final state (SUCCESS | FAILED), the filter will not match and null is returned.
 * This is the database-level idempotency guard.
 *
 * @param {string} orderId
 * @param {string} gatewayReferenceId - Transaction ID from the payment gateway
 * @returns {Promise<DepositRequest|null>} Updated order, or null if already settled
 */
async function markSuccess(orderId, gatewayReferenceId) {
  return DepositRequest.findOneAndUpdate(
    {
      order_id: orderId,
      status: DEPOSIT_REQUEST_STATUS.PENDING   // Guard: only update PENDING orders
    },
    {
      status: DEPOSIT_REQUEST_STATUS.SUCCESS,
      gateway_reference_id: gatewayReferenceId
    },
    { returnDocument: 'after', runValidators: true }
  );
}

/**
 * Atomically mark an order as FAILED with an optional reason note.
 * Only transitions orders that are currently PENDING.
 *
 * @param {string} orderId
 * @param {string} [note] - Human-readable failure reason
 * @returns {Promise<DepositRequest|null>}
 */
async function markFailed(orderId, note) {
  return DepositRequest.findOneAndUpdate(
    {
      order_id: orderId,
      status: DEPOSIT_REQUEST_STATUS.PENDING   // Guard: only update PENDING orders
    },
    {
      status: DEPOSIT_REQUEST_STATUS.FAILED,
      ...(note ? { note } : {})
    },
    { returnDocument: 'after', runValidators: true }
  );
}

/**
 * Rollback a SUCCESS order back to PENDING in the rare case where
 * token crediting or TransactionHistory logging failed AFTER the order
 * was already marked SUCCESS.
 * This is the compensating operation — called only from the webhook error path.
 *
 * @param {string} orderId
 * @returns {Promise<DepositRequest|null>}
 */
async function rollbackToFailed(orderId) {
  return DepositRequest.findOneAndUpdate(
    {
      order_id: orderId,
      status: DEPOSIT_REQUEST_STATUS.SUCCESS   // Only rollback recently-SUCCESS orders
    },
    {
      status: DEPOSIT_REQUEST_STATUS.FAILED,
      note: 'SYSTEM: Rolled back — token credit or audit log failed after SUCCESS mark'
    },
    { returnDocument: 'after' }
  );
}

/**
 * Return paginated order history for a user, newest first.
 *
 * @param {string|ObjectId} userId
 * @param {{ skip: number, limit: number }} pagination
 * @returns {Promise<DepositRequest[]>}
 */
async function findByUserId(userId, { skip = 0, limit = 20 } = {}) {
  return DepositRequest.find({ user_id: userId })
    .sort({ created_at: -1 })
    .skip(skip)
    .limit(limit)
    .lean();
}

/**
 * Count deposit orders for a user (used for pagination metadata).
 *
 * @param {string|ObjectId} userId
 * @returns {Promise<number>}
 */
async function countByUserId(userId) {
  return DepositRequest.countDocuments({ user_id: userId });
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
