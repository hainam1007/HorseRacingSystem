const raceOddsService = require('../services/raceOddsService');
const { sendSuccess } = require('../utils/apiResponse');

async function generateRaceOdds(req, res) {
  const data = await raceOddsService.generateRaceOdds(req, req.params.id);

  return sendSuccess(res, 201, 'Race odds generated successfully', data);
}

async function getRaceOdds(req, res) {
  const data = await raceOddsService.getRaceOdds(req.params.id);

  return sendSuccess(res, 200, 'Race odds retrieved successfully', data);
}

async function updateRaceOdds(req, res) {
  const data = await raceOddsService.updateRaceOdds(req, req.params.id, req.validatedBody);

  return sendSuccess(res, 200, 'Race odds adjusted successfully', data);
}

module.exports = {
  generateRaceOdds,
  getRaceOdds,
  updateRaceOdds
};
