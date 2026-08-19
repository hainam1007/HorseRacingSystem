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

  if (race.registration_locked || race.entries_finalized_at) {
    throw new ApiError(400, 'Trận đua đã khóa đăng ký hoặc đã chốt danh sách thi đấu.');
  }

  const horse = await getModels().Horse.findByPk(payload.horse_id);

  if (!horse) {
    throw new ApiError(404, 'Horse not found');
  }

  // Check Surface Compatibility
  const raceSurface = race.surface || 'Turf';
  const incompatibleSurfaces = Array.isArray(horse.incompatible_surfaces) ? horse.incompatible_surfaces : [];
  if (incompatibleSurfaces.includes(raceSurface)) {
    throw new ApiError(400, `Ngựa ${horse.name} không tương thích với mặt sân ${raceSurface} của trận đua này.`);
  }

  // Check Rule 3: Active Violation Penalty for Horse
  const activePenalty = await getModels().ViolationPenalty.findOne({
    where: {
      horse_id: payload.horse_id,
      status: 'active'
    }
  });

  if (activePenalty) {
    throw new ApiError(400, 'Ngựa đang bị kỷ luật/cấm thi đấu, không thể đăng ký.');
  }

  // Check Rule 1: Minimum Rest Time (2 hours before/after race)
  if (race.starting_at || race.race_date) {
    const raceTime = new Date(race.starting_at || race.race_date).getTime();
    const twoHoursMs = 2 * 60 * 60 * 1000;

    const existingRegistrations = await getModels().Registration.findAll({
      where: {
        horse_id: payload.horse_id,
        status: { [require('sequelize').Op.ne]: 'rejected' }
      },
      include: [{ model: getModels().Race, as: 'race' }]
    });

    for (const reg of existingRegistrations) {
      if (reg.race && reg.race.id !== payload.race_id && (reg.race.starting_at || reg.race.race_date)) {
        const otherTime = new Date(reg.race.starting_at || reg.race.race_date).getTime();
        if (Math.abs(raceTime - otherTime) < twoHoursMs) {
          throw new ApiError(400, `Ngựa đã có lịch thi đấu lúc ${new Date(otherTime).toISOString().substr(11, 5)}, cần tối thiểu 2 giờ nghỉ ngơi.`);
        }
      }
    }
  }

  const ownerId = await resolveOwner(req, payload);

  if (!sameId(horse.owner_id && (horse.owner_id._id || horse.owner_id), ownerId)) {
    throw new ApiError(403, 'Horse does not belong to this owner');
  }

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
      approved_at: new Date()
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
async function getRegistration(id) {
  const registration = await registrationRepository.findById(id);

  if (!registration) {
    throw new ApiError(404, 'Registration not found');
  }

  return {
    registration
  };
}

async function withdrawRegistration(req, id, reason) {
  const registration = await registrationRepository.findById(id);
  if (!registration) {
    throw new ApiError(404, 'Registration not found');
  }

  const race = await raceRepository.findById(registration.race_id._id || registration.race_id);
  if (race && (race.entries_finalized_at || race.status === 'running' || race.status === 'completed')) {
    throw new ApiError(400, 'Trận đua đã chốt danh sách hoặc đã khởi chạy, không thể rút đăng ký.');
  }

  const models = getModels();
  const regModel = await models.Registration.findByPk(id);
  if (!regModel) {
    throw new ApiError(404, 'Registration record not found');
  }

  await regModel.update({
    status: 'withdrawn',
    note: reason ? `Rút tên: ${reason}` : 'Rút tên thi đấu'
  });

  if (race) {
    await registrationSlotService.releaseRaceSlot(race.id || race._id);
  }

  return {
    message: 'Đã rút đăng ký ngựa khỏi trận đua thành công.',
    registration: await registrationRepository.findById(id)
  };
}

module.exports = {
  createRegistration,
  listRegistrations,
  getRegistration,
  withdrawRegistration
};
