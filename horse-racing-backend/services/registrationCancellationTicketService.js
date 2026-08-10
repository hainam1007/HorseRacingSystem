const mongoose = require('mongoose');

const ApiError = require('../utils/ApiError');
const {
  ASSIGNMENT_STATUS,
  CANCELLATION_TICKET_STATUS,
  ODDS_MARKET_STATUS,
  REFUND_STATUS,
  REGISTRATION_STATUS
} = require('../constants/statuses');
const {
  Bet,
  JockeyAssignment,
  Race,
  RaceOddsMarket,
  Registration,
  RegistrationCancellationTicket,
  Tournament
} = require('../models');
const profileRepository = require('../repositories/profileRepository');
const ticketRepository = require('../repositories/registrationCancellationTicketRepository');

const CLOSED_RACE_STATUSES = [
  'started',
  'starting',
  'running',
  'ongoing',
  'in_progress',
  'completed',
  'finished',
  'cancelled',
  'canceled',
  'deleted'
];
const CANCELLABLE_REGISTRATION_PAYMENT_STATUSES = ['paid', 'not_required'];

function sameId(first, second) {
  return first && second && first.toString() === second.toString();
}

function getRaceStartTime(race) {
  const time = race && race.race_date
    ? new Date(race.race_date).getTime()
    : Number.NaN;

  return Number.isNaN(time) ? null : time;
}

function assertCancellationWindowOpen(race) {
  const startTime = getRaceStartTime(race);

  if (!startTime) {
    throw new ApiError(409, 'Race start date is required before cancellation can be requested');
  }

  if (Date.now() >= startTime) {
    throw new ApiError(409, 'Cancellation requests must be completed before the race starts');
  }

  if (CLOSED_RACE_STATUSES.includes(String(race.status || '').toLowerCase())) {
    throw new ApiError(409, 'This race can no longer be cancelled');
  }
}

async function getOwnerOrThrow(userId) {
  const owner = await profileRepository.findHorseOwnerByUserId(userId);

  if (!owner) {
    throw new ApiError(404, 'Horse owner profile not found');
  }

  return owner;
}

async function createTicket(userId, payload) {
  const owner = await getOwnerOrThrow(userId);
  const registration = await Registration.findById(payload.registration_id).lean();

  if (!registration) {
    throw new ApiError(404, 'Race registration not found');
  }

  if (!sameId(registration.owner_id, owner._id)) {
    throw new ApiError(403, 'Race registration does not belong to current horse owner');
  }

  if (registration.status !== REGISTRATION_STATUS.APPROVED) {
    throw new ApiError(409, 'Only confirmed race registrations can be cancelled');
  }

  if (!CANCELLABLE_REGISTRATION_PAYMENT_STATUSES.includes(registration.payment_status)) {
    throw new ApiError(409, 'Registration payment must be completed before cancellation is requested');
  }

  const [tournament, race] = await Promise.all([
    Tournament.findById(registration.tournament_id).lean(),
    Race.findById(registration.race_id).lean()
  ]);

  if (!tournament || !race) {
    throw new ApiError(404, 'Tournament or race not found');
  }

  assertCancellationWindowOpen(race);

  try {
    const ticket = await ticketRepository.create({
      registration_id: registration._id,
      tournament_id: registration.tournament_id,
      race_id: registration.race_id,
      owner_id: owner._id,
      horse_id: registration.horse_id,
      reason: payload.reason,
      status: CANCELLATION_TICKET_STATUS.PENDING,
      refund_status: registration.payment_status === 'paid'
        ? REFUND_STATUS.AWAITING_APPROVAL
        : REFUND_STATUS.NOT_REQUIRED,
      refund_amount_vnd: registration.payment_status === 'paid'
        ? Number(registration.entry_fee_vnd || 0)
        : 0,
      requested_at: new Date()
    });

    return {
      cancellation_ticket: await ticketRepository.findById(ticket._id)
    };
  } catch (error) {
    if (error && error.code === 11000) {
      throw new ApiError(409, 'A pending cancellation ticket already exists for this registration');
    }

    throw error;
  }
}

async function listOwnerTickets(userId, query) {
  const owner = await getOwnerOrThrow(userId);

  return {
    cancellation_tickets: await ticketRepository.find(
      Object.assign({ owner_id: owner._id }, query || {})
    )
  };
}

async function getOwnerTicket(userId, ticketId) {
  const owner = await getOwnerOrThrow(userId);
  const ticket = await ticketRepository.findById(ticketId);

  if (!ticket) {
    throw new ApiError(404, 'Cancellation ticket not found');
  }

  if (!sameId(ticket.owner_id && (ticket.owner_id._id || ticket.owner_id), owner._id)) {
    throw new ApiError(403, 'Cancellation ticket does not belong to current horse owner');
  }

  return { cancellation_ticket: ticket };
}

async function listAdminTickets(query) {
  return {
    cancellation_tickets: await ticketRepository.find(query || {})
  };
}

async function getAdminTicket(ticketId) {
  const ticket = await ticketRepository.findById(ticketId);

  if (!ticket) {
    throw new ApiError(404, 'Cancellation ticket not found');
  }

  return { cancellation_ticket: ticket };
}

async function approveTicket(adminUserId, ticketId, payload) {
  const session = await mongoose.startSession();

  try {
    await session.withTransaction(async function() {
      const ticket = await RegistrationCancellationTicket.findOne({
        _id: ticketId,
        status: CANCELLATION_TICKET_STATUS.PENDING
      }).session(session);

      if (!ticket) {
        throw new ApiError(409, 'Only pending cancellation tickets can be approved');
      }

      const registration = await Registration.findById(ticket.registration_id).session(session);
      const tournament = await Tournament.findById(ticket.tournament_id).session(session);
      const race = await Race.findById(ticket.race_id).session(session);

      if (!registration || !tournament || !race) {
        throw new ApiError(404, 'Cancellation ticket registration data is incomplete');
      }

      assertCancellationWindowOpen(race);

      if (registration.status !== REGISTRATION_STATUS.APPROVED) {
        throw new ApiError(409, 'Race registration is no longer confirmed');
      }

      if (
        [
          ODDS_MARKET_STATUS.OPEN,
          ODDS_MARKET_STATUS.CLOSED,
          ODDS_MARKET_STATUS.SETTLED
        ].includes(race.betting_status)
      ) {
        throw new ApiError(409, 'Cancellation cannot be approved after race betting opens');
      }

      const raceBetCount = await Bet.countDocuments({ race_id: race._id }).session(session);

      if (raceBetCount > 0) {
        throw new ApiError(409, 'Cancellation cannot be approved after bets are placed');
      }

      const paidRegistration = registration.payment_status === 'paid';
      const hadReservedSlot = registration.slot_reserved === true;
      const now = new Date();

      registration.status = REGISTRATION_STATUS.CANCELLED;
      registration.slot_reserved = false;
      registration.slot_released_at = now;

      if (paidRegistration) {
        registration.payment_status = 'refund_pending';
      }

      await registration.save({ session: session });

      if (hadReservedSlot && Number(race.registration_slot_count || 0) > 0) {
        race.registration_slot_count = Math.max(0, Number(race.registration_slot_count || 0) - 1);
      }

      race.model_input_version = Number(race.model_input_version || 0) + 1;

      if (race.betting_status === ODDS_MARKET_STATUS.GENERATED) {
        race.betting_status = ODDS_MARKET_STATUS.STALE;
      }

      if (
        race.betting_market &&
        race.betting_market.status === ODDS_MARKET_STATUS.GENERATED
      ) {
        race.betting_market.status = ODDS_MARKET_STATUS.STALE;
      }

      await race.save({ session: session });

      await JockeyAssignment.updateMany(
        {
          race_id: race._id,
          horse_id: registration.horse_id,
          status: {
            $nin: [
              ASSIGNMENT_STATUS.CANCELLED,
              ASSIGNMENT_STATUS.REJECTED,
              ASSIGNMENT_STATUS.REPLACED
            ]
          }
        },
        {
          $set: {
            status: ASSIGNMENT_STATUS.CANCELLED,
            response_message: 'Race registration cancellation approved by admin',
            responded_at: now
          }
        },
        { session: session, runValidators: true }
      );

      await RaceOddsMarket.updateOne(
        {
          race_id: race._id,
          status: ODDS_MARKET_STATUS.GENERATED
        },
        {
          $set: { status: ODDS_MARKET_STATUS.STALE }
        },
        { session: session, runValidators: true }
      );

      ticket.status = CANCELLATION_TICKET_STATUS.APPROVED;
      ticket.reviewed_by = adminUserId;
      ticket.reviewed_at = now;
      ticket.admin_note = payload.admin_note;
      ticket.refund_status = paidRegistration
        ? REFUND_STATUS.PENDING
        : REFUND_STATUS.NOT_REQUIRED;
      ticket.refund_amount_vnd = paidRegistration
        ? Number(registration.entry_fee_vnd || 0)
        : 0;
      await ticket.save({ session: session });
    });
  } finally {
    await session.endSession();
  }

  return getAdminTicket(ticketId);
}

async function rejectTicket(adminUserId, ticketId, payload) {
  const ticket = await RegistrationCancellationTicket.findOneAndUpdate(
    {
      _id: ticketId,
      status: CANCELLATION_TICKET_STATUS.PENDING
    },
    {
      $set: {
        status: CANCELLATION_TICKET_STATUS.REJECTED,
        reviewed_by: adminUserId,
        reviewed_at: new Date(),
        admin_note: payload.admin_note,
        refund_status: REFUND_STATUS.NOT_REQUIRED
      }
    },
    {
      returnDocument: 'after',
      runValidators: true
    }
  );

  if (!ticket) {
    throw new ApiError(409, 'Only pending cancellation tickets can be rejected');
  }

  return getAdminTicket(ticketId);
}

async function markRefundSent(adminUserId, ticketId, payload) {
  const session = await mongoose.startSession();

  try {
    await session.withTransaction(async function() {
      const ticket = await RegistrationCancellationTicket.findOne({
        _id: ticketId,
        status: CANCELLATION_TICKET_STATUS.APPROVED,
        refund_status: REFUND_STATUS.PENDING
      }).session(session);

      if (!ticket) {
        throw new ApiError(409, 'Only approved tickets with a pending refund can be marked as sent');
      }

      const registration = await Registration.findById(ticket.registration_id).session(session);

      if (!registration || registration.payment_status !== 'refund_pending') {
        throw new ApiError(409, 'Registration refund is not pending');
      }

      const now = new Date();
      registration.payment_status = 'refund_sent';
      await registration.save({ session: session });

      ticket.refund_status = REFUND_STATUS.AWAITING_OWNER_CONFIRMATION;
      ticket.refund_reference = payload.refund_reference;
      ticket.refund_sent_by = adminUserId;
      ticket.refund_sent_at = now;

      if (payload.admin_note) {
        ticket.admin_note = payload.admin_note;
      }

      await ticket.save({ session: session });
    });
  } finally {
    await session.endSession();
  }

  return getAdminTicket(ticketId);
}

async function confirmRefundReceipt(userId, ticketId, payload) {
  const owner = await getOwnerOrThrow(userId);
  const session = await mongoose.startSession();

  try {
    await session.withTransaction(async function() {
      const ticket = await RegistrationCancellationTicket.findOne({
        _id: ticketId,
        owner_id: owner._id,
        status: CANCELLATION_TICKET_STATUS.APPROVED,
        refund_status: REFUND_STATUS.AWAITING_OWNER_CONFIRMATION
      }).session(session);

      if (!ticket) {
        throw new ApiError(
          409,
          'Only a refund awaiting owner confirmation can be confirmed'
        );
      }

      const registration = await Registration.findById(ticket.registration_id).session(session);

      if (!registration || registration.payment_status !== 'refund_sent') {
        throw new ApiError(409, 'Registration refund has not been marked as sent');
      }

      const now = new Date();
      registration.payment_status = 'refunded';
      registration.payment_refunded_at = now;
      await registration.save({ session: session });

      ticket.refund_status = REFUND_STATUS.COMPLETED;
      ticket.owner_confirmed_at = now;
      ticket.owner_confirmation_note = payload.confirmation_note;
      await ticket.save({ session: session });
    });
  } finally {
    await session.endSession();
  }

  return getOwnerTicket(userId, ticketId);
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
