const walletService = require('../services/walletService');
const { sendSuccess } = require('../utils/apiResponse');

/**
 * GET /api/wallet/me
 * Return the authenticated user's wallet (auto-created if first call).
 */
async function getMyWallet(req, res) {
  const data = await walletService.getOrCreateWallet(req.user._id);
  return sendSuccess(res, 200, 'Wallet retrieved successfully', data);
}

/**
 * POST /api/wallet/deposit
 */
async function depositToken(req, res) {
  const { vnd_amount, reference_id } = req.body;
  const data = await walletService.depositToken(req.user._id, vnd_amount, reference_id);
  return sendSuccess(res, 200, 'Tokens deposited successfully', data);
}

/**
 * GET /api/wallet/transactions
 */
async function getTransactionHistory(req, res) {
  const data = await walletService.getTransactionHistory(req.user._id, req.query);
  return sendSuccess(res, 200, 'Transaction history retrieved successfully', data);
}

module.exports = {
  getMyWallet,
  depositToken,
  getTransactionHistory
};
