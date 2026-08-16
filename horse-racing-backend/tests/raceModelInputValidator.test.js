const assert = require('node:assert/strict');
const test = require('node:test');

const { validateUpdateJockey } = require('../validators/jockeyValidator');
const { validateAdminRaceEntry } = require('../validators/raceEntryValidator');
const { validateCreateRace } = require('../validators/raceValidator');

function runValidator(validator, body) {
  const req = { body: body, params: {} };
  let error;
  validator(req, {}, function(nextError) { error = nextError; });
  return { error: error, payload: req.validatedBody };
}

test('race validator accepts supported probability model fields', () => {
  const result = runValidator(validateCreateRace, {
    tournament_id: '507f1f77-bcf8-4cd7-9943-901100000001',
    round_id: '507f1f77-bcf8-4cd7-9943-901100000002',
    name: 'Race 1',
    race_no: 1,
    venue_code: 'st',
    course: 'B+2',
    race_class: '5',
    going: 'Good',
    surface: 'Turf'
  });

  assert.equal(result.error, undefined);
  assert.equal(result.payload.venue_code, 'ST');
  assert.equal(result.payload.race_class, '5');
});

test('race validator rejects the unsupported restricted class label', () => {
  const result = runValidator(validateCreateRace, {
    tournament_id: '507f1f77-bcf8-4cd7-9943-901100000001',
    round_id: '507f1f77-bcf8-4cd7-9943-901100000002',
    name: 'Restricted Race',
    race_class: '4 (Restricted)'
  });

  assert.equal(result.error.statusCode, 400);
  assert.ok(result.error.details.some(function(item) { return item.field === 'race_class'; }));
});

test('race validator accepts an uploaded image data URI and rejects non-image data', () => {
  const valid = runValidator(validateCreateRace, {
    tournament_id: '507f1f77-bcf8-4cd7-9943-901100000001',
    round_id: '507f1f77-bcf8-4cd7-9943-901100000002',
    name: 'Image race',
    image_file_data: 'data:image/png;base64,aGVsbG8='
  });
  const invalid = runValidator(validateCreateRace, {
    tournament_id: '507f1f77-bcf8-4cd7-9943-901100000001',
    round_id: '507f1f77-bcf8-4cd7-9943-901100000002',
    name: 'Invalid image race',
    image_file_data: 'data:text/plain;base64,aGVsbG8='
  });

  assert.equal(valid.error, undefined);
  assert.equal(valid.payload.image_file_data, 'data:image/png;base64,aGVsbG8=');
  assert.equal(invalid.error.statusCode, 400);
  assert.ok(invalid.error.details.some(function(item) { return item.field === 'image_file_data'; }));
});

test('race entry validator rejects unknown gear codes and unsafe carried weight', () => {
  const result = runValidator(validateAdminRaceEntry, {
    declared_weight_kg: 90,
    gears: ['B', 'UNKNOWN']
  });

  assert.equal(result.error.statusCode, 400);
  assert.ok(result.error.details.some(function(item) { return item.field === 'declared_weight_kg'; }));
  assert.ok(result.error.details.some(function(item) { return item.field === 'gears'; }));
});

test('jockey profile validator only accepts weight_kg in the supported range', () => {
  const invalid = runValidator(validateUpdateJockey, { weight_kg: 20 });
  const valid = runValidator(validateUpdateJockey, { weight_kg: 54.2 });

  assert.equal(invalid.error.statusCode, 400);
  assert.equal(valid.error, undefined);
  assert.equal(valid.payload.weight_kg, 54.2);
});
