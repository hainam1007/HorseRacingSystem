const ApiError = require('../utils/ApiError');

// ─── Allowed VND tiers (mirrors DepositPackage schema enum) ──────────────────
const ALLOWED_VND_PRICES = [10000, 20000, 50000, 100000, 200000, 500000];

// ─── Middleware: POST /api/admin/deposit-packages ─────────────────────────────

/**
 * Validate request body for creating a new deposit package.
 *
 * Required fields: package_id, label, vnd_price, token_received
 * Optional fields: bonus_token (default 0), is_active (default true)
 */
function validateCreateDepositPackage(req, res, next) {
  const body = req.body || {};
  const errors = [];

  // ── package_id ─────────────────────────────────────────────────────────────
  const packageId = typeof body.package_id === 'string' ? body.package_id.trim() : null;

  if (!packageId) {
    errors.push({ field: 'package_id', message: 'package_id is required' });
  } else if (!/^[A-Z0-9_-]{2,32}$/.test(packageId.toUpperCase())) {
    errors.push({
      field: 'package_id',
      message: 'package_id must be 2–32 characters, using only letters, numbers, underscores, or hyphens'
    });
  }

  // ── label ──────────────────────────────────────────────────────────────────
  const label = typeof body.label === 'string' ? body.label.trim() : null;

  if (!label) {
    errors.push({ field: 'label', message: 'label is required' });
  }

  // ── vnd_price ──────────────────────────────────────────────────────────────
  if (body.vnd_price === undefined || body.vnd_price === null || body.vnd_price === '') {
    errors.push({ field: 'vnd_price', message: 'vnd_price is required' });
  } else {
    const vndPriceNum = Number(body.vnd_price);

    if (!Number.isFinite(vndPriceNum) || vndPriceNum <= 0) {
      errors.push({ field: 'vnd_price', message: 'vnd_price must be a positive number' });
    } else if (!ALLOWED_VND_PRICES.includes(vndPriceNum)) {
      errors.push({
        field: 'vnd_price',
        message: `vnd_price must be one of: ${ALLOWED_VND_PRICES.map(function (p) { return p.toLocaleString(); }).join(', ')} VND`
      });
    }
  }

  // ── token_received ─────────────────────────────────────────────────────────
  if (body.token_received === undefined || body.token_received === null || body.token_received === '') {
    errors.push({ field: 'token_received', message: 'token_received is required' });
  } else {
    const tokenReceivedNum = Number(body.token_received);

    if (!Number.isFinite(tokenReceivedNum) || tokenReceivedNum < 1) {
      errors.push({ field: 'token_received', message: 'token_received must be an integer >= 1' });
    }
  }

  // ── bonus_token (optional) ─────────────────────────────────────────────────
  if (body.bonus_token !== undefined && body.bonus_token !== null && body.bonus_token !== '') {
    const bonusTokenNum = Number(body.bonus_token);

    if (!Number.isFinite(bonusTokenNum) || bonusTokenNum < 0) {
      errors.push({ field: 'bonus_token', message: 'bonus_token must be an integer >= 0' });
    }
  }

  if (errors.length) {
    return next(new ApiError(400, 'Validation failed', errors));
  }

  return next();
}

// ─── Middleware: PUT /api/admin/deposit-packages/:id ──────────────────────────

/**
 * Validate request body for updating a deposit package.
 * All fields are optional — at least one must be supplied.
 */
function validateUpdateDepositPackage(req, res, next) {
  const body = req.body || {};
  const errors = [];

  // ── Ensure at least one field is present ───────────────────────────────────
  const updatableFields = ['label', 'vnd_price', 'token_received', 'bonus_token', 'is_active'];
  const providedFields = updatableFields.filter(function (f) { return body[f] !== undefined; });

  if (providedFields.length === 0) {
    return next(new ApiError(400, 'At least one field must be provided for update', {
      updatable_fields: updatableFields
    }));
  }

  // ── label ──────────────────────────────────────────────────────────────────
  if (body.label !== undefined) {
    if (typeof body.label !== 'string' || !body.label.trim()) {
      errors.push({ field: 'label', message: 'label must be a non-empty string' });
    }
  }

  // ── vnd_price ──────────────────────────────────────────────────────────────
  if (body.vnd_price !== undefined) {
    const vndPriceNum = Number(body.vnd_price);

    if (!Number.isFinite(vndPriceNum) || vndPriceNum <= 0) {
      errors.push({ field: 'vnd_price', message: 'vnd_price must be a positive number' });
    } else if (!ALLOWED_VND_PRICES.includes(vndPriceNum)) {
      errors.push({
        field: 'vnd_price',
        message: `vnd_price must be one of: ${ALLOWED_VND_PRICES.map(function (p) { return p.toLocaleString(); }).join(', ')} VND`
      });
    }
  }

  // ── token_received ─────────────────────────────────────────────────────────
  if (body.token_received !== undefined) {
    const tokenReceivedNum = Number(body.token_received);

    if (!Number.isFinite(tokenReceivedNum) || tokenReceivedNum < 1) {
      errors.push({ field: 'token_received', message: 'token_received must be an integer >= 1' });
    }
  }

  // ── bonus_token ────────────────────────────────────────────────────────────
  if (body.bonus_token !== undefined) {
    const bonusTokenNum = Number(body.bonus_token);

    if (!Number.isFinite(bonusTokenNum) || bonusTokenNum < 0) {
      errors.push({ field: 'bonus_token', message: 'bonus_token must be an integer >= 0' });
    }
  }

  // ── is_active ──────────────────────────────────────────────────────────────
  if (body.is_active !== undefined) {
    if (typeof body.is_active !== 'boolean') {
      errors.push({ field: 'is_active', message: 'is_active must be a boolean (true or false)' });
    }
  }

  if (errors.length) {
    return next(new ApiError(400, 'Validation failed', errors));
  }

  return next();
}

module.exports = {
  validateCreateDepositPackage,
  validateUpdateDepositPackage
};
