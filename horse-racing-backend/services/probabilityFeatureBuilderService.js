const ApiError = require('../utils/ApiError');
const { ASSIGNMENT_STATUS, ASSIGNMENT_TYPE, RACE_RESULT_STATUS, REGISTRATION_STATUS } = require('../constants/statuses');
const { JockeyAssignment, Race, RaceResult, Registration } = require('../models');

const DAY_MS = 24 * 60 * 60 * 1000;
const NEUTRAL_FINISH_AVG = 8;
const DEFAULT_DAYS_SINCE_LAST_RACE = 365;

function documentId(value) {
  return value && (value._id || value);
}

function idString(value) {
  const id = documentId(value);
  return id ? id.toString() : '';
}

function getLooseField(document, field) {
  if (!document) {
    return undefined;
  }

  if (typeof document.get === 'function') {
    return document.get(field);
  }

  return document[field];
}

function toNumber(value, fallback) {
  if (value === undefined || value === null || value === '') {
    return fallback;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function kilogramsToPounds(value) {
  return Number((Number(value) * 2.20462).toFixed(2));
}

function getUserName(user, fallback) {
  if (!user || typeof user === 'string') {
    return fallback;
  }

  return user.full_name || user.email || fallback;
}

function getOwnerName(owner) {
  if (!owner || typeof owner === 'string') {
    return 'Demo Trainer';
  }

  return owner.stable_name || getUserName(owner.user_id, 'Demo Trainer');
}

function getJockeyName(jockey) {
  if (!jockey || typeof jockey === 'string') {
    return 'Unknown Jockey';
  }

  return getUserName(jockey.user_id, jockey.license_number || 'Unknown Jockey');
}

function normalizeVenue(race) {
  const explicitCode = String(getLooseField(race, 'venue_code') || '').trim().toUpperCase();

  if (explicitCode) {
    return explicitCode;
  }

  const value = String(getLooseField(race, 'venue') || race.location || '').trim();

  if (/happy|valley|\bhv\b/i.test(value)) {
    return 'HV';
  }

  if (/sha|tin|\bst\b/i.test(value)) {
    return 'ST';
  }

  if (/^[a-z]{2}$/i.test(value)) {
    return value.toUpperCase();
  }

  return 'ST';
}

function normalizeRaceNo(race) {
  const explicitRaceNo = getLooseField(race, 'race_no');

  if (explicitRaceNo !== undefined && explicitRaceNo !== null && explicitRaceNo !== '') {
    return toNumber(explicitRaceNo, 1);
  }

  const match = String(race.name || '').match(/\d+/);
  return match ? Number(match[0]) : 1;
}

function getRaceDate(result) {
  const race = result.race_id || result.race || {};
  const date = race.race_date || result.race_date || result.published_at || result.recorded_at;
  const parsed = date ? new Date(date) : null;

  return parsed && !Number.isNaN(parsed.getTime()) ? parsed : null;
}

function getResultPosition(result) {
  const position = result.final_position ?? result.position;
  const parsed = Number(position);

  return Number.isFinite(parsed) ? parsed : null;
}

function getWinCount(results) {
  return results.filter(function(result) {
    return getResultPosition(result) === 1;
  }).length;
}

function getPlaceCount(results) {
  return results.filter(function(result) {
    const position = getResultPosition(result);
    return position !== null && position <= 3;
  }).length;
}

function getRate(count, total) {
  return total > 0 ? count / total : 0;
}

function sortRecent(results) {
  return results.slice().sort(function(first, second) {
    const firstDate = getRaceDate(first);
    const secondDate = getRaceDate(second);
    return (secondDate ? secondDate.getTime() : 0) - (firstDate ? firstDate.getTime() : 0);
  });
}

function getFinishAverage(results, limit) {
  const selectedResults = sortRecent(results)
    .slice(0, limit)
    .map(getResultPosition)
    .filter(function(position) {
      return position !== null;
    });

  if (!selectedResults.length) {
    return NEUTRAL_FINISH_AVG;
  }

  return selectedResults.reduce(function(total, position) {
    return total + position;
  }, 0) / selectedResults.length;
}

function filterWithinDays(results, currentRaceDate, days) {
  const cutoff = new Date(currentRaceDate.getTime() - (days * DAY_MS));

  return results.filter(function(result) {
    const raceDate = getRaceDate(result);
    return raceDate && raceDate >= cutoff && raceDate < currentRaceDate;
  });
}

function filterPriorResults(results, currentRaceDate) {
  return results.filter(function(result) {
    const raceDate = getRaceDate(result);
    return raceDate && raceDate < currentRaceDate;
  });
}

function sameNumber(first, second) {
  return Number(first) === Number(second);
}

function sameString(first, second) {
  return String(first || '').trim().toLowerCase() === String(second || '').trim().toLowerCase();
}

function computeHistoricalFeatures(options) {
  const currentRaceDate = options.currentRaceDate;
  const currentDistance = options.currentDistance;
  const currentVenue = options.currentVenue;
  const currentGoing = options.currentGoing;
  const horseId = options.horseId;
  const jockeyId = options.jockeyId;
  const ownerId = options.ownerId;
  const fallbacks = options.fallbacks || [];
  const priorResults = filterPriorResults(options.pastResults || [], currentRaceDate);

  const horseResults = priorResults.filter(function(result) {
    return idString(result.horse_id) === idString(horseId);
  });
  const jockeyResults = priorResults.filter(function(result) {
    return idString(result.jockey_id) === idString(jockeyId);
  });
  const trainerResults = priorResults.filter(function(result) {
    return idString(result.horse_id && result.horse_id.owner_id) === idString(ownerId);
  });
  const jockeyTrainerResults = trainerResults.filter(function(result) {
    return idString(result.jockey_id) === idString(jockeyId);
  });

  if (!horseResults.length) {
    fallbacks.push('hist_horse_no_prior_results');
  }

  if (!jockeyResults.length) {
    fallbacks.push('hist_jockey_no_prior_results');
  }

  if (!trainerResults.length) {
    fallbacks.push('hist_trainer_proxy_no_prior_results');
  }

  const sameDistanceResults = horseResults.filter(function(result) {
    return sameNumber(result.race_id && result.race_id.distance, currentDistance);
  });
  const sameVenueResults = horseResults.filter(function(result) {
    return sameString(normalizeVenue(result.race_id || {}), currentVenue);
  });
  const sameGoingResults = horseResults.filter(function(result) {
    return sameString(getLooseField(result.race_id, 'going') || 'Good', currentGoing);
  });
  const latestHorseRaceDate = sortRecent(horseResults).map(getRaceDate).find(Boolean);

  return {
    hist_horse_prior_starts: horseResults.length,
    hist_horse_prior_wins: getWinCount(horseResults),
    hist_horse_prior_places: getPlaceCount(horseResults),
    hist_horse_prior_win_rate: getRate(getWinCount(horseResults), horseResults.length),
    hist_horse_prior_place_rate: getRate(getPlaceCount(horseResults), horseResults.length),
    hist_horse_last_3_finish_avg: getFinishAverage(horseResults, 3),
    hist_horse_last_5_finish_avg: getFinishAverage(horseResults, 5),
    hist_horse_last_3_win_rate: getRate(getWinCount(sortRecent(horseResults).slice(0, 3)), Math.min(horseResults.length, 3)),
    hist_horse_last_5_win_rate: getRate(getWinCount(sortRecent(horseResults).slice(0, 5)), Math.min(horseResults.length, 5)),
    hist_horse_days_since_last_race: latestHorseRaceDate
      ? Math.max(0, Math.round((currentRaceDate.getTime() - latestHorseRaceDate.getTime()) / DAY_MS))
      : DEFAULT_DAYS_SINCE_LAST_RACE,
    hist_horse_same_distance_starts: sameDistanceResults.length,
    hist_horse_same_distance_win_rate: getRate(getWinCount(sameDistanceResults), sameDistanceResults.length),
    hist_horse_same_venue_starts: sameVenueResults.length,
    hist_horse_same_venue_win_rate: getRate(getWinCount(sameVenueResults), sameVenueResults.length),
    hist_horse_same_going_starts: sameGoingResults.length,
    hist_horse_same_going_win_rate: getRate(getWinCount(sameGoingResults), sameGoingResults.length),
    hist_jockey_prior_starts: jockeyResults.length,
    hist_jockey_prior_wins: getWinCount(jockeyResults),
    hist_jockey_prior_win_rate: getRate(getWinCount(jockeyResults), jockeyResults.length),
    hist_jockey_last_30d_win_rate: getRate(getWinCount(filterWithinDays(jockeyResults, currentRaceDate, 30)), filterWithinDays(jockeyResults, currentRaceDate, 30).length),
    hist_jockey_last_90d_win_rate: getRate(getWinCount(filterWithinDays(jockeyResults, currentRaceDate, 90)), filterWithinDays(jockeyResults, currentRaceDate, 90).length),
    hist_trainer_prior_starts: trainerResults.length,
    hist_trainer_prior_wins: getWinCount(trainerResults),
    hist_trainer_prior_win_rate: getRate(getWinCount(trainerResults), trainerResults.length),
    hist_trainer_last_30d_win_rate: getRate(getWinCount(filterWithinDays(trainerResults, currentRaceDate, 30)), filterWithinDays(trainerResults, currentRaceDate, 30).length),
    hist_trainer_last_90d_win_rate: getRate(getWinCount(filterWithinDays(trainerResults, currentRaceDate, 90)), filterWithinDays(trainerResults, currentRaceDate, 90).length),
    hist_jockey_trainer_prior_starts: jockeyTrainerResults.length,
    hist_jockey_trainer_prior_wins: getWinCount(jockeyTrainerResults),
    hist_jockey_trainer_prior_win_rate: getRate(getWinCount(jockeyTrainerResults), jockeyTrainerResults.length)
  };
}

function buildFeatureEntry(context) {
  const race = context.race;
  const registration = context.registration;
  const horse = registration.horse_id;
  const owner = registration.owner_id;
  const assignment = context.assignment;
  const jockey = assignment && assignment.jockey_id;
  const fallbacks = [];
  const currentDistance = toNumber(getLooseField(race, 'distance'), 1200);
  const currentGoing = getLooseField(race, 'going') || 'Good';
  const currentVenue = normalizeVenue(race);

  if (getLooseField(race, 'distance') === undefined || getLooseField(race, 'distance') === null) {
    fallbacks.push('race.distance_default_1200');
  }

  if (!getLooseField(race, 'going')) {
    fallbacks.push('race.going_default_good');
  }

  if (!getLooseField(race, 'venue_code') && !getLooseField(race, 'venue') && !race.location) {
    fallbacks.push('race.venue_default_st');
  }

  if (!assignment || !jockey) {
    fallbacks.push('jockey.default_unknown');
  }

  const draw = toNumber(getLooseField(registration, 'draw'), context.index + 1);
  if (getLooseField(registration, 'draw') === undefined) {
    fallbacks.push('entry.draw_by_registration_order');
  }

  if (getLooseField(registration, 'horse_no') === undefined) {
    fallbacks.push('entry.horse_no_by_registration_order');
  }

  const rating = toNumber(
    getLooseField(registration, 'rating_snapshot') ?? getLooseField(horse, 'current_rating') ?? getLooseField(horse, 'rating'),
    50
  );
  if (getLooseField(registration, 'rating_snapshot') === undefined && getLooseField(horse, 'current_rating') === undefined && !getLooseField(horse, 'rating')) {
    fallbacks.push('entry.rating_default_50');
  }

  const declaredWeightKg = toNumber(getLooseField(registration, 'declared_weight_kg'), 54.5);
  const declaredWeight = kilogramsToPounds(declaredWeightKg);
  if (getLooseField(registration, 'declared_weight_kg') === undefined) {
    fallbacks.push('entry.declared_weight_kg_default_54_5');
  }

  const historicalFeatures = computeHistoricalFeatures({
    currentRaceDate: context.currentRaceDate,
    currentDistance: currentDistance,
    currentVenue: currentVenue,
    currentGoing: currentGoing,
    horseId: horse && horse._id,
    jockeyId: jockey && jockey._id,
    ownerId: owner && owner._id,
    pastResults: context.pastResults,
    fallbacks: fallbacks
  });

  return {
    participant: {
      horse_id: horse && horse._id,
      jockey_id: jockey && jockey._id,
      horse_no: toNumber(getLooseField(registration, 'horse_no'), context.index + 1),
      horse_name: horse ? horse.name : `Horse ${context.index + 1}`,
      jockey_name: getJockeyName(jockey),
      fallbacks_used: fallbacks.slice()
    },
    horsePayload: Object.assign({
      horse_id: idString(horse),
      horse_no: toNumber(getLooseField(registration, 'horse_no'), context.index + 1),
      horse_name: horse ? horse.name : `Horse ${context.index + 1}`,
      draw: draw,
      rating: rating,
      declared_weight: declaredWeight,
      distance: currentDistance,
      jockey: getJockeyName(jockey),
      trainer: getOwnerName(owner),
      gears: Array.isArray(getLooseField(registration, 'gears'))
        ? getLooseField(registration, 'gears').join('/')
        : (getLooseField(registration, 'gears') || ''),
      course: getLooseField(race, 'course') || 'B+2',
      race_class: String(getLooseField(race, 'race_class') || '5'),
      going: currentGoing,
      surface: getLooseField(race, 'surface') || 'Turf'
    }, historicalFeatures)
  };
}

async function buildRaceProbabilityPayload(raceId) {
  const race = await Race.findById(raceId)
    .populate('tournament_id')
    .populate('round_id');

  if (!race) {
    throw new ApiError(404, 'Race not found');
  }

  const currentRaceDate = race.race_date && !Number.isNaN(new Date(race.race_date).getTime())
    ? new Date(race.race_date)
    : new Date();
  const registrations = await Registration.find({
    race_id: race._id,
    status: REGISTRATION_STATUS.APPROVED
  })
    .populate({
      path: 'horse_id',
      populate: {
        path: 'owner_id',
        populate: { path: 'user_id', select: 'full_name email' }
      }
    })
    .populate({
      path: 'owner_id',
      populate: { path: 'user_id', select: 'full_name email' }
    })
    .sort({ registered_at: 1 });

  if (registrations.length < 2) {
    throw new ApiError(400, 'At least two approved race registrations are required to generate odds');
  }

  const horseIds = registrations.map(function(registration) {
    return documentId(registration.horse_id);
  }).filter(Boolean);
  const assignments = horseIds.length
    ? await JockeyAssignment.find({
      race_id: race._id,
      horse_id: { $in: horseIds },
      assignment_type: ASSIGNMENT_TYPE.PRIMARY,
      status: ASSIGNMENT_STATUS.ACCEPTED
    })
      .populate({
        path: 'jockey_id',
        populate: { path: 'user_id', select: 'full_name email' }
      })
    : [];
  const assignmentByHorse = new Map(assignments.map(function(assignment) {
    return [idString(assignment.horse_id), assignment];
  }));
  const pastResults = await RaceResult.find({ status: RACE_RESULT_STATUS.PUBLISHED })
    .populate('race_id')
    .populate('horse_id')
    .populate('jockey_id');
  const entries = registrations.map(function(registration, index) {
    return buildFeatureEntry({
      race: race,
      registration: registration,
      assignment: assignmentByHorse.get(idString(registration.horse_id)),
      currentRaceDate: currentRaceDate,
      pastResults: pastResults,
      index: index
    });
  });
  const allFallbacks = entries.flatMap(function(entry) {
    return entry.participant.fallbacks_used;
  });
  const uniqueFallbacks = Array.from(new Set(allFallbacks));
  const venue = normalizeVenue(race);
  const raceNo = normalizeRaceNo(race);

  return {
    race: race,
    payload: {
      race_info: {
        race_date: currentRaceDate.toISOString(),
        venue: venue,
        race_no: raceNo
      },
      horses: entries.map(function(entry) {
        return entry.horsePayload;
      })
    },
    participants: entries.map(function(entry) {
      return entry.participant;
    }),
    diagnostics: {
      participant_count: entries.length,
      fallback_count: allFallbacks.length,
      fallbacks_used: uniqueFallbacks,
      race_payload_id: `${currentRaceDate.toISOString()}_${venue}_${raceNo}`
    }
  };
}

module.exports = {
  buildRaceProbabilityPayload,
  _private: {
    computeHistoricalFeatures,
    filterPriorResults,
    getFinishAverage,
    kilogramsToPounds,
    normalizeVenue
  }
};
