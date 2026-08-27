'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const { ROLE_NAMES } = require('../constants/roles');
const { HORSE_CHECK_PHASE, HORSE_CHECK_STATUS } = require('../constants/statuses');
const { Horse, HorseCheck } = require('../models');
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
  horseFindAll: Horse.findAll,
  horseFindByPk: Horse.findByPk,
  horseCheckFindAll: HorseCheck.findAll,
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
  Horse.findAll = originals.horseFindAll;
  Horse.findByPk = originals.horseFindByPk;
  HorseCheck.findAll = originals.horseCheckFindAll;
  horseCheckRepository.create = originals.horseCheckCreate;
  horseCheckRepository.findById = originals.horseCheckFindById;
  horseCheckRepository.findOne = originals.horseCheckFindOne;
  horseCheckRepository.updateById = originals.horseCheckUpdateById;
  profileRepository.findRaceRefereeByUserId = originals.refereeFindByUserId;
  raceRepository.findById = originals.raceFindById;
});

test('bulk save updates an existing Sequelize horse check by its id field', async () => {
  const checklist = {
    identity_verified: true,
    registration_valid: true,
    jockey_assigned: true,
    jockey_contract_confirmed: true,
    horse_health_status_ok: true,
    no_visible_lameness: true,
    no_visible_injury: true,
    normal_gait: true,
    normal_breathing: true,
    equipment_ok: true,
    fit_to_race: true
  };
  let updatedId;
  let updatedData;

  raceRepository.findById = async () => raceFixture();
  profileRepository.findRaceRefereeByUserId = async () => ({ _id: REFEREE_ID });
  Horse.findAll = async () => [{ id: HORSE_ID, status: 'active', weight: 460 }];
  HorseCheck.findAll = async () => [{
    id: CHECK_ID,
    race_id: RACE_ID,
    horse_id: HORSE_ID,
    referee_id: REFEREE_ID,
    phase: HORSE_CHECK_PHASE.PRE_RACE,
    status: HORSE_CHECK_STATUS.FAILED,
    checklist: {}
  }];
  horseCheckRepository.updateById = async (id, data) => {
    updatedId = id;
    updatedData = data;
    return { id, ...data };
  };

  const result = await horseCheckService.bulkSaveHorseChecks(refereeRequest(), {
    race_id: RACE_ID,
    phase: HORSE_CHECK_PHASE.PRE_RACE,
    checks: [{
      horse_id: HORSE_ID,
      status: HORSE_CHECK_STATUS.PASSED,
      checklist
    }]
  });

  assert.equal(updatedId, CHECK_ID);
  assert.equal(updatedData.status, HORSE_CHECK_STATUS.PASSED);
  assert.deepEqual(updatedData.checklist, checklist);
  assert.equal(result.summary.updated_count, 1);
  assert.equal(result.summary.failed_count, 0);
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
