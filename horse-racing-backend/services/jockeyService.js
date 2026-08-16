const ApiError = require('../utils/ApiError');
const { ASSIGNMENT_STATUS, ASSIGNMENT_TYPE, RACE_RESULT_STATUS } = require('../constants/statuses');
const { Op } = require('sequelize');
const { loadSequelizeModels } = require('../models/sequelize/index.js');
const jockeyAssignmentRepository = require('../repositories/jockeyAssignmentRepository');
const profileRepository = require('../repositories/profileRepository');
const raceResultRepository = require('../repositories/raceResultRepository');
const violationRepository = require('../repositories/violationRepository');
const jockeyAssignmentService = require('./jockeyAssignmentService');

function getModels() { return loadSequelizeModels().models; }

async function getJockeyProfile(userId) {
  const jockey = await profileRepository.findJockeyByUserId(userId);

  if (!jockey) {
    throw new ApiError(404, 'Jockey profile not found');
  }

  return jockey;
}

async function getMe(userId) {
  return {
    jockey: await getJockeyProfile(userId)
  };
}

async function getApprovalStatus(userId) {
  const jockey = await getJockeyProfile(userId);

  return {
    approval_status: {
      jockey_id: jockey._id,
      status: jockey.status,
      is_approved: jockey.status === 'active',
      license_number: jockey.license_number || null
    }
  };
}

async function updateMe(userId, payload) {
  const updateData = {
    height: payload.height,
    weight_kg: payload.weight_kg,
    experience_years: payload.experience_years,
    license_number: payload.license_number
  };

  Object.keys(updateData).forEach(function(key) {
    if (updateData[key] === undefined) {
      delete updateData[key];
    }
  });

  const jockey = await profileRepository.updateJockeyByUserId(userId, updateData);

  if (!jockey) {
    throw new ApiError(404, 'Jockey profile not found');
  }

  return {
    jockey: jockey
  };
}

async function listMyAssignments(userId, query) {
  const jockey = await getJockeyProfile(userId);
  const filter = {
    jockey_id: jockey._id
  };

  if (query.status) {
    filter.status = query.status;
  }

  return {
    assignments: await jockeyAssignmentRepository.find(filter)
  };
}

async function acceptAssignment(userId, assignmentId, payload) {
  return jockeyAssignmentService.acceptMeeting(
    userId,
    assignmentId,
    payload.response_message
  );
}

async function rejectAssignment(userId, assignmentId, payload) {
  return jockeyAssignmentService.rejectMeeting(
    userId,
    assignmentId,
    payload.response_message
  );
}

async function getSchedule(userId, query) {
  const jockey = await getJockeyProfile(userId);
  const assignments = await jockeyAssignmentRepository.find({
    jockey_id: jockey._id,
    status: ASSIGNMENT_STATUS.ACCEPTED,
    assignment_type: ASSIGNMENT_TYPE.PRIMARY
  });

  const from = query.from ? new Date(query.from) : null;
  const to = query.to ? new Date(query.to) : null;

  const schedule = assignments.filter(function(assignment) {
    const race = assignment.race || (assignment.race_id && assignment.race_id.race_date ? assignment.race_id : null);
    const raceDate = race && race.race_date;

    if (!raceDate) {
      return true;
    }

    const date = new Date(raceDate);

    if (from && date < from) {
      return false;
    }

    if (to && date > to) {
      return false;
    }

    return true;
  });

  return {
    schedule: schedule.map(function(item) {
      return item && item.toJSON ? item.toJSON() : item;
    })
  };
}

async function getHorseJockeyList(horseId, query) {
  const filter = {
    horse_id: horseId
  };

  if (query.status) {
    filter.status = query.status;
  }

  return {
    jockeys: await jockeyAssignmentRepository.find(filter)
  };
}

async function getHorseRaceSchedule(horseId, query) {
  const from = query.from ? new Date(query.from) : null;
  const to = query.to ? new Date(query.to) : null;
  const assignments = await jockeyAssignmentRepository.find({
    horse_id: horseId,
    status: ASSIGNMENT_STATUS.ACCEPTED,
    assignment_type: ASSIGNMENT_TYPE.PRIMARY
  });

  const assignedRaceIds = assignments
    .map(function(assignment) {
      const race = assignment.race || assignment.race_id;
      return race && (race.id || race._id);
    })
    .filter(Boolean);

  const raceFilter = {};

  if (assignedRaceIds.length) {
    raceFilter.id = { [Op.in]: assignedRaceIds };
  } else {
    return { schedule: [] };
  }

  if (from || to) {
    raceFilter.race_date = {};
    if (from) raceFilter.race_date[Op.gte] = from;
    if (to) raceFilter.race_date[Op.lte] = to;
  }

  const races = await getModels().Race.findAll({
    where: raceFilter,
    include: [
      { model: getModels().Tournament, as: 'tournament' },
      { model: getModels().Round, as: 'round' },
      {
        model: getModels().RaceReferee,
        as: 'referee',
        include: [{ model: getModels().User, as: 'user', attributes: ['full_name', 'email'] }]
      }
    ],
    order: [['race_date', 'ASC']]
  });

  return { schedule: races.map(r => r.toJSON ? r.toJSON() : r) };
}

async function getResults(userId) {
  const jockey = await getJockeyProfile(userId);

  return {
    results: await raceResultRepository.find({
      jockey_id: jockey._id,
      status: RACE_RESULT_STATUS.PUBLISHED
    })
  };
}

async function getStats(userId) {
  const jockey = await getJockeyProfile(userId);
  const results = await raceResultRepository.find({
    jockey_id: jockey._id,
    status: RACE_RESULT_STATUS.PUBLISHED
  });
  const totalRaces = results.length;
  const totalWins = results.filter(function(result) {
    return result.position === 1;
  }).length;
  const top3Finishes = results.filter(function(result) {
    return result.position && result.position <= 3;
  }).length;

  return {
    stats: {
      jockey_id: jockey._id,
      total_races: totalRaces,
      total_wins: totalWins,
      win_rate: totalRaces ? Number(((totalWins / totalRaces) * 100).toFixed(2)) : 0,
      top_3_finishes: top3Finishes
    }
  };
}

async function getViolations(userId) {
  const jockey = await getJockeyProfile(userId);

  return {
    violations: await violationRepository.find({
      jockey_id: jockey._id
    })
  };
}

module.exports = {
  getMe,
  getApprovalStatus,
  updateMe,
  listMyAssignments,
  acceptAssignment,
  rejectAssignment,
  getSchedule,
  getHorseJockeyList,
  getHorseRaceSchedule,
  getResults,
  getStats,
  getViolations
};
