const assert = require('node:assert/strict');
const test = require('node:test');

const betRepository = require('../repositories/betRepository');
const raceOddsMarketRepository = require('../repositories/raceOddsMarketRepository');
const raceRepository = require('../repositories/raceRepository');
const raceEngineService = require('../services/raceEngineService');
const raceService = require('../services/raceService');

const originalFindById = raceRepository.findById;
const originalUpdateById = raceRepository.updateById;
const originalUpdateMany = raceRepository.updateMany;
const originalFindMarketByRaceId = raceOddsMarketRepository.findByRaceId;
const originalCaptureOpeningOdds = raceOddsMarketRepository.captureOpeningOdds;
const originalUpdateMarketByRaceId = raceOddsMarketRepository.updateByRaceId;
const originalCountBets = betRepository.count;
const originalLockRace = raceEngineService.lockRace;
const originalCollectParticipants = raceEngineService.collectParticipants;
const originalGenerateProvisionalRaceRun = raceEngineService.generateProvisionalRaceRun;

test.afterEach(function() {
  raceRepository.findById = originalFindById;
  raceRepository.updateById = originalUpdateById;
  raceRepository.updateMany = originalUpdateMany;
  raceOddsMarketRepository.findByRaceId = originalFindMarketByRaceId;
  raceOddsMarketRepository.captureOpeningOdds = originalCaptureOpeningOdds;
  raceOddsMarketRepository.updateByRaceId = originalUpdateMarketByRaceId;
  betRepository.count = originalCountBets;
  raceEngineService.lockRace = originalLockRace;
  raceEngineService.collectParticipants = originalCollectParticipants;
  raceEngineService.generateProvisionalRaceRun = originalGenerateProvisionalRaceRun;
});

test('demo registration opener unlocks scheduled race and moves it into the future', async function() {
  let capturedPayload;

  raceRepository.findById = async function() {
    return { _id: 'race-id', status: 'scheduled' };
  };
  raceRepository.updateById = async function(id, payload) {
    capturedPayload = payload;
    return { _id: id, ...payload };
  };

  const before = Date.now();
  const result = await raceService.openRegistrationForDemo('race-id');

  assert.equal(result.race._id, 'race-id');
  assert.equal(capturedPayload.registration_locked, false);
  assert.equal(capturedPayload.status, 'scheduled');
  assert.ok(capturedPayload.race_date instanceof Date);
  assert.ok(capturedPayload.race_date.getTime() - before >= 23 * 60 * 60 * 1000);
});

test('demo registration opener resets a past non-scheduled race for immediate demo entry', async function() {
  let capturedPayload;

  raceRepository.findById = async function() {
    return {
      _id: 'race-id',
      status: 'completed',
      race_date: new Date('2026-07-27T09:00:00.000Z'),
      registration_locked: true
    };
  };
  raceRepository.updateById = async function(id, payload) {
    capturedPayload = payload;
    return { _id: id, ...payload };
  };

  const result = await raceService.openRegistrationForDemo('race-id');

  assert.equal(result.race.status, 'scheduled');
  assert.equal(capturedPayload.registration_locked, false);
  assert.equal(capturedPayload.starting_at, null);
  assert.equal(capturedPayload.started_at, null);
  assert.ok(capturedPayload.race_date.getTime() > Date.now());
  assert.ok(capturedPayload.registration_lock_at.getTime() > Date.now());
});

test('admin can update the race date without odds lifecycle conflicts', async function() {
  const updatedDate = new Date('2026-07-27T09:00:00.000Z');
  let capturedPayload;

  raceRepository.findById = async function() {
    return {
      _id: 'race-id',
      status: 'scheduled',
      race_date: new Date('2026-07-28T09:00:00.000Z'),
      betting_status: 'open'
    };
  };
  raceOddsMarketRepository.findByRaceId = async function() {
    throw new Error('Race update must not inspect the odds market');
  };
  raceRepository.updateById = async function(id, payload) {
    capturedPayload = payload;
    return { _id: id, ...payload };
  };

  const result = await raceService.updateRace('race-id', {
    race_date: updatedDate
  });

  assert.equal(result.race.race_date, updatedDate);
  assert.equal(capturedPayload.race_date, updatedDate);
  assert.equal(
    capturedPayload.registration_lock_at.getTime(),
    updatedDate.getTime() - 3 * 60 * 60 * 1000
  );
});

test('demo registration mode opens every scheduled race', async function() {
  let capturedFilter;
  let capturedPayload;

  raceRepository.updateMany = async function(filter, payload) {
    capturedFilter = filter;
    capturedPayload = payload;
    return { modifiedCount: 3 };
  };

  const result = await raceService.setRegistrationDemoMode({ enabled: true });

  assert.deepEqual(capturedFilter, { status: 'scheduled' });
  assert.equal(capturedPayload.registration_locked, false);
  assert.equal(capturedPayload.status, 'scheduled');
  assert.ok(capturedPayload.race_date instanceof Date);
  assert.ok(capturedPayload.registration_lock_at instanceof Date);
  assert.equal(result.enabled, true);
  assert.equal(result.updated_count, 3);
});

test('demo registration mode locks every unlocked race regardless of lifecycle status', async function() {
  let capturedPayload;

  raceRepository.updateMany = async function(filter, payload) {
    assert.deepEqual(filter, { registration_locked: { $ne: true } });
    capturedPayload = payload;
    return { modifiedCount: 2 };
  };

  const result = await raceService.setRegistrationDemoMode({ enabled: false });

  assert.equal(capturedPayload.registration_locked, true);
  assert.ok(capturedPayload.registration_lock_at instanceof Date);
  assert.equal(result.enabled, false);
  assert.equal(result.updated_count, 2);
});

test('demo registration mode validates enabled boolean', async function() {
  await assert.rejects(
    raceService.setRegistrationDemoMode({ enabled: 'true' }),
    {
      statusCode: 400,
      message: 'enabled must be a boolean'
    }
  );
});

test('demo timeline updates only a safe scheduled race with the selected deadline', async function() {
  const raceDate = new Date(Date.now() + 90 * 60 * 1000);
  const registrationLockAt = new Date(Date.now() + 25 * 60 * 1000);
  let raceUpdate;
  let marketUpdate;

  raceRepository.findById = async function() {
    return {
      _id: 'race-id',
      status: 'scheduled',
      model_input_version: 4,
      betting_market: { min_stake: 5, max_stake: 250, currency: 'TOKEN' }
    };
  };
  betRepository.count = async function() { return 0; };
  raceOddsMarketRepository.findByRaceId = async function() {
    return { _id: 'market-id', status: 'generated' };
  };
  raceOddsMarketRepository.updateByRaceId = async function(_, payload) {
    marketUpdate = payload;
    return { _id: 'market-id', ...payload };
  };
  raceRepository.updateById = async function(_, payload) {
    raceUpdate = payload;
    return { _id: 'race-id', ...payload };
  };

  const result = await raceService.prepareDemoTimeline('race-id', {
    race_date: raceDate,
    registration_lock_at: registrationLockAt
  });

  assert.equal(result.registration_open, true);
  assert.equal(result.market_reset, true);
  assert.equal(raceUpdate.race_date, raceDate);
  assert.equal(raceUpdate.registration_lock_at, registrationLockAt);
  assert.equal(raceUpdate.registration_locked, false);
  assert.equal(raceUpdate.entries_finalized_at, null);
  assert.equal(raceUpdate.model_input_version, 5);
  assert.equal(raceUpdate.betting_status, 'stale');
  assert.equal(marketUpdate.status, 'stale');
});

test('demo timeline refuses to modify a race after a spectator has a bet', async function() {
  raceRepository.findById = async function() {
    return { _id: 'race-id', status: 'scheduled' };
  };
  betRepository.count = async function() { return 1; };

  await assert.rejects(
    raceService.prepareDemoTimeline('race-id', {
      race_date: new Date(Date.now() + 90 * 60 * 1000),
      registration_lock_at: new Date(Date.now() + 25 * 60 * 1000)
    }),
    {
      statusCode: 409,
      message: 'The demo timeline cannot change after a spectator has placed a bet'
    }
  );
});

test('demo timeline can lock registrations immediately for one safe race', async function() {
  let raceUpdate;
  raceRepository.findById = async function() {
    return { _id: 'race-id', status: 'scheduled', registration_locked: false };
  };
  betRepository.count = async function() { return 0; };
  raceRepository.updateById = async function(_, payload) {
    raceUpdate = payload;
    return { _id: 'race-id', ...payload };
  };

  const result = await raceService.lockRegistrationForDemo('race-id');

  assert.equal(result.locked, true);
  assert.equal(raceUpdate.registration_locked, true);
  assert.ok(raceUpdate.registration_lock_at instanceof Date);
});

test('open betting requires generated odds market and stores race betting config', async function() {
  let capturedRaceUpdate;
  let capturedMarketUpdate;
  let capturedOpeningOddsRaceId;

  raceRepository.findById = async function() {
    return {
      _id: 'race-id',
      status: 'scheduled',
      betting_market: {
        min_stake: 1,
        max_stake: 1000,
        currency: 'TOKEN'
      }
    };
  };
  raceOddsMarketRepository.findByRaceId = async function() {
    return {
      _id: 'market-id',
      status: 'generated'
    };
  };
  raceOddsMarketRepository.updateByRaceId = async function(id, payload) {
    capturedMarketUpdate = payload;
    return { _id: 'market-id', race_id: id, ...payload };
  };
  raceOddsMarketRepository.captureOpeningOdds = async function(id) {
    capturedOpeningOddsRaceId = id;
  };
  raceRepository.updateById = async function(id, payload) {
    capturedRaceUpdate = payload;
    return { _id: id, ...payload };
  };

  const result = await raceService.openBetting('race-id', {
    min_stake: 5,
    max_stake: 500,
    currency: 'TOKEN'
  });

  assert.equal(capturedMarketUpdate.status, 'open');
  assert.equal(capturedOpeningOddsRaceId, 'race-id');
  assert.equal(capturedRaceUpdate.betting_status, 'open');
  assert.equal(capturedRaceUpdate.betting_market.status, 'open');
  assert.equal(capturedRaceUpdate.betting_market.min_stake, 5);
  assert.equal(capturedRaceUpdate.betting_market.max_stake, 500);
  assert.equal(result.market.status, 'open');
});

test('open betting rejects closed odds market', async function() {
  raceRepository.findById = async function() {
    return {
      _id: 'race-id',
      status: 'scheduled'
    };
  };
  raceOddsMarketRepository.findByRaceId = async function() {
    return {
      _id: 'market-id',
      status: 'closed'
    };
  };

  await assert.rejects(
    raceService.openBetting('race-id', {}),
    {
      statusCode: 400,
      message: 'Only generated or open odds markets can open betting'
    }
  );
});

test('close betting closes race and odds market', async function() {
  const marketResponses = [
    { _id: 'market-id', status: 'open' },
    { _id: 'market-id', status: 'closed' }
  ];
  let capturedRaceUpdate;
  let capturedMarketUpdate;

  raceRepository.findById = async function() {
    return { _id: 'race-id', status: 'scheduled' };
  };
  raceOddsMarketRepository.findByRaceId = async function() {
    return marketResponses.shift();
  };
  raceOddsMarketRepository.updateByRaceId = async function(id, payload) {
    capturedMarketUpdate = payload;
    return { _id: 'market-id', race_id: id, ...payload };
  };
  raceRepository.updateById = async function(id, payload) {
    capturedRaceUpdate = payload;
    return { _id: id, ...payload };
  };

  const result = await raceService.closeBetting('race-id');

  assert.equal(capturedMarketUpdate.status, 'closed');
  assert.equal(capturedRaceUpdate.betting_status, 'closed');
  assert.equal(capturedRaceUpdate['betting_market.status'], 'closed');
  assert.equal(result.market.status, 'closed');
});

test('start race auto closes betting market before race is running', async function() {
  const updates = [];
  let lockRaceCalled = false;

  raceRepository.findById = async function() {
    return {
      _id: 'race-id',
      status: 'scheduled',
      race_date: new Date(Date.now() - 60 * 1000),
      registration_locked: false,
      referee_id: 'referee-id'
    };
  };
  raceEngineService.lockRace = async function() {
    lockRaceCalled = true;
    throw new Error('startRace must lock registration atomically without checking lock time');
  };
  raceOddsMarketRepository.findByRaceId = async function() {
    return { _id: 'market-id', status: 'open' };
  };
  raceOddsMarketRepository.updateByRaceId = async function(id, payload) {
    return { _id: 'market-id', race_id: id, ...payload };
  };
  raceRepository.updateById = async function(id, payload) {
    updates.push(payload);
    return { _id: id, ...payload };
  };
  raceRepository.updateOne = async function(filter, payload) {
    updates.push(payload.$set || payload);
    return { _id: filter._id, ...(payload.$set || payload) };
  };
  raceEngineService.collectParticipants = async function() {
    return {
      participants: [{ horse_id: 'horse-id' }]
    };
  };
  raceEngineService.generateProvisionalRaceRun = async function() {
    return { race_run: { finish_order: ['horse-id'] } };
  };

  const result = await raceService.startRace(
    {
      user: { _id: 'admin-id' },
      roles: ['admin'],
      auth: { roles: ['admin'] }
    },
    'race-id'
  );
  const finalUpdate = updates[updates.length - 1];

  assert.equal(finalUpdate.status, 'running');
  assert.equal(finalUpdate.registration_locked, true);
  assert.equal(finalUpdate.betting_status, 'closed');
  assert.equal(finalUpdate['betting_market.status'], 'closed');
  assert.equal(lockRaceCalled, false);
  assert.deepEqual(result.engine, { race_run: { finish_order: ['horse-id'] } });
});

test('race start uses a recoverable starting state and cancels a new run on finalization failure', function() {
  const source = require('node:fs').readFileSync(
    require('node:path').join(__dirname, '../services/raceService.js'),
    'utf8'
  );

  assert.match(source, /status: 'starting'/);
  assert.match(source, /RACE_START_STALE_MS/);
  assert.match(source, /cancelProvisionalRaceRun/);
  assert.match(source, /status:\s*'scheduled'/);
  assert.match(source, /sequelize\.transaction/);
});
