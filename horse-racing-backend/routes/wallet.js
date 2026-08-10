const express = require('express');

const walletController = require('../controllers/walletController');
const authenticate = require('../middlewares/authenticate');
const asyncHandler = require('../utils/asyncHandler');

const router = express.Router();

router.use(authenticate);
router.get('/me', asyncHandler(walletController.getMyWallet));
router.post('/deposit', asyncHandler(walletController.depositToken));
router.get('/transactions', asyncHandler(walletController.getTransactionHistory));

module.exports = router;
