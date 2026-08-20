const ApiError = require('../utils/ApiError');
const {
  HORSE_CHECK_PHASE,
  HORSE_CHECK_STATUS,
  VIOLATION_SEVERITY,
  VIOLATION_TYPE
} = require('../constants/statuses');
const { isObjectId } = require('./commonValidator');

const PHASES = Object.values(HORSE_CHECK_PHASE);
const STATUSES_BY_PHASE = {
  [HORSE_CHECK_PHASE.PRE_RACE]: [
    HORSE_CHECK_STATUS.PASSED,
    HORSE_CHECK_STATUS.FAILED,
    HORSE_CHECK_STATUS.NEEDS_REVIEW,
    HORSE_CHECK_STATUS.SCRATCHED
  ],
  [HORSE_CHECK_PHASE.DURING_RACE]: [
    HORSE_CHECK_STATUS.NORMAL,
    HORSE_CHECK_STATUS.INCIDENT_RECORDED,
    HORSE_CHECK_STATUS.RACE_STOPPED,
    HORSE_CHECK_STATUS.UNDER_INVESTIGATION
  ],
  [HORSE_CHECK_PHASE.POST_RACE]: [
    HORSE_CHECK_STATUS.NORMAL,
    HORSE_CHECK_STATUS.MINOR_ISSUE,
    HORSE_CHECK_STATUS.INJURY_DETECTED,
    HORSE_CHECK_STATUS.REQUIRES_VET_FOLLOW_UP,
    HORSE_CHECK_STATUS.UNDER_INVESTIGATION
  ]
};

function getString(value) {
  if (typeof value !== 'string') {
    return '';
  }

  return value.trim();
}

function getOptionalNumber(body, fieldName, errors) {
  if (body[fieldName] === undefined || body[fieldName] === null || body[fieldName] === '') {
    return undefined;
  }

  const value = Number(body[fieldName]);

  if (Number.isNaN(value)) {
    errors.push({ field: fieldName, message: fieldName + ' must be a number' });
    return undefined;
  }

  return value;
}

function getOptionalBoolean(body, fieldName, errors) {
  if (body[fieldName] === undefined || body[fieldName] === null || body[fieldName] === '') {
    return undefined;
  }

  if (typeof body[fieldName] === 'boolean') {
    return body[fieldName];
  }

  if (body[fieldName] === 'true') {
    return true;
  }

  if (body[fieldName] === 'false') {
    return false;
  }

  errors.push({ field: fieldName, message: fieldName + ' must be a boolean' });
  return undefined;
}

function getOptionalObject(body, fieldName, errors) {
  if (body[fieldName] === undefined) {
    return undefined;
  }

  if (!body[fieldName] || Array.isArray(body[fieldName]) || typeof body[fieldName] !== 'object') {
    errors.push({ field: fieldName, message: fieldName + ' must be an object' });
    return undefined;
  }

  return body[fieldName];
}

function getOptionalStringArray(body, fieldName, errors) {
  if (body[fieldName] === undefined) {
    return undefined;
  }

  if (!Array.isArray(body[fieldName])) {
    errors.push({ field: fieldName, message: fieldName + ' must be an array' });
    return undefined;
  }

  const values = body[fieldName].map(getString).filter(Boolean);
  const invalidUrl = values.find(function(value) {
    return !value.startsWith('http://') && !value.startsWith('https://');
  });

  if (invalidUrl) {
    errors.push({ field: fieldName, message: fieldName + ' must contain only http or https URLs' });
  }

  return values;
}

function getIssues(body, errors) {
  if (body.issues === undefined) {
    return undefined;
  }

  if (!Array.isArray(body.issues)) {
    errors.push({ field: 'issues', message: 'issues must be an array' });
    return undefined;
  }

  return body.issues.map(function(issue) {
    if (typeof issue === 'string') {
      return {
        code: getString(issue)
      };
    }

    if (!issue || typeof issue !== 'object' || Array.isArray(issue)) {
      errors.push({ field: 'issues', message: 'issues items must be strings or objects' });
      return {};
    }

    return {
      code: getString(issue.code),
      severity: getString(issue.severity),
      note: getString(issue.note)
    };
  }).filter(function(issue) {
    return issue.code || issue.severity || issue.note;
  });
}

function applySharedFields(body, payload, errors) {
  ['race_id', 'horse_id'].forEach(function(fieldName) {
    const value = getString(body[fieldName]);

    if (!value) {
      errors.push({ field: fieldName, message: fieldName + ' is required' });
    } else if (!isObjectId(value)) {
      errors.push({ field: fieldName, message: fieldName + ' must be a valid id' });
    } else {
      payload[fieldName] = value;
    }
  });

  ['referee_id', 'jockey_id'].forEach(function(fieldName) {
    if (body[fieldName] !== undefined) {
      const value = getString(body[fieldName]);

      if (!value || !isObjectId(value)) {
        errors.push({ field: fieldName, message: fieldName + ' must be a valid id' });
      } else {
        payload[fieldName] = value;
      }
    }
  });

  ['health_status', 'check_note', 'event_type', 'severity', 'time_marker', 'description'].forEach(function(fieldName) {
    const value = getString(body[fieldName]);

    if (value) {
      payload[fieldName] = value;
    }
  });

  const weight = getOptionalNumber(body, 'weight', errors);
  const isEligible = getOptionalBoolean(body, 'is_eligible', errors);
  const requiresViolation = getOptionalBoolean(body, 'requires_violation', errors);
  const autoConfirmViolation = getOptionalBoolean(body, 'auto_confirm_violation', errors);
  const checklist = getOptionalObject(body, 'checklist', errors);
  const evidenceUrls = getOptionalStringArray(body, 'evidence_urls', errors);
  const issues = getIssues(body, errors);

  if (weight !== undefined) {
    payload.weight = weight;
  }

  if (isEligible !== undefined) {
    payload.is_eligible = isEligible;
  }

  if (requiresViolation !== undefined) {
    payload.requires_violation = requiresViolation;
  }

  if (autoConfirmViolation !== undefined) {
    payload.auto_confirm_violation = autoConfirmViolation;
  }

  if (checklist !== undefined) {
    payload.checklist = checklist;
  }

  if (evidenceUrls !== undefined) {
    payload.evidence_urls = evidenceUrls;
  }

  if (issues !== undefined) {
    payload.issues = issues;
  }
}

function validatePhaseRules(payload, errors) {
  if (!STATUSES_BY_PHASE[payload.phase].includes(payload.status)) {
    errors.push({ field: 'status', message: 'status is invalid for ' + payload.phase });
  }

  const issueCount = payload.issues ? payload.issues.length : 0;
  const note = payload.check_note || payload.description || '';

  if (
    payload.phase === HORSE_CHECK_PHASE.PRE_RACE &&
    [HORSE_CHECK_STATUS.FAILED, HORSE_CHECK_STATUS.SCRATCHED].includes(payload.status) &&
    !issueCount &&
    !note
  ) {
    errors.push({ field: 'issues', message: 'issues or check_note is required when pre-race check fails or scratches horse' });
  }

  if (
    payload.phase === HORSE_CHECK_PHASE.DURING_RACE &&
    payload.status !== HORSE_CHECK_STATUS.NORMAL &&
    !payload.event_type
  ) {
    errors.push({ field: 'event_type', message: 'event_type is required for during-race incidents' });
  }

  if (
    payload.phase === HORSE_CHECK_PHASE.DURING_RACE &&
    payload.event_type &&
    !Object.values(VIOLATION_TYPE).includes(payload.event_type)
  ) {
    errors.push({ field: 'event_type', message: 'event_type is invalid' });
  }

  if (
    payload.phase === HORSE_CHECK_PHASE.DURING_RACE &&
    payload.severity &&
    !Object.values(VIOLATION_SEVERITY).includes(payload.severity)
  ) {
    errors.push({ field: 'severity', message: 'severity is invalid' });
  }

  if (
    payload.phase === HORSE_CHECK_PHASE.DURING_RACE &&
    payload.auto_confirm_violation &&
    !payload.requires_violation
  ) {
    errors.push({ field: 'auto_confirm_violation', message: 'requires_violation must be true when auto_confirm_violation is true' });
  }

  if (
    payload.phase === HORSE_CHECK_PHASE.POST_RACE &&
    [HORSE_CHECK_STATUS.INJURY_DETECTED, HORSE_CHECK_STATUS.REQUIRES_VET_FOLLOW_UP].includes(payload.status) &&
    !issueCount &&
    !note
  ) {
    errors.push({ field: 'issues', message: 'issues or check_note is required when post-race check finds injury or follow-up need' });
  }
}

function buildCreateValidator(fixedPhase) {
  return function validateCreateHorseCheck(req, res, next) {
    const errors = [];
    const body = req.body || {};
    const payload = {};

    applySharedFields(body, payload, errors);

    payload.phase = fixedPhase || getString(body.phase) || HORSE_CHECK_PHASE.PRE_RACE;

    if (!PHASES.includes(payload.phase)) {
      errors.push({ field: 'phase', message: 'phase is invalid' });
    } else {
      const defaultStatus = payload.phase === HORSE_CHECK_PHASE.PRE_RACE
        ? HORSE_CHECK_STATUS.PASSED
        : HORSE_CHECK_STATUS.NORMAL;

      payload.status = getString(body.status) || defaultStatus;

      if (payload.phase === HORSE_CHECK_PHASE.DURING_RACE && payload.event_type && !payload.severity) {
        payload.severity = VIOLATION_SEVERITY.MINOR;
      }

      validatePhaseRules(payload, errors);
    }

    if (errors.length) {
      return next(new ApiError(400, 'Validation failed', errors));
    }

    req.validatedBody = payload;

    return next();
  };
}

function applyBulkCheckFields(body, payload, errors, index) {
  const horseId = getString(body.horse_id);

  if (!horseId) {
    errors.push({ field: 'checks.' + index + '.horse_id', message: 'horse_id is required' });
  } else if (!isObjectId(horseId)) {
    errors.push({ field: 'checks.' + index + '.horse_id', message: 'horse_id must be a valid id' });
  } else {
    payload.horse_id = horseId;
  }

  if (body.jockey_id !== undefined) {
    const jockeyId = getString(body.jockey_id);

    if (!jockeyId || !isObjectId(jockeyId)) {
      errors.push({ field: 'checks.' + index + '.jockey_id', message: 'jockey_id must be a valid id' });
    } else {
      payload.jockey_id = jockeyId;
    }
  }

  ['health_status', 'check_note', 'event_type', 'severity', 'time_marker', 'description'].forEach(function(fieldName) {
    const value = getString(body[fieldName]);

    if (value) {
      payload[fieldName] = value;
    }
  });

  const weight = getOptionalNumber(body, 'weight', errors);
  const isEligible = getOptionalBoolean(body, 'is_eligible', errors);
  const requiresViolation = getOptionalBoolean(body, 'requires_violation', errors);
  const autoConfirmViolation = getOptionalBoolean(body, 'auto_confirm_violation', errors);
  const checklist = getOptionalObject(body, 'checklist', errors);
  const evidenceUrls = getOptionalStringArray(body, 'evidence_urls', errors);
  const issues = getIssues(body, errors);

  if (weight !== undefined) {
    payload.weight = weight;
  }

  if (isEligible !== undefined) {
    payload.is_eligible = isEligible;
  }

  if (requiresViolation !== undefined) {
    payload.requires_violation = requiresViolation;
  }

  if (autoConfirmViolation !== undefined) {
    payload.auto_confirm_violation = autoConfirmViolation;
  }

  if (checklist !== undefined) {
    payload.checklist = checklist;
  }

  if (evidenceUrls !== undefined) {
    payload.evidence_urls = evidenceUrls;
  }

  if (issues !== undefined) {
    payload.issues = issues;
  }
}

function buildBulkValidator(fixedPhase) {
  return function validateBulkHorseChecks(req, res, next) {
    const errors = [];
    const body = req.body || {};
    const raceId = getString(body.race_id);
    const checks = Array.isArray(body.checks) ? body.checks : [];
    const payload = {
      phase: fixedPhase,
      checks: []
    };

    if (!raceId) {
      errors.push({ field: 'race_id', message: 'race_id is required' });
    } else if (!isObjectId(raceId)) {
      errors.push({ field: 'race_id', message: 'race_id must be a valid id' });
    } else {
      payload.race_id = raceId;
    }

    if (!Array.isArray(body.checks) || checks.length === 0) {
      errors.push({ field: 'checks', message: 'checks must be a non-empty array' });
    }

    checks.forEach(function(item, index) {
      const checkBody = item && typeof item === 'object' && !Array.isArray(item) ? item : {};
      const checkPayload = {
        phase: fixedPhase
      };
      const defaultStatus = fixedPhase === HORSE_CHECK_PHASE.PRE_RACE
        ? HORSE_CHECK_STATUS.PASSED
        : HORSE_CHECK_STATUS.NORMAL;

      if (checkBody !== item) {
        errors.push({ field: 'checks.' + index, message: 'check item must be an object' });
      }

      applyBulkCheckFields(checkBody, checkPayload, errors, index);
      checkPayload.status = getString(checkBody.status) || defaultStatus;
      validatePhaseRules(checkPayload, errors);
      payload.checks.push(checkPayload);
    });

    if (errors.length) {
      return next(new ApiError(400, 'Validation failed', errors));
    }

    req.validatedBody = payload;

    return next();
  };
}

const validateCreateHorseCheck = buildCreateValidator();
const validateCreatePreRaceHorseCheck = buildCreateValidator(HORSE_CHECK_PHASE.PRE_RACE);
const validateCreateDuringRaceHorseCheck = buildCreateValidator(HORSE_CHECK_PHASE.DURING_RACE);
const validateCreatePostRaceHorseCheck = buildCreateValidator(HORSE_CHECK_PHASE.POST_RACE);
const validateBulkPreRaceHorseChecks = buildBulkValidator(HORSE_CHECK_PHASE.PRE_RACE);
const validateBulkPostRaceHorseChecks = buildBulkValidator(HORSE_CHECK_PHASE.POST_RACE);

function validateListHorseChecks(req, res, next) {
  const errors = [];
  const query = req.query || {};
  const payload = {};

  ['race_id', 'horse_id', 'referee_id', 'jockey_id'].forEach(function(fieldName) {
    if (query[fieldName] !== undefined) {
      const value = getString(query[fieldName]);

      if (!value || !isObjectId(value)) {
        errors.push({ field: fieldName, message: fieldName + ' must be a valid id' });
      } else {
        payload[fieldName] = value;
      }
    }
  });

  ['phase', 'status'].forEach(function(fieldName) {
    if (query[fieldName] !== undefined) {
      payload[fieldName] = getString(query[fieldName]);
    }
  });

  if (payload.phase && !PHASES.includes(payload.phase)) {
    errors.push({ field: 'phase', message: 'phase is invalid' });
  }

  if (errors.length) {
    return next(new ApiError(400, 'Validation failed', errors));
  }

  req.validatedQuery = payload;

  return next();
}

function validateUpdateHorseCheck(req, res, next) {
  const errors = [];
  const body = req.body || {};
  const payload = {};

  ['health_status', 'check_note', 'event_type', 'severity', 'time_marker', 'description', 'status'].forEach(function(fieldName) {
    if (body[fieldName] !== undefined) {
      payload[fieldName] = getString(body[fieldName]);
    }
  });

  const weight = getOptionalNumber(body, 'weight', errors);
  const isEligible = getOptionalBoolean(body, 'is_eligible', errors);
  const requiresViolation = getOptionalBoolean(body, 'requires_violation', errors);
  const autoConfirmViolation = getOptionalBoolean(body, 'auto_confirm_violation', errors);
  const checklist = getOptionalObject(body, 'checklist', errors);
  const evidenceUrls = getOptionalStringArray(body, 'evidence_urls', errors);
  const issues = getIssues(body, errors);

  if (weight !== undefined) {
    payload.weight = weight;
  }

  if (isEligible !== undefined) {
    payload.is_eligible = isEligible;
  }

  if (requiresViolation !== undefined) {
    payload.requires_violation = requiresViolation;
  }

  if (autoConfirmViolation !== undefined) {
    payload.auto_confirm_violation = autoConfirmViolation;
  }

  if (checklist !== undefined) {
    payload.checklist = checklist;
  }

  if (evidenceUrls !== undefined) {
    payload.evidence_urls = evidenceUrls;
  }

  if (issues !== undefined) {
    payload.issues = issues;
  }

  if (!Object.keys(payload).length) {
    errors.push({ field: 'body', message: 'At least one horse check field is required' });
  }

  if (errors.length) {
    return next(new ApiError(400, 'Validation failed', errors));
  }

  req.validatedBody = payload;

  return next();
}

function validateConfirmBallast(req, res, next) {
  const errors = [];
  const payload = {};
  const ballastAddedKg = getOptionalNumber(req.body || {}, 'ballast_added_kg', errors);

  if (ballastAddedKg === undefined) {
    errors.push({ field: 'ballast_added_kg', message: 'ballast_added_kg is required' });
  } else if (!Number.isFinite(ballastAddedKg) || ballastAddedKg < 0) {
    errors.push({ field: 'ballast_added_kg', message: 'ballast_added_kg must be a non-negative number' });
  } else {
    payload.ballast_added_kg = ballastAddedKg;
  }

  if (errors.length) {
    return next(new ApiError(400, 'Validation failed', errors));
  }

  req.validatedBody = payload;

  return next();
}

module.exports = {
  validateBulkPostRaceHorseChecks,
  validateBulkPreRaceHorseChecks,
  validateCreateHorseCheck,
  validateCreatePreRaceHorseCheck,
  validateCreateDuringRaceHorseCheck,
  validateCreatePostRaceHorseCheck,
  validateConfirmBallast,
  validateListHorseChecks,
  validateUpdateHorseCheck
};
