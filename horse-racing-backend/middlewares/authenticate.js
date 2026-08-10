const ApiError = require('../utils/ApiError');
const { verifyAuthToken } = require('../utils/jwt');
const userRepository = require('../repositories/userRepository');

async function authenticate(req, res, next) {
  try {
    const authorization = req.headers.authorization || '';
    const parts = authorization.split(' ');

    if (parts.length !== 2 || parts[0] !== 'Bearer' || !parts[1]) {
      throw new ApiError(401, 'Authentication token is required');
    }

    const payload = verifyAuthToken(parts[1]);
    const user = await userRepository.findById(payload.user_id);

    if (!user) {
      throw new ApiError(401, 'Invalid authentication token');
    }

    req.auth = payload;
    req.user = user;
    req.token = parts[1];

    return next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
      return next(new ApiError(401, 'Invalid or expired authentication token'));
    }

    return next(error);
  }
}

module.exports = authenticate;
