const express = require('express');

const violationController = require('../controllers/violationController');
const authenticate = require('../middlewares/authenticate');
const authorizeRoles = require('../middlewares/authorizeRoles');
const { ROLE_NAMES } = require('../constants/roles');
const asyncHandler = require('../utils/asyncHandler');
const { validateObjectIdParam } = require('../validators/commonValidator');
const {
  validateCreateViolation,
  validateConfirmViolation,
  validateDismissViolation,
  validatePenaltyPreview,
  validateUpdateViolation,
  validateListViolations
} = require('../validators/violationValidator');

const router = express.Router();
const readers = authorizeRoles(ROLE_NAMES.ADMIN, ROLE_NAMES.RACE_REFEREE, ROLE_NAMES.JOCKEY);
const refereeOrAdmin = authorizeRoles(ROLE_NAMES.RACE_REFEREE, ROLE_NAMES.ADMIN);

router.use(authenticate);
router.get('/', readers, validateListViolations, asyncHandler(violationController.listViolations));
router.get('/options', readers, asyncHandler(violationController.getViolationOptions));
router.post(
  '/penalty-preview',
  refereeOrAdmin,
  validatePenaltyPreview,
  asyncHandler(violationController.previewPenalty)
);
router.post(
  '/',
  refereeOrAdmin,
  validateCreateViolation,
  asyncHandler(violationController.createViolation)
);
router.get('/:id', readers, validateObjectIdParam('id'), asyncHandler(violationController.getViolation));
router.post(
  '/:id/confirm',
  refereeOrAdmin,
  validateObjectIdParam('id'),
  validateConfirmViolation,
  asyncHandler(violationController.confirmViolation)
);
router.post(
  '/:id/dismiss',
  refereeOrAdmin,
  validateObjectIdParam('id'),
  validateDismissViolation,
  asyncHandler(violationController.dismissViolation)
);
router.patch(
  '/:id',
  refereeOrAdmin,
  validateObjectIdParam('id'),
  validateUpdateViolation,
  asyncHandler(violationController.updateViolation)
);

module.exports = router;
