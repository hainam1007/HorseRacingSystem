const userService = require('../services/userService');
const { sendSuccess } = require('../utils/apiResponse');

async function getSpectatorTournamentDetail(req, res) {
  const data = await userService.getSpectatorTournamentDetail(req.params.tournamentId);

  return sendSuccess(res, 200, 'Spectator tournament detail retrieved successfully', data);
}

async function getSpectatorRaceSchedule(req, res) {
  const data = await userService.getSpectatorRaceSchedule(req.query);

  return sendSuccess(res, 200, 'Spectator race schedule retrieved successfully', data);
}

async function getSpectatorRaceResults(req, res) {
  const data = await userService.getSpectatorRaceResults(req.params.raceId);

  return sendSuccess(res, 200, 'Published race results retrieved successfully', data);
}

async function getSpectatorRaceLiveState(req, res) {
  const data = await userService.getSpectatorRaceLiveState(req.params.raceId);

  return sendSuccess(res, 200, 'Spectator race live state retrieved successfully', data);
}

module.exports = {
  getSpectatorRaceLiveState,
  getSpectatorRaceResults,
  getSpectatorTournamentDetail,
  getSpectatorRaceSchedule
};
