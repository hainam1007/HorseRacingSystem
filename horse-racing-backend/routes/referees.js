const express = require('express');

const refereeController = require('../controllers/refereeController');
const authenticate = require('../middlewares/authenticate');
const authorizeRoles = require('../middlewares/authorizeRoles');
const { ROLE_NAMES } = require('../constants/roles');
const asyncHandler = require('../utils/asyncHandler');
const { validateObjectIdParam } = require('../validators/commonValidator');

const router = express.Router();

router.use(authenticate);
router.use(authorizeRoles(ROLE_NAMES.RACE_REFEREE));

router.get('/me/workspace', asyncHandler(refereeController.getWorkspace));
router.get(
  '/races/:raceId/live-state',
  validateObjectIdParam('raceId'),
  asyncHandler(refereeController.getRaceLiveState)
);

module.exports = router;
