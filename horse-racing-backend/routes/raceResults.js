const express = require('express');

const raceResultController = require('../controllers/raceResultController');
const authenticate = require('../middlewares/authenticate');
const authorizeRoles = require('../middlewares/authorizeRoles');
const { ROLE_NAMES } = require('../constants/roles');
const asyncHandler = require('../utils/asyncHandler');
const { validateObjectIdParam } = require('../validators/commonValidator');
const { validateRequestCorrection } = require('../validators/raceResultValidator');

const router = express.Router();
const refereeOrAdmin = authorizeRoles(ROLE_NAMES.RACE_REFEREE, ROLE_NAMES.ADMIN);
const refereeOnly = authorizeRoles(ROLE_NAMES.RACE_REFEREE);
const resultReaders = authorizeRoles(ROLE_NAMES.RACE_REFEREE, ROLE_NAMES.ADMIN, ROLE_NAMES.SPECTATOR);
const adminOnly = authorizeRoles(ROLE_NAMES.ADMIN);

router.use(authenticate);
router.get('/', resultReaders, asyncHandler(raceResultController.listResults));
router.get(
  '/races/:raceId/participants',
  refereeOrAdmin,
  validateObjectIdParam('raceId'),
  asyncHandler(raceResultController.getRaceParticipants)
);
router.get(
  '/races/:raceId/readiness',
  refereeOrAdmin,
  validateObjectIdParam('raceId'),
  asyncHandler(raceResultController.getRaceReadiness)
);
router.post(
  '/races/:raceId/finalize',
  refereeOrAdmin,
  validateObjectIdParam('raceId'),
  asyncHandler(raceResultController.finalizeRace)
);
router.post(
  '/races/:raceId/apply-penalties',
  refereeOrAdmin,
  validateObjectIdParam('raceId'),
  asyncHandler(raceResultController.applyRacePenalties)
);
router.post(
  '/races/:raceId/confirm',
  adminOnly,
  validateObjectIdParam('raceId'),
  asyncHandler(raceResultController.confirmRaceResults)
);
router.post(
  '/races/:raceId/request-correction',
  adminOnly,
  validateObjectIdParam('raceId'),
  validateRequestCorrection,
  asyncHandler(raceResultController.requestRaceCorrection)
);
router.post(
  '/races/:raceId/resolve-correction',
  adminOnly,
  validateObjectIdParam('raceId'),
  asyncHandler(raceResultController.resolveRaceCorrection)
);
router.post(
  '/races/:raceId/publish',
  adminOnly,
  validateObjectIdParam('raceId'),
  asyncHandler(raceResultController.publishRaceResults)
);
router.get('/:id', refereeOrAdmin, validateObjectIdParam('id'), asyncHandler(raceResultController.getResult));
router.patch('/:id', refereeOnly, validateObjectIdParam('id'), asyncHandler(raceResultController.updateResult));

module.exports = router;
