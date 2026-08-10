const raceEntryService = require('../services/raceEntryService');
const { sendSuccess } = require('../utils/apiResponse');

async function getModelInputReadiness(req, res) {
  return sendSuccess(res, 200, 'Race model input readiness retrieved successfully', await raceEntryService.getModelInputReadiness(req.params.id));
}

async function finalizeEntries(req, res) {
  return sendSuccess(res, 200, 'Race entries finalized successfully', await raceEntryService.finalizeEntries(req.user._id, req.params.id));
}

async function updateRaceEntry(req, res) {
  return sendSuccess(res, 200, 'Race entry updated successfully', await raceEntryService.updateRaceEntry(req.user._id, req.params.id, req.validatedBody));
}

module.exports = { finalizeEntries, getModelInputReadiness, updateRaceEntry };
