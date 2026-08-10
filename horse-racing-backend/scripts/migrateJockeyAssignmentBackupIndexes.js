require('dotenv').config();

const mongoose = require('mongoose');
const { JockeyAssignment } = require('../models');

const ACTIVE_PRIMARY_STATUSES = [
  'pending',
  'meeting_invited',
  'meeting_accepted',
  'terms_pending_confirmation',
  'terms_agreed',
  'terms_rejected',
  'contract_uploaded',
  'accepted'
];
const ACTIVE_BACKUP_STATUSES = [
  ...ACTIVE_PRIMARY_STATUSES,
  'standby_terms_pending_confirmation',
  'standby_confirmed'
];

async function dropIndexIfExists(collection, name) {
  const indexes = await collection.indexes();
  const found = indexes.find(function(index) {
    return index.name === name;
  });

  if (found) {
    await collection.dropIndex(name);
    console.log('Dropped index:', name);
  }
}

async function findActiveConflicts(assignmentType) {
  return JockeyAssignment.aggregate([
    {
      $match: {
        assignment_type: assignmentType,
        status: {
          $in: assignmentType === 'backup'
            ? ACTIVE_BACKUP_STATUSES
            : ACTIVE_PRIMARY_STATUSES
        }
      }
    },
    {
      $group: {
        _id: {
          race_id: '$race_id',
          horse_id: '$horse_id'
        },
        assignment_ids: { $push: '$_id' },
        count: { $sum: 1 }
      }
    },
    {
      $match: {
        count: { $gt: 1 }
      }
    }
  ]);
}

async function run() {
  const uri = process.env.MONGODB_URI || process.env.MONGO_URI;

  if (!uri) {
    throw new Error('MONGODB_URI is required');
  }

  await mongoose.connect(uri, {
    dbName: process.env.MONGODB_DB_NAME
  });

  const collection = JockeyAssignment.collection;

  await JockeyAssignment.updateMany(
    { assignment_type: { $exists: false } },
    { $set: { assignment_type: 'primary' } }
  );

  const activePrimaryConflicts = await findActiveConflicts('primary');
  const activeBackupConflicts = await findActiveConflicts('backup');

  if (activePrimaryConflicts.length || activeBackupConflicts.length) {
    console.error('Active assignment conflicts must be resolved before creating the unique indexes:');
    activePrimaryConflicts.concat(activeBackupConflicts).forEach(function(conflict) {
      console.error(JSON.stringify({
        race_id: conflict._id.race_id,
        horse_id: conflict._id.horse_id,
        assignment_ids: conflict.assignment_ids,
        count: conflict.count
      }));
    });
    throw new Error('Duplicate active jockey assignments found; no lifecycle records were modified or deleted');
  }

  await JockeyAssignment.updateMany(
    { status: 'pending' },
    { $set: { status: 'meeting_invited' } }
  );

  await JockeyAssignment.updateMany(
    { status: 'rejected' },
    { $set: { status: 'meeting_rejected' } }
  );

  await JockeyAssignment.updateMany(
    {
      assignment_type: 'backup',
      status: 'terms_pending_confirmation'
    },
    {
      $set: {
        status: 'standby_terms_pending_confirmation'
      }
    }
  );

  await JockeyAssignment.updateMany(
    {
      assignment_type: 'backup',
      status: { $in: ['terms_agreed', 'contract_uploaded', 'accepted'] }
    },
    [
      {
        $set: {
          status: 'standby_confirmed',
          standby_terms: { $mergeObjects: ['$terms', '$standby_terms'] },
          standby_contract: { $mergeObjects: ['$contract', '$standby_contract'] }
        }
      }
    ]
  );

  await JockeyAssignment.updateMany(
    { assignment_type: 'backup', backup_priority: { $ne: 1 } },
    { $set: { backup_priority: 1 } }
  );

  const postMigrationConflicts = (await findActiveConflicts('primary'))
    .concat(await findActiveConflicts('backup'));

  if (postMigrationConflicts.length) {
    throw new Error('Backup status migration produced duplicate active assignments; indexes were not changed');
  }

  await collection.createIndex(
    { race_id: 1, horse_id: 1, assignment_type: 1 },
    {
      unique: true,
      name: 'one_active_primary_assignment_per_horse_race_v2',
      partialFilterExpression: {
        assignment_type: 'primary',
        status: { $in: ACTIVE_PRIMARY_STATUSES }
      }
    }
  );
  await collection.createIndex(
    { race_id: 1, horse_id: 1, assignment_type: 1, status: 1 },
    { name: 'jockey_assignment_role_status_idx' }
  );
  await collection.createIndex(
    { race_id: 1, horse_id: 1, assignment_type: 1 },
    {
      unique: true,
      name: 'one_active_backup_assignment_per_horse_race_v2',
      partialFilterExpression: {
        assignment_type: 'backup',
        status: { $in: ACTIVE_BACKUP_STATUSES }
      }
    }
  );
  await collection.createIndex(
    { race_id: 1, horse_id: 1, backup_priority: 1 },
    { name: 'race_horse_backup_priority_idx' }
  );

  // The legacy index prevents a horse from having both a primary and backup.
  // Remove it only after the replacement backup guard exists.
  await dropIndexIfExists(collection, 'race_id_1_horse_id_1');

  console.log('Jockey assignment backup indexes migrated');
}

run()
  .catch(function(error) {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async function() {
    await mongoose.disconnect();
  });
