const assert = require('node:assert/strict');
const test = require('node:test');

const { Bet } = require('../models');
const raceOddsMarketRepository = require('../repositories/raceOddsMarketRepository');
const raceRepository = require('../repositories/raceRepository');
const modelInputLifecycleService = require('../services/modelInputLifecycleService');

const originals = {
  countDocuments: Bet.countDocuments,
  findByRaceId: raceOddsMarketRepository.findByRaceId,
  updateMarket: raceOddsMarketRepository.updateByRaceId,
  updateRace: raceRepository.updateById
};

test.afterEach(() => {
  Bet.countDocuments = originals.countDocuments;
  raceOddsMarketRepository.findByRaceId = originals.findByRaceId;
  raceOddsMarketRepository.updateByRaceId = originals.updateMarket;
  raceRepository.updateById = originals.updateRace;
});

test('generated odds become stale when a model input changes', async () => {
  let marketUpdate;
  raceOddsMarketRepository.findByRaceId = async () => ({ status: 'generated' });
  Bet.countDocuments = async () => 0;
  raceOddsMarketRepository.updateByRaceId = async (id, update) => { marketUpdate = update; };
  raceRepository.updateById = async () => ({});

  const result = await modelInputLifecycleService.prepareModelInputMutation('race-1');

  assert.equal(result.stale, true);
  assert.equal(marketUpdate.status, 'stale');
});

test('model input changes are blocked after any bet exists', async () => {
  raceOddsMarketRepository.findByRaceId = async () => ({ status: 'generated' });
  Bet.countDocuments = async () => 1;

  await assert.rejects(
    () => modelInputLifecycleService.prepareModelInputMutation('race-1'),
    (error) => error.statusCode === 409 && /cannot change/i.test(error.message)
  );
});
