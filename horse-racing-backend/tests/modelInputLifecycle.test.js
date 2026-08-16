const assert = require('node:assert/strict');
const test = require('node:test');

const { Bet } = require('../models');
const { newObjectId } = require('../utils/objectId');
const raceOddsMarketRepository = require('../repositories/raceOddsMarketRepository');
const raceRepository = require('../repositories/raceRepository');
const modelInputLifecycleService = require('../services/modelInputLifecycleService');

const originals = {
  count: Bet.count,
  countDocuments: Bet.countDocuments,
  findByRaceId: raceOddsMarketRepository.findByRaceId,
  updateMarket: raceOddsMarketRepository.updateByRaceId,
  updateRace: raceRepository.updateById
};

test.afterEach(() => {
  Bet.count = originals.count;
  Bet.countDocuments = originals.countDocuments;
  raceOddsMarketRepository.findByRaceId = originals.findByRaceId;
  raceOddsMarketRepository.updateByRaceId = originals.updateMarket;
  raceRepository.updateById = originals.updateRace;
});

test('generated odds become stale when a model input changes', async () => {
  const raceId = newObjectId();
  let marketUpdate;
  raceOddsMarketRepository.findByRaceId = async () => ({ status: 'generated' });
  Bet.count = async () => 0;
  Bet.countDocuments = async () => 0;
  raceOddsMarketRepository.updateByRaceId = async (id, update) => { marketUpdate = update; };
  raceRepository.updateById = async () => ({});

  const result = await modelInputLifecycleService.prepareModelInputMutation(raceId);

  assert.equal(result.stale, true);
  assert.equal(marketUpdate.status, 'stale');
});

test('model input changes are blocked after any bet exists', async () => {
  const raceId = newObjectId();
  raceOddsMarketRepository.findByRaceId = async () => ({ status: 'generated' });
  Bet.count = async () => 1;
  Bet.countDocuments = async () => 1;

  await assert.rejects(
    () => modelInputLifecycleService.prepareModelInputMutation(raceId),
    (error) => error.statusCode === 409 && /cannot change/i.test(error.message)
  );
});
