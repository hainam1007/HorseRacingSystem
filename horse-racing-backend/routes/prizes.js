const express = require('express');

const prizeController = require('../controllers/prizeController');
const authenticate = require('../middlewares/authenticate');
const authorizeRoles = require('../middlewares/authorizeRoles');
const { ROLE_NAMES } = require('../constants/roles');
const asyncHandler = require('../utils/asyncHandler');
const { validateObjectIdParam } = require('../validators/commonValidator');
const { validateRacePrizeConfig } = require('../validators/prizeValidator');

const router = express.Router();
const adminOnly = authorizeRoles(ROLE_NAMES.ADMIN);
const prizeReaders = authorizeRoles(
  ROLE_NAMES.ADMIN,
  ROLE_NAMES.HORSE_OWNER,
  ROLE_NAMES.JOCKEY,
  ROLE_NAMES.SPECTATOR
);

router.use(authenticate);
router.get('/', prizeReaders, asyncHandler(prizeController.listAwards));
router.get('/races/:raceId/config', prizeReaders, validateObjectIdParam('raceId'), asyncHandler(prizeController.getRacePrizeConfig));
router.post('/races/:raceId/config', adminOnly, validateObjectIdParam('raceId'), validateRacePrizeConfig, asyncHandler(prizeController.configureRacePrizes));
router.post('/races/:raceId/calculate', adminOnly, validateObjectIdParam('raceId'), asyncHandler(prizeController.calculateRacePrizeAwards));
router.post('/races/:raceId/approve', adminOnly, validateObjectIdParam('raceId'), asyncHandler(prizeController.approveRaceAwards));
router.get('/races/:raceId/awards', prizeReaders, validateObjectIdParam('raceId'), asyncHandler(prizeController.listRaceAwards));
router.post('/awards/:id/mark-paid', adminOnly, validateObjectIdParam('id'), asyncHandler(prizeController.markAwardPaid));

module.exports = router;
