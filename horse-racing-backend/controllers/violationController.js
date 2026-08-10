const violationService = require('../services/violationService');
const { sendSuccess } = require('../utils/apiResponse');

async function createViolation(req, res) {
  const data = await violationService.createViolation(req, req.validatedBody || req.body);

  return sendSuccess(res, 201, 'Violation created successfully', data);
}

async function listViolations(req, res) {
  const data = await violationService.listViolations(req, req.validatedQuery || req.query);

  return sendSuccess(res, 200, 'Violations retrieved successfully', data);
}

async function getViolation(req, res) {
  const data = await violationService.getViolation(req, req.params.id);

  return sendSuccess(res, 200, 'Violation retrieved successfully', data);
}

async function updateViolation(req, res) {
  const data = await violationService.updateViolation(req, req.params.id, req.validatedBody || req.body);

  return sendSuccess(res, 200, 'Violation updated successfully', data);
}

async function confirmViolation(req, res) {
  const data = await violationService.confirmViolation(req, req.params.id, req.validatedBody || req.body);

  return sendSuccess(res, 200, 'Violation confirmed successfully', data);
}

async function dismissViolation(req, res) {
  const data = await violationService.dismissViolation(req, req.params.id, req.validatedBody || req.body);

  return sendSuccess(res, 200, 'Violation dismissed successfully', data);
}

async function getViolationOptions(req, res) {
  return sendSuccess(res, 200, 'Violation options retrieved successfully', violationService.getViolationOptions());
}

async function previewPenalty(req, res) {
  return sendSuccess(
    res,
    200,
    'Violation penalty preview retrieved successfully',
    violationService.previewPenalty(req.validatedBody)
  );
}

module.exports = {
  confirmViolation,
  createViolation,
  dismissViolation,
  getViolationOptions,
  listViolations,
  getViolation,
  previewPenalty,
  updateViolation
};
