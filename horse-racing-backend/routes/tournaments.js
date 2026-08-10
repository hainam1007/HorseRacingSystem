const express = require('express');

const tournamentController = require('../controllers/tournamentController');
const authenticate = require('../middlewares/authenticate');
const authorizeRoles = require('../middlewares/authorizeRoles');
const { ROLE_NAMES } = require('../constants/roles');
const asyncHandler = require('../utils/asyncHandler');
const { validateObjectIdParam, validateRequiredFields } = require('../validators/commonValidator');

const router = express.Router();
const adminOnly = authorizeRoles(ROLE_NAMES.ADMIN);

router.use(authenticate);
router.get('/', asyncHandler(tournamentController.listTournaments));
router.post('/', adminOnly, validateRequiredFields(['name']), asyncHandler(tournamentController.createTournament));
router.get('/:id', validateObjectIdParam('id'), asyncHandler(tournamentController.getTournament));
router.patch('/:id', adminOnly, validateObjectIdParam('id'), asyncHandler(tournamentController.updateTournament));
router.delete('/:id', adminOnly, validateObjectIdParam('id'), asyncHandler(tournamentController.deleteTournament));

module.exports = router;
