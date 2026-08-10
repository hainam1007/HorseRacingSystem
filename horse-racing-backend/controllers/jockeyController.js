const jockeyService = require('../services/jockeyService');
const { sendSuccess } = require('../utils/apiResponse');

async function getMe(req, res) {
  const data = await jockeyService.getMe(req.user._id);

  return sendSuccess(res, 200, 'Jockey profile retrieved successfully', data);
}

async function getApprovalStatus(req, res) {
  const data = await jockeyService.getApprovalStatus(req.user._id);

  return sendSuccess(res, 200, 'Jockey approval status retrieved successfully', data);
}

async function updateMe(req, res) {
  const data = await jockeyService.updateMe(req.user._id, req.validatedBody);

  return sendSuccess(res, 200, 'Jockey profile updated successfully', data);
}

async function listMyAssignments(req, res) {
  const data = await jockeyService.listMyAssignments(req.user._id, req.query);

  return sendSuccess(res, 200, 'Jockey assignments retrieved successfully', data);
}

async function acceptAssignment(req, res) {
  const data = await jockeyService.acceptAssignment(req.user._id, req.params.id, req.body);

  return sendSuccess(res, 200, 'Jockey assignment accepted successfully', data);
}

async function rejectAssignment(req, res) {
  const data = await jockeyService.rejectAssignment(req.user._id, req.params.id, req.body);

  return sendSuccess(res, 200, 'Jockey assignment rejected successfully', data);
}

async function getSchedule(req, res) {
  const data = await jockeyService.getSchedule(req.user._id, req.query);

  return sendSuccess(res, 200, 'Jockey schedule retrieved successfully', data);
}

async function getHorseJockeyList(req, res) {
  const data = await jockeyService.getHorseJockeyList(req.params.horseId, req.query);

  return sendSuccess(res, 200, 'Horse jockey list retrieved successfully', data);
}

async function getHorseRaceSchedule(req, res) {
  const data = await jockeyService.getHorseRaceSchedule(req.params.horseId, req.query);

  return sendSuccess(res, 200, 'Horse race schedule retrieved successfully', data);
}

async function getResults(req, res) {
  const data = await jockeyService.getResults(req.user._id);

  return sendSuccess(res, 200, 'Jockey results retrieved successfully', data);
}

async function getStats(req, res) {
  const data = await jockeyService.getStats(req.user._id);

  return sendSuccess(res, 200, 'Jockey stats retrieved successfully', data);
}

async function getViolations(req, res) {
  const data = await jockeyService.getViolations(req.user._id);

  return sendSuccess(res, 200, 'Jockey violations retrieved successfully', data);
}

module.exports = {
  getMe,
  getApprovalStatus,
  updateMe,
  listMyAssignments,
  acceptAssignment,
  rejectAssignment,
  getSchedule,
  getHorseJockeyList,
  getHorseRaceSchedule,
  getResults,
  getStats,
  getViolations
};
