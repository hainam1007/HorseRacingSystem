const express = require('express');

const authController = require('../controllers/authController');
const authenticate = require('../middlewares/authenticate');
const asyncHandler = require('../utils/asyncHandler');
const {
  validateChangePassword,
  validateForgotPassword,
  validateHorseOwnerRegister,
  validateLogin,
  validateRegister,
  validateResetPassword,
  validateToken
} = require('../validators/authValidator');

const router = express.Router();

router.get('/roles', asyncHandler(authController.getRoleOptions));
router.post('/register', validateRegister, asyncHandler(authController.register));
router.post('/register/horse-owner', validateHorseOwnerRegister, asyncHandler(authController.registerHorseOwner));
router.post('/login', validateLogin, asyncHandler(authController.login));
router.get('/me', authenticate, asyncHandler(authController.getMe));
router.post('/verify-account', validateToken, asyncHandler(authController.verifyAccount));
router.post('/resend-verification', validateForgotPassword, asyncHandler(authController.resendVerification));
router.post('/forgot-password', validateForgotPassword, asyncHandler(authController.forgotPassword));
router.post('/reset-password', validateResetPassword, asyncHandler(authController.resetPassword));
router.post(
  '/change-password',
  authenticate,
  validateChangePassword,
  asyncHandler(authController.changePassword)
);
router.post('/logout', authenticate, asyncHandler(authController.logout));

module.exports = router;
