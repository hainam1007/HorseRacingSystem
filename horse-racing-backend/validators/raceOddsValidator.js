const ApiError = require('../utils/ApiError');
const { isObjectId } = require('./commonValidator');

function validateUpdateRaceOdds(req, res, next) {
  const body = req.body || {};
  const errors = [];
  const odds = [];
  const seenHorseIds = new Set();

  if (!Array.isArray(body.odds) || !body.odds.length) {
    errors.push({ field: 'odds', message: 'odds must be a non-empty array' });
  } else {
    body.odds.forEach(function(item, index) {
      const horseId = item && String(item.horse_id || '').trim();
      const gameOdds = item && Number(item.game_odds);
      const field = 'odds[' + index + ']';

      if (!isObjectId(horseId)) {
        errors.push({ field: field + '.horse_id', message: 'horse_id must be a valid id' });
      } else if (seenHorseIds.has(horseId)) {
        errors.push({ field: field + '.horse_id', message: 'horse_id must be unique' });
      } else {
        seenHorseIds.add(horseId);
      }

      if (!Number.isFinite(gameOdds) || gameOdds < 1.01 || gameOdds > 1000) {
        errors.push({ field: field + '.game_odds', message: 'game_odds must be between 1.01 and 1000' });
      }

      if (isObjectId(horseId) && Number.isFinite(gameOdds) && gameOdds >= 1.01 && gameOdds <= 1000) {
        odds.push({ horse_id: horseId, game_odds: Math.round(gameOdds * 100) / 100 });
      }
    });
  }

  const note = body.adjustment_note === undefined ? '' : String(body.adjustment_note).trim();
  if (note.length > 500) {
    errors.push({ field: 'adjustment_note', message: 'adjustment_note cannot exceed 500 characters' });
  }

  if (errors.length) return next(new ApiError(400, 'Validation failed', errors));
  req.validatedBody = { odds: odds, adjustment_note: note };
  return next();
}

module.exports = { validateUpdateRaceOdds };
