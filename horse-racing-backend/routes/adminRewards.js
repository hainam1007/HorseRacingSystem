const express = require('express');

const adminRewardController = require('../controllers/adminRewardController');
const authenticate = require('../middlewares/authenticate');
const authorizeRoles = require('../middlewares/authorizeRoles');
const { ROLE_NAMES } = require('../constants/roles');
const asyncHandler = require('../utils/asyncHandler');
const { validateObjectIdParam } = require('../validators/commonValidator');
const {
  validateCreateReward,
  validateUpdateReward,
  validateUpdateStock,
  validateUpdateStatus,
  validateUpdateRedemptionStatus
} = require('../validators/adminRewardValidator');

const router = express.Router();
const adminOnly = authorizeRoles(ROLE_NAMES.ADMIN);

router.use(authenticate);
router.use(adminOnly);

// ─── STATS ──────────────────────────────────────────────────────────────────
router.get('/rewards/statistics', asyncHandler(adminRewardController.getStatistics));

// ─── REWARDS ────────────────────────────────────────────────────────────────
router.get('/rewards', asyncHandler(adminRewardController.listRewards));
// ─── REDEMPTIONS ────────────────────────────────────────────────────────────
router.get('/rewards/redemptions', asyncHandler(adminRewardController.listRedemptions));

router.get('/rewards/:id', validateObjectIdParam('id'), asyncHandler(adminRewardController.getReward));

router.post(
  '/rewards',
  validateCreateReward,
  asyncHandler(adminRewardController.createReward)
);

router.put(
  '/rewards/:id',
  validateObjectIdParam('id'),
  validateUpdateReward,
  asyncHandler(adminRewardController.updateReward)
);

router.patch(
  '/rewards/:id/stock',
  validateObjectIdParam('id'),
  validateUpdateStock,
  asyncHandler(adminRewardController.updateRewardStock)
);

router.patch(
  '/rewards/:id/status',
  validateObjectIdParam('id'),
  validateUpdateStatus,
  asyncHandler(adminRewardController.updateRewardStatus)
);

// ─── REDEMPTIONS ────────────────────────────────────────────────────────────

router.patch(
  '/rewards/redemptions/:id/status',
  validateObjectIdParam('id'),
  validateUpdateRedemptionStatus,
  asyncHandler(adminRewardController.updateRedemptionStatus)
);

module.exports = router;
