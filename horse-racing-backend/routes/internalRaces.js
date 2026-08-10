const express = require('express');

const raceEngineController = require('../controllers/raceEngineController');
const internalAuthenticate = require('../middlewares/internalAuthenticate');
const asyncHandler = require('../utils/asyncHandler');
const { validateObjectIdParam } = require('../validators/commonValidator');

const router = express.Router();

router.use(internalAuthenticate);
router.post('/races/:id/lock', validateObjectIdParam('id'), asyncHandler(raceEngineController.lockRace));
router.post('/races/:id/generate-draft-results', validateObjectIdParam('id'), asyncHandler(raceEngineController.generateDraftResults));
router.get('/races/:id/participants', validateObjectIdParam('id'), asyncHandler(raceEngineController.getParticipants));

module.exports = router;
