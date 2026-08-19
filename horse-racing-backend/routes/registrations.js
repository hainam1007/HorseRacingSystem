const express = require('express');

const registrationController = require('../controllers/registrationController');
const raceEntryController = require('../controllers/raceEntryController');
const authenticate = require('../middlewares/authenticate');
const authorizeRoles = require('../middlewares/authorizeRoles');
const { ROLE_NAMES } = require('../constants/roles');
const asyncHandler = require('../utils/asyncHandler');
const { validateObjectIdParam, validateRequiredFields } = require('../validators/commonValidator');
const { validateAdminRaceEntry } = require('../validators/raceEntryValidator');

const router = express.Router();
const ownerOrAdmin = authorizeRoles(ROLE_NAMES.HORSE_OWNER, ROLE_NAMES.ADMIN);
const adminOnly = authorizeRoles(ROLE_NAMES.ADMIN);

router.use(authenticate);
router.get('/', ownerOrAdmin, asyncHandler(registrationController.listRegistrations));
router.post('/', adminOnly, validateRequiredFields(['race_id', 'horse_id', 'owner_id']), asyncHandler(registrationController.createRegistration));
router.get('/:id', ownerOrAdmin, validateObjectIdParam('id'), asyncHandler(registrationController.getRegistration));
router.post('/:id/withdraw', ownerOrAdmin, validateObjectIdParam('id'), asyncHandler(registrationController.withdrawRegistration));
router.patch('/:id/race-entry', adminOnly, validateObjectIdParam('id'), validateAdminRaceEntry, asyncHandler(raceEntryController.updateRaceEntry));

module.exports = router;
