const assert = require('node:assert/strict');
const test = require('node:test');

const paymentGatewayService = require('../services/paymentGatewayService');

test('MOCK payment method creates a local return URL without gateway env vars', async () => {
  const result = await paymentGatewayService.createPaymentUrl({
    orderId: 'ORDER-MOCK-1',
    amountVnd: 50000,
    orderInfo: 'Local test',
    paymentMethod: 'MOCK'
  });

  const url = new URL(result.payment_url);
  assert.equal(result.order_id, 'ORDER-MOCK-1');
  assert.equal(url.pathname, '/payment-success');
  assert.equal(url.searchParams.get('order_id'), 'ORDER-MOCK-1');
  assert.equal(url.searchParams.get('payment_method'), 'MOCK');
});

test('MOCK webhook verification supports optional shared secret', () => {
  const originalSecret = process.env.MOCK_PAYMENT_WEBHOOK_SECRET;
  process.env.MOCK_PAYMENT_WEBHOOK_SECRET = 'dev-secret';

  assert.deepEqual(
    paymentGatewayService.verifySignature({ order_id: 'ORDER-MOCK-2', mock_secret: 'dev-secret' }, 'MOCK'),
    { valid: true }
  );
  assert.equal(
    paymentGatewayService.verifySignature({ order_id: 'ORDER-MOCK-2', mock_secret: 'wrong' }, 'MOCK').valid,
    false
  );

  if (originalSecret === undefined) {
    delete process.env.MOCK_PAYMENT_WEBHOOK_SECRET;
  } else {
    process.env.MOCK_PAYMENT_WEBHOOK_SECRET = originalSecret;
  }
});

test('MOCK webhook helpers detect success and gateway reference', () => {
  assert.equal(paymentGatewayService.isPaymentSuccess({ status: 'success' }, 'MOCK'), true);
  assert.equal(paymentGatewayService.isPaymentSuccess({ status: 'failed' }, 'MOCK'), false);
  assert.equal(
    paymentGatewayService.extractGatewayTransactionId({ order_id: 'ORDER-MOCK-3' }, 'MOCK'),
    'ORDER-MOCK-3'
  );
});
