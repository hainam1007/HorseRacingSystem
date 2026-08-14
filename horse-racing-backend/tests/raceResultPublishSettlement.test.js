const assert = require('node:assert/strict');
const test = require('node:test');
const { newObjectId } = require('../utils/objectId');

const raceResultRepository = require('../repositories/raceResultRepository');
const betService = require('../services/betService');
const horseRatingService = require('../services/horseRatingService');
const prizeService = require('../services/prizeService');
const raceResultService = require('../services/raceResultService');
const { RaceResult } = require('../models');

const originalCalculateRacePrizeAwards = prizeService.calculateRacePrizeAwards;
const originalSettleRaceBets = betService.settleRaceBets;
const originalApplyPublishedRaceRatings = horseRatingService.applyPublishedRaceRatings;
const originalRaceResultRepositoryFind = raceResultRepository.find;
const originalRaceResultFindAll = RaceResult.findAll;

test.afterEach(() => {
  raceResultRepository.find = originalRaceResultRepositoryFind;
  prizeService.calculateRacePrizeAwards = originalCalculateRacePrizeAwards;
  betService.settleRaceBets = originalSettleRaceBets;
  horseRatingService.applyPublishedRaceRatings = originalApplyPublishedRaceRatings;
  RaceResult.findAll = originalRaceResultFindAll;
});

test('publishRaceResults returns successful publish response when bet settlement fails', async () => {
  const raceId = newObjectId();
  const adminUserId = newObjectId();
  let updateManyCalled = false;

  prizeService.calculateRacePrizeAwards = async () => [
    {
      _id: newObjectId(),
      status: 'calculated'
    }
  ];
  horseRatingService.applyPublishedRaceRatings = async () => ({
    applied: true,
    changes: []
  });
  betService.settleRaceBets = async () => {
    updateManyCalled = true;
    throw new Error('wallet settlement failed');
  };
  raceResultRepository.find = async () => [
    {
      _id: newObjectId(),
      race_id: raceId,
      status: 'confirmed'
    }
  ];
  RaceResult.findAll = async () => [
    {
      _id: newObjectId(),
      race_id: raceId,
      status: 'confirmed',
      toJSON() { return this; }
    }
  ];

  const result = await raceResultService.publishRaceResults(adminUserId, raceId);

  assert.equal(updateManyCalled, true);
  assert.equal(result.results[0].status, 'confirmed');
  assert.equal(result.prize_awards[0].status, 'calculated');
  assert.equal(result.bet_settlement.status, 'failed');
  assert.equal(result.bet_settlement.message, 'wallet settlement failed');
  assert.match(result.bet_settlement.retry_endpoint, /\/api\/bets\/races\/.+\/settle/);
});