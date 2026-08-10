const express = require('express');

const adminHorseController = require('../controllers/adminHorseController');
const authenticate = require('../middlewares/authenticate');
const authorizeRoles = require('../middlewares/authorizeRoles');
const { ROLE_NAMES } = require('../constants/roles');
const asyncHandler = require('../utils/asyncHandler');
const { validateObjectIdParam } = require('../validators/commonValidator');
const { validateUpdateHorseRating } = require('../validators/adminHorseValidator');

const router = express.Router();

router.use(authenticate);
router.use(authorizeRoles(ROLE_NAMES.ADMIN));
router.patch('/horses/:id/rating', validateObjectIdParam('id'), validateUpdateHorseRating, asyncHandler(adminHorseController.updateRating));
router.get('/horses/:id/rating-history', validateObjectIdParam('id'), asyncHandler(adminHorseController.getRatingHistory));

module.exports = router;
