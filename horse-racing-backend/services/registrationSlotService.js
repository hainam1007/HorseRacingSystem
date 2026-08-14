const ApiError = require('../utils/ApiError');
const { REGISTRATION_STATUS } = require('../constants/statuses');
const { Op, literal } = require('sequelize');
const { loadSequelizeModels } = require('../models/sequelize/index.js');

function getModels() { return loadSequelizeModels().models; }
function getSequelize() { return loadSequelizeModels().sequelize; }

function toSerializableRace(raceInstance) {
  if (!raceInstance) return null;
  const plain = raceInstance.toJSON ? raceInstance.toJSON() : raceInstance;
  return { ...plain, _id: plain.id };
}

function activeRegistrationFilter(raceId, now) {
  return {
    race_id: raceId,
    [Op.or]: [
      { status: REGISTRATION_STATUS.APPROVED },
      {
        status: REGISTRATION_STATUS.PENDING,
        payment_status: 'pending',
        payment_expires_at: { [Op.gt]: now }
      }
    ]
  };
}

async function initializeRaceSlots(raceId) {
  const { Race, Registration } = getModels();
  const race = await Race.findByPk(raceId, {
    attributes: ['id', 'registration_slots_initialized', 'registration_slot_count']
  });

  if (!race) {
    throw new ApiError(404, 'Race not found');
  }

  if (race.get('registration_slots_initialized')) {
    return toSerializableRace(race);
  }

  const now = new Date();
  const activeFilter = activeRegistrationFilter(raceId, now);
  const activeCount = await Registration.count({ where: activeFilter });

  const [affected] = await Race.update(
    {
      registration_slot_count: activeCount,
      registration_slots_initialized: true
    },
    {
      where: { id: raceId, registration_slots_initialized: { [Op.ne]: true } }
    }
  );

  if (affected > 0) {
    await Registration.update(
      {
        slot_reserved: true,
        slot_reserved_at: now,
        slot_released_at: null
      },
      { where: activeFilter }
    );
    const updated = await Race.findByPk(raceId);
    return toSerializableRace(updated);
  }

  const raceFinal = await Race.findByPk(raceId);
  return toSerializableRace(raceFinal);
}

async function releaseExpiredReservations(raceId) {
  const { Race, Registration } = getModels();
  const now = new Date();
  const [releasedCount] = await Registration.update(
    {
      slot_reserved: false,
      slot_released_at: now,
      payment_status: 'failed',
      status: REGISTRATION_STATUS.REJECTED,
      admin_note: 'Payment reservation expired'
    },
    {
      where: {
        race_id: raceId,
        slot_reserved: true,
        status: REGISTRATION_STATUS.PENDING,
        payment_status: 'pending',
        payment_expires_at: { [Op.lte]: now }
      }
    }
  );

  if (releasedCount > 0) {
    const sequelize = getSequelize();
    await sequelize.query(
      `UPDATE races
       SET registration_slot_count = GREATEST(0, registration_slot_count - :released)
       WHERE id = :raceId`,
      { replacements: { released: releasedCount, raceId } }
    );
  }

  return releasedCount;
}

async function reserveRaceSlot(raceId) {
  await initializeRaceSlots(raceId);
  await releaseExpiredReservations(raceId);

  const { Race } = getModels();
  const now = new Date();
  const sequelize = getSequelize();

  const [race] = await sequelize.query(
    `UPDATE races
     SET registration_slot_count = registration_slot_count + 1
     WHERE id = :raceId
       AND status = 'scheduled'
       AND (registration_locked IS NULL OR registration_locked = FALSE)
       AND (registration_lock_at IS NULL OR registration_lock_at > :now)
       AND (max_participants IS NULL OR max_participants <= 0 OR COALESCE(registration_slot_count, 0) < max_participants)
     RETURNING *`,
    { replacements: { raceId, now } }
  );

  if (!race || race.length === 0) {
    throw new ApiError(409, 'Race registration is closed or all available places are reserved');
  }

  return race[0];
}

async function releaseRaceSlot(raceId) {
  const { Race } = getModels();
  await Race.update(
    { registration_slot_count: literal('GREATEST(0, registration_slot_count - 1)') },
    { where: { id: raceId, registration_slot_count: { [Op.gt]: 0 } } }
  );
}

async function releaseRegistrationSlot(registrationId, reason) {
  const { Registration } = getModels();
  const now = new Date();
  const updateData = {
    slot_reserved: false,
    slot_released_at: now
  };
  if (reason) updateData.admin_note = reason;

  const [affected] = await Registration.update(updateData, {
    where: { id: registrationId, slot_reserved: true }
  });

  if (affected > 0) {
    const registration = await Registration.findByPk(registrationId);
    if (registration) await releaseRaceSlot(registration.race_id);
    return registration && (registration.toJSON ? registration.toJSON() : registration);
  }
  return null;
}

module.exports = {
  initializeRaceSlots,
  releaseExpiredReservations,
  reserveRaceSlot,
  releaseRaceSlot,
  releaseRegistrationSlot
};
