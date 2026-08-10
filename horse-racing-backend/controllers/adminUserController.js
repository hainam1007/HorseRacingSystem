const adminUserService = require('../services/adminUserService');
const { sendSuccess } = require('../utils/apiResponse');

async function listUsers(req, res) {
  const data = await adminUserService.listUsers(req.validatedQuery);

  return sendSuccess(res, 200, 'User list retrieved successfully', data);
}

async function getUserDetail(req, res) {
  const data = await adminUserService.getUserDetail(req.params.id);

  return sendSuccess(res, 200, 'User detail retrieved successfully', data);
}

async function updateUserStatus(req, res) {
  const data = await adminUserService.updateUserStatus(req.params.id, req.validatedBody);

  return sendSuccess(res, 200, 'User status updated successfully', data);
}

async function assignRole(req, res) {
  const data = await adminUserService.assignRole(req.params.id, req.validatedBody.role_name);

  return sendSuccess(res, 200, 'User role assigned successfully', data);
}

async function removeRole(req, res) {
  const data = await adminUserService.removeRole(req.params.id, req.validatedParams.roleName);

  return sendSuccess(res, 200, 'User role removed successfully', data);
}

module.exports = {
  assignRole,
  getUserDetail,
  listUsers,
  removeRole,
  updateUserStatus
};
