const ApiError = require('../utils/ApiError');
const { ROLE_NAMES } = require('../constants/roles');

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function getString(value) {
  if (typeof value !== 'string') {
    return '';
  }

  return value.trim();
}

function validateRegister(req, res, next) {
  const errors = [];
  const body = req.body || {};
  const fullName = getString(body.full_name);
  const email = getString(body.email).toLowerCase();
  const password = getString(body.password);

  if (!fullName) {
    errors.push({ field: 'full_name', message: 'full_name is required' });
  }

  if (!email) {
    errors.push({ field: 'email', message: 'email is required' });
  } else if (!EMAIL_PATTERN.test(email)) {
    errors.push({ field: 'email', message: 'email is invalid' });
  }

  if (!password) {
    errors.push({ field: 'password', message: 'password is required' });
  } else if (password.length < 8) {
    errors.push({ field: 'password', message: 'password must be at least 8 characters' });
  }

  if (errors.length) {
    return next(new ApiError(400, 'Validation failed', errors));
  }

  req.validatedBody = Object.assign({}, body, {
    full_name: fullName,
    email: email,
    password: password,
    roles: [ROLE_NAMES.SPECTATOR],
    profiles: {}
  });

  return next();
}

function validateHorseOwnerRegister(req, res, next) {
  const errors = [];
  const body = req.body || {};
  const fullName = getString(body.full_name);
  const email = getString(body.email).toLowerCase();
  const password = getString(body.password);

  if (!fullName) {
    errors.push({ field: 'full_name', message: 'full_name is required' });
  }

  if (!email) {
    errors.push({ field: 'email', message: 'email is required' });
  } else if (!EMAIL_PATTERN.test(email)) {
    errors.push({ field: 'email', message: 'email is invalid' });
  }

  if (!password) {
    errors.push({ field: 'password', message: 'password is required' });
  } else if (password.length < 8) {
    errors.push({ field: 'password', message: 'password must be at least 8 characters' });
  }

  if (errors.length) {
    return next(new ApiError(400, 'Validation failed', errors));
  }

  req.validatedBody = Object.assign({}, body, {
    full_name: fullName,
    email: email,
    password: password,
    roles: [ROLE_NAMES.SPECTATOR],
    profiles: {}
  });

  return next();
}

function validateLogin(req, res, next) {
  const errors = [];
  const body = req.body || {};
  const email = getString(body.email).toLowerCase();
  const password = getString(body.password);

  if (!email) {
    errors.push({ field: 'email', message: 'email is required' });
  } else if (!EMAIL_PATTERN.test(email)) {
    errors.push({ field: 'email', message: 'email is invalid' });
  }

  if (!password) {
    errors.push({ field: 'password', message: 'password is required' });
  }

  if (errors.length) {
    return next(new ApiError(400, 'Validation failed', errors));
  }

  req.validatedBody = {
    email: email,
    password: password
  };

  return next();
}

function validateToken(req, res, next) {
  const body = req.body || {};
  const otp = getString(body.otp);
  const token = getString(body.token);
  const verificationCode = otp || token;

  if (!verificationCode) {
    return next(new ApiError(400, 'Validation failed', [
      { field: 'otp', message: 'otp is required' }
    ]));
  }

  req.validatedBody = {
    otp: verificationCode
  };

  return next();
}

function validateForgotPassword(req, res, next) {
  const body = req.body || {};
  const email = getString(body.email).toLowerCase();

  if (!email || !EMAIL_PATTERN.test(email)) {
    return next(new ApiError(400, 'Validation failed', [
      { field: 'email', message: 'valid email is required' }
    ]));
  }

  req.validatedBody = {
    email: email
  };

  return next();
}

function validateResetPassword(req, res, next) {
  const errors = [];
  const body = req.body || {};
  const otp = getString(body.otp);
  const token = getString(body.token);
  const resetCode = otp || token;
  const newPassword = getString(body.new_password || body.password);

  if (!resetCode) {
    errors.push({ field: 'otp', message: 'otp is required' });
  }

  if (!newPassword) {
    errors.push({ field: 'new_password', message: 'new_password is required' });
  } else if (newPassword.length < 8) {
    errors.push({ field: 'new_password', message: 'new_password must be at least 8 characters' });
  }

  if (errors.length) {
    return next(new ApiError(400, 'Validation failed', errors));
  }

  req.validatedBody = {
    otp: resetCode,
    new_password: newPassword
  };

  return next();
}

function validateChangePassword(req, res, next) {
  const errors = [];
  const body = req.body || {};
  const currentPassword = getString(body.current_password || body.old_password);
  const newPassword = getString(body.new_password);

  if (!currentPassword) {
    errors.push({ field: 'current_password', message: 'current_password is required' });
  }

  if (!newPassword) {
    errors.push({ field: 'new_password', message: 'new_password is required' });
  } else if (newPassword.length < 8) {
    errors.push({ field: 'new_password', message: 'new_password must be at least 8 characters' });
  }

  if (currentPassword && newPassword && currentPassword === newPassword) {
    errors.push({ field: 'new_password', message: 'new_password must be different from current_password' });
  }

  if (errors.length) {
    return next(new ApiError(400, 'Validation failed', errors));
  }

  req.validatedBody = {
    current_password: currentPassword,
    new_password: newPassword
  };

  return next();
}

module.exports = {
  validateHorseOwnerRegister,
  validateRegister,
  validateLogin,
  validateToken,
  validateForgotPassword,
  validateResetPassword,
  validateChangePassword
};
