const prizeService = require('../services/prizeService');
const { sendSuccess } = require('../utils/apiResponse');

async function configureRacePrizes(req, res) {
  const data = await prizeService.configureRacePrizes(req.user._id, req.params.raceId, req.body);
  return sendSuccess(res, 200, 'Race prizes configured successfully', data);
}

async function getRacePrizeConfig(req, res) {
  const data = await prizeService.getRacePrizeConfig(req.params.raceId);
  return sendSuccess(res, 200, 'Race prize config retrieved successfully', data);
}

async function calculateRacePrizeAwards(req, res) {
  const data = await prizeService.calculateRacePrizeAwards(req.params.raceId, req.user._id);
  return sendSuccess(res, 200, 'Race prize awards calculated successfully', data);
}

async function approveRaceAwards(req, res) {
  const data = await prizeService.approveRaceAwards(req.user._id, req.params.raceId);
  return sendSuccess(res, 200, 'Race prize awards approved successfully', data);
}

async function markAwardPaid(req, res) {
  const data = await prizeService.markAwardPaid(req.user._id, req.params.id);
  return sendSuccess(res, 200, 'Prize award marked paid successfully', data);
}

async function listAwards(req, res) {
  const data = await prizeService.listAwards(req, req.query);
  return sendSuccess(res, 200, 'Prize awards retrieved successfully', data);
}

async function listRaceAwards(req, res) {
  const awards = await prizeService.listRaceAwards(req, req.params.raceId);
  return sendSuccess(res, 200, 'Race prize awards retrieved successfully', { awards: awards });
}

module.exports = {
  approveRaceAwards,
  calculateRacePrizeAwards,
  configureRacePrizes,
  getRacePrizeConfig,
  listAwards,
  listRaceAwards,
  markAwardPaid
};
