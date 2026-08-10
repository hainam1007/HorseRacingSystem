const express = require('express');

const refereeController = require('../controllers/refereeController');
const authenticate = require('../middlewares/authenticate');
const authorizeRoles = require('../middlewares/authorizeRoles');
const { ROLE_NAMES } = require('../constants/roles');
const asyncHandler = require('../utils/asyncHandler');

const router = express.Router();

router.use(authenticate);
router.use(authorizeRoles(ROLE_NAMES.RACE_REFEREE));

router.get('/me/workspace', asyncHandler(refereeController.getWorkspace));

module.exports = router;
