const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

test('race result correction endpoints are routed and validated', function() {
  const routes = read('routes/raceResults.js');

  assert.match(routes, /\/races\/:raceId\/request-correction/);
  assert.match(routes, /\/races\/:raceId\/resolve-correction/);
  assert.match(routes, /validateRequestCorrection/);
  assert.match(routes, /adminOnly/);
  assert.match(routes, /const refereeOnly = authorizeRoles\(ROLE_NAMES\.RACE_REFEREE\)/);
  assert.match(routes, /router\.patch\('\/:id', refereeOnly/);
});

test('race result correction request is persisted and blocks confirmation', function() {
  const model = read('models/RaceResult.js');
  const service = read('services/raceResultService.js');

  assert.match(model, /correction_requested/);
  assert.match(model, /correction_note/);
  assert.match(model, /correction_requested_by/);
  assert.match(model, /correction_resolved_by/);
  assert.match(model, /penalties_applied_at/);
  assert.match(model, /submitted_to_admin_at/);
  assert.match(service, /async function requestRaceCorrection/);
  assert.match(service, /async function resolveRaceCorrection/);
  assert.match(service, /Race result correction must be resolved before confirmation/);
  assert.match(service, /Confirmed penalties changed or have not been applied/);
  assert.match(service, /status:\s*RACE_RESULT_STATUS\.DRAFT/);
});
