const adminDepositPackageService = require('../services/adminDepositPackageService');
const { sendSuccess } = require('../utils/apiResponse');

/**
 * GET /api/admin/deposit-packages
 * Return ALL packages (active + inactive) for the admin dashboard.
 */
async function listAllPackages(req, res) {
  const data = await adminDepositPackageService.listAllPackages();
  return sendSuccess(res, 200, 'All deposit packages retrieved successfully', data);
}

/**
 * POST /api/admin/deposit-packages
 * Create a new deposit package.
 * Body: { package_id, label, vnd_price, token_received, bonus_token?, is_active? }
 */
async function createPackage(req, res) {
  const data = await adminDepositPackageService.createPackage(req.body);
  return sendSuccess(res, 201, 'Deposit package created successfully', data);
}

/**
 * PUT /api/admin/deposit-packages/:id
 * Update a deposit package by its MongoDB _id.
 * Body: any subset of { label, vnd_price, token_received, bonus_token, is_active }
 * Note: package_id is immutable and ignored even if supplied.
 */
async function updatePackage(req, res) {
  const data = await adminDepositPackageService.updatePackage(req.params.id, req.body);
  return sendSuccess(res, 200, 'Deposit package updated successfully', data);
}

/**
 * DELETE /api/admin/deposit-packages/:id
 * Soft-delete a package (sets is_active: false).
 * Blocked with 409 if the package has any SUCCESS orders (financial integrity guard).
 */
async function deletePackage(req, res) {
  const data = await adminDepositPackageService.deletePackage(req.params.id);
  return sendSuccess(res, 200, data.message, data);
}

module.exports = {
  listAllPackages,
  createPackage,
  updatePackage,
  deletePackage
};
