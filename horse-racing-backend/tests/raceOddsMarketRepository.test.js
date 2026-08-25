const assert = require('node:assert/strict');
const test = require('node:test');

const raceOddsMarketRepository = require('../repositories/raceOddsMarketRepository');

test('odds persistence replaces child rows with the complete generated runner list', async function() {
  const calls = [];
  const RaceOddsMarketOdd = {
    destroy: async function(options) { calls.push({ action: 'destroy', options }); },
    bulkCreate: async function(rows, options) { calls.push({ action: 'create', rows, options }); }
  };

  await raceOddsMarketRepository._private.replaceOdds(
    RaceOddsMarketOdd,
    'market-1',
    [
      { _id: 'old-row-id', horse_id: 'horse-1', horse_name: 'Runner One' },
      { horse_id: 'horse-2', horse_name: 'Runner Two' }
    ],
    'transaction-1'
  );

  assert.deepEqual(calls[0], {
    action: 'destroy',
    options: { where: { odds_market_id: 'market-1' }, transaction: 'transaction-1' }
  });
  assert.equal(calls[1].action, 'create');
  assert.equal(calls[1].rows.length, 2);
  assert.equal(calls[1].rows[0].odds_market_id, 'market-1');
  assert.equal(calls[1].rows[0]._id, undefined);
});

test('market payload separates child odds from market columns', function() {
  const payload = raceOddsMarketRepository._private.splitMarketPayload({
    status: 'generated',
    odds: [{ horse_id: 'horse-1' }]
  });

  assert.deepEqual(payload.market, { status: 'generated' });
  assert.deepEqual(payload.odds, [{ horse_id: 'horse-1' }]);
});
