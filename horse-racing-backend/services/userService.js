const ApiError = require('../utils/ApiError');
const { isObjectId } = require('../validators/commonValidator');
const raceRepository = require('../repositories/raceRepository');
const raceResultRepository = require('../repositories/raceResultRepository');
const roundRepository = require('../repositories/roundRepository');
const tournamentRepository = require('../repositories/tournamentRepository');
const raceOddsMarketRepository = require('../repositories/raceOddsMarketRepository');
const raceEngineService = require('./raceEngineService');

function mapTournament(tournament) {
  return {
    _id: tournament._id,
    name: tournament.name,
    description: tournament.description,
    location: tournament.location,
    image_url: tournament.image_url,
    start_date: tournament.start_date,
    end_date: tournament.end_date,
    status: tournament.status,
    created_at: tournament.created_at,
    updated_at: tournament.updated_at
  };
}

function mapRound(round) {
  return {
    _id: round._id,
    name: round.name,
    round_order: round.round_order,
    description: round.description,
    status: round.status
  };
}

function mapRaceScheduleItem(race) {
  const refereeUser = race.referee_id && race.referee_id.user_id ? race.referee_id.user_id : null;

  return {
    _id: race._id,
    name: race.name,
    race_date: race.race_date,
    distance: race.distance,
    max_participants: race.max_participants,
    location: race.location,
    status: race.status,
    tournament: race.tournament_id
      ? {
          _id: race.tournament_id._id,
          name: race.tournament_id.name,
          location: race.tournament_id.location
        }
      : null,
    round: race.round_id
      ? {
          _id: race.round_id._id,
          name: race.round_id.name,
          round_order: race.round_id.round_order
        }
      : null,
    referee: refereeUser
      ? {
          _id: race.referee_id._id,
          full_name: refereeUser.full_name
        }
      : null,
    registration_locked: race.registration_locked,
    registration_lock_at: race.registration_lock_at,
    updated_at: race.updated_at
  };
}

function getId(value) {
  return value && (value._id || value.id || value);
}

function mapRunParticipant(participant) {
  const horse = participant.horse || participant.horse_id || {};
  const jockey = participant.jockey || participant.jockey_id || {};
  const jockeyUser = jockey.user || jockey.user_id || null;

  return {
    horse_id: getId(horse),
    horse: horse,
    jockey_id: getId(jockey),
    jockey: jockey,
    jockey_name: jockeyUser ? jockeyUser.full_name : jockey.full_name,
    assignment_id: getId(participant.assignment_id),
    lane: participant.lane,
    seed_position: participant.seed_position
  };
}

function mapRunOrder(item) {
  const horse = item.horse || item.horse_id || {};
  const jockey = item.jockey || item.jockey_id || {};
  const jockeyUser = jockey.user || jockey.user_id || null;

  return {
    horse_id: getId(horse),
    horse: horse,
    jockey_id: getId(jockey),
    jockey: jockey,
    jockey_name: jockeyUser ? jockeyUser.full_name : jockey.full_name,
    position: item.position,
    finish_time: item.finish_time,
    score: item.score
  };
}

function mapParticipantStatus(participant, index) {
  const horse = participant.horse || {};
  const jockey = participant.jockey || {};
  const jockeyUser = jockey.user || jockey.user_id || null;
  const owner = horse.owner || horse.owner_id || {};
  const ownerUser = owner.user || owner.user_id || null;

  return {
    registration_id: getId(participant.registration),
    horse_id: getId(horse),
    horse: horse,
    jockey_id: getId(jockey),
    jockey: jockey,
    jockey_name: jockeyUser ? jockeyUser.full_name : jockey.full_name,
    owner_id: getId(owner),
    owner: owner,
    owner_name: owner.stable_name || (ownerUser ? ownerUser.full_name : null),
    assignment_id: getId(participant.assignment),
    lane: participant.assignment && participant.assignment.lane != null ? participant.assignment.lane : index + 1,
    eligible: participant.eligible,
    blockers: participant.blockers || [],
    pre_race_check: participant.pre_race_check
      ? {
          _id: participant.pre_race_check._id,
          status: participant.pre_race_check.status,
          is_eligible: participant.pre_race_check.is_eligible
        }
      : null
  };
}

function mapRaceRun(raceRun, market) {
  if (!raceRun) {
    return null;
  }

  return {
    _id: raceRun._id,
    race_id: getId(raceRun.race_id),
    status: raceRun.status,
    generated_at: raceRun.generated_at,
    seed: raceRun.seed,
    participants: Array.isArray(raceRun.participants) ? raceRun.participants.map(mapRunParticipant) : [],
    finish_order: Array.isArray(raceRun.finish_order) ? raceRun.finish_order.map(mapRunOrder) : [],
    race_script: raceEngineService.buildRaceScriptFromRun(raceRun, market?.odds || [])
  };
}

function assertObjectIdQuery(query, field) {
  if (query[field] && !isObjectId(query[field])) {
    throw new ApiError(400, field + ' is invalid');
  }
}

function parseDateQuery(query, field) {
  if (!query[field]) {
    return null;
  }

  const date = new Date(query[field]);

  if (Number.isNaN(date.getTime())) {
    throw new ApiError(400, field + ' is invalid');
  }

  return date;
}

async function getSpectatorTournamentDetail(tournamentId) {
  const tournament = await tournamentRepository.findById(tournamentId);

  if (!tournament) {
    throw new ApiError(404, 'Tournament not found');
  }

  const [rounds, raceCount] = await Promise.all([
    roundRepository.find({ tournament_id: tournament._id }),
    raceRepository.count({ tournament_id: tournament._id })
  ]);

  return {
    tournament: mapTournament(tournament),
    rounds: rounds.map(mapRound),
    race_count: raceCount
  };
}

async function getSpectatorRaceSchedule(query) {
  const filter = {};
  const from = parseDateQuery(query, 'from');
  const to = parseDateQuery(query, 'to');

  assertObjectIdQuery(query, 'tournament_id');
  assertObjectIdQuery(query, 'round_id');

  ['tournament_id', 'round_id', 'status'].forEach(function(field) {
    if (query[field]) {
      filter[field] = query[field];
    }
  });

  if (from || to) {
    filter.race_date = {};

    if (from) {
      filter.race_date.$gte = from;
    }

    if (to) {
      filter.race_date.$lte = to;
    }
  }

  const races = await raceRepository.find(filter);

  return {
    races: races.map(mapRaceScheduleItem)
  };
}

async function getSpectatorRaceResults(raceId) {
  const race = await raceRepository.findById(raceId);

  if (!race) {
    throw new ApiError(404, 'Race not found');
  }

  const results = await raceResultRepository.find({
    race_id: race._id,
    status: 'published'
  });

  return {
    race: mapRaceScheduleItem(race),
    results: results.sort(function(first, second) {
      return (first.final_position || first.position || Number.MAX_SAFE_INTEGER) - (second.final_position || second.position || Number.MAX_SAFE_INTEGER);
    })
  };
}

async function getSpectatorRaceLiveState(raceId) {
  const race = await raceRepository.findById(raceId);

  if (!race) {
    throw new ApiError(404, 'Race not found');
  }

  const [raceRun, participantData, publishedResults, market] = await Promise.all([
    raceEngineService.getProvisionalRaceRun(race._id),
    raceEngineService.collectParticipantStatuses(race._id),
    raceResultRepository.find({
      race_id: race._id,
      status: 'published'
    }),
    raceOddsMarketRepository.findByRaceId(race._id)
  ]);

  return {
    race: mapRaceScheduleItem(race),
    participants: participantData.participants.map(mapParticipantStatus),
    engine: mapRaceRun(raceRun, market),
    official_results: publishedResults.sort(function(first, second) {
      return (first.final_position || first.position || Number.MAX_SAFE_INTEGER) - (second.final_position || second.position || Number.MAX_SAFE_INTEGER);
    })
  };
}

module.exports = {
  getSpectatorRaceLiveState,
  getSpectatorRaceResults,
  getSpectatorTournamentDetail,
  getSpectatorRaceSchedule
};
