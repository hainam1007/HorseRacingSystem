const express = require('express');

const horseOwnerController = require('../controllers/horseOwnerController');
const cancellationTicketController = require('../controllers/registrationCancellationTicketController');
const authenticate = require('../middlewares/authenticate');
const asyncHandler = require('../utils/asyncHandler');
const {
  validateCreateHorse,
  validateHorseIdParam,
  validateJockeyIdParam,
  validateRaceIdParam,
  validateRaceRegistration,
  validateRegistrationOrderIdParam,
  validateRegistrationIdParam,
  validateTournamentIdParam,
  validateUpdateHorse,
  validateUpdateHorseMedia,
  validateUpdateProfile
} = require('../validators/horseOwnerValidator');
const { validateObjectIdParam } = require('../validators/commonValidator');
const { validateOwnerEntryDetails } = require('../validators/raceEntryValidator');
const {
  validateCancellationTicketList,
  validateConfirmRefundReceipt,
  validateCreateCancellationTicket
} = require('../validators/registrationCancellationTicketValidator');

const router = express.Router();

router.use(authenticate);

router.get('/profile', asyncHandler(horseOwnerController.getProfile));
router.patch('/profile', validateUpdateProfile, asyncHandler(horseOwnerController.updateProfile));

router.get('/horses', asyncHandler(horseOwnerController.getHorses));
router.post('/horses', validateCreateHorse, asyncHandler(horseOwnerController.createHorse));
router.get('/horses/:horseId', validateHorseIdParam, asyncHandler(horseOwnerController.getHorseDetail));
router.patch('/horses/:horseId', validateHorseIdParam, validateUpdateHorse, asyncHandler(horseOwnerController.updateHorse));
router.delete('/horses/:horseId', validateHorseIdParam, asyncHandler(horseOwnerController.deactivateHorse));
router.patch(
  '/horses/:horseId/media',
  validateHorseIdParam,
  validateUpdateHorseMedia,
  asyncHandler(horseOwnerController.updateHorseMedia)
);
router.get(
  '/horses/:horseId/approval-status',
  validateHorseIdParam,
  asyncHandler(horseOwnerController.getHorseApprovalStatus)
);

router.get('/jockeys', asyncHandler(horseOwnerController.getAvailableJockeys));
router.get('/jockeys/:jockeyId', validateJockeyIdParam, asyncHandler(horseOwnerController.getJockeyDetail));

router.get('/tournaments', asyncHandler(horseOwnerController.getTournaments));
router.get(
  '/tournaments/:tournamentId/races',
  validateTournamentIdParam,
  asyncHandler(horseOwnerController.getRacesByTournamentId)
);
router.get(
  '/races/:raceId/eligible-horses',
  validateRaceIdParam,
  asyncHandler(horseOwnerController.getEligibleHorsesForRace)
);
router.get('/races/:raceId/rounds', validateRaceIdParam, asyncHandler(horseOwnerController.getRoundsByRaceId));

router.post('/race-registrations', validateRaceRegistration, asyncHandler(horseOwnerController.registerHorseForRace));
router.patch(
  '/race-registrations/:registrationId/entry-details',
  validateRegistrationIdParam,
  validateOwnerEntryDetails,
  asyncHandler(horseOwnerController.updateRaceEntryDetails)
);
router.get(
  '/registration-payments/:orderId',
  validateRegistrationOrderIdParam,
  asyncHandler(horseOwnerController.getRegistrationPayment)
);
router.post(
  '/registration-cancellation-tickets',
  validateCreateCancellationTicket,
  asyncHandler(cancellationTicketController.createTicket)
);
router.get(
  '/registration-cancellation-tickets',
  validateCancellationTicketList,
  asyncHandler(cancellationTicketController.listOwnerTickets)
);
router.get(
  '/registration-cancellation-tickets/:id',
  validateObjectIdParam('id'),
  asyncHandler(cancellationTicketController.getOwnerTicket)
);
router.post(
  '/registration-cancellation-tickets/:id/confirm-refund',
  validateObjectIdParam('id'),
  validateConfirmRefundReceipt,
  asyncHandler(cancellationTicketController.confirmRefundReceipt)
);

module.exports = router;
