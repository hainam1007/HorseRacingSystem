const assert = require('node:assert/strict');
const test = require('node:test');

const { validateDemoTimeline } = require('../validators/raceValidator');

function runValidation(body) {
  const req = { body };
  let receivedError;
  validateDemoTimeline(req, {}, function(error) {
    receivedError = error;
  });
  return { req, error: receivedError };
}

test('demo timeline validator accepts a future registration deadline before the race', function() {
  const result = runValidation({
    registration_lock_at: new Date(Date.now() + 20 * 60 * 1000).toISOString(),
    race_date: new Date(Date.now() + 90 * 60 * 1000).toISOString()
  });

  assert.equal(result.error, undefined);
  assert.ok(result.req.validatedBody.race_date instanceof Date);
  assert.ok(result.req.validatedBody.registration_lock_at instanceof Date);
});

test('demo timeline validator rejects a deadline that is not before the race', function() {
  const result = runValidation({
    registration_lock_at: new Date(Date.now() + 90 * 60 * 1000).toISOString(),
    race_date: new Date(Date.now() + 20 * 60 * 1000).toISOString()
  });

  assert.equal(result.error.statusCode, 400);
  assert.match(result.error.message, /Validation failed/);
});
