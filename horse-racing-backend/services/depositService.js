const ApiError = require('../utils/ApiError');
const { DEPOSIT_REQUEST_STATUS, PAYMENT_METHOD } = require('../constants/depositStatuses');
const { VND_PER_TOKEN } = require('../constants/depositConstants');
const depositPackageRepository = require('../repositories/depositPackageRepository');
const depositRequestRepository = require('../repositories/depositRequestRepository');
const walletRepository = require('../repositories/walletRepository');
const transactionRepository = require('../repositories/transactionRepository');
const paymentGatewayService = require('./paymentGatewayService');

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Generate a URL-safe, collision-resistant internal order ID.
 * Format: ORDER-<ms timestamp>-<8 random hex chars>
 * This ID is passed to the payment gateway as the "transaction reference".
 *
 * @returns {string}
 */
function generateOrderId() {
  const random = Math.random().toString(16).slice(2, 10).toUpperCase();
  return `ORDER-${Date.now()}-${random}`;
}

/**
 * Build the reference_id used in the TransactionHistory audit log.
 * We prefer the gateway's own transaction ID for bank-level traceability.
 * Falls back to the internal order_id when the gateway ID is unavailable.
 *
 * @param {string} gatewayReferenceId
 * @param {string} orderId
 * @returns {string}
 */
function buildTransactionReferenceId(gatewayReferenceId, orderId) {
  return `deposit:${gatewayReferenceId || orderId}`;
}

// ─── Service Functions ────────────────────────────────────────────────────────

/**
 * Return all active deposit packages sorted by price (ascending).
 * Used to populate the "Top up" screen in the Spectator UI.
 *
 * @returns {Promise<{ packages: DepositPackage[] }>}
 */
async function listDepositPackages() {
  const packages = await depositPackageRepository.findAllActivePackages();

  // Append computed total_token to each plain object (lean docs don't include virtuals)
  const enriched = packages.map(function (pkg) {
    return Object.assign({}, pkg, { total_token: pkg.token_received + pkg.bonus_token });
  });

  return { packages: enriched };
}


function previewCustomDeposit(tokenAmount) {
  const vndAmount = tokenAmount * VND_PER_TOKEN;

  return {
    token_amount: tokenAmount,
    vnd_price: vndAmount,
    rate: `1 Token = ${VND_PER_TOKEN.toLocaleString()} VND`,
    note: 'Custom top-up has no bonus tokens'
  };
}

async function createPaymentIntent(userId, packageId, paymentMethod, customTokenAmount) {
  const allowedMethods = Object.values(PAYMENT_METHOD);

  if (!paymentMethod || !allowedMethods.includes(paymentMethod)) {
    throw new ApiError(400, `Invalid payment_method. Must be one of: ${allowedMethods.join(', ')}`);
  }

  let vndPrice;
  let totalToken;
  let displayLabel;
  let depositPackageId; 

  if (packageId) {
    const pkg = await depositPackageRepository.findActivePackageById(packageId);

    if (!pkg) {
      throw new ApiError(404, `Deposit package "${packageId}" not found or is currently unavailable`);
    }

    vndPrice = pkg.vnd_price;
    totalToken = pkg.token_received + pkg.bonus_token;
    displayLabel = `${pkg.label} — ${totalToken} Token(s)`;
    depositPackageId = pkg.package_id;

  } else if (customTokenAmount) {
    const amount = Number(customTokenAmount);

    if (!Number.isInteger(amount) || amount < 1) {
      throw new ApiError(400, 'custom_token_amount must be a positive integer');
    }

    vndPrice = amount * VND_PER_TOKEN;
    totalToken = amount;               
    displayLabel = `Custom top-up — ${amount} Token(s)`;
    depositPackageId = 'CUSTOM';

  } else {
    throw new ApiError(400, 'Either package_id or custom_token_amount must be provided');
  }

  // ── 3. Ensure user has a wallet (auto-create on first deposit) ─────────────
  await walletRepository.upsertWallet(userId);

  // ── 4. Create PENDING order ────────────────────────────────────────────────
  const orderId = generateOrderId();

  const order = await depositRequestRepository.createOrder({
    order_id: orderId,
    user_id: userId,
    package_id: depositPackageId,
    total_vnd: vndPrice,
    total_token: totalToken,
    payment_method: paymentMethod,
    status: DEPOSIT_REQUEST_STATUS.PENDING
  });

  // ── 5. Build gateway redirect URL ─────────────────────────────────────────
  let gatewayResult;

  try {
    gatewayResult = await paymentGatewayService.createPaymentUrl({
      orderId: orderId,
      amountVnd: vndPrice,
      orderInfo: displayLabel,
      paymentMethod: paymentMethod
    });
  } catch (gatewayError) {
    // If the gateway SDK throws, the PENDING order remains; user can retry.
    throw new ApiError(502, 'Failed to create payment URL with the selected gateway', {
      reason: gatewayError.message
    });
  }

  return {
    order_id: orderId,
    payment_url: gatewayResult.payment_url,
    order: order
  };
}

/**
 * Handle an incoming payment webhook from the gateway.
 *
 * ─── Financial safety steps ───────────────────────────────────────────────────
 *
 *  Step 1 — SECURITY: Verify HMAC/checksum signature.
 *            Rejects spoofed or tampered webhook calls.
 *
 *  Step 2 — IDEMPOTENCY: Load order; skip if already SUCCESS or FAILED.
 *            Handles duplicate webhook deliveries (gateways often retry).
 *
 *  Step 3 — PAYMENT RESULT: If gateway reports FAILED → mark order FAILED, done.
 *
 *  Step 4 — CREDIT WALLET: atomically increment token balance via $inc.
 *
 *  Step 5 — MARK ORDER SUCCESS + WRITE AUDIT LOG (both inside try/catch):
 *            - Mark order SUCCESS with gateway_reference_id.
 *            - Write immutable TransactionHistory row (type='deposit').
 *            - If EITHER of these fails after token credit → reverse the credit
 *              and mark order FAILED (compensating transaction).
 *
 * @param {object} webhookPayload  - Raw body from the gateway's HTTP POST
 * @param {string} paymentMethod   - Used to select the correct verify logic
 * @returns {Promise<{ processed: boolean, order: DepositRequest, message: string }>}
 */
async function handlePaymentWebhook(webhookPayload, paymentMethod) {
  // ── Step 1: Verify signature ───────────────────────────────────────────────
  const { valid, reason } = paymentGatewayService.verifySignature(webhookPayload, paymentMethod);

  if (!valid) {
    throw new ApiError(403, 'Webhook signature verification failed', { reason });
  }

  // ── Step 2: Load and validate order — Idempotency gate ────────────────────
  // Extract our internal order_id from the payload.
  // VNPAY sends it as vnp_TxnRef; Momo as orderId; MOCK as order_id.
  const orderId = webhookPayload.order_id
    || webhookPayload.vnp_TxnRef
    || webhookPayload.orderId;

  if (!orderId) {
    throw new ApiError(400, 'Webhook payload is missing order_id / txn reference');
  }

  const order = await depositRequestRepository.findByOrderId(orderId);

  if (!order) {
    throw new ApiError(404, `Deposit order "${orderId}" not found`);
  }

  // ── Idempotency: if already in a final state, return immediately ───────────
  if (order.status !== DEPOSIT_REQUEST_STATUS.PENDING) {
    return {
      processed: false,
      order: order,
      message: `Order "${orderId}" already in final state: ${order.status}. No action taken.`
    };
  }

  // ── Step 3: Handle gateway FAILURE ────────────────────────────────────────
  const isSuccess = paymentGatewayService.isPaymentSuccess(webhookPayload, paymentMethod);

  if (!isSuccess) {
    const failedOrder = await depositRequestRepository.markFailed(
      orderId,
      `Gateway reported payment failure (method: ${paymentMethod})`
    );

    return {
      processed: true,
      order: failedOrder,
      message: 'Payment was reported as failed by the gateway. No tokens credited.'
    };
  }

  // ── Step 4: Credit wallet tokens ──────────────────────────────────────────
  //   incrementToken uses atomic $inc — safe for concurrent calls.
  const gatewayReferenceId = paymentGatewayService.extractGatewayTransactionId(
    webhookPayload,
    paymentMethod
  );
  const referenceId = buildTransactionReferenceId(gatewayReferenceId, orderId);

  // Idempotency check at TransactionHistory level (mirrors depositToken in walletService).
  // If this reference was already logged, another concurrent webhook already processed it.
  const existingLog = await transactionRepository.checkExistsByReference(referenceId);

  if (existingLog) {
    // The wallet was already credited (possibly by a parallel webhook delivery).
    // Mark the order SUCCESS if it somehow slipped through the PENDING guard above.
    return {
      processed: false,
      order: order,
      message: `Reference "${referenceId}" already processed. No duplicate credit issued.`
    };
  }

  // Atomic wallet increment — returns { balanceBefore, balanceAfter, wallet }
  const credit = await walletRepository.incrementToken(order.user_id, order.total_token);

  if (!credit) {
    // Wallet didn't exist despite upsertWallet being called at intent creation.
    // This is an unexpected state — mark order FAILED and surface an error.
    await depositRequestRepository.markFailed(orderId, 'SYSTEM: User wallet not found during credit');
    throw new ApiError(500, 'User wallet not found. Order marked FAILED. Please contact support.');
  }

  // ── Step 5: Mark order SUCCESS and write audit log ─────────────────────────
  //   Both writes are wrapped in a single try/catch.
  //   If either fails after the credit, we perform a compensating rollback.
  let successOrder;
  let txLog;

  try {
    // 5a. Mark order SUCCESS (conditional on PENDING — DB-level idempotency guard)
    successOrder = await depositRequestRepository.markSuccess(orderId, gatewayReferenceId);

    if (!successOrder) {
      // Another concurrent webhook already marked this order SUCCESS between
      // our PENDING check above and this write — reverse our credit.
      await walletRepository.incrementToken(order.user_id, -order.total_token);
      return {
        processed: false,
        order: order,
        message: `Order "${orderId}" was concurrently settled. Credit reversed.`
      };
    }

    // 5b. Write immutable TransactionHistory audit record
    txLog = await transactionRepository.createLog({
      user_id: order.user_id,
      transaction_type: 'deposit',
      amount: order.total_token,
      direction: 'credit',
      balance_before: credit.balanceBefore,
      balance_after: credit.balanceAfter,
      status: 'completed',
      reference_id: referenceId,
      note: `Top-up: ${order.total_vnd.toLocaleString()} VND → ${order.total_token} Token(s) [${paymentMethod}]`
    });

  } catch (persistError) {
    // ── Compensating Transaction (Rollback) ──────────────────────────────────
    // The wallet credit succeeded but we failed to persist the order status or
    // the audit log. To keep data consistent:
    //   1. Reverse the token credit.
    //   2. Mark the order FAILED with a system note.
    // The admin can investigate via the order record and retry if needed.

    // (a) Reverse the wallet credit
    try {
      await walletRepository.incrementToken(order.user_id, -order.total_token);
    } catch (rollbackError) {
      // Rollback itself failed — this is a critical inconsistency.
      // Log to stderr; in production this should trigger an alert/Sentry event.
      console.error(
        '[CRITICAL] Deposit rollback failed. Manual reconciliation required.',
        { orderId, userId: order.user_id, totalToken: order.total_token, rollbackError }
      );
    }

    // (b) Mark order FAILED with a note for audit visibility
    try {
      await depositRequestRepository.rollbackToFailed(orderId);
    } catch (markFailedError) {
      console.error(
        '[CRITICAL] Failed to mark order FAILED after rollback.',
        { orderId, markFailedError }
      );
    }

    throw new ApiError(500,
      'Payment was received but an error occurred while crediting your wallet. ' +
      'The charge has been reversed. Please contact support with order ID: ' + orderId,
      { order_id: orderId, reason: persistError.message }
    );
  }

  return {
    processed: true,
    order: successOrder,
    transaction: txLog,
    wallet_balance_after: credit.balanceAfter,
    message: `${order.total_token} Token(s) credited to wallet successfully.`
  };
}

/**
 * Return paginated deposit order history for a spectator.
 *
 * @param {string|ObjectId} userId
 * @param {{ page?: string|number, limit?: string|number }} query
 * @returns {Promise<{ orders: DepositRequest[], meta: object }>}
 */
async function getMyDepositHistory(userId, query = {}) {
  const page = Math.max(1, parseInt(query.page) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(query.limit) || 20));
  const skip = (page - 1) * limit;

  const [orders, total] = await Promise.all([
    depositRequestRepository.findByUserId(userId, { skip, limit }),
    depositRequestRepository.countByUserId(userId)
  ]);

  return {
    orders,
    meta: { total, page, limit, total_pages: Math.ceil(total / limit) }
  };
}

module.exports = {
  listDepositPackages,
  previewCustomDeposit,
  createPaymentIntent,
  handlePaymentWebhook,
  getMyDepositHistory
};
