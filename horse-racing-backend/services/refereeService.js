const ApiError = require('../utils/ApiError');
const {
  ASSIGNMENT_STATUS,
  ASSIGNMENT_TYPE,
  HORSE_CHECK_PHASE,
  HORSE_CHECK_STATUS,
  REGISTRATION_STATUS
} = require('../constants/statuses');
const profileRepository = require('../repositories/profileRepository');
const {
  HorseCheck,
  JockeyAssignment,
  Race,
  RaceResult,
  RefereeReport,
  Registration,
  Violation
} = require('../models');

function getDocumentId(value) {
  return value && (value._id || value.id || value);
}

function idString(value) {
  const id = getDocumentId(value);

  return id ? id.toString() : '';
}

function groupByRace(items) {
  return items.reduce(function(groups, item) {
    const raceId = idString(item.race_id);

    if (!raceId) {
      return groups;
    }

    if (!groups[raceId]) {
      groups[raceId] = [];
    }

    groups[raceId].push(item);
    return groups;
  }, {});
}

function addLatestHorseCheck(latestByKey, horseCheck) {
  const raceId = idString(horseCheck.race_id);
  const horseId = idString(horseCheck.horse_id);
  const phase = horseCheck.phase;
  const key = raceId + ':' + horseId + ':' + phase;
  const existing = latestByKey.get(key);

  if (!raceId || !horseId || !phase) {
    return;
  }

  if (!existing || new Date(horseCheck.checked_at || 0) > new Date(existing.checked_at || 0)) {
    latestByKey.set(key, horseCheck);
  }
}

function buildAssignmentMap(assignments) {
  return assignments.reduce(function(map, assignment) {
    if (assignment.assignment_type && assignment.assignment_type !== ASSIGNMENT_TYPE.PRIMARY) {
      return map;
    }

    const key = idString(assignment.race_id) + ':' + idString(assignment.horse_id);
    const existing = map.get(key);

    if (!key.includes(':') || key.startsWith(':') || key.endsWith(':')) {
      return map;
    }

    if (!existing || new Date(assignment.invited_at || 0) > new Date(existing.invited_at || 0)) {
      map.set(key, assignment);
    }

    return map;
  }, new Map());
}

function buildParticipant(registration, assignmentMap, latestCheckMap) {
  const raceId = idString(registration.race_id);
  const horse = registration.horse_id;
  const horseId = idString(horse);
  const assignment = assignmentMap.get(raceId + ':' + horseId) || null;
  const preRaceCheck = latestCheckMap.get(raceId + ':' + horseId + ':' + HORSE_CHECK_PHASE.PRE_RACE) || null;
  const postRaceCheck = latestCheckMap.get(raceId + ':' + horseId + ':' + HORSE_CHECK_PHASE.POST_RACE) || null;
  const blockers = [];

  if (!assignment || assignment.status !== ASSIGNMENT_STATUS.ACCEPTED) {
    blockers.push('accepted_jockey_assignment_required');
  }

  if (
    assignment &&
    assignment.jockey_id &&
    assignment.jockey_id.suspended_until &&
    new Date(assignment.jockey_id.suspended_until).getTime() > Date.now()
  ) {
    blockers.push('jockey_suspension_active');
  }

  if (
    !preRaceCheck ||
    preRaceCheck.status !== HORSE_CHECK_STATUS.PASSED ||
    preRaceCheck.is_eligible !== true
  ) {
    blockers.push('passed_pre_race_check_required');
  }

  return {
    registration: registration,
    horse: horse,
    owner: registration.owner_id || (horse && horse.owner_id) || null,
    jockey: assignment ? assignment.jockey_id : null,
    assignment: assignment,
    pre_race_check: preRaceCheck,
    post_race_check: postRaceCheck,
    eligible: blockers.length === 0,
    blockers: blockers
  };
}

async function getWorkspace(req) {
  const referee = await profileRepository.findRaceRefereeByUserId(req.user._id);

  if (!referee) {
    throw new ApiError(404, 'Race referee profile not found');
  }

  const races = await Race.find({ referee_id: referee._id })
    .sort({ race_date: 1, created_at: -1 })
    .populate('tournament_id')
    .populate('round_id')
    .populate({
      path: 'referee_id',
      populate: {
        path: 'user_id',
        select: 'full_name email'
      }
    })
    .lean();
  const raceIds = races.map(function(race) {
    return race._id;
  });

  if (!raceIds.length) {
    return {
      referee: referee,
      races: [],
      participants_by_race: {},
      results_by_race: {},
      violations_by_race: {},
      horse_checks_by_race: {},
      reports_by_race: {}
    };
  }

  const [
    registrations,
    assignments,
    horseChecks,
    raceResults,
    violations,
    refereeReports
  ] = await Promise.all([
    Registration.find({
      race_id: { $in: raceIds },
      status: REGISTRATION_STATUS.APPROVED
    })
      .populate({
        path: 'horse_id',
        populate: {
          path: 'owner_id',
          populate: {
            path: 'user_id',
            select: 'full_name email'
          }
        }
      })
      .populate({
        path: 'owner_id',
        populate: {
          path: 'user_id',
          select: 'full_name email'
        }
      })
      .sort({ registered_at: 1 })
      .lean(),
    JockeyAssignment.find({
      race_id: { $in: raceIds },
      assignment_type: ASSIGNMENT_TYPE.PRIMARY,
      status: ASSIGNMENT_STATUS.ACCEPTED
    })
      .sort({ invited_at: -1 })
      .populate({
        path: 'jockey_id',
        populate: {
          path: 'user_id',
          select: 'full_name email'
        }
      })
      .lean(),
    HorseCheck.find({
      race_id: { $in: raceIds },
      referee_id: referee._id
    })
      .sort({ checked_at: -1 })
      .lean(),
    RaceResult.find({ race_id: { $in: raceIds } })
      .sort({ published_at: -1, recorded_at: -1 })
      .populate('horse_id')
      .populate({
        path: 'jockey_id',
        populate: {
          path: 'user_id',
          select: 'full_name email'
        }
      })
      .populate('applied_violation_ids')
      .lean(),
    Violation.find({
      race_id: { $in: raceIds },
      referee_id: referee._id
    })
      .sort({ created_at: -1 })
      .populate('horse_id')
      .populate({
        path: 'jockey_id',
        populate: {
          path: 'user_id',
          select: 'full_name email'
        }
      })
      .populate('horse_check_id')
      .lean(),
    RefereeReport.find({
      race_id: { $in: raceIds },
      referee_id: referee._id
    })
      .sort({ created_at: -1 })
      .lean()
  ]);
  const assignmentMap = buildAssignmentMap(assignments);
  const latestCheckMap = new Map();
  const participantsByRace = {};

  horseChecks.forEach(function(horseCheck) {
    addLatestHorseCheck(latestCheckMap, horseCheck);
  });

  registrations.forEach(function(registration) {
    const raceId = idString(registration.race_id);

    if (!participantsByRace[raceId]) {
      participantsByRace[raceId] = [];
    }

    participantsByRace[raceId].push(buildParticipant(registration, assignmentMap, latestCheckMap));
  });

  return {
    referee: referee,
    races: races,
    participants_by_race: participantsByRace,
    results_by_race: groupByRace(raceResults),
    violations_by_race: groupByRace(violations),
    horse_checks_by_race: groupByRace(horseChecks),
    reports_by_race: groupByRace(refereeReports)
  };
}

module.exports = {
  getWorkspace
};
