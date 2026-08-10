const horseCheckService = require('../services/horseCheckService');
const { sendSuccess } = require('../utils/apiResponse');

async function createHorseCheck(req, res) {
  const data = await horseCheckService.createHorseCheck(req, req.validatedBody);

  return sendSuccess(res, 201, 'Horse check created successfully', data);
}

async function bulkSaveHorseChecks(req, res) {
  const data = await horseCheckService.bulkSaveHorseChecks(req, req.validatedBody);

  return sendSuccess(res, 200, 'Horse checks saved successfully', data);
}

async function listHorseChecks(req, res) {
  const data = await horseCheckService.listHorseChecks(req, req.validatedQuery);

  return sendSuccess(res, 200, 'Horse check list retrieved successfully', data);
}

async function getHorseCheck(req, res) {
  const data = await horseCheckService.getHorseCheck(req, req.params.id);

  return sendSuccess(res, 200, 'Horse check detail retrieved successfully', data);
}

async function updateHorseCheck(req, res) {
  const data = await horseCheckService.updateHorseCheck(req, req.params.id, req.validatedBody);

  return sendSuccess(res, 200, 'Horse check updated successfully', data);
}

module.exports = {
  bulkSaveHorseChecks,
  createHorseCheck,
  getHorseCheck,
  listHorseChecks,
  updateHorseCheck
};
