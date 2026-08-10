require('dotenv').config();

const mongoose = require('mongoose');
const { connectDatabase } = require('../config/database');
const Jockey = require('../models/Jockey');
const RaceResult = require('../models/RaceResult');
const Violation = require('../models/Violation');

const KNOWN_PENALTY_TYPES = new Set([
  'warning',
  'score_deduction',
  'time_penalty',
  'position_demotion',
  'disqualification',
  'suspension',
  'fine'
]);

function normalizePenaltyType(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_');
}

function mapLegacyPenalty(value) {
  const normalizedType = normalizePenaltyType(value);

  if (!KNOWN_PENALTY_TYPES.has(normalizedType)) {
    return {
      recognized: false,
      penalty: {
        note: 'Legacy penalty requiring review: ' + value
      },
      status: 'under_review'
    };
  }

  return {
    recognized: true,
    penalty: {
      type: normalizedType,
      disqualified: normalizedType === 'disqualification',
      note: String(value)
    }
  };
}

async function migrateViolations(dryRun) {
  const cursor = Violation.collection.find({});
  const stats = { scanned: 0, updated: 0, requires_review: 0 };

  for await (const violation of cursor) {
    stats.scanned += 1;
    const update = {};

    if (typeof violation.penalty === 'string') {
      const mappedPenalty = mapLegacyPenalty(violation.penalty);

      update.penalty = mappedPenalty.penalty;

      if (!mappedPenalty.recognized) {
        update.status = mappedPenalty.status;
        stats.requires_review += 1;
      }
    }

    if ((!violation.evidence_files || !violation.evidence_files.length) && violation.evidence_urls?.length) {
      update.evidence_files = violation.evidence_urls.map(function(url) {
        return { url: url };
      });
    }

    if (Object.keys(update).length) {
      if (!dryRun) {
        await Violation.collection.updateOne({ _id: violation._id }, { $set: update });
      }

      stats.updated += 1;
    }
  }

  return stats;
}

async function migrateRaceResults(dryRun) {
  const cursor = RaceResult.collection.find({});
  const stats = { scanned: 0, updated: 0 };

  for await (const result of cursor) {
    stats.scanned += 1;
    const update = {};

    if (result.raw_position === undefined) update.raw_position = result.position;
    if (result.raw_finish_time === undefined) update.raw_finish_time = result.finish_time;
    if (result.raw_score === undefined) update.raw_score = result.score;
    if (result.final_position === undefined) update.final_position = result.position;
    if (result.final_finish_time === undefined) update.final_finish_time = result.finish_time;
    if (result.final_score === undefined) update.final_score = result.score;
    if (!Array.isArray(result.applied_violation_ids)) update.applied_violation_ids = [];

    if (Object.keys(update).length) {
      if (!dryRun) {
        await RaceResult.collection.updateOne({ _id: result._id }, { $set: update });
      }

      stats.updated += 1;
    }
  }

  return stats;
}

async function migrateJockeys(dryRun) {
  const fineFilter = { outstanding_fine_amount: { $exists: false } };
  const statusFilter = { disciplinary_status: { $exists: false } };
  const [missingFine, missingStatus] = await Promise.all([
    Jockey.collection.countDocuments(fineFilter),
    Jockey.collection.countDocuments(statusFilter)
  ]);

  if (!dryRun) {
    if (missingFine) {
      await Jockey.collection.updateMany(fineFilter, { $set: { outstanding_fine_amount: 0 } });
    }

    if (missingStatus) {
      await Jockey.collection.updateMany(statusFilter, { $set: { disciplinary_status: 'clear' } });
    }
  }

  return {
    missing_fine: missingFine,
    missing_status: missingStatus
  };
}

async function run() {
  const dryRun = process.argv.includes('--dry-run');

  try {
    await connectDatabase();
    const violations = await migrateViolations(dryRun);
    const raceResults = await migrateRaceResults(dryRun);
    const jockeys = await migrateJockeys(dryRun);

    console.log('Violation/result migration completed', {
      dry_run: dryRun,
      violations: violations,
      race_results: raceResults,
      jockeys: jockeys
    });
  } finally {
    await mongoose.disconnect();
  }
}

if (require.main === module) {
  run().catch(function(error) {
    console.error('Violation/result migration failed:', error);
    process.exitCode = 1;
  });
}

module.exports = {
  mapLegacyPenalty,
  migrateJockeys,
  migrateRaceResults,
  migrateViolations,
  normalizePenaltyType
};
