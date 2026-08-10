const express = require('express');

const jockeyController = require('../controllers/jockeyController');
const authenticate = require('../middlewares/authenticate');
const authorizeRoles = require('../middlewares/authorizeRoles');
const { ROLE_NAMES } = require('../constants/roles');
const asyncHandler = require('../utils/asyncHandler');
const { validateObjectIdParam } = require('../validators/commonValidator');
const { validateUpdateJockey } = require('../validators/jockeyValidator');

const router = express.Router();
const jockeyOnly = authorizeRoles(ROLE_NAMES.JOCKEY);

router.use(authenticate);
router.use(jockeyOnly);

router.get('/me', asyncHandler(jockeyController.getMe));
router.patch('/me', validateUpdateJockey, asyncHandler(jockeyController.updateMe));
router.get('/me/approval-status', asyncHandler(jockeyController.getApprovalStatus));
router.get('/me/assignments', asyncHandler(jockeyController.listMyAssignments));
router.post('/me/assignments/:id/accept', validateObjectIdParam('id'), asyncHandler(jockeyController.acceptAssignment));
router.post('/me/assignments/:id/reject', validateObjectIdParam('id'), asyncHandler(jockeyController.rejectAssignment));
router.get('/me/schedule', asyncHandler(jockeyController.getSchedule));
router.get('/me/results', asyncHandler(jockeyController.getResults));
router.get('/me/stats', asyncHandler(jockeyController.getStats));
router.get('/me/violations', asyncHandler(jockeyController.getViolations));
router.get('/horses/:horseId/jockeys', validateObjectIdParam('horseId'), asyncHandler(jockeyController.getHorseJockeyList));
router.get('/horses/:horseId/schedule', validateObjectIdParam('horseId'), asyncHandler(jockeyController.getHorseRaceSchedule));

module.exports = router;
