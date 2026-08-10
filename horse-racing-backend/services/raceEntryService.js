const ApiError = require('../utils/ApiError');
const { MODEL_INPUT_DEFAULTS } = require('../constants/raceModelInput');
const { REGISTRATION_STATUS } = require('../constants/statuses');
const raceEntryRepository = require('../repositories/raceEntryRepository');
const raceRepository = require('../repositories/raceRepository');
const modelInputLifecycleService = require('./modelInputLifecycleService');

function idString(value) {
  const id = value && (value._id || value);
  return id ? id.toString() : '';
}

function raceMissingFields(race) {
  const fields = ['race_date', 'distance', 'race_no', 'venue_code', 'course', 'race_class', 'going', 'surface'];
  return fields.filter(function(field) { return race[field] === undefined || race[field] === null || race[field] === ''; });
}

async function loadEntryContext(raceId) {
  const race = await raceRepository.findById(raceId);
  if (!race) throw new ApiError(404, 'Race not found');
  const registrations = await raceEntryRepository.findByRaceId(raceId, { status: REGISTRATION_STATUS.APPROVED });
  const horseIds = registrations.map(function(entry) { return entry.horse_id && entry.horse_id._id; }).filter(Boolean);
  const assignments = horseIds.length
    ? await raceEntryRepository.findAcceptedPrimaryAssignments(raceId, horseIds)
    : [];
  const assignmentByHorse = new Map(assignments.map(function(item) { return [idString(item.horse_id), item]; }));
  return { race, registrations, assignmentByHorse };
}

async function getModelInputReadiness(raceId) {
  const context = await loadEntryContext(raceId);
  const participants = context.registrations.map(function(entry) {
    const horse = entry.horse_id;
    const assignment = context.assignmentByHorse.get(idString(horse));
    const jockey = assignment && assignment.jockey_id;
    const missingFields = [];
    if (!entry.horse_no) missingFields.push('horse_no');
    if (!entry.draw) missingFields.push('draw');
    if (entry.rating_snapshot === undefined || entry.rating_snapshot === null) missingFields.push('rating_snapshot');
    if (entry.declared_weight_kg === undefined || entry.declared_weight_kg === null) missingFields.push('declared_weight_kg');
    if (!Array.isArray(entry.gears)) missingFields.push('gears');
    if (!assignment) missingFields.push('accepted_primary_jockey');
    return {
      registration_id: entry._id,
      horse_id: horse && horse._id,
      horse_name: horse && horse.name,
      current_rating: Number((horse && horse.current_rating) ?? MODEL_INPUT_DEFAULTS.HORSE_RATING),
      default_gears: (horse && horse.default_gears) || [],
      primary_jockey: jockey ? {
        jockey_id: jockey._id,
        name: jockey.user_id && (jockey.user_id.full_name || jockey.user_id.email),
        license_number: jockey.license_number
      } : null,
      horse_no: entry.horse_no,
      draw: entry.draw,
      rating_snapshot: entry.rating_snapshot,
      declared_weight_kg: entry.declared_weight_kg,
      gears: entry.gears || [],
      missing_fields: missingFields,
      ready: missingFields.length === 0
    };
  });
  const missingRaceFields = raceMissingFields(context.race);
  const entriesFinalized = Boolean(context.race.entries_finalized_at);
  const ready = entriesFinalized
    && participants.length >= 2
    && missingRaceFields.length === 0
    && participants.every(function(item) { return item.ready; });
  return {
    race_id: context.race._id,
    entries_finalized: entriesFinalized,
    model_input_version: context.race.model_input_version || 0,
    missing_race_fields: missingRaceFields,
    participant_count: participants.length,
    participants: participants,
    ready: ready
  };
}

async function assignDrawsByRegistrationOrder(raceId) {
  const context = await loadEntryContext(raceId);

  if (context.registrations.length < 2) {
    throw new ApiError(400, 'At least two approved race registrations are required to generate odds');
  }
  const maxParticipants = Number(context.race.max_participants || 0);
  if (maxParticipants > 0 && context.registrations.length > maxParticipants) {
    throw new ApiError(409, 'Approved registrations exceed the race participant capacity');
  }

  const operations = [
    {
      updateMany: {
        filter: {
          race_id: raceId,
          status: REGISTRATION_STATUS.APPROVED
        },
        update: { $unset: { draw: 1 } }
      }
    }
  ].concat(context.registrations.map(function(entry, index) {
    return {
      updateOne: {
        filter: { _id: entry._id },
        update: { $set: { draw: index + 1 } }
      }
    };
  }));

  await raceEntryRepository.bulkWrite(operations);

  return {
    race_id: raceId,
    participant_count: context.registrations.length,
    assignments: context.registrations.map(function(entry, index) {
      return {
        registration_id: entry._id,
        horse_id: entry.horse_id && entry.horse_id._id,
        draw: index + 1
      };
    })
  };
}

async function finalizeEntries(adminUserId, raceId) {
  const context = await loadEntryContext(raceId);
  if (String(context.race.status || '').toLowerCase() !== 'scheduled') throw new ApiError(409, 'Only scheduled races can finalize entries');
  if (context.registrations.length < 2) throw new ApiError(400, 'At least two approved registrations are required');
  const missingJockeyEntries = context.registrations.filter(function(entry) {
    return !context.assignmentByHorse.has(idString(entry.horse_id));
  });
  if (missingJockeyEntries.length) {
    throw new ApiError(409, 'Every entry requires an accepted primary jockey', {
      registration_ids: missingJockeyEntries.map(function(entry) { return entry._id; })
    });
  }

  if (context.race.entries_finalized_at) return {
    race: context.race,
    entries: context.registrations,
    readiness: await getModelInputReadiness(raceId),
    already_finalized: true
  };

  await modelInputLifecycleService.prepareModelInputMutation(raceId);
  const finalizedAt = new Date();
  const operations = context.registrations.map(function(entry, index) {
    const horse = entry.horse_id || {};
    return {
      updateOne: {
        filter: { _id: entry._id },
        update: {
          $set: {
            horse_no: index + 1,
            draw: index + 1,
            rating_snapshot: horse.current_rating ?? MODEL_INPUT_DEFAULTS.HORSE_RATING,
            gears: entry.gears && entry.gears.length ? entry.gears : (horse.default_gears || []),
            declared_weight_kg: entry.declared_weight_kg ?? MODEL_INPUT_DEFAULTS.DECLARED_WEIGHT_KG,
            entry_finalized_at: finalizedAt,
            entry_finalized_by: adminUserId
          }
        }
      }
    };
  });
  await raceEntryRepository.bulkWrite(operations);
  const race = await raceRepository.updateById(raceId, {
    $set: { entries_finalized_at: finalizedAt, entries_finalized_by: adminUserId },
    $inc: { model_input_version: 1 }
  });
  return {
    race: race,
    entries: await raceEntryRepository.findByRaceId(raceId, { status: REGISTRATION_STATUS.APPROVED }),
    readiness: await getModelInputReadiness(raceId),
    already_finalized: false
  };
}

async function updateRaceEntry(adminUserId, registrationId, payload) {
  const entry = await raceEntryRepository.findById(registrationId);
  if (!entry) throw new ApiError(404, 'Race registration not found');
  const raceId = entry.race_id && (entry.race_id._id || entry.race_id);
  await modelInputLifecycleService.prepareModelInputMutation(raceId);
  for (const field of ['horse_no', 'draw']) {
    if (payload[field] !== undefined) {
      const duplicate = await raceEntryRepository.findDuplicate(raceId, entry._id, field, payload[field]);
      if (duplicate) throw new ApiError(409, field + ' is already assigned in this race');
    }
  }
  const updatedEntry = await raceEntryRepository.updateById(entry._id, {
    $set: Object.assign({}, payload, {
      entry_finalized_at: entry.entry_finalized_at || new Date(),
      entry_finalized_by: adminUserId
    })
  });
  await raceRepository.updateById(raceId, { $inc: { model_input_version: 1 } });
  return { registration: updatedEntry, readiness: await getModelInputReadiness(raceId) };
}

module.exports = {
  assignDrawsByRegistrationOrder,
  finalizeEntries,
  getModelInputReadiness,
  updateRaceEntry
};
