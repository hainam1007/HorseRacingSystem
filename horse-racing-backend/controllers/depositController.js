const depositService = require('../services/depositService');
const horseOwnerService = require('../services/horseOwnerService');
const { sendSuccess } = require('../utils/apiResponse');

function inferPaymentMethod(req) {
  const payload = req.method === 'GET' ? req.query : req.body;
  const explicitMethod =
    req.query.payment_method ||
    payload.payment_method ||
    req.headers['x-payment-method'];

  if (explicitMethod) {
    return String(explicitMethod).trim().toUpperCase();
  }

  if (payload.vnp_TxnRef || payload.vnp_SecureHash) {
    return 'VNPAY';
  }

  if (payload.partnerCode || payload.resultCode !== undefined || payload.transId) {
    return 'MOMO';
  }

  if (payload.mock === true || payload.mock_secret || payload.order_id) {
    return 'MOCK';
  }

  return null;
}

function buildPaymentReturnUrl(req, data) {
  const baseUrl = process.env.FRONTEND_PAYMENT_RETURN_URL || 'http://localhost:5173/payment-success';
  const url = new URL(baseUrl);
  const orderId = data?.order?.order_id || req.query.vnp_TxnRef || req.query.orderId || req.query.order_id || '';

  if (orderId) url.searchParams.set('order_id', orderId);
  if (req.query.vnp_ResponseCode) url.searchParams.set('vnp_ResponseCode', req.query.vnp_ResponseCode);
  if (req.query.resultCode !== undefined) url.searchParams.set('resultCode', req.query.resultCode);
  if (data?.order?.status) url.searchParams.set('status', data.order.status);
  if (data?.order?.payment_method) url.searchParams.set('payment_method', data.order.payment_method);

  return url.toString();
}

/**
 * GET /api/deposit/packages
 * Return all active deposit packages sorted cheapest → most expensive.
 * Accessible to any authenticated user.
 */
async function listDepositPackages(req, res) {
  const data = await depositService.listDepositPackages();
  return sendSuccess(res, 200, 'Deposit packages retrieved successfully', data);
}

/**
 * POST /api/deposit/preview-custom
 */
async function previewCustomDeposit(req, res) {
  const { token_amount } = req.validatedBody;
  const data = depositService.previewCustomDeposit(token_amount);
  return sendSuccess(res, 200, 'Custom deposit preview calculated successfully', data);
}

/**
 * POST /api/deposit/intent
 */
async function createPaymentIntent(req, res) {
  const { package_id, custom_token_amount, payment_method } = req.body;
  const data = await depositService.createPaymentIntent(
    req.user._id,
    package_id || null,
    payment_method,
    custom_token_amount || null
  );
  return sendSuccess(res, 201, 'Payment intent created successfully', data);
}

/**
 * POST /api/deposit/webhook/payment
 */
async function handlePaymentWebhook(req, res) {
  const paymentMethod = inferPaymentMethod(req);

  if (!paymentMethod) {
    return res.status(400).json({
      success: false,
      message: 'payment_method is required when the gateway payload cannot be inferred'
    });
  }

  const payload = req.method === 'GET' ? req.query : req.body;
  const orderId = payload.vnp_TxnRef || payload.orderId || payload.order_id || '';
  const data = String(orderId).startsWith('REG-')
    ? await horseOwnerService.handleRegistrationPaymentWebhook(payload, paymentMethod)
    : await depositService.handlePaymentWebhook(payload, paymentMethod);

  if (req.method === 'GET' && req.query.format !== 'json') {
    return res.redirect(302, buildPaymentReturnUrl(req, data));
  }

  return sendSuccess(res, 200, data.message, data);
}

/**
 * GET /api/deposit/history
 */
async function getMyDepositHistory(req, res) {
  const data = await depositService.getMyDepositHistory(req.user._id, req.query);
  return sendSuccess(res, 200, 'Deposit history retrieved successfully', data);
}

module.exports = {
  listDepositPackages,
  previewCustomDeposit,
  createPaymentIntent,
  handlePaymentWebhook,
  getMyDepositHistory
};
