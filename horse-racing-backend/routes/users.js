const express = require('express');

const userController = require('../controllers/userController');
const authenticate = require('../middlewares/authenticate');
const authorizeRoles = require('../middlewares/authorizeRoles');
const { ROLE_NAMES } = require('../constants/roles');
const asyncHandler = require('../utils/asyncHandler');
const { validateObjectIdParam } = require('../validators/commonValidator');

const router = express.Router();
const spectatorOnly = authorizeRoles(ROLE_NAMES.SPECTATOR);
const spectatorOrReferee = authorizeRoles(ROLE_NAMES.SPECTATOR, ROLE_NAMES.RACE_REFEREE);

router.use(authenticate);

router.get(
  '/spectator/tournaments/:tournamentId',
  spectatorOnly,
  validateObjectIdParam('tournamentId'),
  asyncHandler(userController.getSpectatorTournamentDetail)
);
router.get('/spectator/race-schedule', spectatorOnly, asyncHandler(userController.getSpectatorRaceSchedule));
router.get(
  '/spectator/races/:raceId/results',
  spectatorOnly,
  validateObjectIdParam('raceId'),
  asyncHandler(userController.getSpectatorRaceResults)
);
router.get(
  '/spectator/races/:raceId/live-state',
  spectatorOrReferee,
  validateObjectIdParam('raceId'),
  asyncHandler(userController.getSpectatorRaceLiveState)
);

module.exports = router;
