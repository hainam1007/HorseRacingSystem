'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const { ROLE_NAMES } = require('../constants/roles');
const { HORSE_CHECK_PHASE, HORSE_CHECK_STATUS } = require('../constants/statuses');
const { Horse } = require('../models');
const { newObjectId } = require('../utils/objectId');
const horseCheckRepository = require('../repositories/horseCheckRepository');
const profileRepository = require('../repositories/profileRepository');
const raceRepository = require('../repositories/raceRepository');
const raceEngineService = require('../services/raceEngineService');
const horseCheckService = require('../services/horseCheckService');

const REFEREE_ID = newObjectId();
const REFEREE_USER_ID = newObjectId();
const RACE_ID = newObjectId();
const HORSE_ID = newObjectId();
const CHECK_ID = newObjectId();

const originals = {
  horseFindByPk: Horse.findByPk,
  horseCheckCreate: horseCheckRepository.create,
  horseCheckFindById: horseCheckRepository.findById,
  horseCheckFindOne: horseCheckRepository.findOne,
  horseCheckUpdateById: horseCheckRepository.updateById,
  refereeFindByUserId: profileRepository.findRaceRefereeByUserId,
  raceFindById: raceRepository.findById
};

function raceFixture() {
  return {
    _id: RACE_ID,
    referee_id: REFEREE_ID,
    eligibility_rule_snapshot: {
      racetrack_id: newObjectId(),
      rule_version: 1,
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

function refereeRequest() {
  return {
    roles: [ROLE_NAMES.RACE_REFEREE],
    user: { _id: REFEREE_USER_ID }
  };
}

function lightHorse() {
  return { _id: HORSE_ID, status: 'active', weight: 438 };
}

function pendingBallastCheck() {
  return {
    _id: CHECK_ID,
    race_id: RACE_ID,
    horse_id: HORSE_ID,
    referee_id: REFEREE_ID,
    phase: HORSE_CHECK_PHASE.PRE_RACE,
    status: HORSE_CHECK_STATUS.PASSED,
    weight: 438,
    ballast_confirmed: false
  };
}

test.afterEach(() => {
  Horse.findByPk = originals.horseFindByPk;
  horseCheckRepository.create = originals.horseCheckCreate;
  horseCheckRepository.findById = originals.horseCheckFindById;
  horseCheckRepository.findOne = originals.horseCheckFindOne;
  horseCheckRepository.updateById = originals.horseCheckUpdateById;
  profileRepository.findRaceRefereeByUserId = originals.refereeFindByUserId;
  raceRepository.findById = originals.raceFindById;
});

test('pre-race checks ignore a client eligibility flag and require confirmed ballast', async () => {
  let created;
  raceRepository.findById = async () => raceFixture();
  Horse.findByPk = async () => lightHorse();
  profileRepository.findRaceRefereeByUserId = async () => ({ _id: REFEREE_ID });
  horseCheckRepository.findOne = async () => null;
  horseCheckRepository.create = async (payload) => {
    created = payload;
    return { _id: CHECK_ID, ...payload };
  };

  await horseCheckService.createHorseCheck(refereeRequest(), {
    race_id: RACE_ID,
    horse_id: HORSE_ID,
    phase: HORSE_CHECK_PHASE.PRE_RACE,
    status: HORSE_CHECK_STATUS.PASSED,
    weight: 438,
    is_eligible: true
  });

  assert.equal(created.is_eligible, false);
  assert.equal(created.ballast_required_kg, 12);
  assert.equal(created.eligibility_result.reasons[0].code, 'BALLAST_CONFIRMATION_REQUIRED');
});

test('assigned referee confirms sufficient ballast and eligibility is recalculated', async () => {
  let updateData;
  const check = pendingBallastCheck();
  raceRepository.findById = async () => raceFixture();
  Horse.findByPk = async () => lightHorse();
  horseCheckRepository.findById = async () => check;
  profileRepository.findRaceRefereeByUserId = async () => ({ _id: REFEREE_ID });
  horseCheckRepository.updateById = async (_id, payload) => {
    updateData = payload;
    return { ...check, ...payload };
  };

  const result = await horseCheckService.confirmBallast(refereeRequest(), CHECK_ID, {
    ballast_added_kg: 12
  });

  assert.equal(updateData.ballast_confirmed, true);
  assert.equal(updateData.ballast_added_kg, 12);
  assert.equal(updateData.ballast_required_kg, 12);
  assert.equal(updateData.is_eligible, true);
  assert.equal(updateData.eligibility_result.status, 'eligible');
  assert.equal(result.horse_check.is_eligible, true);
});

test('ballast confirmation rejects insufficient ballast before changing the horse check', async () => {
  let updateCalls = 0;
  raceRepository.findById = async () => raceFixture();
  Horse.findByPk = async () => lightHorse();
  horseCheckRepository.findById = async () => pendingBallastCheck();
  profileRepository.findRaceRefereeByUserId = async () => ({ _id: REFEREE_ID });
  horseCheckRepository.updateById = async () => { updateCalls += 1; };

  await assert.rejects(
    horseCheckService.confirmBallast(refereeRequest(), CHECK_ID, { ballast_added_kg: 10 }),
    (error) => error.statusCode === 422 && /below the required amount/.test(error.message)
  );

  assert.equal(updateCalls, 0);
});

test('only the referee assigned to the race may confirm ballast', async () => {
  raceRepository.findById = async () => raceFixture();
  Horse.findByPk = async () => lightHorse();
  horseCheckRepository.findById = async () => pendingBallastCheck();
  profileRepository.findRaceRefereeByUserId = async () => ({ _id: newObjectId() });

  await assert.rejects(
    horseCheckService.confirmBallast(refereeRequest(), CHECK_ID, { ballast_added_kg: 12 }),
    (error) => error.statusCode === 403 && /assigned to this race/.test(error.message)
  );
});

test('race readiness uses the evaluator instead of a client-set eligible flag', () => {
  const blockers = raceEngineService.getPreRaceEligibilityBlockers(
    raceFixture(),
    lightHorse(),
    {
      ...pendingBallastCheck(),
      is_eligible: true,
      ballast_added_kg: 12,
      ballast_confirmed: false
    }
  );

  assert.deepEqual(blockers, ['pre_race_eligibility_ballast_confirmation_required']);
});
