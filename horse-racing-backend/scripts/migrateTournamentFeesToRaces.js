require('dotenv').config();

const mongoose = require('mongoose');
const { connectDatabase } = require('../config/database');

async function migrateTournamentFeesToRaces(dryRun) {
  const tournaments = mongoose.connection.collection('tournaments');
  const races = mongoose.connection.collection('races');
  const cursor = tournaments.find({
    $or: [
      { entry_fee: { $exists: true } },
      { entry_fee_currency: { $exists: true } }
    ]
  });
  const stats = {
    tournaments_scanned: 0,
    races_matched: 0,
    races_updated: 0,
    tournaments_cleaned: 0
  };

  for await (const tournament of cursor) {
    stats.tournaments_scanned += 1;
    const entryFee = Math.max(0, Number(tournament.entry_fee || 0));
    const currency = String(tournament.entry_fee_currency || 'VND').trim().toUpperCase();
    const raceFilter = {
      tournament_id: tournament._id,
      $or: [
        { entry_fee: { $exists: false } },
        { entry_fee: null }
      ]
    };
    const raceCount = await races.countDocuments(raceFilter);

    stats.races_matched += raceCount;

    if (!dryRun && raceCount) {
      const result = await races.updateMany(raceFilter, {
        $set: {
          entry_fee: entryFee,
          entry_fee_currency: currency
        }
      });
      stats.races_updated += result.modifiedCount;
    }

    if (!dryRun) {
      await tournaments.updateOne(
        { _id: tournament._id },
        { $unset: { entry_fee: '', entry_fee_currency: '' } }
      );
      stats.tournaments_cleaned += 1;
    }
  }

  return stats;
}

async function run() {
  const dryRun = process.argv.includes('--dry-run');

  try {
    await connectDatabase();
    const result = await migrateTournamentFeesToRaces(dryRun);
    console.log('Tournament fee migration completed', {
      dry_run: dryRun,
      result: result
    });
  } finally {
    await mongoose.disconnect();
  }
}

if (require.main === module) {
  run().catch(function(error) {
    console.error('Tournament fee migration failed:', error);
    process.exitCode = 1;
  });
}

module.exports = {
  migrateTournamentFeesToRaces
};
