const ApiError = require('../utils/ApiError');
const { ROLE_VALUES } = require('../constants/roles');

const USER_STATUSES = ['active', 'pending_verification', 'blocked', 'disabled'];

function getString(value) {
  if (typeof value !== 'string') {
    return '';
  }

  return value.trim();
}

function validateListUsers(req, res, next) {
  const query = req.query || {};
  const payload = {};
  const page = Number(query.page || 1);
  const limit = Number(query.limit || 20);

  if (!Number.isInteger(page) || page < 1) {
    return next(new ApiError(400, 'Validation failed', [
      { field: 'page', message: 'page must be a positive integer' }
    ]));
  }

  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    return next(new ApiError(400, 'Validation failed', [
      { field: 'limit', message: 'limit must be an integer between 1 and 100' }
    ]));
  }

  ['email', 'status', 'role'].forEach(function(field) {
    const value = getString(query[field]);

    if (value) {
      payload[field] = value.toLowerCase();
    }
  });

  if (payload.status && !USER_STATUSES.includes(payload.status)) {
    return next(new ApiError(400, 'Validation failed', [
      { field: 'status', message: 'status is invalid' }
    ]));
  }

  if (payload.role && !ROLE_VALUES.includes(payload.role)) {
    return next(new ApiError(400, 'Validation failed', [
      { field: 'role', message: 'role is invalid' }
    ]));
  }

  req.validatedQuery = Object.assign({}, payload, {
    page: page,
    limit: limit
  });

  return next();
}

function validateUpdateUserStatus(req, res, next) {
  const status = getString((req.body || {}).status).toLowerCase();

  if (!USER_STATUSES.includes(status)) {
    return next(new ApiError(400, 'Validation failed', [
      { field: 'status', message: 'status must be active, pending_verification, blocked, or disabled' }
    ]));
  }

  req.validatedBody = {
    status: status
  };

  return next();
}

function validateRoleNameBody(req, res, next) {
  const roleName = getString((req.body || {}).role_name || (req.body || {}).role).toLowerCase();

  if (!ROLE_VALUES.includes(roleName)) {
    return next(new ApiError(400, 'Validation failed', [
      { field: 'role_name', message: 'role_name is invalid' }
    ]));
  }

  req.validatedBody = {
    role_name: roleName
  };

  return next();
}

function validateRoleNameParam(req, res, next) {
  const roleName = getString(req.params.roleName).toLowerCase();

  if (!ROLE_VALUES.includes(roleName)) {
    return next(new ApiError(400, 'Validation failed', [
      { field: 'roleName', message: 'roleName is invalid' }
    ]));
  }

  req.validatedParams = Object.assign({}, req.validatedParams || {}, {
    roleName: roleName
  });

  return next();
}

module.exports = {
  validateListUsers,
  validateRoleNameBody,
  validateRoleNameParam,
  validateUpdateUserStatus
};
