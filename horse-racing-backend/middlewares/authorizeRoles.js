const ApiError = require('../utils/ApiError');
const userRepository = require('../repositories/userRepository');

function authorizeRoles() {
  const allowedRoles = Array.prototype.slice.call(arguments);

  return async function(req, res, next) {
    try {
      if (!req.user) {
        throw new ApiError(401, 'Authentication token is required');
      }

      const roles = await userRepository.getRoleNamesByUserId(req.user._id);
      req.roles = roles;

      const hasRole = roles.some(function(role) {
        return allowedRoles.includes(role);
      });

      if (!hasRole) {
        throw new ApiError(403, 'You do not have permission to access this resource');
      }

      return next();
    } catch (error) {
      return next(error);
    }
  };
}

module.exports = authorizeRoles;
