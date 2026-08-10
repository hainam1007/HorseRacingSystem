const assert = require('node:assert/strict');
const test = require('node:test');

const prizeService = require('../services/prizeService');

test('default race prize distribution covers top five positions', function() {
  const distribution = prizeService.normalizePrizeDistribution([], 100000000);

  assert.deepEqual(
    distribution.map(function(item) {
      return [item.position, item.percent];
    }),
    [
      [1, 60],
      [2, 20],
      [3, 11],
      [4, 6],
      [5, 3]
    ]
  );
});

test('custom prize distribution rejects duplicate positions', function() {
  assert.throws(function() {
    prizeService.normalizePrizeDistribution([
      { position: 1, percent: 50 },
      { position: 1, percent: 30 }
    ], 1000000);
  }, /unique/);
});

test('prize split keeps ninety percent for owner and ten percent for jockey', function() {
  assert.deepEqual(
    prizeService.splitPrizeAmount(1000000),
    {
      gross_amount: 1000000,
      owner_amount: 900000,
      jockey_amount: 100000
    }
  );
});
