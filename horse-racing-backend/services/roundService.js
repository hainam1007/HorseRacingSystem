const ApiError = require('../utils/ApiError');
const roundRepository = require('../repositories/roundRepository');
const tournamentRepository = require('../repositories/tournamentRepository');

async function ensureTournamentExists(tournamentId) {
  const tournament = await tournamentRepository.findById(tournamentId);

  if (!tournament) {
    throw new ApiError(404, 'Tournament not found');
  }
}

async function createRound(payload) {
  await ensureTournamentExists(payload.tournament_id);

  const round = await roundRepository.create(payload);

  return {
    round: round
  };
}

async function listRounds(query) {
  const filter = {};

  if (query.tournament_id) {
    filter.tournament_id = query.tournament_id;
  }

  if (query.status) {
    filter.status = query.status;
  }

  return {
    rounds: await roundRepository.find(filter)
  };
}

async function getRound(id) {
  const round = await roundRepository.findById(id);

  if (!round) {
    throw new ApiError(404, 'Round not found');
  }

  return {
    round: round
  };
}

async function updateRound(id, payload) {
  if (payload.tournament_id) {
    await ensureTournamentExists(payload.tournament_id);
  }

  const round = await roundRepository.updateById(id, payload);

  if (!round) {
    throw new ApiError(404, 'Round not found');
  }

  return {
    round: round
  };
}

async function deleteRound(id) {
  const round = await roundRepository.softDeleteById(id);

  if (!round) {
    throw new ApiError(404, 'Round not found');
  }

  return {
    round: round
  };
}

module.exports = {
  createRound,
  listRounds,
  getRound,
  updateRound,
  deleteRound
};
