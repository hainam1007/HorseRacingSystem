/**
 * ─── Admin Deposit Package Service ───────────────────────────────────────────
 *
 * Provides CRUD operations for managing DepositPackage documents.
 * All functions are restricted to admin callers (enforced at the route layer).
 *
 * Design decisions:
 *   - package_id is IMMUTABLE after creation (changing it would silently break
 *     the snapshot reference stored inside every DepositRequest document).
 *   - DELETE always uses soft-delete (is_active: false) to preserve audit trails
 *     and financial reconciliation data, regardless of order history.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const ApiError = require('../utils/ApiError');
const depositPackageRepository = require('../repositories/depositPackageRepository');

// ─── Allowed VND tiers — mirrors the schema enum ─────────────────────────────
const ALLOWED_VND_PRICES = [10000, 20000, 50000, 100000, 200000, 500000];

// ─── Helper ───────────────────────────────────────────────────────────────────

/**
 * Compute the total tokens a user receives (base + bonus).
 * Appended to every package object returned to admins.
 *
 * @param {object} pkg - Lean DepositPackage document
 * @returns {object} Package enriched with total_token
 */
function enrichPackage(pkg) {
  return Object.assign({}, pkg, {
    total_token: (pkg.token_received || 0) + (pkg.bonus_token || 0)
  });
}

// ─── Service Functions ────────────────────────────────────────────────────────

/**
 * Return ALL deposit packages (active + inactive) for the admin panel.
 * Sorted cheapest → most expensive.
 *
 * @returns {Promise<{ packages: DepositPackage[] }>}
 */
async function listAllPackages() {
  const packages = await depositPackageRepository.findAll();
  return { packages: packages.map(enrichPackage) };
}

/**
 * Create a new deposit package.
 *
 * Validations:
 *   - package_id must not already exist (case-insensitive).
 *   - vnd_price must be one of the approved tiers.
 *   - token_received must be >= 1.
 *   - bonus_token must be >= 0.
 *
 * @param {object} payload
 * @param {string} payload.package_id      - Unique string ID (e.g. "PKG_75K")
 * @param {string} payload.label           - Display name shown to users
 * @param {number} payload.vnd_price       - Must be in ALLOWED_VND_PRICES
 * @param {number} payload.token_received  - Base tokens (>= 1)
 * @param {number} payload.bonus_token     - Bonus tokens (>= 0, default 0)
 * @param {boolean} [payload.is_active]    - Defaults to true
 * @returns {Promise<{ package: DepositPackage }>}
 */
async function createPackage(payload) {
  const {
    package_id,
    label,
    vnd_price,
    token_received,
    bonus_token = 0,
    is_active = true
  } = payload;

  // ── 1. Required field presence ─────────────────────────────────────────────
  const errors = [];

  if (!package_id || typeof package_id !== 'string' || !package_id.trim()) {
    errors.push({ field: 'package_id', message: 'package_id is required and must be a non-empty string' });
  }

  if (!label || typeof label !== 'string' || !label.trim()) {
    errors.push({ field: 'label', message: 'label is required and must be a non-empty string' });
  }

  const vndPriceNum = Number(vnd_price);

  if (!Number.isFinite(vndPriceNum) || vndPriceNum <= 0) {
    errors.push({ field: 'vnd_price', message: 'vnd_price must be a positive number' });
  } else if (!ALLOWED_VND_PRICES.includes(vndPriceNum)) {
    errors.push({
      field: 'vnd_price',
      message: `vnd_price must be one of: ${ALLOWED_VND_PRICES.map(function (p) { return p.toLocaleString(); }).join(', ')} VND`
    });
  }

  const tokenReceivedNum = Number(token_received);

  if (!Number.isFinite(tokenReceivedNum) || tokenReceivedNum < 1) {
    errors.push({ field: 'token_received', message: 'token_received must be an integer >= 1' });
  }

  const bonusTokenNum = Number(bonus_token);

  if (!Number.isFinite(bonusTokenNum) || bonusTokenNum < 0) {
    errors.push({ field: 'bonus_token', message: 'bonus_token must be an integer >= 0' });
  }

  if (errors.length) {
    throw new ApiError(400, 'Validation failed', errors);
  }

  // ── 2. Uniqueness check on package_id ─────────────────────────────────────
  const existing = await depositPackageRepository.findByPackageId(package_id.trim());

  if (existing) {
    throw new ApiError(409, `A deposit package with package_id "${package_id.trim().toUpperCase()}" already exists`, {
      existing_id: existing._id,
      is_active: existing.is_active
    });
  }

  // ── 3. Persist ────────────────────────────────────────────────────────────
  const created = await depositPackageRepository.createPackage({
    package_id: package_id.trim().toUpperCase(),
    label: label.trim(),
    vnd_price: vndPriceNum,
    token_received: Math.floor(tokenReceivedNum),
    bonus_token: Math.floor(bonusTokenNum),
    is_active: Boolean(is_active)
  });

  return { package: enrichPackage(created.toObject()) };
}

/**
 * Update an existing deposit package by its primary key.
 *
 * Rules:
 *   - package_id cannot be changed (silently ignored if supplied).
 *   - Any subset of { label, vnd_price, token_received, bonus_token, is_active } can be updated.
 *   - Numeric fields are re-validated if supplied.
 *   - Existing PENDING / SUCCESS orders are NOT affected — they carry a snapshot.
 *
 * @param {string} id      - Primary key of the package
 * @param {object} payload - Fields to update
 * @returns {Promise<{ package: DepositPackage }>}
 */
async function updatePackage(id, payload) {
  // ── 1. Ensure the package exists ──────────────────────────────────────────
  const existing = await depositPackageRepository.findById(id);

  if (!existing) {
    throw new ApiError(404, 'Deposit package not found');
  }

  // ── 2. Build validated update object ──────────────────────────────────────
  const errors = [];
  const updateData = {};

  if (payload.label !== undefined) {
    if (typeof payload.label !== 'string' || !payload.label.trim()) {
      errors.push({ field: 'label', message: 'label must be a non-empty string' });
    } else {
      updateData.label = payload.label.trim();
    }
  }

  if (payload.vnd_price !== undefined) {
    const vndPriceNum = Number(payload.vnd_price);

    if (!Number.isFinite(vndPriceNum) || vndPriceNum <= 0) {
      errors.push({ field: 'vnd_price', message: 'vnd_price must be a positive number' });
    } else if (!ALLOWED_VND_PRICES.includes(vndPriceNum)) {
      errors.push({
        field: 'vnd_price',
        message: `vnd_price must be one of: ${ALLOWED_VND_PRICES.map(function (p) { return p.toLocaleString(); }).join(', ')} VND`
      });
    } else {
      updateData.vnd_price = vndPriceNum;
    }
  }

  if (payload.token_received !== undefined) {
    const tokenReceivedNum = Number(payload.token_received);

    if (!Number.isFinite(tokenReceivedNum) || tokenReceivedNum < 1) {
      errors.push({ field: 'token_received', message: 'token_received must be an integer >= 1' });
    } else {
      updateData.token_received = Math.floor(tokenReceivedNum);
    }
  }

  if (payload.bonus_token !== undefined) {
    const bonusTokenNum = Number(payload.bonus_token);

    if (!Number.isFinite(bonusTokenNum) || bonusTokenNum < 0) {
      errors.push({ field: 'bonus_token', message: 'bonus_token must be an integer >= 0' });
    } else {
      updateData.bonus_token = Math.floor(bonusTokenNum);
    }
  }

  if (payload.is_active !== undefined) {
    updateData.is_active = Boolean(payload.is_active);
  }

  if (errors.length) {
    throw new ApiError(400, 'Validation failed', errors);
  }

  if (Object.keys(updateData).length === 0) {
    throw new ApiError(400, 'No valid fields provided for update');
  }

  // ── 3. Persist update ─────────────────────────────────────────────────────
  const updated = await depositPackageRepository.updateById(id, updateData);

  if (!updated) {
    throw new ApiError(404, 'Deposit package not found');
  }

  return { package: enrichPackage(updated.toObject()) };
}

/**
 * Soft-delete a deposit package (always — regardless of order history).
 *
 * Strategy:
 *   - Sets is_active: false unconditionally.
 *   - The package document is NEVER hard-deleted, preserving financial audit trails.
 *   - Spectators immediately stop seeing the package (public API filters is_active: true).
 *   - Existing PENDING orders continue to process normally — DepositRequest stores
 *     a snapshot of total_vnd / total_token at creation time, so no order is disrupted.
 *   - Existing SUCCESS orders remain fully intact for revenue reporting.
 *   - The response includes a has_successful_orders flag so admins know whether
 *     historical revenue data is attached to this package.
 *
 * @param {string} id - Primary key of the package
 * @returns {Promise<{ package: DepositPackage, has_successful_orders: boolean, message: string }>}
 */
async function deletePackage(id) {
  // ── 1. Ensure the package exists ──────────────────────────────────────────
  const existing = await depositPackageRepository.findById(id);

  if (!existing) {
    throw new ApiError(404, 'Deposit package not found');
  }

  // ── 2. Check for historical SUCCESS orders (informational only — not a blocker) ──
  const hasOrders = await depositPackageRepository.hasSuccessfulOrders(existing.package_id);

  // ── 3. Soft-delete: set is_active: false ──────────────────────────────────
  //   If the package is already inactive, this is a no-op update but still succeeds.
  const deleted = await depositPackageRepository.softDeleteById(id);

  const message = hasOrders
    ? `Package "${existing.package_id}" has been deactivated. It had successful orders — ` +
      'the record is preserved in the database for revenue reporting.'
    : `Package "${existing.package_id}" has been deactivated. No successful orders were associated with it.'`;

  return {
    package: enrichPackage(deleted.toObject()),
    has_successful_orders: hasOrders,
    message
  };
}

module.exports = {
  listAllPackages,
  createPackage,
  updatePackage,
  deletePackage
};
