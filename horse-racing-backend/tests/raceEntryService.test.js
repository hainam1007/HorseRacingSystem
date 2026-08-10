const assert = require('node:assert/strict');
const test = require('node:test');

const modelInputLifecycleService = require('../services/modelInputLifecycleService');
const raceEntryRepository = require('../repositories/raceEntryRepository');
const raceRepository = require('../repositories/raceRepository');
const raceEntryService = require('../services/raceEntryService');

const originals = {
  bulkWrite: raceEntryRepository.bulkWrite,
  findAcceptedPrimaryAssignments: raceEntryRepository.findAcceptedPrimaryAssignments,
  findByRaceId: raceEntryRepository.findByRaceId,
  findRaceById: raceRepository.findById,
  prepareModelInputMutation: modelInputLifecycleService.prepareModelInputMutation,
  updateRaceById: raceRepository.updateById
};

test.afterEach(() => {
  raceEntryRepository.bulkWrite = originals.bulkWrite;
  raceEntryRepository.findAcceptedPrimaryAssignments = originals.findAcceptedPrimaryAssignments;
  raceEntryRepository.findByRaceId = originals.findByRaceId;
  raceRepository.findById = originals.findRaceById;
  modelInputLifecycleService.prepareModelInputMutation = originals.prepareModelInputMutation;
  raceRepository.updateById = originals.updateRaceById;
});

function readyContext() {
  const horses = [
    { _id: 'horse-1', name: 'Northern Dancer', current_rating: 55, default_gears: ['B'] },
    { _id: 'horse-2', name: 'Sea Bird', current_rating: 49, default_gears: ['TT'] }
  ];
  const registrations = horses.map(function(horse, index) {
    return {
      _id: `registration-${index + 1}`,
      horse_id: horse,
      horse_no: index + 1,
      draw: index + 1,
      rating_snapshot: horse.current_rating,
      declared_weight_kg: 54.5,
      gears: horse.default_gears
    };
  });
  const assignments = horses.map(function(horse, index) {
    return {
      horse_id: horse._id,
      jockey_id: { _id: `jockey-${index + 1}`, user_id: { full_name: `Jockey ${index + 1}` } }
    };
  });
  return { horses, registrations, assignments };
}

test('model input is not ready until admin finalizes entries', async () => {
  const context = readyContext();
  raceRepository.findById = async () => ({
    _id: 'race-1', race_date: new Date(), distance: 1200, race_no: 1, venue_code: 'ST',
    course: 'B+2', race_class: '5', going: 'Good', surface: 'Turf', model_input_version: 0
  });
  raceEntryRepository.findByRaceId = async () => context.registrations;
  raceEntryRepository.findAcceptedPrimaryAssignments = async () => context.assignments;

  const result = await raceEntryService.getModelInputReadiness('race-1');

  assert.equal(result.entries_finalized, false);
  assert.equal(result.participants.every(function(item) { return item.ready; }), true);
  assert.equal(result.ready, false);
});

test('odds preparation assigns draws by approved registration order', async () => {
  const context = readyContext();
  let operations;

  context.registrations[0].registered_at = new Date('2026-07-27T08:00:00.000Z');
  context.registrations[1].registered_at = new Date('2026-07-27T08:01:00.000Z');
  raceRepository.findById = async () => ({ _id: 'race-1', status: 'scheduled' });
  raceEntryRepository.findByRaceId = async () => context.registrations;
  raceEntryRepository.findAcceptedPrimaryAssignments = async () => context.assignments;
  raceEntryRepository.bulkWrite = async (nextOperations) => {
    operations = nextOperations;
  };

  const result = await raceEntryService.assignDrawsByRegistrationOrder('race-1');

  assert.deepEqual(result.assignments.map(function(item) { return item.draw; }), [1, 2]);
  assert.equal(result.assignments[0].registration_id, 'registration-1');
  assert.equal(result.assignments[1].registration_id, 'registration-2');
  assert.deepEqual(operations[0], {
    updateMany: {
      filter: { race_id: 'race-1', status: 'approved' },
      update: { $unset: { draw: 1 } }
    }
  });
  assert.equal(operations[1].updateOne.update.$set.draw, 1);
  assert.equal(operations[2].updateOne.update.$set.draw, 2);
});

test('finalize assigns snapshots and registration-order draws then reports ready', async () => {
  const context = readyContext();
  context.registrations.forEach(function(entry) {
    delete entry.horse_no;
    delete entry.draw;
    delete entry.rating_snapshot;
    entry.gears = [];
  });
  const race = {
    _id: 'race-1', status: 'scheduled', race_date: new Date(), distance: 1200, race_no: 1,
    venue_code: 'ST', course: 'B+2', race_class: '5', going: 'Good', surface: 'Turf', model_input_version: 0
  };
  raceRepository.findById = async () => race;
  raceEntryRepository.findByRaceId = async () => context.registrations;
  raceEntryRepository.findAcceptedPrimaryAssignments = async () => context.assignments;
  modelInputLifecycleService.prepareModelInputMutation = async () => ({ stale: false });
  raceEntryRepository.bulkWrite = async (operations) => {
    operations.forEach(function(operation) {
      const entry = context.registrations.find(function(item) { return item._id === operation.updateOne.filter._id; });
      Object.assign(entry, operation.updateOne.update.$set);
    });
  };
  raceRepository.updateById = async (id, update) => {
    Object.assign(race, update.$set);
    race.model_input_version += update.$inc.model_input_version;
    return race;
  };

  const result = await raceEntryService.finalizeEntries('admin-1', 'race-1');
  const draws = result.entries.map(function(entry) { return entry.draw; });

  assert.equal(result.readiness.ready, true);
  assert.deepEqual(draws, [1, 2]);
  assert.deepEqual(result.entries.map(function(entry) { return entry.rating_snapshot; }), [55, 49]);
  assert.deepEqual(result.entries.map(function(entry) { return entry.declared_weight_kg; }), [54.5, 54.5]);
});
