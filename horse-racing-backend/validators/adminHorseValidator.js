const ApiError = require('../utils/ApiError');

function validateUpdateHorseRating(req, res, next) {
  const body = req.body || {};
  const rating = Number(body.current_rating);
  const reason = typeof body.reason === 'string' ? body.reason.trim() : '';
  const errors = [];
  if (!Number.isFinite(rating) || rating < 0 || rating > 140) errors.push({ field: 'current_rating', message: 'current_rating must be between 0 and 140' });
  if (!reason) errors.push({ field: 'reason', message: 'reason is required' });
  if (errors.length) return next(new ApiError(400, 'Validation failed', errors));
  req.validatedBody = { current_rating: rating, reason: reason };
  return next();
}

module.exports = { validateUpdateHorseRating };
