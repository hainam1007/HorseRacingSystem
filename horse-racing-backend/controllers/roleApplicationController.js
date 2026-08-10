const roleApplicationService = require('../services/roleApplicationService');
const { sendSuccess } = require('../utils/apiResponse');

async function createApplication(req, res) {
  const data = await roleApplicationService.createApplication(req, req.validatedBody);

  return sendSuccess(res, 201, 'Role application submitted successfully', data);
}

async function listMyApplications(req, res) {
  const data = await roleApplicationService.listMyApplications(req.user._id, req.validatedQuery);

  return sendSuccess(res, 200, 'My role applications retrieved successfully', data);
}

async function listApplications(req, res) {
  const data = await roleApplicationService.listApplications(req.validatedQuery);

  return sendSuccess(res, 200, 'Role applications retrieved successfully', data);
}

async function getApplication(req, res) {
  const data = await roleApplicationService.getApplication(req.params.id);

  return sendSuccess(res, 200, 'Role application detail retrieved successfully', data);
}

async function approveApplication(req, res) {
  const data = await roleApplicationService.approveApplication(req.user._id, req.params.id, req.validatedBody);

  return sendSuccess(res, 200, 'Role application approved successfully', data);
}

async function rejectApplication(req, res) {
  const data = await roleApplicationService.rejectApplication(req.user._id, req.params.id, req.validatedBody);

  return sendSuccess(res, 200, 'Role application rejected successfully', data);
}

module.exports = {
  approveApplication,
  createApplication,
  getApplication,
  listApplications,
  listMyApplications,
  rejectApplication
};
