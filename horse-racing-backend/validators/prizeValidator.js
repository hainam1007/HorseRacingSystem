const ApiError = require('../utils/ApiError');

function validateRacePrizeConfig(req, res, next) {
  const body = req.body || {};
  const prizePool = body.prize_pool !== undefined ? body.prize_pool : body.prizePool;

  if (prizePool !== undefined && (Number.isNaN(Number(prizePool)) || Number(prizePool) < 0)) {
    return next(new ApiError(400, 'prize_pool must be a number greater than or equal to 0'));
  }

  const distribution = body.prize_distribution || body.distribution;

  if (distribution !== undefined && !Array.isArray(distribution)) {
    return next(new ApiError(400, 'prize_distribution must be an array'));
  }

  if (Array.isArray(distribution)) {
    for (const item of distribution) {
      if (!Number.isInteger(Number(item.position)) || Number(item.position) < 1) {
        return next(new ApiError(400, 'prize_distribution.position must be a positive integer'));
      }

      if (item.percent !== undefined && (Number.isNaN(Number(item.percent)) || Number(item.percent) < 0 || Number(item.percent) > 100)) {
        return next(new ApiError(400, 'prize_distribution.percent must be between 0 and 100'));
      }

      if (item.amount !== undefined && (Number.isNaN(Number(item.amount)) || Number(item.amount) < 0)) {
        return next(new ApiError(400, 'prize_distribution.amount must be greater than or equal to 0'));
      }
    }
  }

  return next();
}

module.exports = {
  validateRacePrizeConfig
};
