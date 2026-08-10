const assert = require('node:assert/strict');
const test = require('node:test');

const migration = require('../scripts/migrateViolationResults');

test('legacy penalty type is normalized and preserved', function() {
  const mapped = migration.mapLegacyPenalty('Position Demotion');

  assert.equal(mapped.recognized, true);
  assert.equal(mapped.penalty.type, 'position_demotion');
});

test('legacy disqualification remains disqualification', function() {
  const mapped = migration.mapLegacyPenalty('disqualification');

  assert.equal(mapped.penalty.type, 'disqualification');
  assert.equal(mapped.penalty.disqualified, true);
});

test('unknown legacy penalty requires review without becoming warning', function() {
  const mapped = migration.mapLegacyPenalty('special steward decision');

  assert.equal(mapped.recognized, false);
  assert.equal(mapped.status, 'under_review');
  assert.equal(mapped.penalty.type, undefined);
  assert.match(mapped.penalty.note, /special steward decision/);
});
