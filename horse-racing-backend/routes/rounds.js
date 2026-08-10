const express = require('express');

const roundController = require('../controllers/roundController');
const authenticate = require('../middlewares/authenticate');
const authorizeRoles = require('../middlewares/authorizeRoles');
const { ROLE_NAMES } = require('../constants/roles');
const asyncHandler = require('../utils/asyncHandler');
const { validateObjectIdParam, validateRequiredFields } = require('../validators/commonValidator');

const router = express.Router();
const adminOnly = authorizeRoles(ROLE_NAMES.ADMIN);

router.use(authenticate);
router.get('/', asyncHandler(roundController.listRounds));
router.post('/', adminOnly, validateRequiredFields(['tournament_id', 'name', 'round_order']), asyncHandler(roundController.createRound));
router.get('/:id', validateObjectIdParam('id'), asyncHandler(roundController.getRound));
router.patch('/:id', adminOnly, validateObjectIdParam('id'), asyncHandler(roundController.updateRound));
router.delete('/:id', adminOnly, validateObjectIdParam('id'), asyncHandler(roundController.deleteRound));

module.exports = router;
