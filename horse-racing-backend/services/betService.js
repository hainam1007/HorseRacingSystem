const ApiError = require('../utils/ApiError');
const { BET_STATUS, ODDS_MARKET_STATUS, RACE_RESULT_STATUS } = require('../constants/statuses');
const { Op } = require('sequelize');
const { loadSequelizeModels } = require('../models/sequelize/index.js');
const betRepository = require('../repositories/betRepository');
const dynamicOddsService = require('./dynamicOddsService');
const raceOddsMarketRepository = require('../repositories/raceOddsMarketRepository');
const raceRepository = require('../repositories/raceRepository');
const transactionRepository = require('../repositories/transactionRepository');
const walletRepository = require('../repositories/walletRepository');

function getModels() { return loadSequelizeModels().models; }

const BETTABLE_MARKET_STATUSES = [
  ODDS_MARKET_STATUS.OPEN
];
const CLOSED_RACE_STATUSES = ['running', 'completed', 'finished', 'cancelled', 'deleted'];

function getDocumentId(value) {
  return value && (value._id || value.id || value);
}

function sameId(first, second) {
  return first && second && first.toString() === second.toString();
}

function roundTokenAmount(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

function calculatePotentialPayout(stakeAmount, gameOdds) {
  return roundTokenAmount(Number(stakeAmount) * Number(gameOdds));
}

function createReferenceId(prefix, parts) {
  return [
    prefix,
    Date.now(),
    Math.random().toString(16).slice(2),
    ...parts.map(function(part) {
      return part && part.toString ? part.toString() : String(part);
    })
  ].join(':');
}

async function refundFailedBetPlacement(userId, stakeAmount, originalReferenceId, reason) {
  const refund = await walletRepository.incrementToken(userId, stakeAmount);

  if (!refund) {
    throw new ApiError(500, 'Failed to refund bet stake after bet placement failed');
  }

  await transactionRepository.createLog({
    user_id: userId,
    transaction_type: 'bet_refund',
    amount: stakeAmount,
    direction: 'credit',
    balance_before: refund.balanceBefore,
    balance_after: refund.balanceAfter,
    status: 'completed',
    reference_id: 'bet-refund:' + originalReferenceId,
    note: reason || 'Virtual bet stake refunded because bet placement failed'
  });

  return refund;
}

function getRaceFromMarket(market) {
  return market && market.race_id && market.race_id._id ? market.race_id : null;
}

function assertRaceStillBettable(race) {
  const status = String(race.status || '').toLowerCase();

  if (CLOSED_RACE_STATUSES.includes(status)) {
    throw new ApiError(400, 'Race is no longer open for betting');
  }
}

function assertStakeWithinRaceLimits(race, stakeAmount) {
  const marketConfig = (race && race.betting_market) || {};
  const minStake = Number(marketConfig.min_stake || 1);
  const maxStake = marketConfig.max_stake === undefined ? null : Number(marketConfig.max_stake);

  if (stakeAmount < minStake) {
    throw new ApiError(400, 'Stake amount is below the race minimum', {
      min_stake: minStake
    });
  }

  if (maxStake !== null && Number.isFinite(maxStake) && stakeAmount > maxStake) {
    throw new ApiError(400, 'Stake amount is above the race maximum', {
      max_stake: maxStake
    });
  }
}

function buildOddsSnapshot(market, oddsEntry) {
  return {
    market_id: getDocumentId(market),
    model_name: market.model_name,
    model_version: market.model_version,
    generated_at: market.generated_at,
    payout_factor: market.payout_factor,
    horse_no: oddsEntry.horse_no,
    horse_name: oddsEntry.horse_name,
    win_probability: oddsEntry.win_probability,
    fair_odds: oddsEntry.fair_odds,
    game_odds: oddsEntry.game_odds,
    probability_rank: oddsEntry.probability_rank
  };
}

function getFinalPosition(result) {
  return Number(result.final_position || result.position);
}

function isWinningBet(bet, result) {
  return sameId(bet.predicted_horse_id, result.horse_id) && getFinalPosition(result) === 1;
}

function isPreRaceExcludedBet(bet, race, preRaceCheck, violations, results) {
  const startedAt = race && race.started_at && new Date(race.started_at).getTime();

  if (!startedAt || results.some(function(result) {
    return sameId(result.horse_id, bet.predicted_horse_id);
  })) {
    return false;
  }

  const checkWasBeforeStart = preRaceCheck &&
    new Date(preRaceCheck.checked_at || 0).getTime() <= startedAt;
  const checkExcluded = checkWasBeforeStart && (
    preRaceCheck.is_eligible === false ||
    ['failed', 'scratched'].includes(String(preRaceCheck.status || '').toLowerCase())
  );

  if (checkExcluded) {
    return true;
  }

  return (violations || []).some(function(violation) {
    return sameId(violation.horse_id, bet.predicted_horse_id) &&
      violation.penalty &&
      violation.penalty.disqualified === true &&
      new Date(violation.created_at || 0).getTime() <= startedAt;
  });
}

async function placeBet(req, payload) {
  const market = await raceOddsMarketRepository.findByRaceId(payload.race_id);

  if (!market) {
    throw new ApiError(404, 'Race odds market not found');
  }

  if (!BETTABLE_MARKET_STATUSES.includes(market.status)) {
    throw new ApiError(400, 'Race odds market is not open for betting', {
      market_status: market.status
    });
  }

  const race = getRaceFromMarket(market) || await raceRepository.findById(payload.race_id);

  if (!race) {
    throw new ApiError(404, 'Race not found');
  }

  assertRaceStillBettable(race);
  assertStakeWithinRaceLimits(race, payload.stake_amount);

  const oddsEntry = (market.odds || []).find(function(entry) {
    return sameId(getDocumentId(entry.horse_id), payload.predicted_horse_id);
  });

  if (!oddsEntry) {
    throw new ApiError(400, 'Selected horse is not available in the current odds market');
  }

  await walletRepository.upsertWallet(req.user._id);
  const deduction = await walletRepository.deductTokenIfSufficient(req.user._id, payload.stake_amount);

  if (!deduction) {
    throw new ApiError(400, 'Insufficient wallet balance');
  }

  const potentialPayout = calculatePotentialPayout(payload.stake_amount, oddsEntry.game_odds);
  const referenceId = createReferenceId('bet-deduct', [req.user._id, payload.race_id, payload.predicted_horse_id]);
  let transaction;

  try {
    transaction = await transactionRepository.createLog({
      user_id: req.user._id,
      transaction_type: 'bet_deduct',
      amount: payload.stake_amount,
      direction: 'debit',
      balance_before: deduction.balanceBefore,
      balance_after: deduction.balanceAfter,
      status: 'completed',
      reference_id: referenceId,
      note: 'Virtual bet stake deducted'
    });

    const bet = await betRepository.create({
      spectator_id: req.user._id,
      race_id: payload.race_id,
      predicted_horse_id: payload.predicted_horse_id,
      stake_amount: payload.stake_amount,
      odds_market_id: getDocumentId(market),
      odds_snapshot: buildOddsSnapshot(market, oddsEntry),
      potential_payout: potentialPayout,
      status: BET_STATUS.PENDING,
      submitted_at: new Date()
    });

    const savedBet = await betRepository.findById(bet.id || bet._id);
    let oddsUpdate = null;

    try {
      oddsUpdate = await dynamicOddsService.repriceRaceOdds(payload.race_id);
    } catch (repricingError) {
      // The bet and its accepted odds snapshot are already valid. A transient
      // repricing failure must not refund the wallet while leaving that bet open.
      console.error('[dynamic-odds] failed to reprice race %s: %s', payload.race_id, repricingError.message);
    }

    return {
      // Sequelize models expose `id`; Mongo-style documents expose `_id`.
      // Use either shape so the response lookup never queries with undefined.
      bet: savedBet,
      wallet: deduction.wallet,
      transaction: transaction,
      odds_update: oddsUpdate
    };
  } catch (error) {
    await refundFailedBetPlacement(
      req.user._id,
      payload.stake_amount,
      referenceId,
      'Virtual bet stake refunded because bet creation failed'
    );
    throw error;
  }
}

async function listMyBets(userId, query) {
  const filter = { spectator_id: userId };

  if (query.status) {
    if (!Object.values(BET_STATUS).includes(query.status)) {
      throw new ApiError(400, 'Invalid bet status');
    }

    filter.status = query.status;
  }

  if (query.race_id) {
    filter.race_id = query.race_id;
  }

  return {
    bets: await betRepository.find(filter),
    total: await betRepository.count(filter)
  };
}

async function creditWinningBet(bet, result, settledByUserId) {
  const betId = getDocumentId(bet);
  const resultId = getDocumentId(result);

  if (!betId || !resultId) {
    throw new ApiError(500, 'Unable to settle bet because its official identifiers are missing');
  }

  const payoutAmount = roundTokenAmount(bet.potential_payout);
  const referenceId = 'bet-win:' + betId.toString();
  const existingLog = await transactionRepository.checkExistsByReference(referenceId);
  let credit = null;

  await walletRepository.upsertWallet(bet.spectator_id);

  if (!existingLog && payoutAmount > 0) {
    credit = await walletRepository.incrementToken(bet.spectator_id, payoutAmount);

    try {
      await transactionRepository.createLog({
        user_id: bet.spectator_id,
        transaction_type: 'bet_win',
        amount: payoutAmount,
        direction: 'credit',
        balance_before: credit.balanceBefore,
        balance_after: credit.balanceAfter,
        status: 'completed',
        reference_id: referenceId,
        note: 'Virtual bet win payout'
      });
    } catch (error) {
      if (error.code === 11000) {
        await walletRepository.incrementToken(bet.spectator_id, -payoutAmount);
      }
      throw error;
    }
  }

  const updatedBet = await betRepository.updateById(betId, {
    status: BET_STATUS.WON,
    payout_amount: payoutAmount,
    settled_result_id: resultId,
    settled_at: new Date(),
    checked_at: new Date(),
    settled_by: settledByUserId
  });

  if (!updatedBet) {
    throw new ApiError(500, 'Unable to mark winning bet as settled');
  }

  return updatedBet;
}

async function markLosingBet(bet, result, settledByUserId) {
  const betId = getDocumentId(bet);
  const resultId = getDocumentId(result);

  if (!betId || !resultId) {
    throw new ApiError(500, 'Unable to settle bet because its official identifiers are missing');
  }

  const updatedBet = await betRepository.updateById(betId, {
    status: BET_STATUS.LOST,
    payout_amount: 0,
    settled_result_id: resultId,
    settled_at: new Date(),
    checked_at: new Date(),
    settled_by: settledByUserId
  });

  if (!updatedBet) {
    throw new ApiError(500, 'Unable to mark losing bet as settled');
  }

  return updatedBet;
}

async function refundPreRaceExcludedBet(bet, result, settledByUserId) {
  const betId = getDocumentId(bet);

  if (!betId) {
    throw new ApiError(500, 'Unable to refund bet because its identifier is missing');
  }

  const referenceId = 'bet-refund:pre-race-exclusion:' + betId.toString();
  const existingLog = await transactionRepository.checkExistsByReference(referenceId);

  await walletRepository.upsertWallet(bet.spectator_id);

  if (!existingLog) {
    const refund = await walletRepository.incrementToken(bet.spectator_id, bet.stake_amount);

    if (!refund) {
      throw new ApiError(500, 'Failed to refund bet stake for pre-race horse exclusion');
    }

    try {
      await transactionRepository.createLog({
        user_id: bet.spectator_id,
        transaction_type: 'bet_refund',
        amount: bet.stake_amount,
        direction: 'credit',
        balance_before: refund.balanceBefore,
        balance_after: refund.balanceAfter,
        status: 'completed',
        reference_id: referenceId,
        note: 'Bet stake refunded because the selected horse was excluded before the race started'
      });
    } catch (error) {
      if (error.code === 11000) {
        await walletRepository.incrementToken(bet.spectator_id, -bet.stake_amount);
      }
      throw error;
    }
  }

  const updatedBet = await betRepository.updateById(betId, {
    status: BET_STATUS.CANCELLED,
    payout_amount: 0,
    settled_result_id: result ? getDocumentId(result) : undefined,
    settled_at: new Date(),
    checked_at: new Date(),
    settled_by: settledByUserId
  });

  if (!updatedBet) {
    throw new ApiError(500, 'Unable to mark refunded bet as settled');
  }

  return updatedBet;
}

async function markRaceBettingSettled(raceId) {
  await Promise.all([
    raceOddsMarketRepository.updateByRaceId(raceId, { status: ODDS_MARKET_STATUS.SETTLED }),
    raceRepository.updateById(raceId, {
      betting_status: ODDS_MARKET_STATUS.SETTLED,
      'betting_market.status': ODDS_MARKET_STATUS.SETTLED
    })
  ]);
}

async function settleRaceBets(raceId, settledByUserId) {
  const race = await raceRepository.findById(raceId);

  if (!race) {
    throw new ApiError(404, 'Race not found');
  }

  const pendingBets = await betRepository.findPendingByRaceId(raceId);
  const { RaceResult, HorseCheck, Violation } = getModels();
  const results = await RaceResult.findAll({
    where: { race_id: raceId, status: RACE_RESULT_STATUS.PUBLISHED }
  });

  if (!results.length) {
    throw new ApiError(400, 'Published race results not found');
  }

  const horseIds = pendingBets.map(function(bet) { return bet.predicted_horse_id; });
  const [preRaceChecks, violations] = await Promise.all([
    HorseCheck.findAll({
      where: { race_id: raceId, phase: 'pre_race', horse_id: { [Op.in]: horseIds } },
      order: [['checked_at', 'DESC']]
    }),
    Violation.findAll({
      where: {
        race_id: raceId,
        horse_id: { [Op.in]: horseIds },
        status: { [Op.in]: ['confirmed', 'resolved'] }
      }
    })
  ]);
  const latestCheckByHorse = new Map();
  preRaceChecks.forEach(function(check) {
    const horseId = getDocumentId(check.horse_id).toString();
    if (!latestCheckByHorse.has(horseId)) latestCheckByHorse.set(horseId, check);
  });

  const officialWinner = results.find(function(result) {
    return getFinalPosition(result) === 1;
  });

  if (!pendingBets.length) {
    await markRaceBettingSettled(raceId);

    return {
      race_id: raceId,
      pending_count: 0,
      settled_count: 0,
      won_count: 0,
      lost_count: 0,
      payout_total: 0,
      refunded_count: 0,
      refund_total: 0,
      winner_result_id: officialWinner ? getDocumentId(officialWinner) : null
    };
  }

  if (!officialWinner) {
    throw new ApiError(400, 'Published winning race result not found');
  }

  let wonCount = 0;
  let lostCount = 0;
  let refundedCount = 0;
  let payoutTotal = 0;
  let refundTotal = 0;

  for (const bet of pendingBets) {
    const excludedBeforeStart = isPreRaceExcludedBet(
      bet,
      race,
      latestCheckByHorse.get(getDocumentId(bet.predicted_horse_id).toString()),
      violations,
      results
    );

    if (excludedBeforeStart) {
      await refundPreRaceExcludedBet(bet, officialWinner, settledByUserId);
      refundedCount += 1;
      refundTotal += Number(bet.stake_amount || 0);
    } else if (isWinningBet(bet, officialWinner)) {
      await creditWinningBet(bet, officialWinner, settledByUserId);
      wonCount += 1;
      payoutTotal += roundTokenAmount(bet.potential_payout);
    } else {
      await markLosingBet(bet, officialWinner, settledByUserId);
      lostCount += 1;
    }
  }

  await markRaceBettingSettled(raceId);

  return {
    race_id: raceId,
    pending_count: pendingBets.length,
    settled_count: wonCount + lostCount + refundedCount,
    won_count: wonCount,
    lost_count: lostCount,
    payout_total: roundTokenAmount(payoutTotal),
    refunded_count: refundedCount,
    refund_total: roundTokenAmount(refundTotal),
    winner_result_id: getDocumentId(officialWinner)
  };
}

module.exports = {
  placeBet,
  listMyBets,
  settleRaceBets,
  _private: {
    calculatePotentialPayout,
    getFinalPosition,
    isWinningBet,
    isPreRaceExcludedBet,
    refundPreRaceExcludedBet,
    refundFailedBetPlacement
  }
};
