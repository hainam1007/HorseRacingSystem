const assert = require('node:assert/strict');
const test = require('node:test');
const { newObjectId } = require('../utils/objectId');

const betRepository = require('../repositories/betRepository');
const raceOddsMarketRepository = require('../repositories/raceOddsMarketRepository');
const raceOddsService = require('../services/raceOddsService');
const { validateUpdateRaceOdds } = require('../validators/raceOddsValidator');

const originals = {
  count: betRepository.count,
  findByRaceId: raceOddsMarketRepository.findByRaceId,
  updateGeneratedByRaceId: raceOddsMarketRepository.updateGeneratedByRaceId
};

test.afterEach(function() {
  betRepository.count = originals.count;
  raceOddsMarketRepository.findByRaceId = originals.findByRaceId;
  raceOddsMarketRepository.updateGeneratedByRaceId = originals.updateGeneratedByRaceId;
});

function runValidator(body) {
  const req = { body: body };
  let error;
  validateUpdateRaceOdds(req, {}, function(nextError) { error = nextError; });
  return { error: error, payload: req.validatedBody };
}

test('manual odds validator rejects duplicates and unsafe odds', function() {
  const horseId = newObjectId().toString();
  const result = runValidator({
    odds: [
      { horse_id: horseId, game_odds: 1 },
      { horse_id: horseId, game_odds: 3 }
    ]
  });

  assert.equal(result.error.statusCode, 400);
  assert.ok(result.error.details.some(function(item) { return item.field.endsWith('.game_odds'); }));
  assert.ok(result.error.details.some(function(item) { return item.message === 'horse_id must be unique'; }));
});

test('admin adjusts final game odds while generated model values remain unchanged', async function() {
  const raceId = newObjectId();
  const adminId = newObjectId();
  const horseIds = [newObjectId(), newObjectId()];
  const market = {
    status: 'generated',
    odds: horseIds.map(function(horseId, index) {
      return {
        _id: newObjectId(),
        horse_id: horseId,
        horse_no: index + 1,
        horse_name: 'Runner ' + (index + 1),
        win_probability: index === 0 ? 0.6 : 0.4,
        fair_odds: index === 0 ? 1.67 : 2.5,
        game_odds: index === 0 ? 1.42 : 2.13,
        probability_rank: index + 1,
        fallbacks_used: []
      };
    })
  };
  let saved;

  raceOddsMarketRepository.findByRaceId = async function() { return market; };
  betRepository.count = async function() { return 0; };
  raceOddsMarketRepository.updateGeneratedByRaceId = async function(_, update) {
    saved = update;
    return Object.assign({}, market, update);
  };

  const result = await raceOddsService.updateRaceOdds(
    { user: { _id: adminId } },
    raceId,
    {
      odds: [
        { horse_id: horseIds[0], game_odds: 1.55 },
        { horse_id: horseIds[1], game_odds: 2.4 }
      ],
      adjustment_note: 'Final review'
    }
  );

  assert.deepEqual(saved.odds.map(function(item) { return item.game_odds; }), [1.55, 2.4]);
  assert.deepEqual(saved.odds.map(function(item) { return item.generated_game_odds; }), [1.42, 2.13]);
  assert.deepEqual(saved.odds.map(function(item) { return item.win_probability; }), [0.6, 0.4]);
  assert.equal(saved.manually_adjusted_by, adminId);
  assert.equal(result.market.manual_adjustment_note, 'Final review');
});

test('manual odds adjustment is blocked after betting opens', async function() {
  raceOddsMarketRepository.findByRaceId = async function() {
    return { status: 'open', odds: [] };
  };

  await assert.rejects(
    raceOddsService.updateRaceOdds(
      { user: { _id: newObjectId() } },
      newObjectId(),
      { odds: [] }
    ),
    function(error) { return error.statusCode === 409; }
  );
});
