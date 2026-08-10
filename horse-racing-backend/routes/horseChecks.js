const express = require('express');

const horseCheckController = require('../controllers/horseCheckController');
const authenticate = require('../middlewares/authenticate');
const authorizeRoles = require('../middlewares/authorizeRoles');
const { ROLE_NAMES } = require('../constants/roles');
const asyncHandler = require('../utils/asyncHandler');
const { validateObjectIdParam } = require('../validators/commonValidator');
const {
  validateCreateHorseCheck,
  validateCreatePreRaceHorseCheck,
  validateCreateDuringRaceHorseCheck,
  validateCreatePostRaceHorseCheck,
  validateBulkPreRaceHorseChecks,
  validateBulkPostRaceHorseChecks,
  validateListHorseChecks,
  validateUpdateHorseCheck
} = require('../validators/horseCheckValidator');

const router = express.Router();
const refereeOrAdmin = authorizeRoles(ROLE_NAMES.RACE_REFEREE, ROLE_NAMES.ADMIN);

router.use(authenticate);
router.use(refereeOrAdmin);

router.get('/', validateListHorseChecks, asyncHandler(horseCheckController.listHorseChecks));
router.post('/pre-race/bulk', validateBulkPreRaceHorseChecks, asyncHandler(horseCheckController.bulkSaveHorseChecks));
router.post('/post-race/bulk', validateBulkPostRaceHorseChecks, asyncHandler(horseCheckController.bulkSaveHorseChecks));
router.post('/pre-race', validateCreatePreRaceHorseCheck, asyncHandler(horseCheckController.createHorseCheck));
router.post('/during-race', validateCreateDuringRaceHorseCheck, asyncHandler(horseCheckController.createHorseCheck));
router.post('/post-race', validateCreatePostRaceHorseCheck, asyncHandler(horseCheckController.createHorseCheck));
router.post('/', validateCreateHorseCheck, asyncHandler(horseCheckController.createHorseCheck));
router.get('/:id', validateObjectIdParam('id'), asyncHandler(horseCheckController.getHorseCheck));
router.patch(
  '/:id',
  validateObjectIdParam('id'),
  validateUpdateHorseCheck,
  asyncHandler(horseCheckController.updateHorseCheck)
);

module.exports = router;
