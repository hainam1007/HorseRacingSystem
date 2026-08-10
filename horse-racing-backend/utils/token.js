const crypto = require('crypto');

function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}

function generateOtp() {
  return crypto.randomInt(100000, 1000000).toString();
}

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function getFutureDate(minutes) {
  return new Date(Date.now() + minutes * 60 * 1000);
}

function getVerificationExpiry() {
  return getFutureDate(Number(process.env.EMAIL_VERIFICATION_TOKEN_EXPIRES_MINUTES || 1440));
}

function getPasswordResetExpiry() {
  return getFutureDate(Number(process.env.PASSWORD_RESET_TOKEN_EXPIRES_MINUTES || 15));
}

module.exports = {
  generateOtp,
  generateToken,
  hashToken,
  getVerificationExpiry,
  getPasswordResetExpiry
};
