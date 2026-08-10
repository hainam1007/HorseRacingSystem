const { Race, Registration } = require('../models');
const ApiError = require('../utils/ApiError');
const { REGISTRATION_STATUS } = require('../constants/statuses');

function activeRegistrationFilter(raceId, now) {
  return {
    race_id: raceId,
    $or: [
      { status: REGISTRATION_STATUS.APPROVED },
      {
        status: REGISTRATION_STATUS.PENDING,
        payment_status: 'pending',
        payment_expires_at: { $gt: now }
      }
    ]
  };
}

async function initializeRaceSlots(raceId) {
  const race = await Race.findById(raceId).select(
    'registration_slots_initialized registration_slot_count'
  );

  if (!race) {
    throw new ApiError(404, 'Race not found');
  }

  if (race.registration_slots_initialized) {
    return race;
  }

  const now = new Date();
  const activeFilter = activeRegistrationFilter(raceId, now);
  const activeCount = await Registration.countDocuments(activeFilter);
  const initialized = await Race.findOneAndUpdate(
    { _id: raceId, registration_slots_initialized: { $ne: true } },
    {
      $set: {
        registration_slot_count: activeCount,
        registration_slots_initialized: true
      }
    },
    { returnDocument: 'after', runValidators: true }
  );

  if (initialized) {
    await Registration.updateMany(activeFilter, {
      $set: {
        slot_reserved: true,
        slot_reserved_at: now
      },
      $unset: { slot_released_at: 1 }
    });
    return initialized;
  }

  return Race.findById(raceId);
}

async function releaseExpiredReservations(raceId) {
  const now = new Date();
  const expired = await Registration.updateMany(
    {
      race_id: raceId,
      slot_reserved: true,
      status: REGISTRATION_STATUS.PENDING,
      payment_status: 'pending',
      payment_expires_at: { $lte: now }
    },
    {
      $set: {
        slot_reserved: false,
        slot_released_at: now,
        payment_status: 'failed',
        status: REGISTRATION_STATUS.REJECTED,
        admin_note: 'Payment reservation expired'
      }
    }
  );
  const releasedCount = Number(expired.modifiedCount || expired.nModified || 0);

  if (releasedCount > 0) {
    await Race.updateOne(
      { _id: raceId },
      [{ $set: { registration_slot_count: { $max: [0, { $subtract: ['$registration_slot_count', releasedCount] }] } } }]
    );
  }

  return releasedCount;
}

async function reserveRaceSlot(raceId) {
  await initializeRaceSlots(raceId);
  await releaseExpiredReservations(raceId);

  const now = new Date();
  const race = await Race.findOneAndUpdate(
    {
      _id: raceId,
      status: 'scheduled',
      registration_locked: { $ne: true },
      $and: [
        {
          $or: [
            { registration_lock_at: null },
            { registration_lock_at: { $gt: now } }
          ]
        },
        {
          $expr: {
            $or: [
              { $lte: [{ $ifNull: ['$max_participants', 0] }, 0] },
              {
                $lt: [
                  { $ifNull: ['$registration_slot_count', 0] },
                  '$max_participants'
                ]
              }
            ]
          }
        }
      ]
    },
    { $inc: { registration_slot_count: 1 } },
    { returnDocument: 'after', runValidators: true }
  );

  if (!race) {
    throw new ApiError(409, 'Race registration is closed or all available places are reserved');
  }

  return race;
}

async function releaseRaceSlot(raceId) {
  await Race.updateOne(
    { _id: raceId, registration_slot_count: { $gt: 0 } },
    { $inc: { registration_slot_count: -1 } }
  );
}

async function releaseRegistrationSlot(registrationId, reason) {
  const now = new Date();
  const registration = await Registration.findOneAndUpdate(
    { _id: registrationId, slot_reserved: true },
    {
      $set: {
        slot_reserved: false,
        slot_released_at: now,
        ...(reason ? { admin_note: reason } : {})
      }
    },
    { returnDocument: 'after', runValidators: true }
  );

  if (registration) {
    await releaseRaceSlot(registration.race_id);
  }

  return registration;
}

module.exports = {
  initializeRaceSlots,
  releaseExpiredReservations,
  reserveRaceSlot,
  releaseRaceSlot,
  releaseRegistrationSlot
};
