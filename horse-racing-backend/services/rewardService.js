const ApiError = require("../utils/ApiError");
const walletRepository = require("../repositories/walletRepository");
const transactionRepository = require("../repositories/transactionRepository");
const rewardRepository = require("../repositories/rewardRepository");
const cloudinaryService = require("./cloudinaryService");

// ─── Exported service functions ───────────────────────────────────────────────

/**
 * Return all active reward items sorted cheapest → most expensive.
 *
 * @returns {Promise<{ items: RewardItem[] }>}
 */
async function listRewardItems() {
  const items = await rewardRepository.findAllActiveItems();
  return { items };
}

/**
 * Redeem a reward item by deducting tokens from the user's wallet.
 *
 * Concurrency strategy (without pessimistic locking):
 *
 *  Step A — Wallet deduction (walletRepository.deductTokenIfSufficient):
 *    Uses `findOneAndUpdate` with filter `{ token_balance: { $gte: price } }`.
 *    If the balance is insufficient at the moment of the write, the operation
 *    returns null and we throw 402 — no data is mutated.
 *
 *  Step B — Stock deduction (rewardRepository.deductStock):
 *    Uses `findOneAndUpdate` with filter `{ stock: { $gt: 0 } }`.
 *    If stock reached 0 between our earlier read and this write, the operation
 *    returns null.
 *
 *  Rollback (compensating transaction):
 *    If Step B fails AFTER Step A succeeded, we credit the tokens back to the
 *    wallet and write a failed-status audit log so the event is fully traceable.
 *
 * @param {string|ObjectId} userId
 * @param {string|ObjectId} itemId
 * @returns {Promise<{ redemption: RedemptionHistory, item: RewardItem, wallet: Wallet }>}
 */
async function redeemReward(userId, itemId) {
  // ── 1. Validate item ────────────────────────────────────────────────────
  const item = await rewardRepository.findActiveItem(itemId);

  if (!item) {
    throw new ApiError(
      404,
      "Reward item not found or is currently unavailable",
    );
  }

  if (item.stock <= 0) {
    throw new ApiError(400, "This reward item is out of stock");
  }

  const price = item.token_price;

  // ── 2. Ensure user has a wallet ─────────────────────────────────────────
  await walletRepository.upsertWallet(userId);

  // ── 3. Step A — Atomic conditional wallet deduction ─────────────────────
  const deductResult = await walletRepository.deductTokenIfSufficient(
    userId,
    price,
  );

  if (!deductResult) {
    // Either wallet does not exist or balance < price at the time of the write.
    const current = await walletRepository.upsertWallet(userId);
    throw new ApiError(402, "Insufficient token balance", {
      required: price,
      available: current.token_balance,
    });
  }

  const {
    balanceBefore,
    balanceAfter: balanceAfterDeduct,
    wallet,
  } = deductResult;

  // ── 4. Step B — Atomic stock deduction ──────────────────────────────────
  const updatedItem = await rewardRepository.deductStock(itemId);

  // ── 5. Rollback if stock was exhausted between Step A and Step B ─────────
  if (!updatedItem) {
    // Credit tokens back — this is our compensating transaction.
    await walletRepository.incrementToken(userId, price);

    // Log the failed attempt for auditability (status: 'failed').
    await transactionRepository.createLog({
      user_id: userId,
      transaction_type: "redeem",
      amount: price,
      direction: "credit", // refund direction
      balance_before: balanceAfterDeduct,
      balance_after: balanceAfterDeduct + price,
      status: "failed",
      note: `Compensating refund — item "${item.name}" (id: ${itemId}) ran out of stock`,
    });

    throw new ApiError(
      400,
      "This reward item just ran out of stock. Your tokens have been refunded.",
    );
  }

  // ── 6. Write successful deduction audit log ─────────────────────────────
  const txLog = await transactionRepository.createLog({
    user_id: userId,
    transaction_type: "redeem",
    amount: price,
    direction: "debit",
    balance_before: balanceBefore,
    balance_after: balanceAfterDeduct,
    status: "completed",
    note: `Redeemed reward: "${item.name}" — ${price} Token(s)`,
  });

  // ── 7. Create redemption history record ─────────────────────────────────
  const redemption = await rewardRepository.createRedemption({
    user_id: userId,
    item_id: itemId,
    token_spent: price,
    status: "pending",
    transaction_id: txLog._id,
  });

  return {
    redemption,
    item: updatedItem,
    wallet,
  };
}

/**
 * Return paginated redemption history for a user with item details.
 *
 * @param {string|ObjectId} userId
 * @param {{ page?: string|number, limit?: string|number }} query
 * @returns {Promise<{ redemptions: RedemptionHistory[], meta: object }>}
 */
async function getMyRedemptions(userId, query = {}) {
  const page = Math.max(1, parseInt(query.page) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(query.limit) || 20));
  const skip = (page - 1) * limit;

  const [redemptions, total] = await Promise.all([
    rewardRepository.findRedemptionsByUserId(userId, { skip, limit }),
    rewardRepository.countRedemptionsByUserId(userId),
  ]);

  return {
    redemptions,
    meta: { total, page, limit, total_pages: Math.ceil(total / limit) },
  };
}

// ─── ADMIN SERVICE FUNCTIONS ──────────────────────────────────────────────────

async function listAllRewards(query = {}) {
  const page = Math.max(1, parseInt(query.page) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(query.limit) || 20));
  const skip = (page - 1) * limit;

  const filter = {};
  if (query.status !== undefined) {
    filter.is_active = query.status === "active";
  }
  if (query.search) {
    filter.name = { $regex: new RegExp(query.search, "i") };
  }

  const sort = {};
  const sortField = query.sort || "created_at";
  const sortOrder = query.order === "asc" ? 1 : -1;
  sort[sortField] = sortOrder;

  const [items, total] = await Promise.all([
    rewardRepository.findAllItemsAdmin(filter, sort, skip, limit),
    rewardRepository.countAllItemsAdmin(filter),
  ]);

  return {
    items,
    meta: { total, page, limit, total_pages: Math.ceil(total / limit) },
  };
}

async function getRewardDetail(rewardId) {
  const item = await rewardRepository.findItemById(rewardId);
  if (!item) {
    throw new ApiError(404, "Reward item not found");
  }
  return { item };
}

async function createReward(adminId, payload) {
  const existing = await rewardRepository.findItemByName(payload.name);
  if (existing) {
    throw new ApiError(409, "Reward name already exists");
  }

  const uploadResult = await cloudinaryService.uploadOptionalSource(
    payload.image_file_data,
    payload.image_url,
    { folder: "horse-racing/rewards", resource_type: "image" },
  );

  const data = {
    name: payload.name,
    description: payload.description,
    token_price: payload.token_price,
    stock: payload.stock,
    is_active: payload.is_active,
    image_url: uploadResult ? uploadResult.secure_url : payload.image_url,
    created_by: adminId,
    updated_by: adminId,
  };

  const item = await rewardRepository.createItem(data);
  return { item };
}

async function updateReward(adminId, rewardId, payload) {
  const currentItem = await rewardRepository.findItemById(rewardId);
  if (!currentItem) {
    throw new ApiError(404, "Reward item not found");
  }

  if (
    payload.name &&
    payload.name.toLowerCase() !== currentItem.name.toLowerCase()
  ) {
    const existing = await rewardRepository.findItemByName(payload.name);
    if (existing && existing._id.toString() !== rewardId.toString()) {
      throw new ApiError(409, "Reward name already exists");
    }
  }

  if (
    payload.token_price !== undefined &&
    payload.token_price !== currentItem.token_price
  ) {
    const redemptionsCount =
      await rewardRepository.countRedemptionsByItemId(rewardId);
    if (redemptionsCount > 0) {
      throw new ApiError(
        400,
        "Cannot modify token price because this reward has existing redemptions",
      );
    }
  }

  const updateData = {
    updated_by: adminId,
  };

  if (payload.name !== undefined) updateData.name = payload.name;
  if (payload.description !== undefined)
    updateData.description = payload.description;
  if (payload.token_price !== undefined)
    updateData.token_price = payload.token_price;

  // We intentionally skip automatic Cloudinary deletion via deleteAsset.
  // The current database schema does not store `image_public_id`, which is required for safe asset deletion.
  // Implementing deletion purely by reverse-engineering public_id from the URL string is fragile.
  // Therefore, replacing an image orphans the old asset in Cloudinary to prioritize stability.
  if (
    payload.image_file_data !== undefined ||
    payload.image_url !== undefined
  ) {
    const uploadResult = await cloudinaryService.uploadOptionalSource(
      payload.image_file_data,
      payload.image_url,
      { folder: "horse-racing/rewards", resource_type: "image" },
    );
    if (uploadResult) {
      updateData.image_url = uploadResult.secure_url;
    } else if (payload.image_url !== undefined) {
      updateData.image_url = payload.image_url;
    }
  }

  const updatedItem = await rewardRepository.updateItem(rewardId, updateData);

  return { item: updatedItem };
}

async function updateRewardStock(adminId, rewardId, operation, value) {
  const item = await rewardRepository.findItemById(rewardId);
  if (!item) {
    throw new ApiError(404, "Reward item not found");
  }

  const updatedItem = await rewardRepository.updateStockAdmin(
    rewardId,
    operation,
    value,
  );
  if (!updatedItem) {
    throw new ApiError(400, "Cannot decrease stock below zero");
  }

  await rewardRepository.updateItem(rewardId, { updated_by: adminId });
  return { item: updatedItem };
}

async function updateRewardStatus(adminId, rewardId, isActive) {
  const item = await rewardRepository.findItemById(rewardId);
  if (!item) {
    throw new ApiError(404, "Reward item not found");
  }

  if (!isActive) {
    const pendingProcessingCount =
      await rewardRepository.countRedemptionsByItemIdAndStatus(rewardId, [
        "pending",
        "processing",
      ]);
    if (pendingProcessingCount > 0) {
      throw new ApiError(
        400,
        "Cannot disable reward with pending or processing redemptions",
      );
    }
  }

  const updatedItem = await rewardRepository.updateItem(rewardId, {
    is_active: isActive,
    updated_by: adminId,
  });
  return { item: updatedItem };
}

async function listAdminRedemptions(query = {}) {
  const page = Math.max(1, parseInt(query.page) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(query.limit) || 20));
  const skip = (page - 1) * limit;

  const filter = {};
  if (query.status) {
    filter.status = query.status;
  }
  if (query.user) {
    filter.user_id = query.user;
  }
  if (query.reward) {
    filter.item_id = query.reward;
  }
  if (query.from || query.to) {
    filter.created_at = {};
    if (query.from) filter.created_at.$gte = new Date(query.from);
    if (query.to) filter.created_at.$lte = new Date(query.to);
  }

  const [redemptions, total] = await Promise.all([
    rewardRepository.findRedemptionsForAdmin(filter, skip, limit),
    rewardRepository.countRedemptionsForAdmin(filter),
  ]);

  return {
    redemptions,
    meta: { total, page, limit, total_pages: Math.ceil(total / limit) },
  };
}

async function updateRedemptionStatus(adminId, redemptionId, status) {
  const redemption = await rewardRepository.findRedemptionById(redemptionId);
  if (!redemption) {
    throw new ApiError(404, "Redemption not found");
  }

  const ALLOWED_TRANSITIONS = {
    pending: ["processing", "cancelled"],
    processing: ["completed", "cancelled"],
    completed: [],
    cancelled: [],
  };

  const validNextStates = ALLOWED_TRANSITIONS[redemption.status] || [];
  if (!validNextStates.includes(status)) {
    throw new ApiError(
      400,
      `Invalid status transition from '${redemption.status}' to '${status}'`,
    );
  }

  if (status === "cancelled") {
    // Refund Token
    const refundResult = await walletRepository.incrementToken(
      redemption.user_id,
      redemption.token_spent,
    );
    if (refundResult) {
      await transactionRepository.createLog({
        user_id: redemption.user_id,
        transaction_type: "redeem",
        amount: redemption.token_spent,
        direction: "credit",
        balance_before: refundResult.balanceBefore,
        balance_after: refundResult.balanceAfter,
        status: "completed",
        note: `Refund for cancelled redemption (id: ${redemptionId})`,
      });
    }

    // Restore Stock if not shipped yet
    if (redemption.status === "pending" || redemption.status === "processing") {
      await rewardRepository.updateStockAdmin(
        redemption.item_id._id || redemption.item_id,
        "increase",
        1,
      );
    }
  }

  const updatedRedemption = await rewardRepository.updateRedemptionStatus(
    redemptionId,
    status,
  );
  return { redemption: updatedRedemption };
}

async function getStatistics() {
  const [
    total_rewards,
    inactive_rewards,
    out_of_stock_rewards,
    pending_redemption,
    processing_redemption,
    completed_redemption,
    cancelled_redemption,
  ] = await Promise.all([
    rewardRepository.countAllItemsAdmin({}),
    rewardRepository.countAllItemsAdmin({ is_active: false }),
    rewardRepository.countAllItemsAdmin({ stock: 0 }),
    rewardRepository.countRedemptionsForAdmin({ status: "pending" }),
    rewardRepository.countRedemptionsForAdmin({ status: "processing" }),
    rewardRepository.countRedemptionsForAdmin({ status: "completed" }),
    rewardRepository.countRedemptionsForAdmin({ status: "cancelled" }),
  ]);

  return {
    statistics: {
      total_rewards,
      inactive_rewards,
      out_of_stock_rewards,
      pending_redemption,
      processing_redemption,
      completed_redemption,
      cancelled_redemption,
    },
  };
}

module.exports = {
  listRewardItems,
  redeemReward,
  getMyRedemptions,
  listAllRewards,
  getRewardDetail,
  createReward,
  updateReward,
  updateRewardStock,
  updateRewardStatus,
  listAdminRedemptions,
  updateRedemptionStatus,
  getStatistics,
};
