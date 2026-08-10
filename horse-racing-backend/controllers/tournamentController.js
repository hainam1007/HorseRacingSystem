const tournamentService = require('../services/tournamentService');
const { sendSuccess } = require('../utils/apiResponse');

async function createTournament(req, res) {
  const data = await tournamentService.createTournament(req.user._id, req.body);

  return sendSuccess(res, 201, 'Tournament created successfully', data);
}

async function listTournaments(req, res) {
  const data = await tournamentService.listTournaments(req.query);

  return sendSuccess(res, 200, 'Tournaments retrieved successfully', data);
}

async function getTournament(req, res) {
  const data = await tournamentService.getTournament(req.params.id);

  return sendSuccess(res, 200, 'Tournament retrieved successfully', data);
}

async function updateTournament(req, res) {
  const data = await tournamentService.updateTournament(req.params.id, req.body);

  return sendSuccess(res, 200, 'Tournament updated successfully', data);
}

async function deleteTournament(req, res) {
  const data = await tournamentService.deleteTournament(req.params.id);

  return sendSuccess(res, 200, 'Tournament deleted successfully', data);
}

module.exports = {
  createTournament,
  listTournaments,
  getTournament,
  updateTournament,
  deleteTournament
};
