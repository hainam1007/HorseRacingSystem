const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const { JockeyAssignment, Race, Registration } = require('../models');

const rootDir = path.resolve(__dirname, '..');

function readProjectFile(relativePath) {
  return fs.readFileSync(path.join(rootDir, relativePath), 'utf8');
}

test('race registration schemas track reserved places and refund review', () => {
  const racePaths = Race.schema.paths;
  const registrationPaths = Registration.schema.paths;

  assert.ok(racePaths.registration_slot_count);
  assert.ok(racePaths.registration_slots_initialized);
  assert.ok(registrationPaths.slot_reserved);
  assert.ok(registrationPaths.slot_reserved_at);
  assert.ok(registrationPaths.slot_released_at);
  assert.ok(registrationPaths.payment_status.enumValues.includes('refund_pending'));
});

test('slot reservation uses an atomic race capacity condition', () => {
  const source = readProjectFile('services/registrationSlotService.js');

  assert.match(source, /Race\.findOneAndUpdate/);
  assert.match(source, /\$lt/);
  assert.match(source, /registration_slot_count/);
  assert.match(source, /\$inc:\s*\{\s*registration_slot_count:\s*1/);
  assert.match(source, /releaseExpiredReservations/);
  assert.match(source, /slot_reserved:\s*true/);
});

test('jockey invitations require an eligible paid entry and a pre-race appointment', () => {
  const source = readProjectFile('services/jockeyAssignmentService.js');

  assert.match(source, /status:\s*REGISTRATION_STATUS\.APPROVED/);
  assert.match(source, /payment_status:\s*\{\s*\$in:\s*\['paid', 'not_required'\]/);
  assert.match(source, /The appointment must take place before the race starts/);
  assert.match(source, /existingPrimary\.status !== ASSIGNMENT_STATUS\.ACCEPTED/);
  assert.match(source, /ASSIGNMENT_CANCELLATION_STATUS\.PENDING/);
});

test('only one confirmed horse is allowed per jockey and race', () => {
  const bindingIndex = JockeyAssignment.schema.indexes().find(([, options]) => {
    return options.name === 'one_confirmed_horse_per_jockey_race';
  });

  assert.ok(bindingIndex);
  assert.equal(bindingIndex[1].unique, true);
  assert.deepEqual(bindingIndex[1].partialFilterExpression.status.$in, [
    'accepted',
    'standby_confirmed'
  ]);
});

test('migration initializes old reservations and rejects binding conflicts', () => {
  const source = readProjectFile('scripts/migrateRegistrationSlotsAndJockeyBindings.js');

  assert.match(source, /registration_slot_count:\s*activeCount/);
  assert.match(source, /registration_slots_initialized:\s*true/);
  assert.match(source, /Jockey binding conflicts found/);
  assert.match(source, /JockeyAssignment\.createIndexes/);
});
