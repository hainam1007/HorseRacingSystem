const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { newObjectId } = require('../utils/objectId');

const betRepository = require('../repositories/betRepository');
const raceRepository = require('../repositories/raceRepository');
const raceOddsMarketRepository = require('../repositories/raceOddsMarketRepository');
const transactionRepository = require('../repositories/transactionRepository');
const walletRepository = require('../repositories/walletRepository');
const betService = require('../services/betService');
const { HorseCheck, RaceResult, Violation } = require('../models');

const projectRoot = path.resolve(__dirname, '..');
const originalBetCreate = betRepository.create;
const originalFindPendingByRaceId = betRepository.findPendingByRaceId;
const originalUpdateBetById = betRepository.updateById;
const originalFindRaceById = raceRepository.findById;
const originalUpdateRaceById = raceRepository.updateById;
const originalFindMarketByRaceId = raceOddsMarketRepository.findByRaceId;
const originalUpdateMarketByRaceId = raceOddsMarketRepository.updateByRaceId;
const originalCreateLog = transactionRepository.createLog;
const originalUpsertWallet = walletRepository.upsertWallet;
const originalDeductTokenIfSufficient = walletRepository.deductTokenIfSufficient;
const originalIncrementToken = walletRepository.incrementToken;
const originalFindRaceResults = RaceResult.findAll;
const originalFindHorseChecks = HorseCheck.findAll;
const originalFindViolations = Violation.findAll;

function readProjectFile(relativePath) {
  return fs.readFileSync(path.join(projectRoot, relativePath), 'utf8');
}

test.afterEach(() => {
  betRepository.create = originalBetCreate;
  betRepository.findPendingByRaceId = originalFindPendingByRaceId;
  betRepository.updateById = originalUpdateBetById;
  raceRepository.findById = originalFindRaceById;
  raceRepository.updateById = originalUpdateRaceById;
  raceOddsMarketRepository.findByRaceId = originalFindMarketByRaceId;
  raceOddsMarketRepository.updateByRaceId = originalUpdateMarketByRaceId;
  transactionRepository.createLog = originalCreateLog;
  walletRepository.upsertWallet = originalUpsertWallet;
  walletRepository.deductTokenIfSufficient = originalDeductTokenIfSufficient;
  walletRepository.incrementToken = originalIncrementToken;
  RaceResult.findAll = originalFindRaceResults;
  HorseCheck.findAll = originalFindHorseChecks;
  Violation.findAll = originalFindViolations;
});

test('bet APIs are wired into app, docs, and route layer', () => {
  const appSource = readProjectFile('app.js');
  const routeSource = readProjectFile('routes/bets.js');
  const apiDocsSource = readProjectFile('docs/API.md');

  assert.match(appSource, /\/api\/bets/);
  assert.match(routeSource, /validatePlaceBet/);
  assert.match(routeSource, /\/races\/:raceId\/settle/);
  assert.match(apiDocsSource, /Bet APIs/);
});

test('potential payout uses stake multiplied by game odds rounded to cents', () => {
  assert.equal(betService._private.calculatePotentialPayout(10, 3.547), 35.47);
  assert.equal(betService._private.calculatePotentialPayout(7, 1.333), 9.33);
});

test('winning bet requires same horse and official final position', () => {
  const winningHorseId = newObjectId();
  const losingHorseId = newObjectId();
  const officialResult = {
    horse_id: winningHorseId,
    final_position: 1
  };

  assert.equal(
    betService._private.isWinningBet(
      { predicted_horse_id: winningHorseId },
      officialResult
    ),
    true
  );
  assert.equal(
    betService._private.isWinningBet(
      { predicted_horse_id: losingHorseId },
      officialResult
    ),
    false
  );
});

test('pre-race exclusion is refundable, but post-start exclusion is not', () => {
  const horseId = newObjectId();
  const bet = { predicted_horse_id: horseId };
  const startedAt = new Date('2026-07-25T10:00:00.000Z');
  const race = { started_at: startedAt };
  const excludedCheck = {
    horse_id: horseId,
    phase: 'pre_race',
    status: 'failed',
    is_eligible: false,
    checked_at: new Date('2026-07-25T09:59:00.000Z')
  };

  assert.equal(
    betService._private.isPreRaceExcludedBet(bet, race, excludedCheck, [], []),
    true
  );
  assert.equal(
    betService._private.isPreRaceExcludedBet(
      bet,
      race,
      Object.assign({}, excludedCheck, { checked_at: new Date('2026-07-25T10:01:00.000Z') }),
      [],
      []
    ),
    false
  );
});

test('settlement updates a losing Sequelize-shaped bet that only exposes id', async () => {
  const raceId = newObjectId();
  const betId = newObjectId();
  const losingHorseId = newObjectId();
  const winnerHorseId = newObjectId();
  const winnerResultId = newObjectId();
  const settledByUserId = newObjectId();
  const updates = [];

  raceRepository.findById = async () => ({ id: raceId, status: 'completed' });
  raceRepository.updateById = async () => ({ id: raceId, betting_status: 'settled' });
  raceOddsMarketRepository.updateByRaceId = async () => ({ id: newObjectId(), status: 'settled' });
  betRepository.findPendingByRaceId = async () => [{
    id: betId,
    spectator_id: newObjectId(),
    predicted_horse_id: losingHorseId,
    stake_amount: 25,
    potential_payout: 80
  }];
  betRepository.updateById = async (id, update) => {
    updates.push({ id, update });
    return { id, ...update };
  };
  RaceResult.findAll = async () => [{
    id: winnerResultId,
    horse_id: winnerHorseId,
    final_position: 1,
    status: 'published'
  }];
  HorseCheck.findAll = async () => [];
  Violation.findAll = async () => [];

  const result = await betService.settleRaceBets(raceId, settledByUserId);

  assert.equal(result.settled_count, 1);
  assert.equal(result.lost_count, 1);
  assert.equal(updates.length, 1);
  assert.equal(updates[0].id, betId);
  assert.equal(updates[0].update.status, 'lost');
  assert.equal(updates[0].update.settled_result_id, winnerResultId);
});

test('failed bet creation refunds wallet and writes refund audit log', async () => {
  const userId = newObjectId();
  const raceId = newObjectId();
  const horseId = newObjectId();
  const marketId = newObjectId();
  const logs = [];
  let refundAmount = 0;

  raceOddsMarketRepository.findByRaceId = async () => ({
    _id: marketId,
    status: 'open',
    race_id: {
      _id: raceId,
      status: 'scheduled',
      betting_market: {
        min_stake: 1,
        max_stake: 1000
      }
    },
    odds: [
      {
        horse_id: horseId,
        horse_name: 'Silver Comet',
        win_probability: 0.25,
        fair_odds: 4,
        game_odds: 3.4,
        probability_rank: 1
      }
    ]
  });
  walletRepository.upsertWallet = async () => ({ user_id: userId, token_balance: 100 });
  walletRepository.deductTokenIfSufficient = async () => ({
    balanceBefore: 100,
    balanceAfter: 90,
    wallet: { user_id: userId, token_balance: 90 }
  });
  walletRepository.incrementToken = async (targetUserId, amount) => {
    assert.equal(targetUserId, userId);
    refundAmount += amount;

    return {
      balanceBefore: 90,
      balanceAfter: 100,
      wallet: { user_id: userId, token_balance: 100 }
    };
  };
  transactionRepository.createLog = async (payload) => {
    logs.push(payload);
    return payload;
  };
  betRepository.create = async () => {
    throw new Error('bet insert failed');
  };

  await assert.rejects(
    betService.placeBet(
      { user: { _id: userId } },
      {
        race_id: raceId,
        predicted_horse_id: horseId,
        stake_amount: 10
      }
    ),
    /bet insert failed/
  );

  assert.equal(refundAmount, 10);
  assert.equal(logs.length, 2);
  assert.equal(logs[0].transaction_type, 'bet_deduct');
  assert.equal(logs[1].transaction_type, 'bet_refund');
  assert.equal(logs[1].direction, 'credit');
  assert.equal(logs[1].amount, 10);
  assert.match(logs[1].reference_id, /^bet-refund:bet-deduct:/);
});
