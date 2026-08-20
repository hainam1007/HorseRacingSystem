'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const { ROLE_NAMES } = require('../constants/roles');
const { loadSequelizeModels } = require('../models/sequelize');
const horseOwnerRepository = require('../repositories/horseOwnerRepository');
const horseOwnerService = require('../services/horseOwnerService');
const registrationSlotService = require('../services/registrationSlotService');

const Race = loadSequelizeModels().models.Race;
const originals = {
  findRace: Race.findOne,
  findProfileByUserId: horseOwnerRepository.findProfileByUserId,
  findHorsesByOwnerId: horseOwnerRepository.findHorsesByOwnerId,
  findHorseById: horseOwnerRepository.findHorseById,
  findTournamentById: horseOwnerRepository.findTournamentById,
  reserveRaceSlot: registrationSlotService.reserveRaceSlot
};

test.afterEach(() => {
  Race.findOne = originals.findRace;
  horseOwnerRepository.findProfileByUserId = originals.findProfileByUserId;
  horseOwnerRepository.findHorsesByOwnerId = originals.findHorsesByOwnerId;
  horseOwnerRepository.findHorseById = originals.findHorseById;
  horseOwnerRepository.findTournamentById = originals.findTournamentById;
  registrationSlotService.reserveRaceSlot = originals.reserveRaceSlot;
});

test('eligible-horses response includes eligible and conditional horses but excludes ineligible ones', async () => {
  const ownerId = 'owner-1';
  Race.findOne = async () => ({
    id: 'race-1',
    racetrack_id: 'track-1',
    race_date: '2026-09-10T09:00:00.000Z',
    location: 'Phu Tho Racetrack',
    venue_code: 'PHU_THO',
    racetrack: { id: 'track-1', code: 'PHU_THO', name: 'Phu Tho Racetrack' },
    eligibility_rule_snapshot: {
      racetrack_id: 'track-1',
      racetrack_code: 'PHU_THO',
      rule_version: 3,
      rule: {
        schema_version: 1,
        type: 'horse_weight_range',
        min_kg: 450,
        max_kg: 500,
        ballast_allowed: true
      }
    }
  });
  horseOwnerRepository.findProfileByUserId = async () => ({ _id: ownerId });
  horseOwnerRepository.findHorsesByOwnerId = async () => [
    { _id: 'horse-eligible', name: 'Silver Star', status: 'active', weight: 480 },
    { _id: 'horse-ballast', name: 'Light Runner', status: 'active', weight: 438 },
    { _id: 'horse-heavy', name: 'Heavy Runner', status: 'active', weight: 501 }
  ];

  const result = await horseOwnerService.getEligibleHorsesForRace({
    _id: 'user-1',
    roles: [ROLE_NAMES.HORSE_OWNER]
  }, 'race-1');

  assert.equal(result.racetrack.code, 'PHU_THO');
  assert.equal(result.condition.rule_version, 3);
  assert.equal(result.condition.type, 'horse_weight_range');
  assert.equal(result.excluded_count, 1);
  assert.deepEqual(result.horses.map((item) => item.horse._id), ['horse-eligible', 'horse-ballast']);
  assert.equal(result.horses[0].eligibility_status, 'eligible');
  assert.equal(result.horses[1].eligibility_status, 'conditional_ballast');
  assert.equal(result.horses[1].required_ballast_kg, 12);
  assert.equal(result.horses[1].reasons[0].code, 'HORSE_WEIGHT_BELOW_MIN');
});

test('owner registration rejects an ineligible horse before reserving a race slot', async () => {
  const ownerId = 'owner-1';
  let reserveCalls = 0;
  Race.findOne = async () => ({
    id: 'race-1',
    tournament_id: 'tournament-1',
    status: 'scheduled',
    max_participants: 6,
    eligibility_rule_snapshot: {
      racetrack_id: 'track-1',
      racetrack_code: 'PHU_THO',
      rule_version: 1,
      rule: { schema_version: 1, type: 'horse_weight_range', min_kg: 450, max_kg: 500, ballast_allowed: true }
    }
  });
  horseOwnerRepository.findProfileByUserId = async () => ({ _id: ownerId });
  horseOwnerRepository.findHorseById = async () => ({ _id: 'horse-1', owner_id: ownerId, status: 'active', weight: 501 });
  horseOwnerRepository.findTournamentById = async () => ({ _id: 'tournament-1' });
  registrationSlotService.reserveRaceSlot = async () => { reserveCalls += 1; };

  await assert.rejects(
    horseOwnerService.registerHorseForRace({ _id: 'user-1', roles: [ROLE_NAMES.HORSE_OWNER] }, {
      horse_id: 'horse-1',
      race_id: 'race-1'
    }),
    (error) => error.statusCode === 422
      && error.details?.eligibility?.reasons?.[0]?.code === 'HORSE_WEIGHT_ABOVE_MAX'
  );

  assert.equal(reserveCalls, 0);
});
