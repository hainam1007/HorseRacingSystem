const ApiError = require('../utils/ApiError');
const { isObjectId } = require('./commonValidator');

function validatePlaceBet(req, res, next) {
  const body = req.body || {};
  const errors = [];
  const raceId = body.race_id;
  const horseId = body.predicted_horse_id || body.horse_id;
  const stakeAmount = Number(body.stake_amount);

  if (!raceId || !isObjectId(raceId)) {
    errors.push({ field: 'race_id', message: 'race_id is required and must be a valid ObjectId' });
  }

  if (!horseId || !isObjectId(horseId)) {
    errors.push({ field: 'predicted_horse_id', message: 'predicted_horse_id or horse_id is required and must be a valid ObjectId' });
  }

  if (!Number.isFinite(stakeAmount) || stakeAmount < 1) {
    errors.push({ field: 'stake_amount', message: 'stake_amount must be a number greater than or equal to 1' });
  }

  if (errors.length) {
    return next(new ApiError(400, 'Validation failed', errors));
  }

  req.validatedBody = {
    race_id: raceId,
    predicted_horse_id: horseId,
    stake_amount: stakeAmount
  };

  return next();
}

module.exports = {
  validatePlaceBet
};
