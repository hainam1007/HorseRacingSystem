const { RewardItem, RedemptionHistory } = require('../models');

/**
 * Find a single active reward item by its ID.
 * Returns null if the item does not exist or is inactive.
 *
 * @param {string|ObjectId} itemId
 * @returns {Promise<RewardItem|null>}
 */
async function findActiveItem(itemId) {
  return RewardItem.findOne({ _id: itemId, is_active: true }).lean();
}

/**
 * Return all active reward items ordered by token_price ascending.
 *
 * @returns {Promise<RewardItem[]>}
 */
async function findAllActiveItems() {
  return RewardItem.find({ is_active: true }).sort({ token_price: 1 }).lean();
}

/**
 * Atomically decrement stock by 1 — only when stock is currently > 0.
 * Returns the updated document, or null if stock was already 0 (out of stock)
 * or the item was not found.
 *
 * This is the key concurrency guard: the filter `{ stock: { $gt: 0 } }` ensures
 * stock never goes below 0 even when multiple requests fire simultaneously.
 *
 * @param {string|ObjectId} itemId
 * @returns {Promise<RewardItem|null>}
 */
async function deductStock(itemId) {
  return RewardItem.findOneAndUpdate(
    { _id: itemId, is_active: true, stock: { $gt: 0 } },
    { $inc: { stock: -1 } },
    { returnDocument: 'after', runValidators: true }
  );
}

/**
 * Persist a new redemption record.
 *
 * @param {object} data
 * @returns {Promise<RedemptionHistory>}
 */
async function createRedemption(data) {
  return RedemptionHistory.create(data);
}

/**
 * Paginated redemption history for a user with item details populated.
 *
 * @param {string|ObjectId} userId
 * @param {{ skip: number, limit: number }} pagination
 * @returns {Promise<RedemptionHistory[]>}
 */
async function findRedemptionsByUserId(userId, { skip = 0, limit = 20 } = {}) {
  return RedemptionHistory.find({ user_id: userId })
    .sort({ created_at: -1 })
    .skip(skip)
    .limit(limit)
    .populate('item_id', 'name description token_price image_url')
    .lean();
}

/**
 * Count redemptions for a user (used for pagination metadata).
 *
 * @param {string|ObjectId} userId
 * @returns {Promise<number>}
 */
async function countRedemptionsByUserId(userId) {
  return RedemptionHistory.countDocuments({ user_id: userId });
}

// ─── ADMIN METHODS ────────────────────────────────────────────────────────────

async function createItem(data) {
  return RewardItem.create(data);
}

async function updateItem(id, data) {
  return RewardItem.findByIdAndUpdate(id, { $set: data }, { new: true, runValidators: true });
}

async function findItemById(id) {
  return RewardItem.findById(id).lean();
}

async function findItemByName(name) {
  // Case-insensitive exact match
  return RewardItem.findOne({ name: { $regex: new RegExp(`^${name}$`, 'i') } }).lean();
}

async function findAllItemsAdmin(filter, sort, skip = 0, limit = 20) {
  return RewardItem.find(filter)
    .sort(sort)
    .skip(skip)
    .limit(limit)
    .lean();
}

async function countAllItemsAdmin(filter) {
  return RewardItem.countDocuments(filter);
}

async function updateStockAdmin(id, operation, value) {
  let updateQuery = {};
  let filterQuery = { _id: id };

  if (operation === 'increase') {
    updateQuery = { $inc: { stock: value } };
  } else if (operation === 'decrease') {
    filterQuery.stock = { $gte: value };
    updateQuery = { $inc: { stock: -value } };
  } else if (operation === 'set') {
    updateQuery = { $set: { stock: value } };
  }

  return RewardItem.findOneAndUpdate(filterQuery, updateQuery, { new: true, runValidators: true });
}

async function countRedemptionsByItemId(itemId) {
  return RedemptionHistory.countDocuments({ item_id: itemId });
}

async function countRedemptionsByItemIdAndStatus(itemId, statuses) {
  return RedemptionHistory.countDocuments({ item_id: itemId, status: { $in: statuses } });
}

async function findRedemptionsForAdmin(filter, skip = 0, limit = 20) {
  return RedemptionHistory.find(filter)
    .sort({ created_at: -1 })
    .skip(skip)
    .limit(limit)
    .populate('user_id', 'full_name email')
    .populate('item_id', 'name token_price image_url')
    .lean();
}

async function countRedemptionsForAdmin(filter) {
  return RedemptionHistory.countDocuments(filter);
}

async function findRedemptionById(id) {
  return RedemptionHistory.findById(id).populate('item_id', 'name token_price image_url').lean();
}

async function updateRedemptionStatus(id, status) {
  return RedemptionHistory.findByIdAndUpdate(id, { $set: { status } }, { new: true });
}


module.exports = {
  findActiveItem,
  findAllActiveItems,
  deductStock,
  createRedemption,
  findRedemptionsByUserId,
  countRedemptionsByUserId,
  createItem,
  updateItem,
  findItemById,
  findItemByName,
  findAllItemsAdmin,
  countAllItemsAdmin,
  updateStockAdmin,
  countRedemptionsByItemId,
  countRedemptionsByItemIdAndStatus,
  findRedemptionsForAdmin,
  countRedemptionsForAdmin,
  findRedemptionById,
  updateRedemptionStatus
};
