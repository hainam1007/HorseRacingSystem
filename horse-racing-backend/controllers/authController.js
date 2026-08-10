const authService = require('../services/authService');
const { sendSuccess } = require('../utils/apiResponse');

async function getRoleOptions(req, res) {
  const roles = await authService.getRoleOptions();

  return sendSuccess(res, 200, 'Role options retrieved successfully', {
    roles: roles
  });
}

async function register(req, res) {
  const data = await authService.register(req.validatedBody);

  return sendSuccess(res, 201, 'Registered successfully', data);
}

async function registerHorseOwner(req, res) {
  const data = await authService.register(req.validatedBody);

  return sendSuccess(res, 201, 'Horse owner registered successfully', data);
}

async function login(req, res) {
  const data = await authService.login(req.validatedBody);

  return sendSuccess(res, 200, 'Logged in successfully', data);
}

async function getMe(req, res) {
  const data = await authService.getMe(req.user._id);

  return sendSuccess(res, 200, 'Current user retrieved successfully', data);
}

async function verifyAccount(req, res) {
  const data = await authService.verifyAccount(req.validatedBody);

  return sendSuccess(res, 200, 'Account verified successfully', data);
}

async function resendVerification(req, res) {
  const data = await authService.resendVerification(req.validatedBody);

  return sendSuccess(res, 200, 'Verification OTP sent if the email exists', data);
}

async function forgotPassword(req, res) {
  const data = await authService.forgotPassword(req.validatedBody);

  return sendSuccess(res, 200, 'Password reset OTP sent if the email exists', data);
}

async function resetPassword(req, res) {
  const data = await authService.resetPassword(req.validatedBody);

  return sendSuccess(res, 200, 'Password reset successfully', data);
}

async function changePassword(req, res) {
  const data = await authService.changePassword(req.user._id, req.validatedBody);

  return sendSuccess(res, 200, 'Password changed successfully', data);
}

async function logout(req, res) {
  const data = await authService.logout(req.user, req.token);

  return sendSuccess(res, 200, 'Logged out successfully', data);
}

module.exports = {
  getRoleOptions,
  register,
  registerHorseOwner,
  login,
  getMe,
  verifyAccount,
  resendVerification,
  forgotPassword,
  resetPassword,
  changePassword,
  logout
};
