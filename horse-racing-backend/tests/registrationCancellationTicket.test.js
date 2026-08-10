const assert = require('node:assert/strict');
const test = require('node:test');
const mongoose = require('mongoose');

const {
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
const service = require('../services/registrationCancellationTicketService');

const originals = {
  startSession: mongoose.startSession,
  findHorseOwnerByUserId: profileRepository.findHorseOwnerByUserId,
  createTicket: ticketRepository.create,
  findTicketById: ticketRepository.findById,
  registrationFindById: Registration.findById,
  ticketFindOne: RegistrationCancellationTicket.findOne,
  ticketFindOneAndUpdate: RegistrationCancellationTicket.findOneAndUpdate,
  tournamentFindById: Tournament.findById,
  raceFindById: Race.findById,
  assignmentUpdateMany: JockeyAssignment.updateMany,
  oddsUpdateOne: RaceOddsMarket.updateOne,
  betCountDocuments: Bet.countDocuments
};

function sessionQuery(value) {
  return {
    session() {
      return Promise.resolve(value);
    }
  };
}

function fakeSession() {
  return {
    async withTransaction(callback) {
      await callback();
    },
    async endSession() {}
  };
}

test.afterEach(() => {
  mongoose.startSession = originals.startSession;
  profileRepository.findHorseOwnerByUserId = originals.findHorseOwnerByUserId;
  ticketRepository.create = originals.createTicket;
  ticketRepository.findById = originals.findTicketById;
  Registration.findById = originals.registrationFindById;
  RegistrationCancellationTicket.findOne = originals.ticketFindOne;
  RegistrationCancellationTicket.findOneAndUpdate = originals.ticketFindOneAndUpdate;
  Tournament.findById = originals.tournamentFindById;
  Race.findById = originals.raceFindById;
  JockeyAssignment.updateMany = originals.assignmentUpdateMany;
  RaceOddsMarket.updateOne = originals.oddsUpdateOne;
  Bet.countDocuments = originals.betCountDocuments;
});

test('owner creates a pending cancellation ticket before race start even after tournament start', async () => {
  const ids = {
    user: new mongoose.Types.ObjectId(),
    owner: new mongoose.Types.ObjectId(),
    registration: new mongoose.Types.ObjectId(),
    tournament: new mongoose.Types.ObjectId(),
    race: new mongoose.Types.ObjectId(),
    horse: new mongoose.Types.ObjectId(),
    ticket: new mongoose.Types.ObjectId()
  };
  let createdPayload;

  profileRepository.findHorseOwnerByUserId = async () => ({ _id: ids.owner });
  Registration.findById = () => ({
    lean: async () => ({
      _id: ids.registration,
      owner_id: ids.owner,
      tournament_id: ids.tournament,
      race_id: ids.race,
      horse_id: ids.horse,
      status: REGISTRATION_STATUS.APPROVED,
      payment_status: 'paid',
      entry_fee_vnd: 750000
    })
  });
  Tournament.findById = () => ({ lean: async () => ({ _id: ids.tournament, start_date: new Date(Date.now() - 86400000) }) });
  Race.findById = () => ({
    lean: async () => ({
      _id: ids.race,
      status: 'scheduled',
      race_date: new Date(Date.now() + 86400000)
    })
  });
  ticketRepository.create = async (payload) => {
    createdPayload = payload;
    return { _id: ids.ticket };
  };
  ticketRepository.findById = async () => ({ _id: ids.ticket, ...createdPayload });

  const result = await service.createTicket(ids.user, {
    registration_id: ids.registration,
    reason: 'The horse requires an extended veterinary recovery period.'
  });

  assert.equal(createdPayload.status, CANCELLATION_TICKET_STATUS.PENDING);
  assert.equal(createdPayload.refund_status, REFUND_STATUS.AWAITING_APPROVAL);
  assert.equal(createdPayload.refund_amount_vnd, 750000);
  assert.equal(result.cancellation_ticket._id, ids.ticket);
});

test('owner cannot create a cancellation ticket after race start', async () => {
  const ids = {
    user: new mongoose.Types.ObjectId(),
    owner: new mongoose.Types.ObjectId(),
    registration: new mongoose.Types.ObjectId(),
    tournament: new mongoose.Types.ObjectId(),
    race: new mongoose.Types.ObjectId(),
    horse: new mongoose.Types.ObjectId()
  };

  profileRepository.findHorseOwnerByUserId = async () => ({ _id: ids.owner });
  Registration.findById = () => ({
    lean: async () => ({
      _id: ids.registration,
      owner_id: ids.owner,
      tournament_id: ids.tournament,
      race_id: ids.race,
      horse_id: ids.horse,
      status: REGISTRATION_STATUS.APPROVED,
      payment_status: 'paid',
      entry_fee_vnd: 750000
    })
  });
  Tournament.findById = () => ({ lean: async () => ({ _id: ids.tournament }) });
  Race.findById = () => ({
    lean: async () => ({
      _id: ids.race,
      status: 'scheduled',
      race_date: new Date(Date.now() - 1000)
    })
  });

  await assert.rejects(
    service.createTicket(ids.user, {
      registration_id: ids.registration,
      reason: 'The horse is not fit to race.'
    }),
    /before the race starts/
  );
});

test('admin approval cancels the entry, releases one slot, and makes generated odds stale', async () => {
  const now = Date.now();
  const ticket = {
    _id: new mongoose.Types.ObjectId(),
    registration_id: new mongoose.Types.ObjectId(),
    tournament_id: new mongoose.Types.ObjectId(),
    race_id: new mongoose.Types.ObjectId(),
    horse_id: new mongoose.Types.ObjectId(),
    status: CANCELLATION_TICKET_STATUS.PENDING,
    async save() {}
  };
  const registration = {
    _id: ticket.registration_id,
    horse_id: ticket.horse_id,
    status: REGISTRATION_STATUS.APPROVED,
    payment_status: 'paid',
    entry_fee_vnd: 750000,
    slot_reserved: true,
    async save() {}
  };
  const race = {
    _id: ticket.race_id,
    status: 'scheduled',
    race_date: new Date(now + 86400000),
    registration_slot_count: 5,
    model_input_version: 2,
    betting_status: ODDS_MARKET_STATUS.GENERATED,
    betting_market: { status: ODDS_MARKET_STATUS.GENERATED },
    async save() {}
  };

  mongoose.startSession = async () => fakeSession();
  RegistrationCancellationTicket.findOne = () => sessionQuery(ticket);
  Registration.findById = () => sessionQuery(registration);
  Tournament.findById = () => sessionQuery({ _id: ticket.tournament_id, start_date: new Date(now - 86400000) });
  Race.findById = () => sessionQuery(race);
  Bet.countDocuments = () => sessionQuery(0);
  JockeyAssignment.updateMany = async () => ({ modifiedCount: 1 });
  RaceOddsMarket.updateOne = async () => ({ modifiedCount: 1 });
  ticketRepository.findById = async () => ticket;

  await service.approveTicket(new mongoose.Types.ObjectId(), ticket._id, { admin_note: 'Approved for refund.' });

  assert.equal(registration.status, REGISTRATION_STATUS.CANCELLED);
  assert.equal(registration.payment_status, 'refund_pending');
  assert.equal(registration.slot_reserved, false);
  assert.equal(race.registration_slot_count, 4);
  assert.equal(race.model_input_version, 3);
  assert.equal(race.betting_status, ODDS_MARKET_STATUS.STALE);
  assert.equal(race.betting_market.status, ODDS_MARKET_STATUS.STALE);
  assert.equal(ticket.status, CANCELLATION_TICKET_STATUS.APPROVED);
  assert.equal(ticket.refund_status, REFUND_STATUS.PENDING);
});

test('refund is completed only after the owner confirms receipt', async () => {
  const ownerId = new mongoose.Types.ObjectId();
  const userId = new mongoose.Types.ObjectId();
  const ticketId = new mongoose.Types.ObjectId();
  const registrationId = new mongoose.Types.ObjectId();
  const ticket = {
    _id: ticketId,
    owner_id: ownerId,
    registration_id: registrationId,
    status: CANCELLATION_TICKET_STATUS.APPROVED,
    refund_status: REFUND_STATUS.AWAITING_OWNER_CONFIRMATION,
    async save() {}
  };
  const registration = {
    _id: registrationId,
    payment_status: 'refund_sent',
    async save() {}
  };

  profileRepository.findHorseOwnerByUserId = async () => ({ _id: ownerId });
  mongoose.startSession = async () => fakeSession();
  RegistrationCancellationTicket.findOne = () => sessionQuery(ticket);
  Registration.findById = () => sessionQuery(registration);
  ticketRepository.findById = async () => ticket;

  await service.confirmRefundReceipt(userId, ticketId, {
    confirmation_note: 'Funds received in full.'
  });

  assert.equal(registration.payment_status, 'refunded');
  assert.ok(registration.payment_refunded_at instanceof Date);
  assert.equal(ticket.refund_status, REFUND_STATUS.COMPLETED);
  assert.ok(ticket.owner_confirmed_at instanceof Date);
});

test('admin recording a refund waits for owner confirmation', async () => {
  const adminId = new mongoose.Types.ObjectId();
  const ticketId = new mongoose.Types.ObjectId();
  const registrationId = new mongoose.Types.ObjectId();
  const ticket = {
    _id: ticketId,
    registration_id: registrationId,
    status: CANCELLATION_TICKET_STATUS.APPROVED,
    refund_status: REFUND_STATUS.PENDING,
    async save() {}
  };
  const registration = {
    _id: registrationId,
    payment_status: 'refund_pending',
    async save() {}
  };

  mongoose.startSession = async () => fakeSession();
  RegistrationCancellationTicket.findOne = () => sessionQuery(ticket);
  Registration.findById = () => sessionQuery(registration);
  ticketRepository.findById = async () => ticket;

  await service.markRefundSent(adminId, ticketId, {
    refund_reference: 'VNPAY-REFUND-001',
    admin_note: 'Sent to the original payment account.'
  });

  assert.equal(registration.payment_status, 'refund_sent');
  assert.equal(ticket.refund_status, REFUND_STATUS.AWAITING_OWNER_CONFIRMATION);
  assert.equal(ticket.refund_reference, 'VNPAY-REFUND-001');
  assert.equal(ticket.refund_sent_by, adminId);
  assert.ok(ticket.refund_sent_at instanceof Date);
});
