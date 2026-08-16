const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const raceEngineService = require('../services/raceEngineService');

test('failed RaceEngineRun is retryable', function() {
  assert.equal(
    raceEngineService.getRunAction({
      status: raceEngineService.ENGINE_RUN_STATUS.FAILED
    }),
    'retry'
  );
});

test('stale running RaceEngineRun is retryable', function() {
  const staleDate = new Date(Date.now() - raceEngineService.RUNNING_STALE_MS - 1000);

  assert.equal(
    raceEngineService.getRunAction({
      status: raceEngineService.ENGINE_RUN_STATUS.RUNNING,
      updated_at: staleDate
    }),
    'retry_stale_running'
  );
});

test('fresh running RaceEngineRun is skipped', function() {
  assert.equal(
    raceEngineService.getRunAction({
      status: raceEngineService.ENGINE_RUN_STATUS.RUNNING,
      updated_at: new Date()
    }),
    'skip_running'
  );
});

test('registration lock helper blocks at registration_lock_at', function() {
  const registrationLockAt = new Date('2026-06-19T10:00:00.000Z');

  assert.doesNotThrow(function() {
    raceEngineService.assertRegistrationOpen({
      registration_locked: false,
      registration_lock_at: registrationLockAt
    }, new Date('2026-06-19T09:59:59.000Z'));
  });

  assert.throws(function() {
    raceEngineService.assertRegistrationOpen({
      registration_locked: false,
      registration_lock_at: registrationLockAt
    }, registrationLockAt);
  }, /Race registrations are locked/);
});

test('latest pre-race HorseCheck wins eligibility selection', function() {
  const latestByHorse = new Map();
  const horseId = '507f1f77bcf86cd799439011';

  raceEngineService.addLatestHorseCheck(latestByHorse, {
    horse_id: horseId,
    status: 'passed',
    is_eligible: true,
    checked_at: new Date('2026-06-19T08:00:00.000Z')
  });
  raceEngineService.addLatestHorseCheck(latestByHorse, {
    horse_id: horseId,
    status: 'failed',
    is_eligible: false,
    checked_at: new Date('2026-06-19T09:00:00.000Z')
  });

  assert.equal(latestByHorse.get(horseId).status, 'failed');
  assert.equal(latestByHorse.get(horseId).is_eligible, false);
});

test('draft result generation is wrapped in a Sequelize transaction', function() {
  const source = fs.readFileSync(path.join(__dirname, '..', 'services', 'raceEngineService.js'), 'utf8');

  assert.match(source, /sequelize\.transaction/);
  assert.match(source, /RaceResult\.bulkCreate/);
  assert.match(source, /completeRun\(activeRun\)/);
});

test('scheduler processing only locks registrations', function() {
  const source = fs.readFileSync(path.join(__dirname, '..', 'services', 'raceEngineService.js'), 'utf8');

  assert.match(source, /async function processDueRace[\s\S]*return lockRace\(getRaceId\(race\)\)/);
});

test('draft result generation requires a completed race', function() {
  const source = fs.readFileSync(path.join(__dirname, '..', 'services', 'raceEngineService.js'), 'utf8');

  assert.match(source, /Race must be completed before draft results can be generated/);
});

test('draft results preserve raw and final values', function() {
  const source = fs.readFileSync(path.join(__dirname, '..', 'services', 'raceEngineService.js'), 'utf8');

  assert.match(source, /raw_position/);
  assert.match(source, /raw_finish_time/);
  assert.match(source, /final_position/);
  assert.match(source, /final_finish_time/);
});

test('race result confirmation requires the referee penalty snapshot and submission', function() {
  const source = fs.readFileSync(path.join(__dirname, '..', 'services', 'raceResultService.js'), 'utf8');

  assert.match(source, /async function confirmRaceResults[\s\S]*sequelize\.transaction/);
  assert.match(source, /penaltiesMatchCurrentSnapshot\(submittedResults, confirmedViolations\)/);
  assert.match(source, /Referee must apply confirmed penalties and submit final results before Admin confirmation/);
  assert.match(source, /All race violations must be confirmed or dismissed first/);
});

test('seeded race random is reproducible', function() {
  const firstRandom = raceEngineService.createSeededRandom('demo-race');
  const secondRandom = raceEngineService.createSeededRandom('demo-race');
  const first = raceEngineService.shuffle([1, 2, 3, 4], firstRandom);
  const second = raceEngineService.shuffle([1, 2, 3, 4], secondRandom);

  assert.deepEqual(first, second);
  assert.equal(
    raceEngineService.getFinishTime(1, firstRandom),
    raceEngineService.getFinishTime(1, secondRandom)
  );
});

test('provisional race order is reproducible with seeded Race Engine random', function() {
  const previousSeed = process.env.RACE_ENGINE_RANDOM_SEED;
  const raceId = '507f1f77bcf86cd799439011';
  const participants = [
    {
      horse: { _id: '507f1f77bcf86cd799439012' },
      jockey: { _id: '507f1f77bcf86cd799439013' },
      assignment: { _id: '507f1f77bcf86cd799439014' },
      registration: { lane: 1 }
    },
    {
      horse: { _id: '507f1f77bcf86cd799439015' },
      jockey: { _id: '507f1f77bcf86cd799439016' },
      assignment: { _id: '507f1f77bcf86cd799439017' },
      registration: { lane: 2 }
    }
  ];

  process.env.RACE_ENGINE_RANDOM_SEED = 'demo-order';

  try {
    assert.deepEqual(
      raceEngineService.buildRaceOrder(raceId, participants).map(function(item) {
        return {
          horse_id: item.horse_id,
          position: item.position,
          finish_time: item.finish_time
        };
      }),
      raceEngineService.buildRaceOrder(raceId, participants).map(function(item) {
        return {
          horse_id: item.horse_id,
          position: item.position,
          finish_time: item.finish_time
        };
      })
    );
  } finally {
    if (previousSeed === undefined) {
      delete process.env.RACE_ENGINE_RANDOM_SEED;
    } else {
      process.env.RACE_ENGINE_RANDOM_SEED = previousSeed;
    }
  }
});
