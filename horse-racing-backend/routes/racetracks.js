const express = require('express');

const racetrackController = require('../controllers/racetrackController');
const authenticate = require('../middlewares/authenticate');
const authorizeRoles = require('../middlewares/authorizeRoles');
const { ROLE_NAMES } = require('../constants/roles');
const asyncHandler = require('../utils/asyncHandler');
const { validateObjectIdParam } = require('../validators/commonValidator');

const router = express.Router();
const adminOnly = authorizeRoles(ROLE_NAMES.ADMIN);

router.use(authenticate);

// Public / Authenticated endpoints
router.get('/', asyncHandler(racetrackController.listRacetracks));
router.get('/live-status', asyncHandler(racetrackController.getLiveStatus));
router.get('/:id', validateObjectIdParam('id'), asyncHandler(racetrackController.getRacetrack));
router.get('/:id/available-slots', validateObjectIdParam('id'), asyncHandler(racetrackController.getAvailableSlots));

// Admin endpoints
router.post('/', adminOnly, asyncHandler(racetrackController.createRacetrack));
router.put('/:id', adminOnly, validateObjectIdParam('id'), asyncHandler(racetrackController.updateRacetrack));
router.delete('/:id', adminOnly, validateObjectIdParam('id'), asyncHandler(racetrackController.deleteRacetrack));

module.exports = router;
