const refereeService = require('../services/refereeService');
const { sendSuccess } = require('../utils/apiResponse');

async function getWorkspace(req, res) {
  const data = await refereeService.getWorkspace(req);

  return sendSuccess(res, 200, 'Referee workspace retrieved successfully', data);
}

module.exports = {
  getWorkspace
};
