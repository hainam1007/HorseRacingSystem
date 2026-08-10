const rewardService = require('../services/rewardService');
const { sendSuccess } = require('../utils/apiResponse');

/**
 * GET /api/rewards
 * List all active reward items (cheapest → most expensive).
 */
async function listRewardItems(req, res) {
  const data = await rewardService.listRewardItems();
  return sendSuccess(res, 200, 'Reward items retrieved successfully', data);
}

/**
 * POST /api/rewards/:itemId/redeem
 * Redeem a reward item using the user's token balance.
 * Handles insufficient balance (402) and out-of-stock (400) with automatic token refund.
 */
async function redeemReward(req, res) {
  const data = await rewardService.redeemReward(req.user._id, req.params.itemId);
  return sendSuccess(res, 200, 'Reward redeemed successfully', data);
}

/**
 * GET /api/rewards/redemptions
 * Paginated list of the authenticated user's past redemptions.
 *
 * Query: page, limit
 */
async function getMyRedemptions(req, res) {
  const data = await rewardService.getMyRedemptions(req.user._id, req.query);
  return sendSuccess(res, 200, 'Redemption history retrieved successfully', data);
}

module.exports = {
  listRewardItems,
  redeemReward,
  getMyRedemptions
};
