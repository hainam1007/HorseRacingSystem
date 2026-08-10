require('dotenv').config();

const mongoose = require('mongoose');
const connectDatabase = require('../config/database');
const { JockeyAssignment, Race, Registration } = require('../models');
const { REGISTRATION_STATUS } = require('../constants/statuses');

async function migrateRegistrationSlots() {
  const races = await Race.find({}).select('_id').lean();
  let initializedRaces = 0;
  let reservedRegistrations = 0;

  for (const race of races) {
    const now = new Date();
    const activeFilter = {
      race_id: race._id,
      $or: [
        { status: REGISTRATION_STATUS.APPROVED },
        {
          status: REGISTRATION_STATUS.PENDING,
          payment_status: 'pending',
          payment_expires_at: { $gt: now }
        }
      ]
    };
    const activeCount = await Registration.countDocuments(activeFilter);
    const updated = await Registration.updateMany(activeFilter, {
      $set: {
        slot_reserved: true,
        slot_reserved_at: now
      },
      $unset: { slot_released_at: 1 }
    });

    await Registration.updateMany({
      race_id: race._id,
      slot_reserved: true,
      $nor: activeFilter.$or
    }, {
      $set: {
        slot_reserved: false,
        slot_released_at: now
      }
    });

    await Race.updateOne({ _id: race._id }, {
      $set: {
        registration_slot_count: activeCount,
        registration_slots_initialized: true
      }
    });

    initializedRaces += 1;
    reservedRegistrations += Number(updated.modifiedCount || updated.nModified || 0);
  }

  return { initializedRaces, reservedRegistrations };
}

async function assertNoJockeyBindingConflicts() {
  const conflicts = await JockeyAssignment.aggregate([
    {
      $match: {
        status: { $in: ['accepted', 'standby_confirmed'] }
      }
    },
    {
      $group: {
        _id: {
          race_id: '$race_id',
          jockey_id: '$jockey_id'
        },
        assignment_ids: { $push: '$_id' },
        count: { $sum: 1 }
      }
    },
    { $match: { count: { $gt: 1 } } }
  ]);

  if (conflicts.length) {
    console.error('Confirmed Jockey conflicts must be resolved before creating the unique index:');
    conflicts.forEach(function(conflict) {
      console.error(JSON.stringify(conflict));
    });
    throw new Error('Jockey binding conflicts found');
  }

  await JockeyAssignment.createIndexes();
}

async function run() {
  await connectDatabase();

  try {
    const slotResult = await migrateRegistrationSlots();
    await assertNoJockeyBindingConflicts();
    console.log('Registration slot migration complete:', slotResult);
    console.log('Jockey binding index created successfully');
  } finally {
    await mongoose.disconnect();
  }
}

if (require.main === module) {
  run().catch(function(error) {
    console.error(error);
    process.exitCode = 1;
  });
}

module.exports = {
  migrateRegistrationSlots,
  assertNoJockeyBindingConflicts
};
