require('dotenv').config();

const mongoose = require('mongoose');
const { connectDatabase } = require('../config/database');
const { Race, RaceEngineRun } = require('../models');

const LOCK_OFFSET_MS = 3 * 60 * 60 * 1000;

(async function migrateRaceEngine() {
  try {
    await connectDatabase();

    const races = await Race.find({
      race_date: {
        $exists: true,
        $ne: null
      },
      $or: [
        {
          registration_lock_at: {
            $exists: false
          }
        },
        {
          registration_lock_at: null
        }
      ]
    });

    await Promise.all(races.map(function(race) {
      return Race.findByIdAndUpdate(race._id, {
        registration_lock_at: new Date(new Date(race.race_date).getTime() - LOCK_OFFSET_MS),
        registration_locked: race.registration_locked || false
      });
    }));

    await Race.collection.createIndex({ registration_locked: 1, registration_lock_at: 1 });
    await RaceEngineRun.collection.createIndex({ race_id: 1 }, { unique: true });
    await RaceEngineRun.collection.createIndex({ engine_run_id: 1 }, { unique: true });

    console.log(JSON.stringify({
      success: true,
      races_backfilled: races.length,
      ensured_indexes: [
        'races.registration_locked_1_registration_lock_at_1',
        'race_engine_runs.race_id_1',
        'race_engine_runs.engine_run_id_1'
      ]
    }));
  } catch (error) {
    console.error(error && error.stack ? error.stack : error);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
})();
