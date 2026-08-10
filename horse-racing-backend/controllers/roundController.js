const roundService = require('../services/roundService');
const { sendSuccess } = require('../utils/apiResponse');

async function createRound(req, res) {
  const data = await roundService.createRound(req.body);

  return sendSuccess(res, 201, 'Round created successfully', data);
}

async function listRounds(req, res) {
  const data = await roundService.listRounds(req.query);

  return sendSuccess(res, 200, 'Rounds retrieved successfully', data);
}

async function getRound(req, res) {
  const data = await roundService.getRound(req.params.id);

  return sendSuccess(res, 200, 'Round retrieved successfully', data);
}

async function updateRound(req, res) {
  const data = await roundService.updateRound(req.params.id, req.body);

  return sendSuccess(res, 200, 'Round updated successfully', data);
}

async function deleteRound(req, res) {
  const data = await roundService.deleteRound(req.params.id);

  return sendSuccess(res, 200, 'Round deleted successfully', data);
}

module.exports = {
  createRound,
  listRounds,
  getRound,
  updateRound,
  deleteRound
};
