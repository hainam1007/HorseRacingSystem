const assert = require('node:assert/strict');
const test = require('node:test');
const { newObjectId } = require('../utils/objectId');
const { ROLE_NAMES } = require('../constants/roles');
const roleRepository = require('../repositories/roleRepository');
const userRepository = require('../repositories/userRepository');
const profileRepository = require('../repositories/profileRepository');
const authService = require('../services/authService');
const cloudinaryService = require('../services/cloudinaryService');
const emailService = require('../services/emailService');

const originals = {
  findByEmail: userRepository.findByEmail,
  createUser: userRepository.createUser,
  assignRoles: userRepository.assignRoles,
  findByNames: roleRepository.findByNames,
  createProfiles: profileRepository.createProfiles,
  uploadOptionalSource: cloudinaryService.uploadOptionalSource,
  sendVerificationEmail: emailService.sendVerificationEmail
};

test.afterEach(() => {
  userRepository.findByEmail = originals.findByEmail;
  userRepository.createUser = originals.createUser;
  userRepository.assignRoles = originals.assignRoles;
  roleRepository.findByNames = originals.findByNames;
  profileRepository.createProfiles = originals.createProfiles;
  cloudinaryService.uploadOptionalSource = originals.uploadOptionalSource;
  emailService.sendVerificationEmail = originals.sendVerificationEmail;
});

test('registration remains successful when verification email delivery fails', async () => {
  const userId = newObjectId();

  userRepository.findByEmail = async () => null;
  roleRepository.findByNames = async () => [{ _id: newObjectId(), role_name: ROLE_NAMES.SPECTATOR }];
  cloudinaryService.uploadOptionalSource = async () => null;
  userRepository.createUser = async (payload) => ({
    _id: userId,
    ...payload
  });
  userRepository.assignRoles = async () => true;
  profileRepository.createProfiles = async () => ({});
  emailService.sendVerificationEmail = async () => {
    throw new Error('SMTP unavailable');
  };

  const result = await authService.register({
    full_name: 'Production Signup',
    email: 'production-signup@example.com',
    password: 'Password123',
    roles: [ROLE_NAMES.SPECTATOR],
    profiles: {}
  });

  assert.equal(String(result.user._id), String(userId));
  assert.deepEqual(result.roles, [ROLE_NAMES.SPECTATOR]);
  assert.equal(result.user.status, 'pending_verification');
  assert.equal(result.email.failed, true);
  assert.match(result.email.reason, /Request a new OTP/);
});
