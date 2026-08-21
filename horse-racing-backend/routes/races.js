const express = require('express');

const raceController = require('../controllers/raceController');
const raceOddsController = require('../controllers/raceOddsController');
const raceEntryController = require('../controllers/raceEntryController');
const authenticate = require('../middlewares/authenticate');
const authorizeRoles = require('../middlewares/authorizeRoles');
const { ROLE_NAMES } = require('../constants/roles');
const asyncHandler = require('../utils/asyncHandler');
const { validateObjectIdParam } = require('../validators/commonValidator');
const { validateCreateRace, validateUpdateRace, validateDemoTimeline } = require('../validators/raceValidator');
const { validateUpdateRaceOdds } = require('../validators/raceOddsValidator');

const router = express.Router();
const adminOnly = authorizeRoles(ROLE_NAMES.ADMIN);
const refereeOrAdmin = authorizeRoles(ROLE_NAMES.RACE_REFEREE, ROLE_NAMES.ADMIN);
const oddsReaders = authorizeRoles(
  ROLE_NAMES.ADMIN,
  ROLE_NAMES.HORSE_OWNER,
  ROLE_NAMES.JOCKEY,
  ROLE_NAMES.RACE_REFEREE,
  ROLE_NAMES.SPECTATOR
);

router.use(authenticate);
router.get('/', asyncHandler(raceController.listRaces));
router.post('/', adminOnly, validateCreateRace, asyncHandler(raceController.createRace));
router.post('/registration-demo-mode', adminOnly, asyncHandler(raceController.setRegistrationDemoMode));
router.post('/:id/open-registration-demo', adminOnly, validateObjectIdParam('id'), asyncHandler(raceController.openRegistrationForDemo));
router.post('/:id/demo-timeline', adminOnly, validateObjectIdParam('id'), validateDemoTimeline, asyncHandler(raceController.prepareDemoTimeline));
router.post('/:id/demo-timeline/lock', adminOnly, validateObjectIdParam('id'), asyncHandler(raceController.lockRegistrationForDemo));
router.get('/:id/odds', oddsReaders, validateObjectIdParam('id'), asyncHandler(raceOddsController.getRaceOdds));
router.post('/:id/odds/generate', adminOnly, validateObjectIdParam('id'), asyncHandler(raceOddsController.generateRaceOdds));
router.patch('/:id/odds', adminOnly, validateObjectIdParam('id'), validateUpdateRaceOdds, asyncHandler(raceOddsController.updateRaceOdds));
router.get('/:id/model-input-readiness', adminOnly, validateObjectIdParam('id'), asyncHandler(raceEntryController.getModelInputReadiness));
router.post('/:id/entries/finalize', adminOnly, validateObjectIdParam('id'), asyncHandler(raceEntryController.finalizeEntries));
router.post('/:id/betting/open', adminOnly, validateObjectIdParam('id'), asyncHandler(raceController.openBetting));
router.post('/:id/betting/close', adminOnly, validateObjectIdParam('id'), asyncHandler(raceController.closeBetting));
router.post('/:id/start', refereeOrAdmin, validateObjectIdParam('id'), asyncHandler(raceController.startRace));
router.post('/:id/complete', refereeOrAdmin, validateObjectIdParam('id'), asyncHandler(raceController.completeRace));
router.get('/:id/participants', refereeOrAdmin, validateObjectIdParam('id'), asyncHandler(raceController.getRaceParticipants));
router.get('/:id', validateObjectIdParam('id'), asyncHandler(raceController.getRace));
router.patch('/:id', adminOnly, validateObjectIdParam('id'), validateUpdateRace, asyncHandler(raceController.updateRace));
router.delete('/:id', adminOnly, validateObjectIdParam('id'), asyncHandler(raceController.deleteRace));

module.exports = router;
