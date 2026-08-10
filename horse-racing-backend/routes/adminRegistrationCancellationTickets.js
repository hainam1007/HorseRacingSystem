const express = require('express');

const controller = require('../controllers/registrationCancellationTicketController');
const authenticate = require('../middlewares/authenticate');
const authorizeRoles = require('../middlewares/authorizeRoles');
const { ROLE_NAMES } = require('../constants/roles');
const asyncHandler = require('../utils/asyncHandler');
const { validateObjectIdParam } = require('../validators/commonValidator');
const {
  validateCancellationTicketList,
  validateMarkRefundSent,
  validateReviewCancellationTicket
} = require('../validators/registrationCancellationTicketValidator');

const router = express.Router();

router.use(authenticate);
router.use(authorizeRoles(ROLE_NAMES.ADMIN));

router.get(
  '/registration-cancellation-tickets',
  validateCancellationTicketList,
  asyncHandler(controller.listAdminTickets)
);
router.get(
  '/registration-cancellation-tickets/:id',
  validateObjectIdParam('id'),
  asyncHandler(controller.getAdminTicket)
);
router.post(
  '/registration-cancellation-tickets/:id/approve',
  validateObjectIdParam('id'),
  validateReviewCancellationTicket,
  asyncHandler(controller.approveTicket)
);
router.post(
  '/registration-cancellation-tickets/:id/reject',
  validateObjectIdParam('id'),
  validateReviewCancellationTicket,
  asyncHandler(controller.rejectTicket)
);
router.post(
  '/registration-cancellation-tickets/:id/mark-refunded',
  validateObjectIdParam('id'),
  validateMarkRefundSent,
  asyncHandler(controller.markRefundSent)
);

module.exports = router;
