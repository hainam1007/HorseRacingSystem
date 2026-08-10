const express = require('express');

const refereeReportController = require('../controllers/refereeReportController');
const authenticate = require('../middlewares/authenticate');
const authorizeRoles = require('../middlewares/authorizeRoles');
const { ROLE_NAMES } = require('../constants/roles');
const asyncHandler = require('../utils/asyncHandler');
const { validateObjectIdParam } = require('../validators/commonValidator');
const {
  validateCreateRefereeReport,
  validateListRefereeReports,
  validateUpdateRefereeReport
} = require('../validators/refereeReportValidator');

const router = express.Router();
const refereeOrAdmin = authorizeRoles(ROLE_NAMES.RACE_REFEREE, ROLE_NAMES.ADMIN);

router.use(authenticate);
router.use(refereeOrAdmin);

router.get('/', validateListRefereeReports, asyncHandler(refereeReportController.listRefereeReports));
router.post('/', validateCreateRefereeReport, asyncHandler(refereeReportController.createRefereeReport));
router.get('/:id', validateObjectIdParam('id'), asyncHandler(refereeReportController.getRefereeReport));
router.patch(
  '/:id',
  validateObjectIdParam('id'),
  validateUpdateRefereeReport,
  asyncHandler(refereeReportController.updateRefereeReport)
);
router.post('/:id/submit', validateObjectIdParam('id'), asyncHandler(refereeReportController.submitRefereeReport));

module.exports = router;
