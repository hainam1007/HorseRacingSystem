const raceService = require('../services/raceService');
const { sendSuccess } = require('../utils/apiResponse');

async function createRace(req, res) {
  const data = await raceService.createRace(req.validatedBody);

  return sendSuccess(res, 201, 'Race created successfully', data);
}

async function listRaces(req, res) {
  const data = await raceService.listRaces(req, req.query);

  return sendSuccess(res, 200, 'Races retrieved successfully', data);
}

async function getRace(req, res) {
  const data = await raceService.getRace(req.params.id);

  return sendSuccess(res, 200, 'Race retrieved successfully', data);
}

async function getRaceParticipants(req, res) {
  const data = await raceService.getRaceParticipants(req, req.params.id);

  return sendSuccess(res, 200, 'Race participants retrieved successfully', data);
}

async function updateRace(req, res) {
  const data = await raceService.updateRace(req.params.id, req.validatedBody);

  return sendSuccess(res, 200, 'Race updated successfully', data);
}

async function openRegistrationForDemo(req, res) {
  const data = await raceService.openRegistrationForDemo(req.params.id);

  return sendSuccess(res, 200, 'Race registration opened for demo successfully', data);
}

async function setRegistrationDemoMode(req, res) {
  const data = await raceService.setRegistrationDemoMode(req.body);

  return sendSuccess(res, 200, 'Race registration demo mode updated successfully', data);
}

async function prepareDemoTimeline(req, res) {
  const data = await raceService.prepareDemoTimeline(req.params.id, req.validatedBody);

  return sendSuccess(res, 200, 'Demo timeline prepared successfully', data);
}

async function lockRegistrationForDemo(req, res) {
  const data = await raceService.lockRegistrationForDemo(req.params.id);

  return sendSuccess(res, 200, 'Race registrations locked for demo successfully', data);
}

async function deleteRace(req, res) {
  const data = await raceService.deleteRace(req.params.id);

  return sendSuccess(res, 200, 'Race deleted successfully', data);
}

async function openBetting(req, res) {
  const data = await raceService.openBetting(req.params.id, req.body || {});

  return sendSuccess(res, 200, 'Race betting opened successfully', data);
}

async function closeBetting(req, res) {
  const data = await raceService.closeBetting(req.params.id);

  return sendSuccess(res, 200, 'Race betting closed successfully', data);
}

async function startRace(req, res) {
  const data = await raceService.startRace(req, req.params.id);

  return sendSuccess(res, 200, 'Race started successfully', data);
}

async function completeRace(req, res) {
  const data = await raceService.completeRace(req, req.params.id);

  return sendSuccess(res, 200, 'Race completed successfully', data);
}

module.exports = {
  createRace,
  completeRace,
  listRaces,
  getRace,
  openRegistrationForDemo,
  setRegistrationDemoMode,
  prepareDemoTimeline,
  lockRegistrationForDemo,
  openBetting,
  closeBetting,
  startRace,
  getRaceParticipants,
  updateRace,
  deleteRace
};
