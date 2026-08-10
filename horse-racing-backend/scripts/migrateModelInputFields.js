require('dotenv').config();

const mongoose = require('mongoose');
const { connectDatabase } = require('../config/database');
const { MODEL_INPUT_DEFAULTS } = require('../constants/raceModelInput');
const { Horse, Jockey, Race, RaceOddsMarket, Registration } = require('../models');

function inferVenueCode(race) {
  const value = String(race.venue_code || race.location || '').trim();
  if (/happy|valley|\bhv\b/i.test(value)) return 'HV';
  return 'ST';
}

function inferRaceNo(race) {
  const match = String(race.name || '').match(/\d+/);
  return match ? Math.max(1, Number(match[0])) : 1;
}

function normalizeRaceClass(value) {
  return value === '4 (Restricted)' ? '4' : value;
}

async function migrateRaces(dryRun) {
  const cursor = Race.collection.find({});
  const stats = { scanned: 0, updated: 0 };
  for await (const race of cursor) {
    stats.scanned += 1;
    const set = {};
    if (!race.race_no) set.race_no = inferRaceNo(race);
    if (!race.venue_code) set.venue_code = inferVenueCode(race);
    if (!race.course) set.course = MODEL_INPUT_DEFAULTS.COURSE;
    if (!race.race_class) set.race_class = MODEL_INPUT_DEFAULTS.RACE_CLASS;
    else if (normalizeRaceClass(race.race_class) !== race.race_class) {
      set.race_class = normalizeRaceClass(race.race_class);
    }
    if (!race.going) set.going = MODEL_INPUT_DEFAULTS.GOING;
    if (!race.surface) set.surface = MODEL_INPUT_DEFAULTS.SURFACE;
    if (race.model_input_version === undefined) set.model_input_version = 0;
    if (Object.keys(set).length) {
      if (!dryRun) await Race.collection.updateOne({ _id: race._id }, { $set: set });
      stats.updated += 1;
    }
  }
  return stats;
}

async function migrateHorses(dryRun) {
  const filter = {
    $or: [
      { current_rating: { $exists: false } },
      { default_gears: { $exists: false } }
    ]
  };
  const stats = { matched: await Horse.collection.countDocuments(filter) };
  if (!dryRun && stats.matched) {
    const result = await Horse.collection.updateMany(filter, [
      {
        $set: {
          current_rating: { $ifNull: ['$current_rating', MODEL_INPUT_DEFAULTS.HORSE_RATING] },
          default_gears: { $ifNull: ['$default_gears', []] }
        }
      }
    ]);
    stats.updated = result.modifiedCount;
  } else {
    stats.updated = 0;
  }
  return stats;
}

async function migrateJockeys(dryRun) {
  const cursor = Jockey.collection.find({ weight_kg: { $exists: false } });
  const stats = { scanned: 0, updated: 0 };
  for await (const jockey of cursor) {
    stats.scanned += 1;
    const legacyWeight = Number(jockey.weight);
    if (!Number.isFinite(legacyWeight) || legacyWeight < 30 || legacyWeight > 100) continue;
    if (!dryRun) await Jockey.collection.updateOne({ _id: jockey._id }, { $set: { weight_kg: legacyWeight } });
    stats.updated += 1;
  }
  return stats;
}

async function migrateRegistrations(dryRun) {
  const cursor = Registration.collection.find({});
  const stats = { scanned: 0, updated: 0 };
  for await (const registration of cursor) {
    stats.scanned += 1;
    const set = {};
    if (!Array.isArray(registration.gears)) set.gears = [];
    if (registration.declared_weight_kg === undefined) {
      set.declared_weight_kg = MODEL_INPUT_DEFAULTS.DECLARED_WEIGHT_KG;
    }
    if (Object.keys(set).length) {
      if (!dryRun) await Registration.collection.updateOne({ _id: registration._id }, { $set: set });
      stats.updated += 1;
    }
  }
  return stats;
}

async function staleLegacyOdds(dryRun) {
  const filter = { status: 'generated', model_input_version: { $exists: false } };
  const matched = await RaceOddsMarket.collection.countDocuments(filter);
  if (!dryRun && matched) {
    await RaceOddsMarket.collection.updateMany(filter, {
      $set: {
        status: 'stale',
        model_input_version: 0,
        input_snapshot: { migration_note: 'Regenerate after race entries are finalized' }
      }
    });
  }
  return { matched: matched, updated: dryRun ? 0 : matched };
}

async function run() {
  const dryRun = process.argv.includes('--dry-run');
  try {
    await connectDatabase();
    const result = {
      races: await migrateRaces(dryRun),
      horses: await migrateHorses(dryRun),
      jockeys: await migrateJockeys(dryRun),
      registrations: await migrateRegistrations(dryRun),
      odds_markets: await staleLegacyOdds(dryRun)
    };
    console.log('Model input migration completed', { dry_run: dryRun, result: result });
  } finally {
    await mongoose.disconnect();
  }
}

if (require.main === module) {
  run().catch(function(error) {
    console.error('Model input migration failed:', error);
    process.exitCode = 1;
  });
}

module.exports = {
  inferRaceNo,
  inferVenueCode,
  normalizeRaceClass,
  migrateHorses,
  migrateJockeys,
  migrateRaces,
  migrateRegistrations,
  staleLegacyOdds
};
