const { fn, col } = require('sequelize');
const { loadSequelizeModels } = require('../models/sequelize/index.js');
const { toPlain } = require('../repositories/sequelize/adapter');

const BETTORS_PER_STEP = 5;
const ODDS_STEP = 0.10;
const MIN_GAME_ODDS = 1.10;
const MAX_GAME_ODDS = 99;

function roundOdds(value) {
  return Math.round(Number(value) * 100) / 100;
}

function clampOdds(value) {
  return Math.min(MAX_GAME_ODDS, Math.max(MIN_GAME_ODDS, roundOdds(value)));
}

/**
 * Rebuild current odds from their generated baseline, so repeated calls between
 * bettor thresholds cannot apply the same movement more than once.
 */
function calculateStepOdds(marketOdds, bettorCounts) {
  const odds = marketOdds || [];
  if (odds.length < 2) {
    return odds.map(function(item) {
      return {
        horse_id: item.horse_id,
        game_odds: clampOdds(item.opening_game_odds || item.generated_game_odds || item.game_odds),
        distinct_bettor_count: Number(bettorCounts[String(item.horse_id)] || 0),
        adjustment_steps: 0
      };
    });
  }

  const stepsByHorse = new Map(odds.map(function(item) {
    const count = Number(bettorCounts[String(item.horse_id)] || 0);
    return [String(item.horse_id), Math.floor(count / BETTORS_PER_STEP)];
  }));
  const totalSteps = [...stepsByHorse.values()].reduce(function(total, steps) {
    return total + steps;
  }, 0);

  return odds.map(function(item) {
    const horseId = String(item.horse_id);
    const ownSteps = stepsByHorse.get(horseId) || 0;
    const decrease = ownSteps * ODDS_STEP;
    const increaseFromOtherHorses = (totalSteps - ownSteps) * ODDS_STEP / (odds.length - 1);
    const openingOdds = Number(item.opening_game_odds || item.generated_game_odds || item.game_odds);

    return {
      horse_id: item.horse_id,
      game_odds: clampOdds(openingOdds - decrease + increaseFromOtherHorses),
      distinct_bettor_count: Number(bettorCounts[horseId] || 0),
      adjustment_steps: ownSteps
    };
  });
}

async function repriceRaceOdds(raceId) {
  const { sequelize, models } = loadSequelizeModels();
  const { RaceOddsMarket, RaceOddsMarketOdd, Bet } = models;

  return sequelize.transaction(async function(transaction) {
    const market = await RaceOddsMarket.findOne({
      where: { race_id: raceId, status: 'open' },
      transaction,
      lock: transaction.LOCK.UPDATE
    });

    if (!market) return null;

    const marketOdds = await RaceOddsMarketOdd.findAll({
      where: { odds_market_id: market.id },
      order: [['probability_rank', 'ASC']],
      transaction,
      lock: transaction.LOCK.UPDATE
    });
    const countRows = await Bet.findAll({
      attributes: [
        'predicted_horse_id',
        [fn('COUNT', fn('DISTINCT', col('spectator_id'))), 'bettor_count']
      ],
      where: { race_id: raceId, status: 'pending' },
      group: ['predicted_horse_id'],
      raw: true,
      transaction
    });
    const bettorCounts = Object.fromEntries(countRows.map(function(row) {
      return [String(row.predicted_horse_id), Number(row.bettor_count)];
    }));
    const updates = calculateStepOdds(marketOdds, bettorCounts);

    await Promise.all(updates.map(function(update) {
      return RaceOddsMarketOdd.update(
        { game_odds: update.game_odds },
        { where: { odds_market_id: market.id, horse_id: update.horse_id }, transaction }
      );
    }));

    const refreshedOdds = await RaceOddsMarketOdd.findAll({
      where: { odds_market_id: market.id },
      order: [['probability_rank', 'ASC']],
      transaction
    });

    return {
      market_id: market.id,
      race_id: raceId,
      trigger: {
        bettors_per_step: BETTORS_PER_STEP,
        odds_step: ODDS_STEP
      },
      odds: refreshedOdds.map(function(item) {
        const calculated = updates.find(function(update) {
          return String(update.horse_id) === String(item.horse_id);
        });
        return Object.assign(toPlain(item), {
          distinct_bettor_count: calculated.distinct_bettor_count,
          adjustment_steps: calculated.adjustment_steps
        });
      })
    };
  });
}

module.exports = {
  repriceRaceOdds,
  _private: {
    BETTORS_PER_STEP,
    ODDS_STEP,
    MIN_GAME_ODDS,
    MAX_GAME_ODDS,
    calculateStepOdds
  }
};
