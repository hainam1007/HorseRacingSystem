const jockeyAssignmentService = require('../services/jockeyAssignmentService');
const { sendSuccess } = require('../utils/apiResponse');

async function createAssignment(req, res) {
  const data = await jockeyAssignmentService.createAssignment(req, req.validatedBody || req.body);

  return sendSuccess(res, 201, 'Jockey assignment created successfully', data);
}

async function listAssignments(req, res) {
  const data = await jockeyAssignmentService.listAssignments(req, req.query);

  return sendSuccess(res, 200, 'Jockey assignments retrieved successfully', data);
}

async function getAssignment(req, res) {
  const data = await jockeyAssignmentService.getAssignment(req, req.params.id);

  return sendSuccess(res, 200, 'Jockey assignment retrieved successfully', data);
}

async function cancelAssignment(req, res) {
  const data = await jockeyAssignmentService.cancelAssignment(req, req.params.id);

  return sendSuccess(res, 200, 'Jockey assignment cancelled successfully', data);
}

async function withdrawAssignment(req, res) {
  const data = await jockeyAssignmentService.withdrawAssignment(
    req,
    req.params.id,
    req.validatedBody || req.body
  );

  return sendSuccess(res, 200, 'Jockey assignment withdrawn successfully', data);
}

async function requestCancellation(req, res) {
  const data = await jockeyAssignmentService.requestCancellation(
    req,
    req.params.id,
    req.validatedBody || req.body
  );

  return sendSuccess(res, 201, 'Jockey assignment cancellation requested successfully', data);
}

async function respondToCancellation(req, res) {
  const data = await jockeyAssignmentService.respondToCancellation(
    req,
    req.params.id,
    req.validatedBody || req.body
  );
  const message = data.assignment.status === 'cancelled'
    ? 'Jockey assignment cancellation approved successfully'
    : 'Jockey assignment cancellation rejected successfully';

  return sendSuccess(res, 200, message, data);
}

async function acceptAssignment(req, res) {
  const data = await jockeyAssignmentService.acceptMeeting(
    req.user._id,
    req.params.id,
    req.body.response_message
  );

  return sendSuccess(res, 200, 'Jockey appointment invitation accepted successfully', data);
}

async function rejectAssignment(req, res) {
  const data = await jockeyAssignmentService.rejectMeeting(
    req.user._id,
    req.params.id,
    req.body.response_message
  );

  return sendSuccess(res, 200, 'Jockey appointment invitation rejected successfully', data);
}

async function acceptMeeting(req, res) {
  const data = await jockeyAssignmentService.acceptMeeting(
    req.user._id,
    req.params.id,
    req.body.response_message
  );

  return sendSuccess(res, 200, 'Jockey appointment invitation accepted successfully', data);
}

async function rejectMeeting(req, res) {
  const data = await jockeyAssignmentService.rejectMeeting(
    req.user._id,
    req.params.id,
    req.body.response_message
  );

  return sendSuccess(res, 200, 'Jockey appointment invitation rejected successfully', data);
}

async function updateTerms(req, res) {
  const data = await jockeyAssignmentService.updateTerms(req, req.params.id, req.validatedBody || req.body);

  return sendSuccess(res, 200, 'Jockey assignment terms updated successfully', data);
}

async function uploadContract(req, res) {
  const data = await jockeyAssignmentService.uploadContract(req, req.params.id, req.validatedBody || req.body);

  return sendSuccess(res, 200, 'Jockey assignment contract uploaded successfully', data);
}

async function confirmTerms(req, res) {
  const data = await jockeyAssignmentService.confirmTerms(
    req.user._id,
    req.params.id,
    req.body.response_message
  );

  return sendSuccess(res, 200, 'Jockey assignment terms confirmed successfully', data);
}

async function rejectTerms(req, res) {
  const data = await jockeyAssignmentService.rejectTerms(
    req.user._id,
    req.params.id,
    req.body.response_message
  );

  return sendSuccess(res, 200, 'Jockey assignment terms rejected successfully', data);
}

async function promoteBackup(req, res) {
  const data = await jockeyAssignmentService.promoteBackup(req, req.params.id, req.validatedBody || req.body);

  return sendSuccess(res, 200, 'Backup jockey promoted successfully', data);
}

async function confirmContract(req, res) {
  const data = await jockeyAssignmentService.confirmContract(
    req.user._id,
    req.params.id,
    req.body.response_message
  );

  return sendSuccess(res, 200, 'Jockey assignment contract confirmed successfully', data);
}

async function rejectContract(req, res) {
  const data = await jockeyAssignmentService.rejectContract(
    req.user._id,
    req.params.id,
    req.body.response_message
  );

  return sendSuccess(res, 200, 'Jockey assignment contract rejected successfully', data);
}

module.exports = {
  createAssignment,
  listAssignments,
  getAssignment,
  cancelAssignment,
  withdrawAssignment,
  requestCancellation,
  respondToCancellation,
  acceptAssignment,
  rejectAssignment,
  acceptMeeting,
  rejectMeeting,
  updateTerms,
  confirmTerms,
  rejectTerms,
  uploadContract,
  promoteBackup,
  confirmContract,
  rejectContract
};
