const assert = require('node:assert/strict');
const test = require('node:test');

const probabilityEngineService = require('../services/probabilityEngineService');
const probabilityFeatureBuilderService = require('../services/probabilityFeatureBuilderService');
const raceOddsMarketRepository = require('../repositories/raceOddsMarketRepository');
const raceRepository = require('../repositories/raceRepository');
const raceEntryService = require('../services/raceEntryService');
const raceOddsService = require('../services/raceOddsService');

const originals = {
  buildRaceProbabilityPayload: probabilityFeatureBuilderService.buildRaceProbabilityPayload,
  predictRace: probabilityEngineService.predictRace,
  getModelEvaluation: probabilityEngineService.getModelEvaluation,
  assignDrawsByRegistrationOrder: raceEntryService.assignDrawsByRegistrationOrder,
  upsertByRaceId: raceOddsMarketRepository.upsertByRaceId,
  updateRace: raceRepository.updateById
};

test.afterEach(() => {
  probabilityFeatureBuilderService.buildRaceProbabilityPayload = originals.buildRaceProbabilityPayload;
  probabilityEngineService.predictRace = originals.predictRace;
  probabilityEngineService.getModelEvaluation = originals.getModelEvaluation;
  raceEntryService.assignDrawsByRegistrationOrder = originals.assignDrawsByRegistrationOrder;
  raceOddsMarketRepository.upsertByRaceId = originals.upsertByRaceId;
  raceRepository.updateById = originals.updateRace;
});

test('odds generation accepts fallback-backed model inputs without readiness gating', async () => {
  const savedMarkets = [];

  raceEntryService.assignDrawsByRegistrationOrder = async () => ({
    race_id: 'race-1',
    participant_count: 2,
    assignments: [
      { registration_id: 'registration-1', horse_id: 'horse-1', draw: 1 },
      { registration_id: 'registration-2', horse_id: 'horse-2', draw: 2 }
    ]
  });
  probabilityFeatureBuilderService.buildRaceProbabilityPayload = async () => ({
    race: { model_input_version: 0 },
    payload: {
      race_info: { race_date: '2026-07-27T00:00:00.000Z', venue: 'ST', race_no: 1 },
      horses: [{ horse_no: 1 }, { horse_no: 2 }]
    },
    participants: [
      {
        horse_id: 'horse-1',
        horse_no: 1,
        horse_name: 'Northern Dancer',
        jockey_name: 'Unknown Jockey',
        fallbacks_used: ['jockey.default_unknown', 'entry.draw_by_registration_order']
      },
      {
        horse_id: 'horse-2',
        horse_no: 2,
        horse_name: 'Sunday Silence',
        jockey_name: 'Unknown Jockey',
        fallbacks_used: ['jockey.default_unknown', 'entry.draw_by_registration_order']
      }
    ],
    diagnostics: {
      participant_count: 2,
      fallback_count: 4,
      fallbacks_used: ['jockey.default_unknown', 'entry.draw_by_registration_order']
    }
  });
  probabilityEngineService.predictRace = async () => ({
    horses: [
      { horse_no: 1, horse_name: 'Northern Dancer', win_probability: 0.6, fair_odds: 1.67, game_odds: 1.42, probability_rank: 1 },
      { horse_no: 2, horse_name: 'Sunday Silence', win_probability: 0.4, fair_odds: 2.5, game_odds: 2.13, probability_rank: 2 }
    ]
  });
  probabilityEngineService.getModelEvaluation = () => ({ purpose: 'test' });
  raceOddsMarketRepository.upsertByRaceId = async (raceId, market) => {
    savedMarkets.push({ raceId, market });
    return market;
  };
  raceRepository.updateById = async () => ({});

  const result = await raceOddsService.generateRaceOdds(
    { user: { _id: 'admin-1' } },
    'race-1'
  );

  assert.equal(savedMarkets.length, 1);
  assert.equal(result.market.odds.length, 2);
  assert.deepEqual(result.draw_assignment.assignments.map(function(item) { return item.draw; }), [1, 2]);
  assert.equal(result.diagnostics.fallback_count, 4);
  assert.deepEqual(result.market.odds[0].fallbacks_used, [
    'jockey.default_unknown',
    'entry.draw_by_registration_order'
  ]);
});
