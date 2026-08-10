const assert = require('node:assert/strict');
const test = require('node:test');

const migration = require('../scripts/migrateModelInputFields');

test('model input migration infers stable race identifiers', () => {
  assert.equal(migration.inferRaceNo({ name: 'Race 7 - Summer Mile' }), 7);
  assert.equal(migration.inferRaceNo({ name: 'Championship' }), 1);
  assert.equal(migration.inferVenueCode({ location: 'Happy Valley Racecourse' }), 'HV');
  assert.equal(migration.inferVenueCode({ location: 'Sha Tin Racecourse' }), 'ST');
  assert.equal(migration.normalizeRaceClass('4 (Restricted)'), '4');
  assert.equal(migration.normalizeRaceClass('4'), '4');
});
