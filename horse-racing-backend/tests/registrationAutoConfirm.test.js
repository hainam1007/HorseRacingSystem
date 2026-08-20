const assert = require('node:assert/strict');
const test = require('node:test');
const { newObjectId } = require('../utils/objectId');
const { ROLE_NAMES } = require('../constants/roles');
const { Horse } = require('../models');
const raceRepository = require('../repositories/raceRepository');
const registrationRepository = require('../repositories/registrationRepository');
const emailService = require('../services/emailService');
const raceEngineService = require('../services/raceEngineService');
const registrationSlotService = require('../services/registrationSlotService');
const registrationService = require('../services/registrationService');

const originals = {
  horseFindByPk: Horse.findByPk,
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
  Horse.findByPk = originals.horseFindByPk;
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
  const adminId = newObjectId();
  const ownerId = newObjectId();
  const ownerUserId = newObjectId();
  const horseId = newObjectId();
  const raceId = newObjectId();
  const tournamentId = newObjectId();
  const registrationId = newObjectId();
  let createdPayload = null;
  let emailContext = null;

  raceRepository.findById = async () => ({
    _id: raceId,
    tournament_id: { _id: tournamentId, name: 'Demo Meeting' },
    status: 'scheduled',
    max_participants: 6,
    eligibility_rule_snapshot: {
      racetrack_id: newObjectId(),
      racetrack_code: 'TEST_TRACK',
      rule_version: 1,
      rule: { schema_version: 1, type: 'horse_weight_range', min_kg: 450, max_kg: 500, ballast_allowed: true }
    }
  });
  raceEngineService.ensureRaceRegistrationIsUnlocked = async () => true;
  registrationSlotService.reserveRaceSlot = async () => true;
  registrationSlotService.releaseRaceSlot = async () => true;
  registrationRepository.count = async () => 0;
  Horse.findByPk = async () => ({ _id: horseId, owner_id: ownerId, name: 'Silver Comet', status: 'active', weight: 485 });
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
  assert.equal(createdPayload.eligibility_status, 'eligible');
  assert.equal(createdPayload.eligibility_snapshot.status, 'eligible');
  assert.equal(result.email_delivery.status, 'queued');
  assert.equal(emailContext.user.email, 'owner@example.com');
});
