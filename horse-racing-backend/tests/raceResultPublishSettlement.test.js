const assert = require('node:assert/strict');
const test = require('node:test');
const { newObjectId } = require('../utils/objectId');

const raceResultRepository = require('../repositories/raceResultRepository');
const raceRepository = require('../repositories/raceRepository');
const profileRepository = require('../repositories/profileRepository');
const betService = require('../services/betService');
const horseRatingService = require('../services/horseRatingService');
const prizeService = require('../services/prizeService');
const raceResultService = require('../services/raceResultService');
const { RaceResult } = require('../models');
const { loadSequelizeModels } = require('../models/sequelize');

const originalCalculateRacePrizeAwards = prizeService.calculateRacePrizeAwards;
const originalSettleRaceBets = betService.settleRaceBets;
const originalApplyPublishedRaceRatings = horseRatingService.applyPublishedRaceRatings;
const originalRaceResultRepositoryFind = raceResultRepository.find;
const originalRaceResultRepositoryUpdateMany = raceResultRepository.updateMany;
const originalRaceRepositoryFindById = raceRepository.findById;
const originalFindRaceRefereeByUserId = profileRepository.findRaceRefereeByUserId;
const originalRaceResultFindAll = RaceResult.findAll;
const sequelize = loadSequelizeModels().sequelize;
const originalTransaction = sequelize.transaction;

test.afterEach(() => {
  raceResultRepository.find = originalRaceResultRepositoryFind;
  raceResultRepository.updateMany = originalRaceResultRepositoryUpdateMany;
  raceRepository.findById = originalRaceRepositoryFindById;
  profileRepository.findRaceRefereeByUserId = originalFindRaceRefereeByUserId;
  prizeService.calculateRacePrizeAwards = originalCalculateRacePrizeAwards;
  betService.settleRaceBets = originalSettleRaceBets;
  horseRatingService.applyPublishedRaceRatings = originalApplyPublishedRaceRatings;
  RaceResult.findAll = originalRaceResultFindAll;
  sequelize.transaction = originalTransaction;
});

test('publishRaceResults returns successful publish response when bet settlement fails', async () => {
  const raceId = newObjectId();
  const refereeUserId = newObjectId();
  const refereeId = newObjectId();
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
  sequelize.transaction = async (callback) => callback({});
  raceResultRepository.updateMany = async () => [1];
  raceRepository.findById = async () => ({ _id: raceId, referee_id: refereeId });
  profileRepository.findRaceRefereeByUserId = async () => ({ _id: refereeId, user_id: refereeUserId });

  const result = await raceResultService.publishRaceResults({
    user: { _id: refereeUserId },
    roles: ['race_referee'],
    auth: { roles: ['race_referee'] }
  }, raceId);

  assert.equal(updateManyCalled, true);
  assert.equal(result.results[0].status, 'confirmed');
  assert.equal(result.prize_awards[0].status, 'calculated');
  assert.equal(result.bet_settlement.status, 'failed');
  assert.equal(result.bet_settlement.message, 'wallet settlement failed');
  assert.match(result.bet_settlement.retry_endpoint, /\/api\/bets\/races\/.+\/settle/);
});
