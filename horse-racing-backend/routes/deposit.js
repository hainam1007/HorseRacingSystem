const express = require('express');

const depositController = require('../controllers/depositController');
const authenticate = require('../middlewares/authenticate');
const asyncHandler = require('../utils/asyncHandler');
const {
  validatePreviewCustomDeposit,
  validateCreatePaymentIntent
} = require('../validators/depositValidator');

const router = express.Router();


router.get('/webhook/payment', asyncHandler(depositController.handlePaymentWebhook));
router.post('/webhook/payment', asyncHandler(depositController.handlePaymentWebhook));
router.use(authenticate);
router.get('/packages', asyncHandler(depositController.listDepositPackages));
router.post(
  '/preview-custom',
  validatePreviewCustomDeposit,
  asyncHandler(depositController.previewCustomDeposit)
);
router.post(
  '/intent',
  validateCreatePaymentIntent,
  asyncHandler(depositController.createPaymentIntent)
);
router.get('/history', asyncHandler(depositController.getMyDepositHistory));

module.exports = router;
