const assert = require('node:assert/strict');
const test = require('node:test');

const dynamicOddsService = require('../services/dynamicOddsService');

const calculateStepOdds = dynamicOddsService._private.calculateStepOdds;

test('five distinct bettors lower the selected horse and raise the other horse once', () => {
  const odds = calculateStepOdds([
    { horse_id: 'horse-a', generated_game_odds: 1.8, game_odds: 1.8 },
    { horse_id: 'horse-b', generated_game_odds: 2.1, game_odds: 2.1 }
  ], {
    'horse-a': 0,
    'horse-b': 5
  });

  assert.deepEqual(odds, [
    { horse_id: 'horse-a', game_odds: 1.9, distinct_bettor_count: 0, adjustment_steps: 0 },
    { horse_id: 'horse-b', game_odds: 2, distinct_bettor_count: 5, adjustment_steps: 1 }
  ]);
});

test('bettors six through nine do not reapply the five-bettor adjustment', () => {
  for (const bettorCount of [6, 7, 8, 9]) {
    const odds = calculateStepOdds([
      { horse_id: 'horse-a', generated_game_odds: 1.8, game_odds: 9.9 },
      { horse_id: 'horse-b', generated_game_odds: 2.1, game_odds: 1.2 }
    ], { 'horse-b': bettorCount });

    assert.equal(odds[0].game_odds, 1.9);
    assert.equal(odds[1].game_odds, 2);
    assert.equal(odds[1].adjustment_steps, 1);
  }
});

test('ten distinct bettors apply exactly two steps', () => {
  const odds = calculateStepOdds([
    { horse_id: 'horse-a', generated_game_odds: 1.8, game_odds: 1.8 },
    { horse_id: 'horse-b', generated_game_odds: 2.1, game_odds: 2.1 }
  ], { 'horse-b': 10 });

  assert.equal(odds[0].game_odds, 2);
  assert.equal(odds[1].game_odds, 1.9);
  assert.equal(odds[1].adjustment_steps, 2);
});

test('admin opening odds are the baseline instead of generated AI odds', () => {
  const odds = calculateStepOdds([
    { horse_id: 'horse-a', generated_game_odds: 1.8, opening_game_odds: 1.7, game_odds: 1.7 },
    { horse_id: 'horse-b', generated_game_odds: 2.1, opening_game_odds: 2.3, game_odds: 2.3 }
  ], { 'horse-b': 5 });

  assert.equal(odds[0].game_odds, 1.8);
  assert.equal(odds[1].game_odds, 2.2);
});

test('a movement is divided equally between all other horses', () => {
  const odds = calculateStepOdds([
    { horse_id: 'horse-a', generated_game_odds: 2 },
    { horse_id: 'horse-b', generated_game_odds: 3 },
    { horse_id: 'horse-c', generated_game_odds: 4 }
  ], { 'horse-b': 5 });

  assert.deepEqual(odds.map((item) => item.game_odds), [2.05, 2.9, 4.05]);
});

test('dynamic odds never fall below the configured minimum', () => {
  const odds = calculateStepOdds([
    { horse_id: 'horse-a', generated_game_odds: 1.2 },
    { horse_id: 'horse-b', generated_game_odds: 3 }
  ], { 'horse-a': 100 });

  assert.equal(odds[0].game_odds, dynamicOddsService._private.MIN_GAME_ODDS);
});
