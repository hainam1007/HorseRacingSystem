const crypto = require('crypto');
const axios = require('axios');
const { VNPay } = require('vnpay');

function assertEnvVars(method) {
  const missing = [];

  if (method === 'MOMO') {
    if (!process.env.MOMO_PARTNER_CODE) missing.push('MOMO_PARTNER_CODE');
    if (!process.env.MOMO_ACCESS_KEY) missing.push('MOMO_ACCESS_KEY');
    if (!process.env.MOMO_SECRET_KEY) missing.push('MOMO_SECRET_KEY');
    if (!process.env.MOMO_ENDPOINT) missing.push('MOMO_ENDPOINT');
    if (!process.env.MOMO_REDIRECT_URL) missing.push('MOMO_REDIRECT_URL');
    if (!process.env.MOMO_IPN_URL) missing.push('MOMO_IPN_URL');
  } else if (method === 'VNPAY') {
    if (!process.env.VNPAY_TMN_CODE) missing.push('VNPAY_TMN_CODE');
    if (!process.env.VNPAY_HASH_SECRET) missing.push('VNPAY_HASH_SECRET');
    if (!process.env.VNPAY_PAYMENT_URL) missing.push('VNPAY_PAYMENT_URL');
    if (!process.env.VNPAY_RETURN_URL) missing.push('VNPAY_RETURN_URL');
  }

  if (missing.length > 0) {
    throw new Error(`[Env Hydration Error] Missing configuration for ${method}: ${missing.join(', ')}`);
  }
}

function buildVnpayClient() {
  return new VNPay({
    tmnCode: process.env.VNPAY_TMN_CODE.trim(),
    secureSecret: process.env.VNPAY_HASH_SECRET.trim(),
    vnpayHost: process.env.VNPAY_PAYMENT_URL.trim(),
    testMode: true,
    hashAlgorithm: 'SHA512',
    enableLog: false,
    loggerFn: () => {}
  });
}

async function createPaymentUrl({ orderId, amountVnd, orderInfo, paymentMethod }) {
  if (paymentMethod === 'MOCK') {
    const returnUrl = process.env.MOCK_PAYMENT_RETURN_URL || process.env.FRONTEND_PAYMENT_RETURN_URL || '/payment-success';
    const url = new URL(returnUrl, 'http://localhost:3000');
    url.searchParams.set('order_id', orderId);
    url.searchParams.set('payment_method', 'MOCK');
    url.searchParams.set('status', 'pending');

    return { payment_url: url.toString(), order_id: orderId };
  }

  if (paymentMethod !== 'VNPAY' && paymentMethod !== 'MOMO') {
    throw new Error(`Unsupported payment method: ${paymentMethod}`);
  }

  assertEnvVars(paymentMethod);

  if (paymentMethod === 'VNPAY') {
    const safeVnpayOrderInfo = orderInfo.replace(/[^a-zA-Z0-9]/g, '');
    const paymentUrl = buildVnpayClient().buildPaymentUrl({
      vnp_Amount: amountVnd,
      vnp_IpAddr: '127.0.0.1',
      vnp_TxnRef: orderId,
      vnp_OrderInfo: safeVnpayOrderInfo || 'VNPAYDEPOSIT',
      vnp_OrderType: 'other',
      vnp_ReturnUrl: process.env.VNPAY_RETURN_URL.trim(),
      vnp_Locale: 'vn'
    });

    return { payment_url: paymentUrl, order_id: orderId };
  }

  const cleanOrderInfo = orderInfo
    .replace(/—/g, '-')
    .replace(/[^\x20-\x7E]/g, '');

  const partnerCode = process.env.MOMO_PARTNER_CODE.trim();
  const accessKey = process.env.MOMO_ACCESS_KEY.trim();
  const secretKey = process.env.MOMO_SECRET_KEY.trim();
  const redirectUrl = process.env.MOMO_REDIRECT_URL.trim();
  const ipnUrl = process.env.MOMO_IPN_URL.trim();
  const requestType = 'captureWallet';
  const extraData = '';
  const requestId = orderId;

  const rawSignature = `accessKey=${accessKey}&amount=${amountVnd}&extraData=${extraData}&ipnUrl=${ipnUrl}&orderId=${orderId}&orderInfo=${cleanOrderInfo}&partnerCode=${partnerCode}&redirectUrl=${redirectUrl}&requestId=${requestId}&requestType=${requestType}`;
  const signature = crypto
    .createHmac('sha256', secretKey)
    .update(Buffer.from(rawSignature, 'utf8'))
    .digest('hex');

  const body = {
    partnerCode,
    accessKey,
    requestId,
    amount: amountVnd,
    orderId,
    orderInfo: cleanOrderInfo,
    redirectUrl,
    ipnUrl,
    extraData,
    requestType,
    signature,
    lang: 'vi'
  };

  try {
    const response = await axios.post(process.env.MOMO_ENDPOINT.trim(), body);
    if (response.data && response.data.payUrl) {
      return { payment_url: response.data.payUrl, order_id: orderId };
    }
    throw new Error(`MoMo response error: ${JSON.stringify(response.data)}`);
  } catch (error) {
    if (error.response) {
      throw new Error(`MoMo API Error: ${JSON.stringify(error.response.data)}`);
    }
    throw error;
  }
}

function verifySignature(webhookPayload, paymentMethod) {
  if (paymentMethod === 'MOCK') {
    const expectedSecret = process.env.MOCK_PAYMENT_WEBHOOK_SECRET;
    const receivedSecret = webhookPayload.mock_secret || webhookPayload.secret;

    if (expectedSecret && receivedSecret !== expectedSecret) {
      return { valid: false, reason: 'MOCK webhook secret mismatch' };
    }

    return { valid: true };
  }

  if (paymentMethod !== 'VNPAY' && paymentMethod !== 'MOMO') {
    return { valid: false, reason: `Unsupported payment method: ${paymentMethod}` };
  }

  assertEnvVars(paymentMethod);

  if (paymentMethod === 'VNPAY') {
    try {
      const result = buildVnpayClient().verifyIpnCall(webhookPayload);
      return { valid: result.isVerified, reason: result.isVerified ? undefined : result.message };
    } catch (error) {
      return { valid: false, reason: error.message };
    }
  }

  const secretKey = process.env.MOMO_SECRET_KEY.trim();
  const rawSignature = `accessKey=${process.env.MOMO_ACCESS_KEY.trim()}&amount=${webhookPayload.amount}&extraData=${webhookPayload.extraData}&message=${webhookPayload.message}&orderId=${webhookPayload.orderId}&orderInfo=${webhookPayload.orderInfo}&orderType=${webhookPayload.orderType}&partnerCode=${process.env.MOMO_PARTNER_CODE.trim()}&payType=${webhookPayload.payType}&requestId=${webhookPayload.requestId}&responseTime=${webhookPayload.responseTime}&resultCode=${webhookPayload.resultCode}&transId=${webhookPayload.transId}`;
  const expectedSig = crypto
    .createHmac('sha256', secretKey)
    .update(Buffer.from(rawSignature, 'utf8'))
    .digest('hex');
  const receivedSig = webhookPayload.signature || '';

  if (!receivedSig || receivedSig.length !== expectedSig.length) {
    return { valid: false, reason: 'Momo signature mismatch or missing' };
  }

  const isValid = crypto.timingSafeEqual(
    Buffer.from(receivedSig, 'utf8'),
    Buffer.from(expectedSig, 'utf8')
  );

  return { valid: isValid, reason: isValid ? undefined : 'Momo signature mismatch' };
}

function isPaymentSuccess(webhookPayload, paymentMethod) {
  if (paymentMethod === 'VNPAY') {
    return webhookPayload.vnp_ResponseCode === '00';
  }

  if (paymentMethod === 'MOMO') {
    return Number(webhookPayload.resultCode) === 0;
  }

  if (paymentMethod === 'MOCK') {
    const status = String(webhookPayload.status || webhookPayload.result || '').toLowerCase();
    return status === 'success' || status === 'paid' || webhookPayload.success === true;
  }

  return false;
}

function extractGatewayTransactionId(webhookPayload, paymentMethod) {
  if (paymentMethod === 'VNPAY') {
    return webhookPayload.vnp_TransactionNo || webhookPayload.vnp_TxnRef;
  }

  if (paymentMethod === 'MOMO') {
    return String(webhookPayload.transId || webhookPayload.requestId);
  }

  if (paymentMethod === 'MOCK') {
    return webhookPayload.gateway_reference_id || webhookPayload.transaction_id || webhookPayload.order_id;
  }

  return null;
}

module.exports = {
  createPaymentUrl,
  verifySignature,
  isPaymentSuccess,
  extractGatewayTransactionId
};
