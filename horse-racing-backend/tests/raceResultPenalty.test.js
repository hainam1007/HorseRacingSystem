const assert = require('node:assert/strict');
const test = require('node:test');

const raceResultService = require('../services/raceResultService');

function result(id, horseId, jockeyId, position, finishTime) {
  return {
    _id: id,
    horse_id: horseId,
    jockey_id: jockeyId,
    position: position,
    finish_time: finishTime,
    score: 100 - position * 10
  };
}

test('position demotion ranks all race participants together', function() {
  const results = [
    result('r1', 'h1', 'j1', 1, 60),
    result('r2', 'h2', 'j2', 2, 60.5),
    result('r3', 'h3', 'j3', 3, 61)
  ];
  const violations = [{
    _id: 'v1',
    horse_id: 'h1',
    jockey_id: 'j1',
    penalty: { position_delta: 2 }
  }];
  const updates = raceResultService.buildPenaltyUpdates(results, violations);
  const byId = new Map(updates.map(function(update) {
    return [update.result_id, update.data];
  }));

  assert.equal(byId.get('r2').final_position, 1);
  assert.equal(byId.get('r3').final_position, 2);
  assert.equal(byId.get('r1').final_position, 3);
});

test('disqualified participant receives no final position', function() {
  const results = [
    result('r1', 'h1', 'j1', 1, 60),
    result('r2', 'h2', 'j2', 2, 60.5),
    result('r3', 'h3', 'j3', 3, 61)
  ];
  const violations = [{
    _id: 'v1',
    horse_id: 'h2',
    jockey_id: 'j2',
    penalty: { disqualified: true }
  }];
  const updates = raceResultService.buildPenaltyUpdates(results, violations);
  const byId = new Map(updates.map(function(update) {
    return [update.result_id, update.data];
  }));

  assert.equal(byId.get('r1').final_position, 1);
  assert.equal(byId.get('r3').final_position, 2);
  assert.equal(byId.get('r2').final_position, null);
});
