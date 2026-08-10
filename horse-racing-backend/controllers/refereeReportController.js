const refereeReportService = require('../services/refereeReportService');
const { sendSuccess } = require('../utils/apiResponse');

async function createRefereeReport(req, res) {
  const data = await refereeReportService.createRefereeReport(req, req.validatedBody);

  return sendSuccess(res, 201, 'Referee report created successfully', data);
}

async function listRefereeReports(req, res) {
  const data = await refereeReportService.listRefereeReports(req, req.validatedQuery);

  return sendSuccess(res, 200, 'Referee report list retrieved successfully', data);
}

async function getRefereeReport(req, res) {
  const data = await refereeReportService.getRefereeReport(req, req.params.id);

  return sendSuccess(res, 200, 'Referee report detail retrieved successfully', data);
}

async function updateRefereeReport(req, res) {
  const data = await refereeReportService.updateRefereeReport(req, req.params.id, req.validatedBody);

  return sendSuccess(res, 200, 'Referee report updated successfully', data);
}

async function submitRefereeReport(req, res) {
  const data = await refereeReportService.submitRefereeReport(req, req.params.id);

  return sendSuccess(res, 200, 'Referee report submitted successfully', data);
}

module.exports = {
  createRefereeReport,
  getRefereeReport,
  listRefereeReports,
  submitRefereeReport,
  updateRefereeReport
};
