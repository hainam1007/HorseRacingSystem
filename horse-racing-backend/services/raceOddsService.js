const ApiError = require('../utils/ApiError');
const { ODDS_MARKET_STATUS } = require('../constants/statuses');
const { PROBABILITY_MODEL } = require('../constants/probabilityModel');
const probabilityEngineService = require('./probabilityEngineService');
const probabilityFeatureBuilderService = require('./probabilityFeatureBuilderService');
const betRepository = require('../repositories/betRepository');
const raceOddsMarketRepository = require('../repositories/raceOddsMarketRepository');
const raceRepository = require('../repositories/raceRepository');
const raceEntryService = require('./raceEntryService');

function getProbabilityTotal(horses) {
  return horses.reduce(function(total, horse) {
    return total + Number(horse.win_probability || 0);
  }, 0);
}

function mapOdds(prediction, participants) {
  if (!prediction || !Array.isArray(prediction.horses)) {
    throw new ApiError(502, 'Probability engine returned an invalid prediction payload');
  }

  if (prediction.horses.length !== participants.length) {
    throw new ApiError(502, 'Probability engine returned a different participant count');
  }

  return prediction.horses.map(function(predictedHorse, index) {
    const participant = participants[index];

    return {
      horse_id: participant.horse_id,
      jockey_id: participant.jockey_id || undefined,
      horse_no: predictedHorse.horse_no || participant.horse_no,
      horse_name: predictedHorse.horse_name || participant.horse_name,
      jockey_name: participant.jockey_name,
      win_probability: predictedHorse.win_probability,
      fair_odds: predictedHorse.fair_odds,
      game_odds: predictedHorse.game_odds,
      generated_game_odds: predictedHorse.game_odds,
      probability_rank: predictedHorse.probability_rank,
      fallbacks_used: participant.fallbacks_used || []
    };
  });
}

async function generateRaceOdds(req, raceId) {
  const drawAssignment = await raceEntryService.assignDrawsByRegistrationOrder(raceId);
  const featureData = await probabilityFeatureBuilderService.buildRaceProbabilityPayload(raceId);
  const prediction = await probabilityEngineService.predictRace(featureData.payload);
  const probabilityTotal = getProbabilityTotal(prediction.horses || []);

  if (Math.abs(probabilityTotal - 1) > 0.0001) {
    throw new ApiError(502, 'Probability engine returned probabilities that do not sum to 1', {
      probability_total: probabilityTotal
    });
  }

  const modelEvaluation = probabilityEngineService.getModelEvaluation();
  const market = await raceOddsMarketRepository.upsertByRaceId(raceId, {
    race_id: raceId,
    status: ODDS_MARKET_STATUS.GENERATED,
    model_name: PROBABILITY_MODEL.NAME,
    model_version: PROBABILITY_MODEL.VERSION,
    source: PROBABILITY_MODEL.RUNTIME_DIR,
    payout_factor: PROBABILITY_MODEL.PAYOUT_FACTOR,
    model_input_version: featureData.race.model_input_version || 0,
    input_snapshot: featureData.payload,
    generated_by: req.user && req.user._id,
    generated_at: new Date(),
    manually_adjusted_by: null,
    manually_adjusted_at: null,
    manual_adjustment_note: '',
    model_metrics: modelEvaluation,
    input_diagnostics: featureData.diagnostics,
    odds: mapOdds(prediction, featureData.participants)
  });

  await raceRepository.updateById(raceId, {
    betting_status: ODDS_MARKET_STATUS.GENERATED,
    betting_market: {
      status: ODDS_MARKET_STATUS.GENERATED,
      min_stake: 1,
      max_stake: 1000,
      currency: 'TOKEN'
    }
  });

  return {
    market: market,
    prediction: prediction,
    draw_assignment: drawAssignment,
    diagnostics: featureData.diagnostics,
    model_evaluation: modelEvaluation
  };
}

function documentId(value) {
  return value && (value._id || value);
}

function idString(value) {
  const id = documentId(value);
  return id ? id.toString() : '';
}

function buildAdjustedOdds(marketOdds, requestedOdds) {
  const requestedByHorse = new Map(requestedOdds.map(function(item) {
    return [idString(item.horse_id), item.game_odds];
  }));

  return marketOdds.map(function(item) {
    const horseId = documentId(item.horse_id);
    return {
      _id: item._id,
      horse_id: horseId,
      jockey_id: documentId(item.jockey_id) || undefined,
      horse_no: item.horse_no,
      horse_name: item.horse_name,
      jockey_name: item.jockey_name,
      win_probability: item.win_probability,
      fair_odds: item.fair_odds,
      generated_game_odds: item.generated_game_odds || item.game_odds,
      game_odds: requestedByHorse.get(idString(horseId)),
      probability_rank: item.probability_rank,
      fallbacks_used: item.fallbacks_used || []
    };
  });
}

async function updateRaceOdds(req, raceId, payload) {
  const market = await raceOddsMarketRepository.findByRaceId(raceId);

  if (!market) throw new ApiError(404, 'Race odds market not found');
  if (market.status !== ODDS_MARKET_STATUS.GENERATED) {
    throw new ApiError(409, 'Odds can only be adjusted before betting opens', {
      market_status: market.status
    });
  }
  if (await betRepository.count({ race_id: raceId })) {
    throw new ApiError(409, 'Odds cannot be adjusted after a bet exists');
  }

  const marketHorseIds = new Set((market.odds || []).map(function(item) {
    return idString(item.horse_id);
  }));
  const requestedHorseIds = new Set(payload.odds.map(function(item) {
    return idString(item.horse_id);
  }));

  if (marketHorseIds.size !== requestedHorseIds.size || [...marketHorseIds].some(function(id) {
    return !requestedHorseIds.has(id);
  })) {
    throw new ApiError(400, 'Manual odds must include every market horse exactly once');
  }

  const updated = await raceOddsMarketRepository.updateGeneratedByRaceId(raceId, {
    odds: buildAdjustedOdds(market.odds || [], payload.odds),
    manually_adjusted_by: req.user && req.user._id,
    manually_adjusted_at: new Date(),
    manual_adjustment_note: payload.adjustment_note || ''
  });

  if (!updated) throw new ApiError(409, 'Odds market changed before the adjustment was saved');
  return { market: updated };
}

async function getRaceOdds(raceId) {
  const market = await raceOddsMarketRepository.findByRaceId(raceId);

  if (!market) {
    throw new ApiError(404, 'Race odds market not found');
  }

  return {
    market: market
  };
}

module.exports = {
  generateRaceOdds,
  getRaceOdds,
  updateRaceOdds,
  _private: { buildAdjustedOdds }
};
