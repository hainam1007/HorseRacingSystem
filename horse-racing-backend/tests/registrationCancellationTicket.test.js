const assert = require('node:assert/strict');
const test = require('node:test');
const { newObjectId } = require('../utils/objectId');
const {
  CANCELLATION_TICKET_STATUS,
  ODDS_MARKET_STATUS,
  REFUND_STATUS,
  REGISTRATION_STATUS
} = require('../constants/statuses');
const profileRepository = require('../repositories/profileRepository');
const ticketRepository = require('../repositories/registrationCancellationTicketRepository');
const service = require('../services/registrationCancellationTicketService');
const { Registration, Tournament, Race, RegistrationCancellationTicket } = require('../models');

const originals = {
  findHorseOwnerByUserId: profileRepository.findHorseOwnerByUserId,
  createTicket: ticketRepository.create,
  findTicketById: ticketRepository.findById,
  findTicket: ticketRepository.find,
  updateById: ticketRepository.updateById,
  registrationFindById: require('../repositories/registrationRepository').findById,
  registrationFindByPk: Registration.findByPk,
  tournamentFindByPk: Tournament.findByPk,
  raceFindByPk: Race.findByPk,
  ticketFindOne: RegistrationCancellationTicket.findOne
};

test.afterEach(() => {
  profileRepository.findHorseOwnerByUserId = originals.findHorseOwnerByUserId;
  ticketRepository.create = originals.createTicket;
  ticketRepository.findById = originals.findTicketById;
  ticketRepository.find = originals.findTicket;
  ticketRepository.updateById = originals.updateById;
  require('../repositories/registrationRepository').findById = originals.registrationFindById;
  Registration.findByPk = originals.registrationFindByPk;
  Tournament.findByPk = originals.tournamentFindByPk;
  Race.findByPk = originals.raceFindByPk;
  RegistrationCancellationTicket.findOne = originals.ticketFindOne;
});

test('owner creates a pending cancellation ticket before race start even after tournament start', async () => {
  const ids = {
    user: newObjectId(),
    owner: newObjectId(),
    registration: newObjectId(),
    tournament: newObjectId(),
    race: newObjectId(),
    horse: newObjectId(),
    ticket: newObjectId()
  };
  let createdPayload;

  profileRepository.findHorseOwnerByUserId = async () => ({ _id: ids.owner });
  Registration.findByPk = async () => ({
    _id: ids.registration,
    owner_id: ids.owner,
    tournament_id: ids.tournament,
    race_id: ids.race,
    horse_id: ids.horse,
    status: REGISTRATION_STATUS.APPROVED,
    payment_status: 'paid',
    entry_fee_vnd: 750000
  });
  Tournament.findByPk = async () => ({ _id: ids.tournament, start_date: new Date(Date.now() - 86400000) });
  Race.findByPk = async () => ({
    _id: ids.race,
    status: 'scheduled',
    race_date: new Date(Date.now() + 86400000)
  });
  const registrationRepository = require('../repositories/registrationRepository');
  registrationRepository.findById = async () => ({
    _id: ids.registration,
    owner_id: ids.owner,
    tournament_id: ids.tournament,
    race_id: ids.race,
    horse_id: ids.horse,
    status: REGISTRATION_STATUS.APPROVED,
    payment_status: 'paid',
    entry_fee_vnd: 750000
  });
  ticketRepository.create = async (payload) => {
    createdPayload = payload;
    return { _id: ids.ticket };
  };
  ticketRepository.findById = async () => ({ _id: ids.ticket, ...createdPayload });
  RegistrationCancellationTicket.findOne = async () => ({ _id: ids.ticket, ...createdPayload });

  // Patch horseOwnerService to expose tournament/race lookups via repository layer
  const horseOwnerRepository = require('../repositories/horseOwnerRepository');
  const origHorseFindTournament = horseOwnerRepository.findTournamentById;
  const origHorseFindRace = horseOwnerRepository.findRaceById;
  horseOwnerRepository.findTournamentById = async () => ({ _id: ids.tournament, start_date: new Date(Date.now() - 86400000) });
  horseOwnerRepository.findRaceById = async () => ({
    _id: ids.race,
    status: 'scheduled',
    race_date: new Date(Date.now() + 86400000)
  });

  try {
    const result = await service.createTicket(ids.user, {
      registration_id: ids.registration,
      reason: 'The horse requires an extended veterinary recovery period.'
    });

    assert.equal(createdPayload.status, CANCELLATION_TICKET_STATUS.PENDING);
    assert.equal(createdPayload.refund_status, REFUND_STATUS.AWAITING_APPROVAL);
    assert.equal(createdPayload.refund_amount_vnd, 750000);
    assert.equal(result.cancellation_ticket._id, ids.ticket);
  } finally {
    horseOwnerRepository.findTournamentById = origHorseFindTournament;
    horseOwnerRepository.findRaceById = origHorseFindRace;
  }
});

test('owner cannot create a cancellation ticket after race start', async () => {
  const ids = {
    user: newObjectId(),
    owner: newObjectId(),
    registration: newObjectId(),
    tournament: newObjectId(),
    race: newObjectId(),
    horse: newObjectId()
  };

  profileRepository.findHorseOwnerByUserId = async () => ({ _id: ids.owner });
  Registration.findByPk = async () => ({
    _id: ids.registration,
    owner_id: ids.owner,
    tournament_id: ids.tournament,
    race_id: ids.race,
    horse_id: ids.horse,
    status: REGISTRATION_STATUS.APPROVED,
    payment_status: 'paid',
    entry_fee_vnd: 750000
  });
  Tournament.findByPk = async () => ({ _id: ids.tournament });
  Race.findByPk = async () => ({
    _id: ids.race,
    status: 'scheduled',
    race_date: new Date(Date.now() - 1000)
  });
  const registrationRepository = require('../repositories/registrationRepository');
  registrationRepository.findById = async () => ({
    _id: ids.registration,
    owner_id: ids.owner,
    tournament_id: ids.tournament,
    race_id: ids.race,
    horse_id: ids.horse,
    status: REGISTRATION_STATUS.APPROVED,
    payment_status: 'paid',
    entry_fee_vnd: 750000
  });

  const horseOwnerRepository = require('../repositories/horseOwnerRepository');
  const origHorseFindTournament = horseOwnerRepository.findTournamentById;
  const origHorseFindRace = horseOwnerRepository.findRaceById;
  horseOwnerRepository.findTournamentById = async () => ({ _id: ids.tournament });
  horseOwnerRepository.findRaceById = async () => ({
    _id: ids.race,
    status: 'scheduled',
    race_date: new Date(Date.now() - 1000)
  });

  try {
    await assert.rejects(
      service.createTicket(ids.user, {
        registration_id: ids.registration,
        reason: 'The horse is not fit to race.'
      }),
      /before the race starts/
    );
  } finally {
    horseOwnerRepository.findTournamentById = origHorseFindTournament;
    horseOwnerRepository.findRaceById = origHorseFindRace;
  }
});