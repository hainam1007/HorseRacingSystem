const express = require('express');

const betController = require('../controllers/betController');
const authenticate = require('../middlewares/authenticate');
const authorizeRoles = require('../middlewares/authorizeRoles');
const { ROLE_NAMES } = require('../constants/roles');
const asyncHandler = require('../utils/asyncHandler');
const { validateObjectIdParam } = require('../validators/commonValidator');
const { validatePlaceBet } = require('../validators/betValidator');

const router = express.Router();
const spectatorOnly = authorizeRoles(ROLE_NAMES.SPECTATOR);
const adminOnly = authorizeRoles(ROLE_NAMES.ADMIN);

router.use(authenticate);
router.post('/', spectatorOnly, validatePlaceBet, asyncHandler(betController.placeBet));
router.get('/me', spectatorOnly, asyncHandler(betController.listMyBets));
router.post(
  '/races/:raceId/settle',
  adminOnly,
  validateObjectIdParam('raceId'),
  asyncHandler(betController.settleRaceBets)
);

module.exports = router;
