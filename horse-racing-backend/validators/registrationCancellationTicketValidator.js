const ApiError = require('../utils/ApiError');
const { isObjectId } = require('./commonValidator');
const {
  CANCELLATION_TICKET_STATUS,
  REFUND_STATUS
} = require('../constants/statuses');

function cleanString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function validateCreateCancellationTicket(req, res, next) {
  const body = req.body || {};
  const errors = [];
  const registrationId = cleanString(body.registration_id);
  const reason = cleanString(body.reason);

  if (!isObjectId(registrationId)) {
    errors.push({ field: 'registration_id', message: 'registration_id must be a valid id' });
  }

  if (!reason || reason.length > 1000) {
    errors.push({ field: 'reason', message: 'reason is required and must not exceed 1000 characters' });
  }

  if (errors.length) {
    return next(new ApiError(400, 'Validation failed', errors));
  }

  req.validatedBody = {
    registration_id: registrationId,
    reason: reason
  };
  return next();
}

function validateCancellationTicketList(req, res, next) {
  const query = {};

  if (req.query.status) {
    const status = cleanString(req.query.status);

    if (!Object.values(CANCELLATION_TICKET_STATUS).includes(status)) {
      return next(new ApiError(400, 'Validation failed', [
        { field: 'status', message: 'status is invalid' }
      ]));
    }

    query.status = status;
  }

  if (req.query.refund_status) {
    const refundStatus = cleanString(req.query.refund_status);

    if (!Object.values(REFUND_STATUS).includes(refundStatus)) {
      return next(new ApiError(400, 'Validation failed', [
        { field: 'refund_status', message: 'refund_status is invalid' }
      ]));
    }

    query.refund_status = refundStatus;
  }

  req.validatedQuery = query;
  return next();
}

function validateReviewCancellationTicket(req, res, next) {
  const adminNote = cleanString((req.body || {}).admin_note);

  if (adminNote.length > 1000) {
    return next(new ApiError(400, 'Validation failed', [
      { field: 'admin_note', message: 'admin_note must not exceed 1000 characters' }
    ]));
  }

  req.validatedBody = { admin_note: adminNote || undefined };
  return next();
}

function validateMarkRefundSent(req, res, next) {
  const body = req.body || {};
  const refundReference = cleanString(body.refund_reference);
  const adminNote = cleanString(body.admin_note);
  const errors = [];

  if (!refundReference || refundReference.length > 255) {
    errors.push({
      field: 'refund_reference',
      message: 'refund_reference is required and must not exceed 255 characters'
    });
  }

  if (adminNote.length > 1000) {
    errors.push({ field: 'admin_note', message: 'admin_note must not exceed 1000 characters' });
  }

  if (errors.length) {
    return next(new ApiError(400, 'Validation failed', errors));
  }

  req.validatedBody = {
    refund_reference: refundReference,
    admin_note: adminNote || undefined
  };
  return next();
}

function validateConfirmRefundReceipt(req, res, next) {
  const note = cleanString((req.body || {}).confirmation_note);

  if (note.length > 1000) {
    return next(new ApiError(400, 'Validation failed', [
      { field: 'confirmation_note', message: 'confirmation_note must not exceed 1000 characters' }
    ]));
  }

  req.validatedBody = { confirmation_note: note || undefined };
  return next();
}

module.exports = {
  validateCancellationTicketList,
  validateConfirmRefundReceipt,
  validateCreateCancellationTicket,
  validateMarkRefundSent,
  validateReviewCancellationTicket
};
