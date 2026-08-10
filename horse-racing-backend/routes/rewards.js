const express = require('express');

const rewardController = require('../controllers/rewardController');
const authenticate = require('../middlewares/authenticate');
const asyncHandler = require('../utils/asyncHandler');

const router = express.Router();

router.use(authenticate);

router.get('/', asyncHandler(rewardController.listRewardItems));
router.get('/redemptions', asyncHandler(rewardController.getMyRedemptions));
router.post('/:itemId/redeem', asyncHandler(rewardController.redeemReward));

module.exports = router;
