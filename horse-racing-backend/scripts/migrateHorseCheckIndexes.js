require('dotenv').config();

const mongoose = require('mongoose');
const { connectDatabase } = require('../config/database');
const { HorseCheck } = require('../models');

async function dropIndexIfExists(collection, indexName) {
  const indexes = await collection.indexes();
  const exists = indexes.some(function(index) {
    return index.name === indexName;
  });

  if (!exists) {
    return false;
  }

  await collection.dropIndex(indexName);
  return true;
}

(async function migrateHorseCheckIndexes() {
  try {
    await connectDatabase();

    const droppedLegacyIndex = await dropIndexIfExists(HorseCheck.collection, 'race_id_1_horse_id_1');

    await HorseCheck.collection.createIndex({
      race_id: 1,
      horse_id: 1,
      phase: 1
    });

    console.log(JSON.stringify({
      success: true,
      dropped_legacy_index: droppedLegacyIndex,
      ensured_index: 'race_id_1_horse_id_1_phase_1'
    }));
  } catch (error) {
    console.error(error && error.stack ? error.stack : error);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
})();
