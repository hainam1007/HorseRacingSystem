const betService = require('../services/betService');
const { sendSuccess } = require('../utils/apiResponse');

async function placeBet(req, res) {
  const data = await betService.placeBet(req, req.validatedBody);

  return sendSuccess(res, 201, 'Bet placed successfully', data);
}

async function listMyBets(req, res) {
  const data = await betService.listMyBets(req.user._id, req.query);

  return sendSuccess(res, 200, 'Bets retrieved successfully', data);
}

async function settleRaceBets(req, res) {
  const data = await betService.settleRaceBets(req.params.raceId, req.user._id);

  return sendSuccess(res, 200, 'Race bets settled successfully', data);
}

module.exports = {
  placeBet,
  listMyBets,
  settleRaceBets
};
