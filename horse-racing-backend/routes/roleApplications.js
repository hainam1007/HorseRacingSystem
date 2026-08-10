const express = require('express');

const roleApplicationController = require('../controllers/roleApplicationController');
const authenticate = require('../middlewares/authenticate');
const { ROLE_NAMES } = require('../constants/roles');
const asyncHandler = require('../utils/asyncHandler');
const {
  validateCreateApplication,
  validateListApplications
} = require('../validators/roleApplicationValidator');

const router = express.Router();

router.use(authenticate);

router.get('/me', validateListApplications, asyncHandler(roleApplicationController.listMyApplications));
router.post(
  '/horse-owner',
  validateCreateApplication(ROLE_NAMES.HORSE_OWNER),
  asyncHandler(roleApplicationController.createApplication)
);
router.post(
  '/jockey',
  validateCreateApplication(ROLE_NAMES.JOCKEY),
  asyncHandler(roleApplicationController.createApplication)
);
router.post(
  '/race-referee',
  validateCreateApplication(ROLE_NAMES.RACE_REFEREE),
  asyncHandler(roleApplicationController.createApplication)
);

module.exports = router;
