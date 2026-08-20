'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const { ROLE_NAMES } = require('../constants/roles');
const { Horse } = require('../models');
const { newObjectId } = require('../utils/objectId');
const emailService = require('../services/emailService');
const raceEngineService = require('../services/raceEngineService');
const raceRepository = require('../repositories/raceRepository');
const registrationRepository = require('../repositories/registrationRepository');
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

function raceFixture(raceId, tournamentId) {
  return {
    _id: raceId,
    tournament_id: { _id: tournamentId, name: 'Eligibility Meeting' },
    status: 'scheduled',
    max_participants: 6,
    eligibility_rule_snapshot: {
      racetrack_id: newObjectId(),
      racetrack_code: 'PHU_THO',
      rule_version: 2,
      rule: {
        schema_version: 1,
        type: 'horse_weight_range',
        min_kg: 450,
        max_kg: 500,
        ballast_allowed: true
      }
    }
  };
}

function adminRequest(adminId) {
  return { user: { _id: adminId }, auth: { roles: [ROLE_NAMES.ADMIN] } };
}

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

test('admin registration rejects an ineligible horse before slot reservation or record creation', async () => {
  const adminId = newObjectId();
  const ownerId = newObjectId();
  const horseId = newObjectId();
  const raceId = newObjectId();
  const tournamentId = newObjectId();
  let reserveCalls = 0;
  let createCalls = 0;

  raceRepository.findById = async () => raceFixture(raceId, tournamentId);
  Horse.findByPk = async () => ({ id: horseId, owner_id: ownerId, status: 'active', weight: 501 });
  registrationSlotService.reserveRaceSlot = async () => { reserveCalls += 1; };
  registrationRepository.create = async () => { createCalls += 1; };

  await assert.rejects(
    registrationService.createRegistration(adminRequest(adminId), {
      race_id: raceId,
      horse_id: horseId,
      owner_id: ownerId
    }),
    (error) => error.statusCode === 422
      && error.details?.eligibility?.reasons?.[0]?.code === 'HORSE_WEIGHT_ABOVE_MAX'
  );

  assert.equal(reserveCalls, 0);
  assert.equal(createCalls, 0);
});

test('admin registration stores a conditional-ballast eligibility snapshot', async () => {
  const adminId = newObjectId();
  const ownerId = newObjectId();
  const ownerUserId = newObjectId();
  const horseId = newObjectId();
  const raceId = newObjectId();
  const tournamentId = newObjectId();
  const registrationId = newObjectId();
  let createdPayload;

  raceRepository.findById = async () => raceFixture(raceId, tournamentId);
  Horse.findByPk = async () => ({ id: horseId, owner_id: ownerId, name: 'Light Runner', status: 'active', weight: 438 });
  registrationRepository.count = async () => 0;
  raceEngineService.ensureRaceRegistrationIsUnlocked = async () => true;
  registrationSlotService.reserveRaceSlot = async () => true;
  registrationSlotService.releaseRaceSlot = async () => true;
  registrationRepository.create = async (payload) => {
    createdPayload = payload;
    return { _id: registrationId, ...payload };
  };
  registrationRepository.findById = async () => ({
    _id: registrationId,
    ...createdPayload,
    owner_id: { _id: ownerId, user_id: { _id: ownerUserId, email: 'owner@example.com' } },
    horse_id: { _id: horseId, name: 'Light Runner' },
    race_id: { _id: raceId, name: 'Race 1' },
    tournament_id: { _id: tournamentId, name: 'Eligibility Meeting' }
  });
  emailService.isEmailConfigured = () => false;
  emailService.sendRaceRegistrationConfirmedEmail = async () => ({ skipped: true });

  await registrationService.createRegistration(adminRequest(adminId), {
    race_id: raceId,
    horse_id: horseId,
    owner_id: ownerId
  });

  assert.equal(createdPayload.eligibility_status, 'conditional_ballast');
  assert.equal(createdPayload.eligibility_snapshot.status, 'conditional_ballast');
  assert.equal(createdPayload.eligibility_snapshot.required_ballast_kg, 12);
  assert.ok(createdPayload.eligibility_checked_at instanceof Date);
});
