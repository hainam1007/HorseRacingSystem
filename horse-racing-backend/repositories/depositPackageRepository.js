const { DepositPackage, DepositRequest } = require('../models');
const { DEPOSIT_REQUEST_STATUS } = require('../constants/depositStatuses');

// ─── Spectator-facing (read-only, active only) ────────────────────────────────

/**
 * Return all active deposit packages sorted cheapest → most expensive.
 * Only packages with is_active: true are visible to users.
 *
 * @returns {Promise<DepositPackage[]>}
 */
async function findAllActivePackages() {
  return DepositPackage.find({ is_active: true })
    .sort({ vnd_price: 1 })
    .lean();
}

/**
 * Find a single active package by its string identifier (e.g. "PKG_50K").
 * Returns null if not found or the package is inactive.
 *
 * @param {string} packageId
 * @returns {Promise<DepositPackage|null>}
 */
async function findActivePackageById(packageId) {
  return DepositPackage.findOne({
    package_id: packageId.toUpperCase(),
    is_active: true
  }).lean();
}

// ─── Admin-facing (full CRUD, all statuses) ───────────────────────────────────

/**
 * Return ALL deposit packages (active + inactive) sorted newest first.
 * Used by admin dashboards where full visibility is required.
 *
 * @returns {Promise<DepositPackage[]>}
 */
async function findAll() {
  return DepositPackage.find({})
    .sort({ created_at: -1, vnd_price: 1 })
    .lean();
}

/**
 * Find a package by its MongoDB _id. Returns the raw document regardless of
 * active status — used by admin update / delete flows.
 *
 * @param {string|ObjectId} id - MongoDB _id
 * @returns {Promise<DepositPackage|null>}
 */
async function findById(id) {
  return DepositPackage.findById(id).lean();
}

/**
 * Find a package by its string package_id (case-insensitive via uppercase normalisation).
 * Used during creation to enforce uniqueness before hitting the DB unique index.
 *
 * @param {string} packageId - e.g. "PKG_50K"
 * @returns {Promise<DepositPackage|null>}
 */
async function findByPackageId(packageId) {
  return DepositPackage.findOne({ package_id: packageId.toUpperCase() }).lean();
}

/**
 * Persist a new deposit package document.
 *
 * @param {object} data - { package_id, label, vnd_price, token_received, bonus_token, is_active }
 * @returns {Promise<DepositPackage>}
 */
async function createPackage(data) {
  return DepositPackage.create(data);
}

/**
 * Update a deposit package by its MongoDB _id.
 * Only the supplied fields are updated; unspecified fields are left unchanged.
 * Returns the updated document or null if not found.
 *
 * Note: package_id is intentionally NOT updatable here. Changing a package's
 * string ID would break the snapshot reference stored in DepositRequest documents.
 *
 * @param {string|ObjectId} id
 * @param {object} updateData - { label?, vnd_price?, token_received?, bonus_token?, is_active? }
 * @returns {Promise<DepositPackage|null>}
 */
async function updateById(id, updateData) {
  return DepositPackage.findByIdAndUpdate(
    id,
    { $set: updateData },
    { returnDocument: 'after', runValidators: true }
  );
}

/**
 * Soft-delete a package by setting is_active: false.
 * The document remains in the DB for audit and historical order traceability.
 * Returns the updated document or null if not found.
 *
 * @param {string|ObjectId} id
 * @returns {Promise<DepositPackage|null>}
 */
async function softDeleteById(id) {
  return DepositPackage.findByIdAndUpdate(
    id,
    { $set: { is_active: false } },
    { returnDocument: 'after', runValidators: true }
  );
}

/**
 * Check whether any DepositRequest with status SUCCESS exists for a given
 * package_id string. Used to enforce the "block hard delete if orders exist" rule.
 *
 * @param {string} packageId - The string package_id (e.g. "PKG_50K")
 * @returns {Promise<boolean>}
 */
async function hasSuccessfulOrders(packageId) {
  const count = await DepositRequest.countDocuments({
    package_id: packageId,
    status: DEPOSIT_REQUEST_STATUS.SUCCESS
  });
  return count > 0;
}

module.exports = {
  // Spectator-facing
  findAllActivePackages,
  findActivePackageById,
  // Admin-facing
  findAll,
  findById,
  findByPackageId,
  createPackage,
  updateById,
  softDeleteById,
  hasSuccessfulOrders
};
