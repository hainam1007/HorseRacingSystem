const ApiError = require('../utils/ApiError');
const { ROLE_NAMES } = require('../constants/roles');
const { REGISTRATION_STATUS } = require('../constants/statuses');
const { loadSequelizeModels } = require('../models/sequelize/index.js');
const profileRepository = require('../repositories/profileRepository');
const raceRepository = require('../repositories/raceRepository');
const registrationRepository = require('../repositories/registrationRepository');
const emailService = require('./emailService');
const raceEngineService = require('./raceEngineService');
const registrationSlotService = require('./registrationSlotService');
const racetrackEligibilityService = require('./racetrackEligibilityService');

function getModels() { return loadSequelizeModels().models; }

function hasRole(req, role) {
  return (req.roles || req.auth.roles || []).includes(role);
}

function sameId(first, second) {
  return first && second && first.toString() === second.toString();
}

function registrationRank(registration) {
  if (registration.status === REGISTRATION_STATUS.PENDING) return 0;
  if (registration.status === REGISTRATION_STATUS.APPROVED) return 1;
  if (registration.status === REGISTRATION_STATUS.REJECTED) return 2;
  return 3;
}

function registrationTime(registration) {
  return new Date(registration.registered_at || registration.created_at || 0).getTime() || 0;
}

async function resolveOwner(req, payload) {
  if (hasRole(req, ROLE_NAMES.ADMIN)) {
    if (!payload.owner_id) {
      throw new ApiError(400, 'owner_id is required for admin registration create');
    }

    return payload.owner_id;
  }

  const owner = await profileRepository.findHorseOwnerByUserId(req.user._id);

  if (!owner) {
    throw new ApiError(404, 'Horse owner profile not found');
  }

  return owner._id;
}

async function createRegistration(req, payload) {
  const race = await raceRepository.findById(payload.race_id);

  if (!race) {
    throw new ApiError(404, 'Race not found');
  }

  await raceEngineService.ensureRaceRegistrationIsUnlocked(payload.race_id);

  if (String(race.status || '').toLowerCase() !== 'scheduled') {
    throw new ApiError(400, 'Only scheduled races accept registrations');
  }

  const horse = await getModels().Horse.findByPk(payload.horse_id);

  if (!horse) {
    throw new ApiError(404, 'Horse not found');
  }

  const ownerId = await resolveOwner(req, payload);

  if (!sameId(horse.owner_id && (horse.owner_id._id || horse.owner_id), ownerId)) {
    throw new ApiError(403, 'Horse does not belong to this owner');
  }

  // Admin-created registrations use the same race snapshot evaluator as the
  // owner flow, so this endpoint cannot bypass racetrack eligibility.
  const eligibility = racetrackEligibilityService.assertHorseCanRegister(race, horse);
  const eligibilityPayload = {
    eligibility_status: eligibility.status,
    eligibility_snapshot: eligibility,
    eligibility_checked_at: new Date()
  };

  const duplicateCount = await registrationRepository.count({
    race_id: payload.race_id,
    horse_id: payload.horse_id
  });

  if (duplicateCount > 0) {
    throw new ApiError(409, 'Horse is already registered for this race');
  }

  await registrationSlotService.reserveRaceSlot(payload.race_id);
  let createdRegistration;

  try {
    createdRegistration = await registrationRepository.create({
      tournament_id: race.tournament_id._id || race.tournament_id,
      race_id: payload.race_id,
      horse_id: payload.horse_id,
      owner_id: ownerId,
      note: payload.note,
      payment_status: 'not_required',
      slot_reserved: true,
      slot_reserved_at: new Date(),
      status: REGISTRATION_STATUS.APPROVED,
      approved_by: req.user._id,
      approved_at: new Date(),
      ...eligibilityPayload
    });
  } catch (error) {
    await registrationSlotService.releaseRaceSlot(payload.race_id);
    throw error;
  }
  const registration = await registrationRepository.findById(createdRegistration._id);

  emailService.sendRaceRegistrationConfirmedEmail({
    user: registration.owner_id.user_id,
    owner: registration.owner_id,
    horse: registration.horse_id,
    tournament: registration.tournament_id,
    race: registration.race_id,
    registration: registration
  }).catch(function(error) {
    console.error('Unable to send race registration confirmation email:', error.message);
  });
  const emailConfigured = emailService.isEmailConfigured();

  return {
    registration: registration,
    email_delivery: {
      queued: emailConfigured,
      status: emailConfigured ? 'queued' : 'skipped'
    }
  };
}

async function listRegistrations(req, query) {
  const filter = {};

  ['tournament_id', 'race_id', 'horse_id', 'status'].forEach(function(field) {
    if (query[field]) {
      filter[field] = query[field];
    }
  });

  if (hasRole(req, ROLE_NAMES.HORSE_OWNER) && !hasRole(req, ROLE_NAMES.ADMIN)) {
    const owner = await profileRepository.findHorseOwnerByUserId(req.user._id);

    if (!owner) {
      throw new ApiError(404, 'Horse owner profile not found');
    }

    filter.owner_id = owner._id;
  } else if (query.owner_id) {
    filter.owner_id = query.owner_id;
  }

  const registrations = (await registrationRepository.find(filter)).sort(function(first, second) {
    return registrationRank(first) - registrationRank(second) || registrationTime(second) - registrationTime(first);
  });

  return {
    registrations
  };
}

async function getRegistration(id) {
  const registration = await registrationRepository.findById(id);

  if (!registration) {
    throw new ApiError(404, 'Registration not found');
  }

  return {
    registration
  };
}

module.exports = {
  createRegistration,
  listRegistrations,
  getRegistration
};
