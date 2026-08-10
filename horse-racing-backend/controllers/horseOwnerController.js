const horseOwnerService = require('../services/horseOwnerService');
const { sendSuccess } = require('../utils/apiResponse');

function getCurrentUser(req) {
  return Object.assign({}, req.user.toObject ? req.user.toObject() : req.user, {
    roles: req.auth ? req.auth.roles : []
  });
}

async function getProfile(req, res) {
  const data = await horseOwnerService.getProfile(getCurrentUser(req));

  return sendSuccess(res, 200, 'Horse owner profile retrieved successfully', data);
}

async function updateProfile(req, res) {
  const data = await horseOwnerService.updateProfile(getCurrentUser(req), req.validatedBody);

  return sendSuccess(res, 200, 'Horse owner profile updated successfully', data);
}

async function getHorses(req, res) {
  const data = await horseOwnerService.getHorses(getCurrentUser(req));

  return sendSuccess(res, 200, 'Horse list retrieved successfully', data);
}

async function createHorse(req, res) {
  const data = await horseOwnerService.createHorse(getCurrentUser(req), req.validatedBody);

  return sendSuccess(res, 201, 'Horse profile created successfully', data);
}

async function getHorseDetail(req, res) {
  const data = await horseOwnerService.getHorseDetail(getCurrentUser(req), req.params.horseId);

  return sendSuccess(res, 200, 'Horse detail retrieved successfully', data);
}

async function updateHorse(req, res) {
  const data = await horseOwnerService.updateHorse(getCurrentUser(req), req.params.horseId, req.validatedBody);

  return sendSuccess(res, 200, 'Horse information updated successfully', data);
}

async function deactivateHorse(req, res) {
  const data = await horseOwnerService.deactivateHorse(getCurrentUser(req), req.params.horseId);

  return sendSuccess(res, 200, 'Horse deactivated successfully', data);
}

async function updateHorseMedia(req, res) {
  const data = await horseOwnerService.updateHorseMedia(getCurrentUser(req), req.params.horseId, req.validatedBody);

  return sendSuccess(res, 200, 'Horse image updated successfully', data);
}

async function getHorseApprovalStatus(req, res) {
  const data = await horseOwnerService.getHorseApprovalStatus(getCurrentUser(req), req.params.horseId);

  return sendSuccess(res, 200, 'Horse approval status retrieved successfully', data);
}

async function getAvailableJockeys(req, res) {
  const data = await horseOwnerService.getAvailableJockeys(getCurrentUser(req), req.query.race_id);

  return sendSuccess(res, 200, 'Available jockey list retrieved successfully', data);
}

async function getJockeyDetail(req, res) {
  const data = await horseOwnerService.getJockeyDetail(getCurrentUser(req), req.params.jockeyId);

  return sendSuccess(res, 200, 'Jockey detail retrieved successfully', data);
}

async function getTournaments(req, res) {
  const data = await horseOwnerService.getTournaments(getCurrentUser(req));

  return sendSuccess(res, 200, 'Tournament list retrieved successfully', data);
}

async function getRacesByTournamentId(req, res) {
  const data = await horseOwnerService.getRacesByTournamentId(getCurrentUser(req), req.params.tournamentId);

  return sendSuccess(res, 200, 'Race list retrieved successfully', data);
}

async function getRoundsByRaceId(req, res) {
  const data = await horseOwnerService.getRoundsByRaceId(getCurrentUser(req), req.params.raceId);

  return sendSuccess(res, 200, 'Round list retrieved successfully', data);
}

async function registerHorseForRace(req, res) {
  const data = await horseOwnerService.registerHorseForRace(getCurrentUser(req), req.validatedBody);

  return sendSuccess(res, 201, data.payment_url ? 'VNPay registration payment created successfully' : 'Horse race entry confirmed successfully', data);
}

async function getRegistrationPayment(req, res) {
  const data = await horseOwnerService.getRegistrationPayment(getCurrentUser(req), req.params.orderId);

  return sendSuccess(res, 200, 'Race registration payment retrieved successfully', data);
}

async function updateRaceEntryDetails(req, res) {
  const data = await horseOwnerService.updateRaceEntryDetails(
    getCurrentUser(req),
    req.params.registrationId,
    req.validatedBody
  );

  return sendSuccess(res, 200, 'Race entry details updated successfully', data);
}

module.exports = {
  getProfile,
  updateProfile,
  getHorses,
  createHorse,
  getHorseDetail,
  updateHorse,
  deactivateHorse,
  updateHorseMedia,
  getHorseApprovalStatus,
  getAvailableJockeys,
  getJockeyDetail,
  getTournaments,
  getRacesByTournamentId,
  getRoundsByRaceId,
  registerHorseForRace,
  getRegistrationPayment,
  updateRaceEntryDetails
};
