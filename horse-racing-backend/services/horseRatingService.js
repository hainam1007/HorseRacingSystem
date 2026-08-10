const ApiError = require('../utils/ApiError');
const { MODEL_INPUT_DEFAULTS } = require('../constants/raceModelInput');
const horseRatingRepository = require('../repositories/horseRatingRepository');
const { Race, RaceResult } = require('../models');

const ELO_SCALE = 40;
const MAX_DELTA = 8;

function classK(raceClass) {
  return { '1': 10, '2': 9, '3': 8, '4': 7, '5': 6 }[String(raceClass || '5')] || 6;
}

function expectedAgainst(rating, opponentRating) {
  return 1 / (1 + (10 ** ((opponentRating - rating) / ELO_SCALE)));
}

function actualAgainst(position, opponentPosition) {
  if (position === opponentPosition) return 0.5;
  return position < opponentPosition ? 1 : 0;
}

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function calculateRatingChanges(entries, raceClass) {
  const k = classK(raceClass);
  return entries.map(function(entry, index) {
    const opponents = entries.filter(function(_, opponentIndex) { return opponentIndex !== index; });
    const expectedScore = opponents.reduce(function(total, opponent) {
      return total + expectedAgainst(entry.rating, opponent.rating);
    }, 0) / opponents.length;
    const actualScore = opponents.reduce(function(total, opponent) {
      return total + actualAgainst(entry.raw_position, opponent.raw_position);
    }, 0) / opponents.length;
    const delta = clamp(Math.round(k * (actualScore - expectedScore)), -MAX_DELTA, MAX_DELTA);
    return Object.assign({}, entry, {
      expected_score: Number(expectedScore.toFixed(6)),
      actual_score: Number(actualScore.toFixed(6)),
      rating_delta: delta,
      new_rating: clamp(entry.rating + delta, 0, 140)
    });
  });
}

async function applyPublishedRaceRatings(raceId, adminUserId, options) {
  const session = options && options.session;
  if (await horseRatingRepository.countHistory({ race_id: raceId, source: 'published_result' }, { session })) {
    return { applied: false, reason: 'already_applied', changes: [] };
  }
  const raceQuery = Race.findById(raceId);
  const resultQuery = RaceResult.find({ race_id: raceId, status: 'published' }).populate('horse_id');
  if (session) {
    raceQuery.session(session);
    resultQuery.session(session);
  }
  const [race, results] = await Promise.all([raceQuery, resultQuery]);
  if (!race) throw new ApiError(404, 'Race not found');
  const entries = results.filter(function(result) {
    return Number.isFinite(Number(result.raw_position ?? result.position));
  }).map(function(result) {
    const horse = result.horse_id;
    return {
      horse_id: horse && horse._id,
      rating: Number((horse && horse.current_rating) ?? MODEL_INPUT_DEFAULTS.HORSE_RATING),
      raw_position: Number(result.raw_position ?? result.position)
    };
  }).filter(function(entry) { return entry.horse_id; });
  if (entries.length < 2) return { applied: false, reason: 'insufficient_valid_results', changes: [] };

  const changes = calculateRatingChanges(entries, race.race_class);
  const calculatedAt = new Date();
  for (const change of changes) {
    await horseRatingRepository.updateHorseRating(change.horse_id, {
      current_rating: change.new_rating,
      rating_updated_at: calculatedAt,
      rating_updated_by: adminUserId
    }, { session });
    await horseRatingRepository.createHistory({
      horse_id: change.horse_id,
      race_id: raceId,
      previous_rating: change.rating,
      rating_delta: change.rating_delta,
      new_rating: change.new_rating,
      expected_score: change.expected_score,
      actual_score: change.actual_score,
      raw_position: change.raw_position,
      participant_count: changes.length,
      source: 'published_result',
      calculated_by: adminUserId,
      calculated_at: calculatedAt
    }, { session });
  }
  return { applied: true, changes: changes };
}

async function updateRatingManually(adminUserId, horseId, payload) {
  const horse = await horseRatingRepository.findHorseById(horseId);
  if (!horse) throw new ApiError(404, 'Horse not found');
  const previousRating = Number(horse.current_rating ?? MODEL_INPUT_DEFAULTS.HORSE_RATING);
  const updatedAt = new Date();
  const updatedHorse = await horseRatingRepository.updateHorseRating(horseId, {
    current_rating: payload.current_rating,
    rating_updated_at: updatedAt,
    rating_updated_by: adminUserId
  });
  const history = await horseRatingRepository.createHistory({
    horse_id: horseId,
    previous_rating: previousRating,
    rating_delta: payload.current_rating - previousRating,
    new_rating: payload.current_rating,
    source: 'manual_admin',
    reason: payload.reason,
    calculated_by: adminUserId,
    calculated_at: updatedAt
  });
  return { horse: updatedHorse, rating_history: history };
}

async function getRatingHistory(horseId) {
  const horse = await horseRatingRepository.findHorseById(horseId);
  if (!horse) throw new ApiError(404, 'Horse not found');
  return { horse: horse, rating_history: await horseRatingRepository.findHistory({ horse_id: horseId }) };
}

module.exports = {
  applyPublishedRaceRatings,
  calculateRatingChanges,
  getRatingHistory,
  updateRatingManually
};
