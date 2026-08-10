const registrationService = require('../services/registrationService');
const { sendSuccess } = require('../utils/apiResponse');

async function createRegistration(req, res) {
  const data = await registrationService.createRegistration(req, req.body);

  return sendSuccess(res, 201, 'Registration created and confirmed successfully', data);
}

async function listRegistrations(req, res) {
  const data = await registrationService.listRegistrations(req, req.query);

  return sendSuccess(res, 200, 'Registrations retrieved successfully', data);
}

async function getRegistration(req, res) {
  const data = await registrationService.getRegistration(req.params.id);

  return sendSuccess(res, 200, 'Registration retrieved successfully', data);
}

module.exports = {
  createRegistration,
  listRegistrations,
  getRegistration
};
