const ApiError = require('../utils/ApiError');

function internalAuthenticate(req, res, next) {
  const configuredToken = process.env.INTERNAL_API_TOKEN;

  if (!configuredToken) {
    return next(new ApiError(500, 'INTERNAL_API_TOKEN is required'));
  }

  const providedToken = req.headers['x-internal-token'];

  if (!providedToken || providedToken !== configuredToken) {
    return next(new ApiError(401, 'Internal authentication token is required'));
  }

  return next();
}

module.exports = internalAuthenticate;
