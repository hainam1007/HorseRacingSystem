const rewardService = require('../services/rewardService');

async function listRewards(req, res) {
  const result = await rewardService.listAllRewards(req.query);
  res.json(result);
}

async function getReward(req, res) {
  const result = await rewardService.getRewardDetail(req.params.id);
  res.json(result);
}

async function createReward(req, res) {
  const payload = req.validatedBody;
  const adminId = req.user._id;
  const result = await rewardService.createReward(adminId, payload);
  res.status(201).json(result);
}

async function updateReward(req, res) {
  const payload = req.validatedBody;
  const adminId = req.user._id;
  const result = await rewardService.updateReward(adminId, req.params.id, payload);
  res.json(result);
}

async function updateRewardStock(req, res) {
  const { operation, value } = req.validatedBody;
  const adminId = req.user._id;
  const result = await rewardService.updateRewardStock(adminId, req.params.id, operation, value);
  res.json(result);
}

async function updateRewardStatus(req, res) {
  const { is_active } = req.validatedBody;
  const adminId = req.user._id;
  const result = await rewardService.updateRewardStatus(adminId, req.params.id, is_active);
  res.json(result);
}

async function listRedemptions(req, res) {
  const result = await rewardService.listAdminRedemptions(req.query);
  res.json(result);
}

async function updateRedemptionStatus(req, res) {
  const { status } = req.validatedBody;
  const adminId = req.user._id;
  const result = await rewardService.updateRedemptionStatus(adminId, req.params.id, status);
  res.json(result);
}

async function getStatistics(req, res) {
  const result = await rewardService.getStatistics();
  res.json(result);
}

module.exports = {
  listRewards,
  getReward,
  createReward,
  updateReward,
  updateRewardStock,
  updateRewardStatus,
  listRedemptions,
  updateRedemptionStatus,
  getStatistics
};
