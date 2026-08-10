const ApiError = require('../utils/ApiError');
const { PAYMENT_METHOD } = require('../constants/depositStatuses');
const { VND_PER_TOKEN } = require('../constants/depositConstants');

// ─── Constants ────────────────────────────────────────────────────────────────

const CUSTOM_TOKEN_MIN = 1;
const CUSTOM_TOKEN_MAX = 100000; // 100,000 tokens = 100,000,000 VND safety cap

// ─── Middleware: POST /api/deposit/preview-custom ─────────────────────────────

/**
 * Validate request body for the custom deposit preview endpoint.
 *
 * Required fields:
 *   - token_amount {number} — positive integer
 */
function validatePreviewCustomDeposit(req, res, next) {
  const body = req.body || {};
  const tokenAmount = Number(body.token_amount);

  if (!body.token_amount && body.token_amount !== 0) {
    return next(new ApiError(400, 'Validation failed', [
      { field: 'token_amount', message: 'token_amount is required' }
    ]));
  }

  if (!Number.isInteger(tokenAmount) || tokenAmount < CUSTOM_TOKEN_MIN) {
    return next(new ApiError(400, 'Validation failed', [
      { field: 'token_amount', message: `token_amount must be a positive integer (minimum ${CUSTOM_TOKEN_MIN})` }
    ]));
  }

  if (tokenAmount > CUSTOM_TOKEN_MAX) {
    return next(new ApiError(400, 'Validation failed', [
      {
        field: 'token_amount',
        message: `token_amount exceeds maximum allowed value of ${CUSTOM_TOKEN_MAX.toLocaleString()} per transaction`
      }
    ]));
  }

  req.validatedBody = { token_amount: tokenAmount };
  return next();
}

// ─── Middleware: POST /api/deposit/intent ─────────────────────────────────────

/**
 * Validate request body for creating a payment intent.
 *
 * Accepts ONE of two mutually-exclusive deposit modes:
 *   Mode A — Package-based : { package_id, payment_method }
 *   Mode B — Custom amount : { custom_token_amount, payment_method }
 *
 * Rules:
 *   - Exactly one of `package_id` or `custom_token_amount` must be present.
 *   - Providing both is ambiguous and rejected with 400.
 *   - `payment_method` is always required.
 */
function validateCreatePaymentIntent(req, res, next) {
  const body = req.body || {};
  const errors = [];

  // ── 1. Determine deposit mode ──────────────────────────────────────────────
  const hasPackageId = body.package_id !== undefined && body.package_id !== null && body.package_id !== '';
  const hasCustomAmount = body.custom_token_amount !== undefined && body.custom_token_amount !== null && body.custom_token_amount !== '';

  if (!hasPackageId && !hasCustomAmount) {
    return next(new ApiError(400, 'Validation failed', [
      {
        field: 'package_id / custom_token_amount',
        message: 'Either package_id (for a fixed package) or custom_token_amount (for a custom amount) is required'
      }
    ]));
  }

  if (hasPackageId && hasCustomAmount) {
    return next(new ApiError(400, 'Validation failed', [
      {
        field: 'package_id / custom_token_amount',
        message: 'Provide either package_id or custom_token_amount — not both'
      }
    ]));
  }

  // ── 2. Mode A: validate package_id ────────────────────────────────────────
  if (hasPackageId) {
    const packageId = typeof body.package_id === 'string' ? body.package_id.trim() : null;

    if (!packageId) {
      errors.push({ field: 'package_id', message: 'package_id must be a non-empty string' });
    } else {
      // Normalise to UPPER_CASE before passing downstream
      req.body.package_id = packageId.toUpperCase();
    }
  }

  // ── 3. Mode B: validate custom_token_amount ────────────────────────────────
  if (hasCustomAmount) {
    const customAmount = Number(body.custom_token_amount);

    if (!Number.isInteger(customAmount) || customAmount < CUSTOM_TOKEN_MIN) {
      errors.push({
        field: 'custom_token_amount',
        message: `custom_token_amount must be a positive integer (minimum ${CUSTOM_TOKEN_MIN})`
      });
    } else if (customAmount > CUSTOM_TOKEN_MAX) {
      errors.push({
        field: 'custom_token_amount',
        message: `custom_token_amount exceeds the maximum of ${CUSTOM_TOKEN_MAX.toLocaleString()} per transaction`
      });
    } else {
      req.body.custom_token_amount = customAmount;
    }
  }

  // ── 4. Validate payment_method (always required) ──────────────────────────
  const allowedMethods = Object.values(PAYMENT_METHOD);
  const paymentMethod = typeof body.payment_method === 'string'
    ? body.payment_method.trim().toUpperCase()
    : null;

  if (!paymentMethod) {
    errors.push({
      field: 'payment_method',
      message: `payment_method is required. Must be one of: ${allowedMethods.join(', ')}`
    });
  } else if (!allowedMethods.includes(paymentMethod)) {
    errors.push({
      field: 'payment_method',
      message: `payment_method must be one of: ${allowedMethods.join(', ')}`
    });
  } else {
    req.body.payment_method = paymentMethod;
  }

  if (errors.length) {
    return next(new ApiError(400, 'Validation failed', errors));
  }

  return next();
}

module.exports = {
  validatePreviewCustomDeposit,
  validateCreatePaymentIntent
};
