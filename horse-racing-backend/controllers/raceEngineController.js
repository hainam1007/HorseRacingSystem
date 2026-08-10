const raceEngineService = require('../services/raceEngineService');
const { sendSuccess } = require('../utils/apiResponse');

async function lockRace(req, res) {
  const data = await raceEngineService.lockRace(req.params.id);

  return sendSuccess(res, 200, 'Race registrations locked successfully', data);
}

async function generateDraftResults(req, res) {
  const data = await raceEngineService.generateDraftResults(req.params.id);

  return sendSuccess(res, 200, 'Draft race results generated successfully', data);
}

async function getParticipants(req, res) {
  const data = await raceEngineService.collectParticipants(req.params.id);

  return sendSuccess(res, 200, 'Race participants retrieved successfully', data);
}

module.exports = {
  generateDraftResults,
  getParticipants,
  lockRace
};
