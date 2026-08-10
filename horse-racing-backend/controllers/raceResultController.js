const raceResultService = require('../services/raceResultService');
const { sendSuccess } = require('../utils/apiResponse');

async function createResult(req, res) {
  const data = await raceResultService.createResult(req, req.body);

  return sendSuccess(res, 201, 'Race result created successfully', data);
}

async function finalizeRace(req, res) {
  const data = await raceResultService.finalizeRace(req, req.params.raceId);

  return sendSuccess(res, 200, 'Penalty-adjusted race summary submitted to Admin successfully', data);
}

async function getRaceParticipants(req, res) {
  const data = await raceResultService.getRaceParticipants(req, req.params.raceId);

  return sendSuccess(res, 200, 'Race participant status retrieved successfully', data);
}

async function getRaceReadiness(req, res) {
  const data = await raceResultService.getRaceReadiness(req, req.params.raceId);

  return sendSuccess(res, 200, 'Race closure readiness retrieved successfully', data);
}

async function applyRacePenalties(req, res) {
  const data = await raceResultService.applyRacePenalties(req, req.params.raceId);

  return sendSuccess(res, 200, 'Race penalties applied successfully', data);
}

async function listResults(req, res) {
  const data = await raceResultService.listResults(req, req.query);

  return sendSuccess(res, 200, 'Race results retrieved successfully', data);
}

async function getResult(req, res) {
  const data = await raceResultService.getResult(req, req.params.id);

  return sendSuccess(res, 200, 'Race result retrieved successfully', data);
}

async function updateResult(req, res) {
  const data = await raceResultService.updateResult(req, req.params.id, req.body);

  return sendSuccess(res, 200, 'Race result updated successfully', data);
}

async function confirmRaceResults(req, res) {
  const data = await raceResultService.confirmRaceResults(req.user._id, req.params.raceId);

  return sendSuccess(res, 200, 'Race results confirmed successfully', data);
}

async function requestRaceCorrection(req, res) {
  const data = await raceResultService.requestRaceCorrection(req.user._id, req.params.raceId, req.validatedBody);

  return sendSuccess(res, 200, 'Race result correction requested successfully', data);
}

async function resolveRaceCorrection(req, res) {
  const data = await raceResultService.resolveRaceCorrection(req.user._id, req.params.raceId);

  return sendSuccess(res, 200, 'Race result correction resolved successfully', data);
}

async function publishRaceResults(req, res) {
  const data = await raceResultService.publishRaceResults(req.user._id, req.params.raceId);

  return sendSuccess(res, 200, 'Race results published successfully', data);
}

module.exports = {
  applyRacePenalties,
  createResult,
  confirmRaceResults,
  finalizeRace,
  getRaceParticipants,
  getRaceReadiness,
  listResults,
  getResult,
  updateResult,
  requestRaceCorrection,
  resolveRaceCorrection,
  publishRaceResults
};
