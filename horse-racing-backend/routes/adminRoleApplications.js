const express = require('express');

const roleApplicationController = require('../controllers/roleApplicationController');
const authenticate = require('../middlewares/authenticate');
const authorizeRoles = require('../middlewares/authorizeRoles');
const { ROLE_NAMES } = require('../constants/roles');
const asyncHandler = require('../utils/asyncHandler');
const { validateObjectIdParam } = require('../validators/commonValidator');
const {
  validateListApplications,
  validateReviewApplication
} = require('../validators/roleApplicationValidator');

const router = express.Router();
const adminOnly = authorizeRoles(ROLE_NAMES.ADMIN);

router.use(authenticate);
router.use(adminOnly);

router.get('/role-applications', validateListApplications, asyncHandler(roleApplicationController.listApplications));
router.get('/role-applications/:id', validateObjectIdParam('id'), asyncHandler(roleApplicationController.getApplication));
router.post(
  '/role-applications/:id/approve',
  validateObjectIdParam('id'),
  validateReviewApplication,
  asyncHandler(roleApplicationController.approveApplication)
);
router.post(
  '/role-applications/:id/reject',
  validateObjectIdParam('id'),
  validateReviewApplication,
  asyncHandler(roleApplicationController.rejectApplication)
);

module.exports = router;
