const assert = require('node:assert/strict');
const test = require('node:test');
const mongoose = require('mongoose');

const { RaceResult } = require('../models');
const raceResultRepository = require('../repositories/raceResultRepository');
const betService = require('../services/betService');
const horseRatingService = require('../services/horseRatingService');
const prizeService = require('../services/prizeService');
const raceResultService = require('../services/raceResultService');

const originalStartSession = mongoose.startSession;
const originalRaceResultFind = RaceResult.find;
const originalRaceResultUpdateMany = RaceResult.updateMany;
const originalRaceResultRepositoryFind = raceResultRepository.find;
const originalCalculateRacePrizeAwards = prizeService.calculateRacePrizeAwards;
const originalSettleRaceBets = betService.settleRaceBets;
const originalApplyPublishedRaceRatings = horseRatingService.applyPublishedRaceRatings;

test.afterEach(() => {
  mongoose.startSession = originalStartSession;
  RaceResult.find = originalRaceResultFind;
  RaceResult.updateMany = originalRaceResultUpdateMany;
  raceResultRepository.find = originalRaceResultRepositoryFind;
  prizeService.calculateRacePrizeAwards = originalCalculateRacePrizeAwards;
  betService.settleRaceBets = originalSettleRaceBets;
  horseRatingService.applyPublishedRaceRatings = originalApplyPublishedRaceRatings;
});

test('publishRaceResults returns successful publish response when bet settlement fails', async () => {
  const raceId = new mongoose.Types.ObjectId();
  const adminUserId = new mongoose.Types.ObjectId();
  let updateManyCalled = false;

  mongoose.startSession = async () => ({
    withTransaction: async (callback) => callback(),
    endSession: async () => {}
  });
  RaceResult.find = () => ({
    session: async () => [
      {
        _id: new mongoose.Types.ObjectId(),
        race_id: raceId,
        status: 'confirmed'
      }
    ]
  });
  RaceResult.updateMany = async () => {
    updateManyCalled = true;
    return { modifiedCount: 1 };
  };
  prizeService.calculateRacePrizeAwards = async () => [
    {
      _id: new mongoose.Types.ObjectId(),
      status: 'calculated'
    }
  ];
  horseRatingService.applyPublishedRaceRatings = async () => ({
    applied: true,
    changes: []
  });
  betService.settleRaceBets = async () => {
    throw new Error('wallet settlement failed');
  };
  raceResultRepository.find = async () => [
    {
      _id: new mongoose.Types.ObjectId(),
      race_id: raceId,
      status: 'published'
    }
  ];

  const result = await raceResultService.publishRaceResults(adminUserId, raceId);

  assert.equal(updateManyCalled, true);
  assert.equal(result.results[0].status, 'published');
  assert.equal(result.prize_awards[0].status, 'calculated');
  assert.equal(result.bet_settlement.status, 'failed');
  assert.equal(result.bet_settlement.message, 'wallet settlement failed');
  assert.match(result.bet_settlement.retry_endpoint, /\/api\/bets\/races\/.+\/settle/);
});
