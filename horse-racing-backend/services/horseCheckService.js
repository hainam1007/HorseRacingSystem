const ApiError = require('../utils/ApiError');
const { ROLE_NAMES } = require('../constants/roles');
const {
  HORSE_CHECK_PHASE,
  HORSE_CHECK_STATUS,
  VIOLATION_SEVERITY,
  VIOLATION_STATUS
} = require('../constants/statuses');
const { getViolationPenaltyPolicy } = require('../constants/violationPenaltyPolicy');
const { Op } = require('sequelize');
const { loadSequelizeModels } = require('../models/sequelize/index.js');
const horseCheckRepository = require('../repositories/horseCheckRepository');
const profileRepository = require('../repositories/profileRepository');
const raceRepository = require('../repositories/raceRepository');
const raceResultRepository = require('../repositories/raceResultRepository');
const violationRepository = require('../repositories/violationRepository');
const {
  ELIGIBILITY_STATUS,
  evaluatePreRaceEligibility
} = require('./racetrackEligibilityService');

function getModels() { return loadSequelizeModels().models; }

function hasRole(req, role) {
  return (req.roles || req.auth.roles || []).includes(role);
}

function sameId(first, second) {
  return first && second && first.toString() === second.toString();
}

function getDocumentId(value) {
  if (!value) return value;
  if (typeof value === 'string') return value;
  return value._id || value.id || (typeof value.get === 'function' ? value.get('id') : value);
}

function idString(value) {
  const id = getDocumentId(value);

  return id ? id.toString() : '';
}

function getField(value, field) {
  if (!value) return undefined;
  if (typeof value.get === 'function') return value.get(field);
  return value[field];
}

function sameNumber(first, second) {
  if (first === undefined || first === null || first === '') {
    return second === undefined || second === null || second === '';
  }

  if (second === undefined || second === null || second === '') {
    return false;
  }

  return Number(first) === Number(second);
}

function hasEligibilityRuleSnapshot(race) {
  return Boolean(race && race.eligibility_rule_snapshot);
}

function getPreRaceEligibilityData(race, horse, horseCheck, status) {
  const eligibility = evaluatePreRaceEligibility(race, horse, horseCheck);

  return {
    ballast_required_kg: eligibility.required_ballast_kg || 0,
    eligibility_result: eligibility,
    is_eligible: status === HORSE_CHECK_STATUS.PASSED &&
      eligibility.status === ELIGIBILITY_STATUS.ELIGIBLE
  };
}

function buildPreRaceCheckData(race, horse, payload, existingCheck) {
  const weightChanged = existingCheck && payload.weight !== undefined &&
    !sameNumber(payload.weight, getField(existingCheck, 'weight'));
  const horseCheck = {
    weight: payload.weight !== undefined ? payload.weight : getField(existingCheck, 'weight'),
    ballast_added_kg: weightChanged ? undefined : getField(existingCheck, 'ballast_added_kg'),
    ballast_confirmed: weightChanged ? false : Boolean(getField(existingCheck, 'ballast_confirmed'))
  };
  const eligibilityData = getPreRaceEligibilityData(
    race,
    horse,
    horseCheck,
    payload.status
  );

  return Object.assign({}, eligibilityData, {
    ballast_added_kg: horseCheck.ballast_added_kg,
    ballast_confirmed: horseCheck.ballast_confirmed,
    ballast_confirmed_by: weightChanged ? null : getField(existingCheck, 'ballast_confirmed_by'),
    ballast_confirmed_at: weightChanged ? null : getField(existingCheck, 'ballast_confirmed_at')
  });
}

function isPassedAndEligiblePreRaceCheck(race, horse, horseCheck) {
  if (!horseCheck || getField(horseCheck, 'status') !== HORSE_CHECK_STATUS.PASSED) {
    return false;
  }

  // Older races created before racetrack eligibility snapshots keep their
  // historic pre-race behaviour. Every race with a snapshot is evaluated
  // server-side below, rather than trusting this stored flag.
  if (!hasEligibilityRuleSnapshot(race)) {
    return getField(horseCheck, 'is_eligible') === true;
  }

  return getPreRaceEligibilityData(
    race,
    horse,
    horseCheck,
    getField(horseCheck, 'status')
  ).is_eligible;
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
    race_id: getDocumentId(race),
    horse_id: getDocumentId(horse),
    phase: HORSE_CHECK_PHASE.PRE_RACE
  });

  if (!isPassedAndEligiblePreRaceCheck(race, horse, preRaceCheck)) {
    throw new ApiError(409, 'Horse must pass pre-race check before during-race or post-race checks');
  }
}

async function createHorseCheck(req, payload) {
  const { Horse, Jockey } = getModels();
  const [race, horse, jockey] = await Promise.all([
    raceRepository.findById(payload.race_id),
    Horse.findByPk(payload.horse_id),
    payload.jockey_id ? Jockey.findByPk(payload.jockey_id) : Promise.resolve(null)
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
      race_id: getDocumentId(race),
      status: { [Op.in]: ['confirmed', 'published'] }
    });

    if (lockedResults.length) {
      throw new ApiError(409, 'Violations cannot be recorded after race results are confirmed');
    }
  }

  if ([HORSE_CHECK_PHASE.PRE_RACE, HORSE_CHECK_PHASE.POST_RACE].includes(phase)) {
    const existingCheck = await horseCheckRepository.findOne({
      race_id: getDocumentId(race),
      horse_id: getDocumentId(horse),
      phase: phase
    });

    if (existingCheck) {
      if (!canUpdateExistingCheck(req, race, refereeId, existingCheck)) {
        throw new ApiError(403, 'Only the assigned race referee can take over this horse check');
      }

      const updatedHorseCheck = await horseCheckRepository.updateById(
        getDocumentId(existingCheck),
        buildHorseCheckData(
          race,
          refereeId,
          Object.assign({}, payload, { phase: phase }),
          horse,
          existingCheck
        )
      );

      if (!updatedHorseCheck) {
        throw new ApiError(404, 'Horse check not found');
      }

      return {
        horse_check: updatedHorseCheck
      };
    }
  }

  const horseCheck = await horseCheckRepository.create(
    buildHorseCheckData(race, refereeId, payload, horse)
  );

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
      race_id: getDocumentId(race),
      horse_id: getDocumentId(horse),
      jockey_id: payload.jockey_id,
      referee_id: refereeId,
      horse_check_id: getDocumentId(horseCheck),
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

    const updatedHorseCheck = await horseCheckRepository.updateById(getDocumentId(horseCheck), {
      linked_violation_id: getDocumentId(violation)
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

function buildHorseCheckData(race, refereeId, payload, horse, existingCheck) {
  const defaultEligibility = payload.phase === HORSE_CHECK_PHASE.PRE_RACE
    ? payload.status === HORSE_CHECK_STATUS.PASSED
    : true;
  const checkData = {
    race_id: getDocumentId(race),
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
    // Pre-race eligibility is always calculated on the server. Do not accept a
    // client-supplied is_eligible flag because it could bypass racetrack rules.
    is_eligible: payload.phase === HORSE_CHECK_PHASE.PRE_RACE
      ? false
      : (payload.is_eligible === undefined ? defaultEligibility : payload.is_eligible),
    checked_at: new Date()
  };

  if (payload.phase === HORSE_CHECK_PHASE.PRE_RACE) {
    if (!horse) {
      throw new ApiError(500, 'Horse is required to evaluate the pre-race check');
    }

    return Object.assign(
      checkData,
      buildPreRaceCheckData(race, horse, payload, existingCheck)
    );
  }

  return checkData;
}

async function ensureBulkPostRaceIsOpen(raceId, phase) {
  if (phase !== HORSE_CHECK_PHASE.POST_RACE) {
    return;
  }

  const { RaceResult, Horse, Jockey, HorseCheck } = getModels();
  const lockedResultCount = await RaceResult.count({
    where: { race_id: raceId, status: { [Op.in]: ['confirmed', 'published'] } }
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

  const raceId = getDocumentId(race);

  await ensureBulkPostRaceIsOpen(raceId, payload.phase);

  const horseIds = payload.checks.map(function(check) {
    return check.horse_id;
  });
  const jockeyIds = payload.checks.map(function(check) {
    return check.jockey_id;
  }).filter(Boolean);
  const { Horse, Jockey, HorseCheck } = getModels();
  const [horses, jockeys, existingChecks, preRaceChecks] = await Promise.all([
    Horse.findAll({ where: { id: { [Op.in]: horseIds } } }),
    jockeyIds.length ? Jockey.findAll({ where: { id: { [Op.in]: jockeyIds } } }) : Promise.resolve([]),
    HorseCheck.findAll({
      where: { race_id: raceId, horse_id: { [Op.in]: horseIds }, phase: payload.phase }
    }),
    payload.phase === HORSE_CHECK_PHASE.POST_RACE
      ? HorseCheck.findAll({
        where: { race_id: raceId, horse_id: { [Op.in]: horseIds }, phase: HORSE_CHECK_PHASE.PRE_RACE }
      })
      : Promise.resolve([])
  ]);
  const horseMap = new Map(horses.map(function(horse) {
    return [horse.id.toString(), horse];
  }));
  const jockeyMap = new Map(jockeys.map(function(jockey) {
    return [jockey.id.toString(), jockey];
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

        if (!isPassedAndEligiblePreRaceCheck(race, horse, preRaceCheck)) {
          throw new ApiError(409, 'Horse must pass pre-race check before post-race check');
        }
      }

      const existingCheck = existingByHorse.get(horseId);
      const checkData = buildHorseCheckData(race, refereeId, checkPayload, horse, existingCheck);

      if (existingCheck) {
        if (!canUpdateExistingCheck(req, race, refereeId, existingCheck)) {
          throw new ApiError(403, 'Only the assigned race referee can take over this horse check');
        }

        const updatedHorseCheck = await horseCheckRepository.updateById(getDocumentId(existingCheck), checkData);

        if (!updatedHorseCheck) {
          throw new ApiError(404, 'Horse check not found');
        }

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

  const updateData = Object.assign({}, payload, {
    checked_at: new Date()
  });

  if (horseCheck.phase === HORSE_CHECK_PHASE.PRE_RACE) {
    const { Horse } = getModels();
    const [race, horse] = await Promise.all([
      raceRepository.findById(horseCheck.race_id),
      Horse.findByPk(horseCheck.horse_id)
    ]);

    if (!race || !horse) {
      throw new ApiError(404, race ? 'Horse not found' : 'Race not found');
    }

    const mergedPayload = Object.assign({}, horseCheck.toJSON ? horseCheck.toJSON() : horseCheck, payload, {
      phase: HORSE_CHECK_PHASE.PRE_RACE,
      status: payload.status === undefined ? horseCheck.status : payload.status
    });
    Object.assign(updateData, buildPreRaceCheckData(race, horse, mergedPayload, horseCheck));
    delete updateData.is_eligible;
    Object.assign(updateData, getPreRaceEligibilityData(race, horse, {
      weight: mergedPayload.weight,
      ballast_added_kg: updateData.ballast_added_kg,
      ballast_confirmed: updateData.ballast_confirmed
    }, mergedPayload.status));
  }

  const updatedHorseCheck = await horseCheckRepository.updateById(id, updateData);

  return {
    horse_check: updatedHorseCheck
  };
}

async function confirmBallast(req, id, payload) {
  const { Horse } = getModels();
  const horseCheck = await horseCheckRepository.findById(id);

  if (!horseCheck) {
    throw new ApiError(404, 'Horse check not found');
  }

  if (horseCheck.phase !== HORSE_CHECK_PHASE.PRE_RACE) {
    throw new ApiError(409, 'Ballast can only be confirmed for a pre-race check');
  }

  const [race, horse] = await Promise.all([
    raceRepository.findById(horseCheck.race_id),
    Horse.findByPk(horseCheck.horse_id)
  ]);

  if (!race || !horse) {
    throw new ApiError(404, race ? 'Horse not found' : 'Race not found');
  }

  // A referee must be the one currently assigned to this race. Admins retain
  // their existing supervision permission for referee workflows.
  if (!hasRole(req, ROLE_NAMES.ADMIN)) {
    const referee = await getCurrentReferee(req);
    const assignedRefereeId = getDocumentId(race.referee_id);

    if (!assignedRefereeId || !sameId(assignedRefereeId, referee._id)) {
      throw new ApiError(403, 'Only the referee assigned to this race can confirm ballast');
    }
  }

  const baseline = evaluatePreRaceEligibility(race, horse, horseCheck);
  const rule = baseline.rule || {};
  const measuredWeight = horseCheck.weight === undefined || horseCheck.weight === null || horseCheck.weight === ''
    ? NaN
    : Number(horseCheck.weight);
  const minKg = Number(rule.min_kg);
  const maxKg = Number(rule.max_kg);
  const ballastAddedKg = Number(payload.ballast_added_kg);

  if (rule.type !== 'horse_weight_range') {
    throw new ApiError(409, 'This race does not use a horse weight eligibility rule');
  }

  if (rule.ballast_allowed !== true) {
    throw new ApiError(409, 'This race does not allow ballast confirmation');
  }

  if (!Number.isFinite(measuredWeight) || measuredWeight >= minKg) {
    throw new ApiError(409, 'Ballast confirmation is only available below the minimum measured weight');
  }

  const requiredBallastKg = minKg - measuredWeight;
  if (ballastAddedKg < requiredBallastKg) {
    throw new ApiError(422, 'Ballast added is below the required amount', {
      required_ballast_kg: requiredBallastKg,
      ballast_added_kg: ballastAddedKg
    });
  }

  if (measuredWeight + ballastAddedKg > maxKg) {
    throw new ApiError(422, 'Effective weight exceeds the maximum allowed weight', {
      effective_weight_kg: measuredWeight + ballastAddedKg,
      max_kg: maxKg
    });
  }

  const evaluationCheck = Object.assign({}, horseCheck.toJSON ? horseCheck.toJSON() : horseCheck, {
    ballast_added_kg: ballastAddedKg,
    ballast_confirmed: true
  });
  const eligibilityData = getPreRaceEligibilityData(
    race,
    horse,
    evaluationCheck,
    horseCheck.status
  );
  const updatedHorseCheck = await horseCheckRepository.updateById(id, Object.assign({}, eligibilityData, {
    ballast_required_kg: requiredBallastKg,
    ballast_added_kg: ballastAddedKg,
    ballast_confirmed: true,
    ballast_confirmed_by: req.user._id,
    ballast_confirmed_at: new Date(),
    checked_at: new Date()
  }));

  return {
    horse_check: updatedHorseCheck
  };
}

module.exports = {
  bulkSaveHorseChecks,
  confirmBallast,
  createHorseCheck,
  getHorseCheck,
  listHorseChecks,
  updateHorseCheck
};
