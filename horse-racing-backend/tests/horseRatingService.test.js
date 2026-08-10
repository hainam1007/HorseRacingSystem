const assert = require('node:assert/strict');
const test = require('node:test');

const horseRatingService = require('../services/horseRatingService');

test('calculateRatingChanges produces balanced deltas for equal-rated runners', () => {
  const entries = [1, 2, 3, 4, 5, 6].map(function(position) {
    return {
      horse_id: `horse-${position}`,
      rating: 50,
      raw_position: position
    };
  });

  const changes = horseRatingService.calculateRatingChanges(entries, '3');

  assert.deepEqual(changes.map(function(change) { return change.rating_delta; }), [4, 2, 1, -1, -2, -4]);
  assert.equal(changes.reduce(function(total, change) { return total + change.rating_delta; }, 0), 0);
});

test('calculateRatingChanges rewards an upset winner more than a favorite winner', () => {
  const upset = horseRatingService.calculateRatingChanges([
    { horse_id: 'outsider', rating: 40, raw_position: 1 },
    { horse_id: 'favorite', rating: 70, raw_position: 2 }
  ], '1');
  const expected = horseRatingService.calculateRatingChanges([
    { horse_id: 'favorite', rating: 70, raw_position: 1 },
    { horse_id: 'outsider', rating: 40, raw_position: 2 }
  ], '1');

  assert.ok(upset[0].rating_delta > expected[0].rating_delta);
  assert.ok(upset[0].rating_delta <= 8);
});
