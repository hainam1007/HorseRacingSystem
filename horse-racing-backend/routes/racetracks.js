'use strict';

const express = require('express');

const racetrackController = require('../controllers/racetrackController');
const authenticate = require('../middlewares/authenticate');
const authorizeRoles = require('../middlewares/authorizeRoles');
const { ROLE_NAMES } = require('../constants/roles');
const asyncHandler = require('../utils/asyncHandler');
const { validateUuidParam } = require('../validators/commonValidator');
const {
    validateCreateRacetrack,
    validateUpdateRacetrack
} = require('../validators/racetrackValidator');

const router = express.Router();
const adminOnly = authorizeRoles(ROLE_NAMES.ADMIN);

router.use(authenticate);

router.get('/', asyncHandler(racetrackController.listRacetracks));
router.get('/:id', validateUuidParam('id'), asyncHandler(racetrackController.getRacetrack));
router.post('/', adminOnly, validateCreateRacetrack, asyncHandler(racetrackController.createRacetrack));
router.patch('/:id', adminOnly, validateUuidParam('id'), validateUpdateRacetrack, asyncHandler(racetrackController.updateRacetrack));
router.post('/:id/archive', adminOnly, validateUuidParam('id'), asyncHandler(racetrackController.archiveRacetrack));

module.exports = router;
