const ticketService = require('../services/registrationCancellationTicketService');
const { sendSuccess } = require('../utils/apiResponse');

async function createTicket(req, res) {
  const data = await ticketService.createTicket(req.user._id, req.validatedBody);
  return sendSuccess(res, 201, 'Cancellation request submitted successfully', data);
}

async function listOwnerTickets(req, res) {
  const data = await ticketService.listOwnerTickets(req.user._id, req.validatedQuery);
  return sendSuccess(res, 200, 'Cancellation requests retrieved successfully', data);
}

async function getOwnerTicket(req, res) {
  const data = await ticketService.getOwnerTicket(req.user._id, req.params.id);
  return sendSuccess(res, 200, 'Cancellation request retrieved successfully', data);
}

async function confirmRefundReceipt(req, res) {
  const data = await ticketService.confirmRefundReceipt(
    req.user._id,
    req.params.id,
    req.validatedBody
  );
  return sendSuccess(res, 200, 'Refund receipt confirmed successfully', data);
}

async function listAdminTickets(req, res) {
  const data = await ticketService.listAdminTickets(req.validatedQuery);
  return sendSuccess(res, 200, 'Cancellation requests retrieved successfully', data);
}

async function getAdminTicket(req, res) {
  const data = await ticketService.getAdminTicket(req.params.id);
  return sendSuccess(res, 200, 'Cancellation request retrieved successfully', data);
}

async function approveTicket(req, res) {
  const data = await ticketService.approveTicket(req.user._id, req.params.id, req.validatedBody);
  return sendSuccess(res, 200, 'Cancellation request approved successfully', data);
}

async function rejectTicket(req, res) {
  const data = await ticketService.rejectTicket(req.user._id, req.params.id, req.validatedBody);
  return sendSuccess(res, 200, 'Cancellation request rejected successfully', data);
}

async function markRefundSent(req, res) {
  const data = await ticketService.markRefundSent(req.user._id, req.params.id, req.validatedBody);
  return sendSuccess(res, 200, 'Refund marked as sent successfully', data);
}

module.exports = {
  approveTicket,
  confirmRefundReceipt,
  createTicket,
  getAdminTicket,
  getOwnerTicket,
  listAdminTickets,
  listOwnerTickets,
  markRefundSent,
  rejectTicket
};
