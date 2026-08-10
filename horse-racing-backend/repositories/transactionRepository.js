const { TransactionHistory } = require('../models');

/**
 * Persist a single immutable transaction log entry.
 *
 * @param {object} data — must include: user_id, transaction_type, amount,
 *                        direction, balance_before, balance_after, status
 * @returns {Promise<TransactionHistory>}
 */
async function createLog(data) {
  return TransactionHistory.create(data);
}

/**
 * Check whether a transaction with the given idempotency key already exists.
 * Returns the existing document (truthy) or null (falsy).
 *
 * @param {string} referenceId
 * @returns {Promise<TransactionHistory|null>}
 */
async function checkExistsByReference(referenceId) {
  return TransactionHistory.findOne({ reference_id: referenceId }).lean();
}

/**
 * Return a paginated, filtered list of transactions for a user.
 *
 * @param {string|ObjectId} userId
 * @param {object} filter — optional extra filter fields (e.g. { transaction_type })
 * @param {{ skip: number, limit: number }} pagination
 * @returns {Promise<TransactionHistory[]>}
 */
async function findByUserId(userId, filter = {}, { skip = 0, limit = 20 } = {}) {
  return TransactionHistory.find({ user_id: userId, ...filter })
    .sort({ created_at: -1 })
    .skip(skip)
    .limit(limit)
    .lean();
}

/**
 * Count transactions for a user (used for pagination metadata).
 *
 * @param {string|ObjectId} userId
 * @param {object} filter
 * @returns {Promise<number>}
 */
async function countByUserId(userId, filter = {}) {
  return TransactionHistory.countDocuments({ user_id: userId, ...filter });
}

module.exports = {
  createLog,
  checkExistsByReference,
  findByUserId,
  countByUserId
};
