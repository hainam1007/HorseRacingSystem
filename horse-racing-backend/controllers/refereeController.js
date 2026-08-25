const refereeService = require('../services/refereeService');
const userService = require('../services/userService');
const { sendSuccess } = require('../utils/apiResponse');

async function getWorkspace(req, res) {
  const data = await refereeService.getWorkspace(req);

  return sendSuccess(res, 200, 'Referee workspace retrieved successfully', data);
}

async function getRaceLiveState(req, res) {
  const data = await userService.getSpectatorRaceLiveState(req.params.raceId);

  return sendSuccess(res, 200, 'Race live state retrieved successfully', data);
}

module.exports = {
  getWorkspace,
  getRaceLiveState
};
