const assert = require('node:assert/strict');
const test = require('node:test');

const probabilityFeatureBuilderService = require('../services/probabilityFeatureBuilderService');

test('kilogramsToPounds converts app weight to the model unit', () => {
  assert.equal(probabilityFeatureBuilderService._private.kilogramsToPounds(54.5), 120.15);
  assert.equal(probabilityFeatureBuilderService._private.kilogramsToPounds(50), 110.23);
});

test('feature input preserves ids and display names from Sequelize associations', () => {
  const entry = probabilityFeatureBuilderService._private.buildFeatureEntry({
    race: { race_date: new Date('2026-08-22T00:00:00.000Z'), distance: 1200, venue_code: 'ST', race_no: 1, going: 'Good', course: 'B+2', race_class: '5', surface: 'Turf' },
    registration: {
      horse_no: 6,
      draw: 6,
      rating_snapshot: 50,
      declared_weight_kg: 54.5,
      gears: [],
      horse: { id: 'horse-dead', name: 'DEADHORSE', current_rating: 50 },
      owner: { id: 'owner-1', stable_name: 'Demo Stable' }
    },
    assignment: {
      jockey: { id: 'jockey-alpha', license_number: 'JOC-VN-2026-001', user: { full_name: 'Jockey Alpha' } }
    },
    currentRaceDate: new Date('2026-08-22T00:00:00.000Z'),
    pastResults: [],
    index: 5
  });

  assert.equal(entry.participant.horse_id, 'horse-dead');
  assert.equal(entry.participant.jockey_id, 'jockey-alpha');
  assert.equal(entry.participant.horse_name, 'DEADHORSE');
  assert.equal(entry.participant.jockey_name, 'Jockey Alpha');
  assert.equal(entry.horsePayload.horse_id, 'horse-dead');
});
