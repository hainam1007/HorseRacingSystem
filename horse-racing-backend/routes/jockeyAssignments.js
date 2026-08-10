const express = require('express');

const jockeyAssignmentController = require('../controllers/jockeyAssignmentController');
const authenticate = require('../middlewares/authenticate');
const authorizeRoles = require('../middlewares/authorizeRoles');
const { ROLE_NAMES } = require('../constants/roles');
const asyncHandler = require('../utils/asyncHandler');
const { validateObjectIdParam } = require('../validators/commonValidator');
const {
  validateCreateAssignment,
  validateWithdrawal,
  validateCancellationRequest,
  validateCancellationResponse,
  validatePromoteBackup,
  validateUpdateTerms,
  validateUploadContract
} = require('../validators/jockeyAssignmentValidator');

const router = express.Router();
const assignmentReaders = authorizeRoles(ROLE_NAMES.ADMIN, ROLE_NAMES.HORSE_OWNER, ROLE_NAMES.JOCKEY);
const ownerOrAdmin = authorizeRoles(ROLE_NAMES.HORSE_OWNER, ROLE_NAMES.ADMIN);
const jockeyOnly = authorizeRoles(ROLE_NAMES.JOCKEY);
const ownerOrJockey = authorizeRoles(ROLE_NAMES.HORSE_OWNER, ROLE_NAMES.JOCKEY);

router.use(authenticate);
router.get('/', assignmentReaders, asyncHandler(jockeyAssignmentController.listAssignments));
router.post(
  '/',
  ownerOrAdmin,
  validateCreateAssignment,
  asyncHandler(jockeyAssignmentController.createAssignment)
);
router.get('/:id', assignmentReaders, validateObjectIdParam('id'), asyncHandler(jockeyAssignmentController.getAssignment));
router.post('/:id/cancel', ownerOrAdmin, validateObjectIdParam('id'), asyncHandler(jockeyAssignmentController.cancelAssignment));
router.post(
  '/:id/withdraw',
  ownerOrJockey,
  validateObjectIdParam('id'),
  validateWithdrawal,
  asyncHandler(jockeyAssignmentController.withdrawAssignment)
);
router.post(
  '/:id/cancellation-request',
  ownerOrJockey,
  validateObjectIdParam('id'),
  validateCancellationRequest,
  asyncHandler(jockeyAssignmentController.requestCancellation)
);
router.post(
  '/:id/cancellation-request/respond',
  ownerOrJockey,
  validateObjectIdParam('id'),
  validateCancellationResponse,
  asyncHandler(jockeyAssignmentController.respondToCancellation)
);
router.post('/:id/accept', jockeyOnly, validateObjectIdParam('id'), asyncHandler(jockeyAssignmentController.acceptAssignment));
router.post('/:id/reject', jockeyOnly, validateObjectIdParam('id'), asyncHandler(jockeyAssignmentController.rejectAssignment));
router.post('/:id/accept-meeting', jockeyOnly, validateObjectIdParam('id'), asyncHandler(jockeyAssignmentController.acceptMeeting));
router.post('/:id/reject-meeting', jockeyOnly, validateObjectIdParam('id'), asyncHandler(jockeyAssignmentController.rejectMeeting));
router.post('/:id/accept-appointment', jockeyOnly, validateObjectIdParam('id'), asyncHandler(jockeyAssignmentController.acceptMeeting));
router.post('/:id/reject-appointment', jockeyOnly, validateObjectIdParam('id'), asyncHandler(jockeyAssignmentController.rejectMeeting));
router.patch('/:id/terms', ownerOrAdmin, validateObjectIdParam('id'), validateUpdateTerms, asyncHandler(jockeyAssignmentController.updateTerms));
router.post('/:id/confirm-terms', jockeyOnly, validateObjectIdParam('id'), asyncHandler(jockeyAssignmentController.confirmTerms));
router.post('/:id/reject-terms', jockeyOnly, validateObjectIdParam('id'), asyncHandler(jockeyAssignmentController.rejectTerms));
router.post('/:id/contract', ownerOrAdmin, validateObjectIdParam('id'), validateUploadContract, asyncHandler(jockeyAssignmentController.uploadContract));
router.post('/:id/promote', ownerOrAdmin, validateObjectIdParam('id'), validatePromoteBackup, asyncHandler(jockeyAssignmentController.promoteBackup));
router.post('/:id/confirm-contract', jockeyOnly, validateObjectIdParam('id'), asyncHandler(jockeyAssignmentController.confirmContract));
router.post('/:id/reject-contract', jockeyOnly, validateObjectIdParam('id'), asyncHandler(jockeyAssignmentController.rejectContract));

module.exports = router;
