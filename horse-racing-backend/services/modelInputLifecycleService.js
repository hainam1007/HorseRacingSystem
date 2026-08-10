const ApiError = require('../utils/ApiError');
const { ODDS_MARKET_STATUS } = require('../constants/statuses');
const raceOddsMarketRepository = require('../repositories/raceOddsMarketRepository');
const raceRepository = require('../repositories/raceRepository');
const { Bet } = require('../models');

async function prepareModelInputMutation(raceId) {
  const market = await raceOddsMarketRepository.findByRaceId(raceId);

  if (!market) return { market: null, stale: false };

  const betCount = await Bet.countDocuments({ race_id: raceId });
  if (betCount > 0 || [ODDS_MARKET_STATUS.OPEN, ODDS_MARKET_STATUS.CLOSED, ODDS_MARKET_STATUS.SETTLED].includes(market.status)) {
    throw new ApiError(409, 'Model input cannot change after betting has opened or bets have been placed', {
      market_status: market.status,
      bet_count: betCount
    });
  }

  if (market.status === ODDS_MARKET_STATUS.GENERATED) {
    await Promise.all([
      raceOddsMarketRepository.updateByRaceId(raceId, { status: ODDS_MARKET_STATUS.STALE }),
      raceRepository.updateById(raceId, {
        betting_status: ODDS_MARKET_STATUS.STALE,
        'betting_market.status': ODDS_MARKET_STATUS.STALE
      })
    ]);
    return { market: market, stale: true };
  }

  return { market: market, stale: market.status === ODDS_MARKET_STATUS.STALE };
}

module.exports = { prepareModelInputMutation };
