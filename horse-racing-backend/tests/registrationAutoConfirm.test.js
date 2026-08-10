const assert = require('node:assert/strict');
const test = require('node:test');
const mongoose = require('mongoose');

const { ROLE_NAMES } = require('../constants/roles');
const { Horse } = require('../models');
const raceRepository = require('../repositories/raceRepository');
const registrationRepository = require('../repositories/registrationRepository');
const emailService = require('../services/emailService');
const raceEngineService = require('../services/raceEngineService');
const registrationSlotService = require('../services/registrationSlotService');
const registrationService = require('../services/registrationService');

const originals = {
  horseFindById: Horse.findById,
  raceFindById: raceRepository.findById,
  registrationCount: registrationRepository.count,
  registrationCreate: registrationRepository.create,
  registrationFindById: registrationRepository.findById,
  ensureRaceRegistrationIsUnlocked: raceEngineService.ensureRaceRegistrationIsUnlocked,
  reserveRaceSlot: registrationSlotService.reserveRaceSlot,
  releaseRaceSlot: registrationSlotService.releaseRaceSlot,
  isEmailConfigured: emailService.isEmailConfigured,
  sendRaceRegistrationConfirmedEmail: emailService.sendRaceRegistrationConfirmedEmail
};

test.afterEach(() => {
  Horse.findById = originals.horseFindById;
  raceRepository.findById = originals.raceFindById;
  registrationRepository.count = originals.registrationCount;
  registrationRepository.create = originals.registrationCreate;
  registrationRepository.findById = originals.registrationFindById;
  raceEngineService.ensureRaceRegistrationIsUnlocked = originals.ensureRaceRegistrationIsUnlocked;
  registrationSlotService.reserveRaceSlot = originals.reserveRaceSlot;
  registrationSlotService.releaseRaceSlot = originals.releaseRaceSlot;
  emailService.isEmailConfigured = originals.isEmailConfigured;
  emailService.sendRaceRegistrationConfirmedEmail = originals.sendRaceRegistrationConfirmedEmail;
});

test('admin operational registration is auto-confirmed and queues owner email', async () => {
  const adminId = new mongoose.Types.ObjectId();
  const ownerId = new mongoose.Types.ObjectId();
  const ownerUserId = new mongoose.Types.ObjectId();
  const horseId = new mongoose.Types.ObjectId();
  const raceId = new mongoose.Types.ObjectId();
  const tournamentId = new mongoose.Types.ObjectId();
  const registrationId = new mongoose.Types.ObjectId();
  let createdPayload = null;
  let emailContext = null;

  raceRepository.findById = async () => ({
    _id: raceId,
    tournament_id: { _id: tournamentId, name: 'Demo Meeting' },
    status: 'scheduled',
    max_participants: 6
  });
  raceEngineService.ensureRaceRegistrationIsUnlocked = async () => true;
  registrationSlotService.reserveRaceSlot = async () => true;
  registrationSlotService.releaseRaceSlot = async () => true;
  registrationRepository.count = async () => 0;
  Horse.findById = async () => ({ _id: horseId, owner_id: ownerId, name: 'Silver Comet' });
  registrationRepository.create = async (payload) => {
    createdPayload = payload;
    return { _id: registrationId, ...payload };
  };
  registrationRepository.findById = async () => ({
    _id: registrationId,
    ...createdPayload,
    owner_id: { _id: ownerId, user_id: { _id: ownerUserId, email: 'owner@example.com' } },
    horse_id: { _id: horseId, name: 'Silver Comet' },
    race_id: { _id: raceId, name: 'Race 1' },
    tournament_id: { _id: tournamentId, name: 'Demo Meeting' }
  });
  emailService.isEmailConfigured = () => true;
  emailService.sendRaceRegistrationConfirmedEmail = async (context) => {
    emailContext = context;
    return { skipped: false };
  };

  const result = await registrationService.createRegistration({
    user: { _id: adminId },
    auth: { roles: [ROLE_NAMES.ADMIN] }
  }, {
    race_id: raceId,
    horse_id: horseId,
    owner_id: ownerId
  });

  assert.equal(createdPayload.status, 'approved');
  assert.equal(String(createdPayload.approved_by), String(adminId));
  assert.equal(String(createdPayload.tournament_id), String(tournamentId));
  assert.ok(createdPayload.approved_at instanceof Date);
  assert.equal(result.email_delivery.status, 'queued');
  assert.equal(emailContext.user.email, 'owner@example.com');
});
