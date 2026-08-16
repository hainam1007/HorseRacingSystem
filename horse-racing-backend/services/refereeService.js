const ApiError = require('../utils/ApiError');
const { Op } = require('sequelize');
const {
  ASSIGNMENT_STATUS,
  ASSIGNMENT_TYPE,
  HORSE_CHECK_PHASE,
  HORSE_CHECK_STATUS,
  REGISTRATION_STATUS
} = require('../constants/statuses');
const profileRepository = require('../repositories/profileRepository');
const { loadSequelizeModels } = require('../models/sequelize/index.js');

function getModels() { return loadSequelizeModels().models; }

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
  // The associations are eagerly loaded above. Use them in the workspace
  // payload; the *_id fields are only foreign-key values and do not contain
  // the display data needed by the referee UI.
  const horse = registration.horse || registration.horse_id;
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
    owner: registration.owner || (horse && horse.owner) || registration.owner_id || (horse && horse.owner_id) || null,
    jockey: assignment ? (assignment.jockey || assignment.jockey_id) : null,
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

  const { Race, Registration, JockeyAssignment, HorseCheck, RaceResult, Violation, RefereeReport } = getModels();
  const races = await Race.findAll({
    where: { referee_id: referee._id },
    order: [['race_date', 'ASC'], ['created_at', 'DESC']],
    include: [
      { model: getModels().Tournament, as: 'tournament' },
      { model: getModels().Round, as: 'round' },
      {
        model: getModels().RaceReferee,
        as: 'referee',
        include: [{ model: getModels().User, as: 'user', attributes: ['full_name', 'email'] }]
      }
    ]
  });
  const raceIds = races.map(function(race) { return race.id; });

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
    Registration.findAll({
      where: { race_id: { [Op.in]: raceIds }, status: REGISTRATION_STATUS.APPROVED },
      include: [
        {
          model: getModels().Horse,
          as: 'horse',
          include: [{
            model: getModels().HorseOwner,
            as: 'owner',
            include: [{ model: getModels().User, as: 'user', attributes: ['full_name', 'email'] }]
          }]
        },
        {
          model: getModels().HorseOwner,
          as: 'owner',
          include: [{ model: getModels().User, as: 'user', attributes: ['full_name', 'email'] }]
        }
      ],
      order: [['registered_at', 'ASC']]
    }),
    JockeyAssignment.findAll({
      where: {
        race_id: { [Op.in]: raceIds },
        assignment_type: ASSIGNMENT_TYPE.PRIMARY,
        status: ASSIGNMENT_STATUS.ACCEPTED
      },
      order: [['invited_at', 'DESC']],
      include: [{
        model: getModels().Jockey,
        as: 'jockey',
        include: [{ model: getModels().User, as: 'user', attributes: ['full_name', 'email'] }]
      }]
    }),
    HorseCheck.findAll({
      where: { race_id: { [Op.in]: raceIds }, referee_id: referee._id },
      order: [['checked_at', 'DESC']]
    }),
    RaceResult.findAll({
      where: { race_id: { [Op.in]: raceIds } },
      order: [['published_at', 'DESC'], ['recorded_at', 'DESC']],
      include: [
        { model: getModels().Horse, as: 'horse' },
        {
          model: getModels().Jockey,
          as: 'jockey',
          include: [{ model: getModels().User, as: 'user', attributes: ['full_name', 'email'] }]
        },
        { model: getModels().RaceResultAppliedViolation, as: 'applied_violations' }
      ]
    }),
    Violation.findAll({
      where: { race_id: { [Op.in]: raceIds }, referee_id: referee._id },
      order: [['created_at', 'DESC']],
      include: [
        { model: getModels().Horse, as: 'horse' },
        {
          model: getModels().Jockey,
          as: 'jockey',
          include: [{ model: getModels().User, as: 'user', attributes: ['full_name', 'email'] }]
        },
        { model: getModels().HorseCheck, as: 'horse_check' }
      ]
    }),
    RefereeReport.findAll({
      where: { race_id: { [Op.in]: raceIds }, referee_id: referee._id },
      order: [['created_at', 'DESC']]
    })
  ]);

  const raceRes = races.map(function(race) {
    const plain = race.toJSON ? race.toJSON() : race;
    return { ...plain, _id: plain.id };
  });
  const regRes = registrations.map(function(r) {
    const plain = r.toJSON ? r.toJSON() : r;
    return { ...plain, _id: plain.id };
  });
  const assignRes = assignments.map(function(a) {
    const plain = a.toJSON ? a.toJSON() : a;
    return { ...plain, _id: plain.id };
  });
  const checkRes = horseChecks.map(function(c) {
    const plain = c.toJSON ? c.toJSON() : c;
    return { ...plain, _id: plain.id };
  });
  const resultRes = raceResults.map(function(r) {
    const plain = r.toJSON ? r.toJSON() : r;
    return { ...plain, _id: plain.id };
  });
  const violationRes = violations.map(function(v) {
    const plain = v.toJSON ? v.toJSON() : v;
    return { ...plain, _id: plain.id };
  });
  const reportRes = refereeReports.map(function(r) {
    const plain = r.toJSON ? r.toJSON() : r;
    return { ...plain, _id: plain.id };
  });

  const assignmentMap = buildAssignmentMap(assignRes);
  const latestCheckMap = new Map();
  const participantsByRace = {};

  checkRes.forEach(function(horseCheck) {
    addLatestHorseCheck(latestCheckMap, horseCheck);
  });

  regRes.forEach(function(registration) {
    const raceId = idString(registration.race_id);

    if (!participantsByRace[raceId]) {
      participantsByRace[raceId] = [];
    }

    participantsByRace[raceId].push(buildParticipant(registration, assignmentMap, latestCheckMap));
  });

  return {
    referee: referee,
    races: raceRes,
    participants_by_race: participantsByRace,
    results_by_race: groupByRace(resultRes),
    violations_by_race: groupByRace(violationRes),
    horse_checks_by_race: groupByRace(checkRes),
    reports_by_race: groupByRace(reportRes)
  };
}

module.exports = {
  getWorkspace
};
