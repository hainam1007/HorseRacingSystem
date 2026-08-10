const ApiError = require('../utils/ApiError');
const { ROLE_NAMES } = require('../constants/roles');
const {
  HORSE_CHECK_PHASE,
  HORSE_CHECK_STATUS,
  VIOLATION_SEVERITY,
  VIOLATION_STATUS
} = require('../constants/statuses');
const { getViolationPenaltyPolicy } = require('../constants/violationPenaltyPolicy');
const { Horse, HorseCheck, Jockey, RaceResult } = require('../models');
const horseCheckRepository = require('../repositories/horseCheckRepository');
const profileRepository = require('../repositories/profileRepository');
const raceRepository = require('../repositories/raceRepository');
const raceResultRepository = require('../repositories/raceResultRepository');
const violationRepository = require('../repositories/violationRepository');

function hasRole(req, role) {
  return (req.roles || req.auth.roles || []).includes(role);
}

function sameId(first, second) {
  return first && second && first.toString() === second.toString();
}

function getDocumentId(value) {
  return value && (value._id || value);
}

function idString(value) {
  const id = getDocumentId(value);

  return id ? id.toString() : '';
}

function canUpdateExistingCheck(req, race, refereeId, horseCheck) {
  if (hasRole(req, ROLE_NAMES.ADMIN)) {
    return true;
  }

  if (sameId(getDocumentId(horseCheck.referee_id), refereeId)) {
    return true;
  }

  return sameId(getDocumentId(race.referee_id), refereeId);
}

async function getCurrentReferee(req) {
  const referee = await profileRepository.findRaceRefereeByUserId(req.user._id);

  if (!referee) {
    throw new ApiError(404, 'Race referee profile not found');
  }

  return referee;
}

async function resolveRefereeId(req, race, payload) {
  if (hasRole(req, ROLE_NAMES.ADMIN)) {
    const refereeId = payload.referee_id || getDocumentId(race.referee_id);

    if (!refereeId) {
      throw new ApiError(400, 'referee_id is required when the race has no assigned referee');
    }

    return refereeId;
  }

  const referee = await getCurrentReferee(req);
  const assignedRefereeId = getDocumentId(race.referee_id);

  if (assignedRefereeId && !sameId(assignedRefereeId, referee._id)) {
    throw new ApiError(403, 'You can only create checks for races assigned to you');
  }

  return referee._id;
}

async function ensurePassedPreRaceCheck(race, horse, phase) {
  if (phase === HORSE_CHECK_PHASE.PRE_RACE) {
    return;
  }

  const preRaceCheck = await horseCheckRepository.findOne({
    race_id: race._id,
    horse_id: horse._id,
    phase: HORSE_CHECK_PHASE.PRE_RACE
  });

  if (
    !preRaceCheck ||
    preRaceCheck.status !== HORSE_CHECK_STATUS.PASSED ||
    preRaceCheck.is_eligible !== true
  ) {
    throw new ApiError(409, 'Horse must pass pre-race check before during-race or post-race checks');
  }
}

async function createHorseCheck(req, payload) {
  const [race, horse, jockey] = await Promise.all([
    raceRepository.findById(payload.race_id),
    Horse.findById(payload.horse_id),
    payload.jockey_id ? Jockey.findById(payload.jockey_id) : Promise.resolve(null)
  ]);

  if (!race) {
    throw new ApiError(404, 'Race not found');
  }

  if (!horse) {
    throw new ApiError(404, 'Horse not found');
  }

  if (payload.jockey_id && !jockey) {
    throw new ApiError(404, 'Jockey not found');
  }

  const phase = payload.phase || HORSE_CHECK_PHASE.PRE_RACE;
  const refereeId = await resolveRefereeId(req, race, payload);

  await ensurePassedPreRaceCheck(race, horse, phase);

  if (payload.phase === HORSE_CHECK_PHASE.DURING_RACE && payload.requires_violation) {
    const lockedResults = await raceResultRepository.find({
      race_id: race._id,
      status: { $in: ['confirmed', 'published'] }
    });

    if (lockedResults.length) {
      throw new ApiError(409, 'Violations cannot be recorded after race results are confirmed');
    }
  }

  if ([HORSE_CHECK_PHASE.PRE_RACE, HORSE_CHECK_PHASE.POST_RACE].includes(phase)) {
    const existingCheck = await horseCheckRepository.findOne({
      race_id: race._id,
      horse_id: horse._id,
      phase: phase
    });

    if (existingCheck) {
      if (!canUpdateExistingCheck(req, race, refereeId, existingCheck)) {
        throw new ApiError(403, 'Only the assigned race referee can take over this horse check');
      }

      const updatedHorseCheck = await horseCheckRepository.updateById(
        existingCheck._id,
        buildHorseCheckData(race, refereeId, Object.assign({}, payload, { phase: phase }))
      );

      return {
        horse_check: updatedHorseCheck
      };
    }
  }

  const horseCheck = await horseCheckRepository.create({
    race_id: race._id,
    horse_id: horse._id,
    jockey_id: payload.jockey_id,
    referee_id: refereeId,
    phase: payload.phase || HORSE_CHECK_PHASE.PRE_RACE,
    status: payload.status,
    checklist: payload.checklist || {},
    issues: payload.issues || [],
    event_type: payload.event_type,
    severity: payload.severity,
    time_marker: payload.time_marker,
    description: payload.description,
    evidence_urls: payload.evidence_urls || [],
    requires_violation: payload.requires_violation || false,
    auto_confirm_violation: payload.auto_confirm_violation || false,
    health_status: payload.health_status,
    weight: payload.weight,
    check_note: payload.check_note,
    is_eligible: payload.is_eligible === undefined ? payload.status === HORSE_CHECK_STATUS.PASSED : payload.is_eligible,
    checked_at: new Date()
  });

  if (
    horseCheck.phase === HORSE_CHECK_PHASE.DURING_RACE &&
    horseCheck.requires_violation &&
    horseCheck.event_type
  ) {
    const policy = getViolationPenaltyPolicy(
      horseCheck.event_type,
      horseCheck.severity || VIOLATION_SEVERITY.MINOR
    );
    const violationData = {
      race_id: race._id,
      horse_id: horse._id,
      jockey_id: payload.jockey_id,
      referee_id: refereeId,
      horse_check_id: horseCheck._id,
      violation_type: horseCheck.event_type,
      description: horseCheck.description || horseCheck.check_note,
      severity: horseCheck.severity || VIOLATION_SEVERITY.MINOR,
      time_marker: horseCheck.time_marker,
      evidence_urls: horseCheck.evidence_urls,
      status: VIOLATION_STATUS.RECORDED,
      suggested_penalty: policy.suggested_penalty,
      policy_version: policy.policy_version,
      created_at: new Date()
    };

    const violation = await violationRepository.create(violationData);

    const updatedHorseCheck = await horseCheckRepository.updateById(horseCheck._id, {
      linked_violation_id: violation._id
    });

    return {
      horse_check: updatedHorseCheck,
      violation: violation,
      policy: policy,
      auto_confirmed: false
    };
  }

  return {
    horse_check: horseCheck
  };
}

function buildHorseCheckData(race, refereeId, payload) {
  const defaultEligibility = payload.phase === HORSE_CHECK_PHASE.PRE_RACE
    ? payload.status === HORSE_CHECK_STATUS.PASSED
    : true;

  return {
    race_id: race._id,
    horse_id: payload.horse_id,
    jockey_id: payload.jockey_id,
    referee_id: refereeId,
    phase: payload.phase || HORSE_CHECK_PHASE.PRE_RACE,
    status: payload.status,
    checklist: payload.checklist || {},
    issues: payload.issues || [],
    event_type: payload.event_type,
    severity: payload.severity,
    time_marker: payload.time_marker,
    description: payload.description,
    evidence_urls: payload.evidence_urls || [],
    requires_violation: payload.requires_violation || false,
    auto_confirm_violation: payload.auto_confirm_violation || false,
    health_status: payload.health_status,
    weight: payload.weight,
    check_note: payload.check_note,
    is_eligible: payload.is_eligible === undefined ? defaultEligibility : payload.is_eligible,
    checked_at: new Date()
  };
}

async function ensureBulkPostRaceIsOpen(raceId, phase) {
  if (phase !== HORSE_CHECK_PHASE.POST_RACE) {
    return;
  }

  const lockedResultCount = await RaceResult.countDocuments({
    race_id: raceId,
    status: { $in: ['confirmed', 'published'] }
  });

  if (lockedResultCount > 0) {
    throw new ApiError(409, 'Post-race checks cannot be changed after race results are confirmed or published');
  }
}

async function bulkSaveHorseChecks(req, payload) {
  const race = await raceRepository.findById(payload.race_id);

  if (!race) {
    throw new ApiError(404, 'Race not found');
  }

  const refereeId = await resolveRefereeId(req, race, payload);

  await ensureBulkPostRaceIsOpen(race._id, payload.phase);

  const horseIds = payload.checks.map(function(check) {
    return check.horse_id;
  });
  const jockeyIds = payload.checks.map(function(check) {
    return check.jockey_id;
  }).filter(Boolean);
  const [horses, jockeys, existingChecks, preRaceChecks] = await Promise.all([
    Horse.find({ _id: { $in: horseIds } }),
    jockeyIds.length ? Jockey.find({ _id: { $in: jockeyIds } }) : Promise.resolve([]),
    HorseCheck.find({
      race_id: race._id,
      horse_id: { $in: horseIds },
      phase: payload.phase
    }),
    payload.phase === HORSE_CHECK_PHASE.POST_RACE
      ? HorseCheck.find({
        race_id: race._id,
        horse_id: { $in: horseIds },
        phase: HORSE_CHECK_PHASE.PRE_RACE
      })
      : Promise.resolve([])
  ]);
  const horseMap = new Map(horses.map(function(horse) {
    return [horse._id.toString(), horse];
  }));
  const jockeyMap = new Map(jockeys.map(function(jockey) {
    return [jockey._id.toString(), jockey];
  }));
  const existingByHorse = new Map(existingChecks.map(function(check) {
    return [idString(check.horse_id), check];
  }));
  const preCheckByHorse = new Map(preRaceChecks.map(function(check) {
    return [idString(check.horse_id), check];
  }));
  const created = [];
  const updated = [];
  const failed = [];

  for (const checkPayload of payload.checks) {
    const horseId = checkPayload.horse_id;
    const jockeyId = checkPayload.jockey_id;
    const horse = horseMap.get(horseId);

    try {
      if (!horse) {
        throw new ApiError(404, 'Horse not found');
      }

      if (jockeyId && !jockeyMap.has(jockeyId)) {
        throw new ApiError(404, 'Jockey not found');
      }

      if (payload.phase === HORSE_CHECK_PHASE.POST_RACE) {
        const preRaceCheck = preCheckByHorse.get(horseId);

        if (
          !preRaceCheck ||
          preRaceCheck.status !== HORSE_CHECK_STATUS.PASSED ||
          preRaceCheck.is_eligible !== true
        ) {
          throw new ApiError(409, 'Horse must pass pre-race check before post-race check');
        }
      }

      const existingCheck = existingByHorse.get(horseId);
      const checkData = buildHorseCheckData(race, refereeId, checkPayload);

      if (existingCheck) {
        if (!canUpdateExistingCheck(req, race, refereeId, existingCheck)) {
          throw new ApiError(403, 'Only the assigned race referee can take over this horse check');
        }

        const updatedHorseCheck = await horseCheckRepository.updateById(existingCheck._id, checkData);

        updated.push(updatedHorseCheck);
      } else {
        const horseCheck = await horseCheckRepository.create(checkData);

        created.push(horseCheck);
      }
    } catch (error) {
      failed.push({
        horse_id: horseId,
        status: error.status || 500,
        message: error.message || 'Unable to save horse check'
      });
    }
  }

  return {
    created: created,
    updated: updated,
    failed: failed,
    summary: {
      created_count: created.length,
      updated_count: updated.length,
      failed_count: failed.length
    }
  };
}

async function listHorseChecks(req, query) {
  const filter = {};

  ['race_id', 'horse_id', 'referee_id', 'jockey_id', 'phase', 'status'].forEach(function(field) {
    if (query[field]) {
      filter[field] = query[field];
    }
  });

  if (hasRole(req, ROLE_NAMES.RACE_REFEREE) && !hasRole(req, ROLE_NAMES.ADMIN)) {
    const referee = await getCurrentReferee(req);

    filter.referee_id = referee._id;
  }

  return {
    horse_checks: await horseCheckRepository.find(filter)
  };
}

async function ensureCanAccessHorseCheck(req, horseCheck) {
  if (hasRole(req, ROLE_NAMES.ADMIN)) {
    return;
  }

  const referee = await getCurrentReferee(req);

  if (sameId(getDocumentId(horseCheck.referee_id), referee._id)) {
    return;
  }

  throw new ApiError(403, 'You do not have permission to access this horse check');
}

async function getHorseCheck(req, id) {
  const horseCheck = await horseCheckRepository.findById(id);

  if (!horseCheck) {
    throw new ApiError(404, 'Horse check not found');
  }

  await ensureCanAccessHorseCheck(req, horseCheck);

  return {
    horse_check: horseCheck
  };
}

async function updateHorseCheck(req, id, payload) {
  const horseCheck = await horseCheckRepository.findById(id);

  if (!horseCheck) {
    throw new ApiError(404, 'Horse check not found');
  }

  await ensureCanAccessHorseCheck(req, horseCheck);

  const updatedHorseCheck = await horseCheckRepository.updateById(id, Object.assign({}, payload, {
    checked_at: new Date()
  }));

  return {
    horse_check: updatedHorseCheck
  };
}

module.exports = {
  bulkSaveHorseChecks,
  createHorseCheck,
  getHorseCheck,
  listHorseChecks,
  updateHorseCheck
};
