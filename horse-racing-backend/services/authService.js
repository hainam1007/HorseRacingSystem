const ApiError = require('../utils/ApiError');
const { ROLE_OPTIONS } = require('../constants/roles');
const { comparePassword, hashPassword } = require('../utils/password');
const { signAuthToken } = require('../utils/jwt');
const {
  generateOtp,
  getPasswordResetExpiry,
  getVerificationExpiry,
  hashToken
} = require('../utils/token');
const roleRepository = require('../repositories/roleRepository');
const userRepository = require('../repositories/userRepository');
const profileRepository = require('../repositories/profileRepository');
const emailService = require('./emailService');
const cloudinaryService = require('./cloudinaryService');

function sanitizeUser(user) {
  const plainUser = typeof user.toObject === 'function' ? user.toObject() : user;

  delete plainUser.password;

  return plainUser;
}

function buildAuthResponse(user, roles, profiles) {
  const token = signAuthToken({
    user_id: user._id.toString(),
    roles: roles
  });

  return {
    token: token,
    token_type: 'Bearer',
    expires_in: process.env.JWT_EXPIRES_IN || '7d',
    user: sanitizeUser(user),
    roles: roles,
    profiles: profiles || {}
  };
}

function shouldExposeDevToken() {
  return process.env.NODE_ENV !== 'production';
}

function buildTokenResponse(token, expiresAt, exposedFieldName) {
  const response = {
    expires_at: expiresAt
  };

  if (shouldExposeDevToken()) {
    response[exposedFieldName || 'token'] = token;
  }

  return response;
}

async function getRoleOptions() {
  const dbRoles = await roleRepository.getAllRoles();
  const roleMap = dbRoles.reduce(function(result, role) {
    result[role.role_name] = role;
    return result;
  }, {});

  return ROLE_OPTIONS.map(function(role) {
    return {
      value: role.value,
      label: role.label,
      description: role.description,
      id: roleMap[role.value] ? roleMap[role.value]._id : null
    };
  });
}

async function register(payload) {
  const existingUser = await userRepository.findByEmail(payload.email);

  if (existingUser) {
    throw new ApiError(409, 'Email is already registered');
  }

  const hashedPassword = await hashPassword(payload.password);
  const verificationOtp = generateOtp();
  const verificationExpiresAt = getVerificationExpiry();
  const roleDocs = await roleRepository.findByNames(payload.roles);
  const avatarUpload = await cloudinaryService.uploadOptionalSource(
    payload.avatar_file_data || payload.avatar_file,
    payload.avatar_url,
    { folder: 'horse-racing/avatars', resource_type: 'image' }
  );

  if (roleDocs.length !== payload.roles.length) {
    throw new ApiError(400, 'One or more roles are not available');
  }

  const user = await userRepository.createUser({
    full_name: payload.full_name,
    email: payload.email,
    password: hashedPassword,
    phone_number: payload.phone_number,
    date_of_birth: payload.date_of_birth,
    avatar_url: avatarUpload ? avatarUpload.secure_url : payload.avatar_url,
    avatar_public_id: avatarUpload ? avatarUpload.public_id : undefined,
    status: 'pending_verification',
    email_verified: false,
    email_verification_token: hashToken(verificationOtp),
    email_verification_expires_at: verificationExpiresAt
  });

  let profiles;

  try {
    await userRepository.assignRoles(user._id, roleDocs);
    profiles = await profileRepository.createProfiles(user._id, payload.roles, payload.profiles);
  } catch (error) {
    throw new ApiError(500, 'User was created but role/profile setup failed', {
      user_id: user._id,
      reason: error.message
    });
  }

  let email;

  try {
    email = await emailService.sendVerificationEmail(user, verificationOtp, verificationExpiresAt);
  } catch (error) {
    console.error('Unable to send registration verification email:', error.message);
    email = {
      skipped: false,
      failed: true,
      reason: 'Verification email could not be sent. Request a new OTP to try again.'
    };
  }

  return {
    user: sanitizeUser(user),
    roles: payload.roles,
    profiles: profiles,
    verification: buildTokenResponse(verificationOtp, verificationExpiresAt, 'otp'),
    email: email
  };
}

async function login(payload) {
  const user = await userRepository.findByEmailWithPassword(payload.email);

  if (!user) {
    throw new ApiError(401, 'Invalid email or password');
  }

  const passwordMatches = await comparePassword(payload.password, user.password);

  if (!passwordMatches) {
    throw new ApiError(401, 'Invalid email or password');
  }

  if (user.status === 'blocked' || user.status === 'disabled') {
    throw new ApiError(403, 'User account is not active');
  }

  if (!user.email_verified) {
    throw new ApiError(403, 'User account is not verified');
  }

  const roles = await userRepository.getRoleNamesByUserId(user._id);

  return buildAuthResponse(user, roles, {});
}

async function getMe(userId) {
  const userWithRoles = await userRepository.getUserWithRoles(userId);

  if (!userWithRoles) {
    throw new ApiError(404, 'User not found');
  }

  const profiles = await profileRepository.getProfilesByUserId(userId);

  return {
    user: sanitizeUser(userWithRoles.user),
    roles: userWithRoles.roles,
    profiles: profiles
  };
}

async function verifyAccount(payload) {
  const verificationCode = payload.otp || payload.token;
  const user = await userRepository.findByVerificationToken(hashToken(verificationCode));

  if (!user) {
    throw new ApiError(400, 'Verification OTP is invalid or expired');
  }

  const updatedUser = await userRepository.updateById(user._id, {
    $set: {
      email_verified: true,
      email_verified_at: new Date(),
      status: user.status === 'pending_verification' ? 'active' : user.status
    },
    $unset: {
      email_verification_token: '',
      email_verification_expires_at: ''
    }
  });

  const roles = await userRepository.getRoleNamesByUserId(updatedUser._id);

  return {
    user: sanitizeUser(updatedUser),
    roles: roles
  };
}

async function resendVerification(payload) {
  const user = await userRepository.findByEmailWithAuthSecrets(payload.email);

  if (!user) {
    return {
      sent: true
    };
  }

  if (user.email_verified) {
    return {
      sent: false,
      already_verified: true
    };
  }

  const verificationOtp = generateOtp();
  const verificationExpiresAt = getVerificationExpiry();

  await userRepository.updateById(user._id, {
    $set: {
      status: 'pending_verification',
      email_verification_token: hashToken(verificationOtp),
      email_verification_expires_at: verificationExpiresAt
    }
  });
  const email = await emailService.sendVerificationEmail(user, verificationOtp, verificationExpiresAt);

  return {
    sent: true,
    verification: buildTokenResponse(verificationOtp, verificationExpiresAt, 'otp'),
    email: email
  };
}

async function forgotPassword(payload) {
  const user = await userRepository.findByEmailWithAuthSecrets(payload.email);

  if (!user || user.status === 'blocked' || user.status === 'disabled' || !user.email_verified) {
    return {
      sent: true
    };
  }

  const resetOtp = generateOtp();
  const resetExpiresAt = getPasswordResetExpiry();

  await userRepository.updateById(user._id, {
    $set: {
      password_reset_token: hashToken(resetOtp),
      password_reset_expires_at: resetExpiresAt
    }
  });
  const email = await emailService.sendPasswordResetEmail(user, resetOtp, resetExpiresAt);

  return {
    sent: true,
    reset: buildTokenResponse(resetOtp, resetExpiresAt, 'otp'),
    email: email
  };
}

async function resetPassword(payload) {
  const resetCode = payload.otp || payload.token;
  const user = await userRepository.findByPasswordResetToken(hashToken(resetCode));

  if (!user) {
    throw new ApiError(400, 'Password reset OTP is invalid or expired');
  }

  const hashedPassword = await hashPassword(payload.new_password);

  const updatedUser = await userRepository.updateById(user._id, {
    $set: {
      password: hashedPassword,
      password_changed_at: new Date()
    },
    $unset: {
      password_reset_token: '',
      password_reset_expires_at: ''
    }
  });

  return {
    user: sanitizeUser(updatedUser)
  };
}

async function changePassword(userId, payload) {
  const user = await userRepository.findByIdWithPassword(userId);

  if (!user) {
    throw new ApiError(404, 'User not found');
  }

  const passwordMatches = await comparePassword(payload.current_password, user.password);

  if (!passwordMatches) {
    throw new ApiError(401, 'Current password is incorrect');
  }

  const hashedPassword = await hashPassword(payload.new_password);
  const updatedUser = await userRepository.updateById(user._id, {
    $set: {
      password: hashedPassword,
      password_changed_at: new Date()
    },
    $unset: {
      password_reset_token: '',
      password_reset_expires_at: ''
    }
  });

  return {
    user: sanitizeUser(updatedUser)
  };
}

async function logout() {
  return {
    logged_out: true
  };
}

module.exports = {
  getRoleOptions,
  register,
  login,
  getMe,
  verifyAccount,
  resendVerification,
  forgotPassword,
  resetPassword,
  changePassword,
  logout
};
