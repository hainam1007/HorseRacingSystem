const ApiError = require('../utils/ApiError');
const {
  PENALTY_TYPE,
  VIOLATION_SEVERITY,
  VIOLATION_STATUS,
  VIOLATION_TYPE
} = require('../constants/statuses');
const { isObjectId } = require('./commonValidator');

const ALLOWED_EVIDENCE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'video/mp4'];
const MAX_EVIDENCE_SOURCE_LENGTH = 15 * 1024 * 1024;

function getString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function getNonNegativeNumber(value, fieldName, errors) {
  if (value === undefined || value === null || value === '') {
    return 0;
  }

  const number = Number(value);

  if (Number.isNaN(number) || number < 0) {
    errors.push({ field: fieldName, message: fieldName + ' must be a non-negative number' });
    return 0;
  }

  return number;
}

function validateIds(body, payload, errors) {
  ['race_id', 'horse_id', 'jockey_id', 'referee_id', 'horse_check_id'].forEach(function(fieldName) {
    if (body[fieldName] === undefined) {
      return;
    }

    const value = getString(body[fieldName]);

    if (!value || !isObjectId(value)) {
      errors.push({ field: fieldName, message: fieldName + ' must be a valid id' });
    } else {
      payload[fieldName] = value;
    }
  });
}

function validateEvidenceFiles(body, errors) {
  const evidenceFiles = [];

  if (body.evidence_urls !== undefined) {
    if (!Array.isArray(body.evidence_urls)) {
      errors.push({ field: 'evidence_urls', message: 'evidence_urls must be an array' });
    } else {
      body.evidence_urls.forEach(function(value, index) {
        const url = getString(value);

        if (!url.startsWith('http://') && !url.startsWith('https://')) {
          errors.push({ field: 'evidence_urls.' + index, message: 'evidence URL must use http or https' });
        } else {
          evidenceFiles.push({ url: url });
        }
      });
    }
  }

  if (body.evidence_files !== undefined) {
    if (!Array.isArray(body.evidence_files)) {
      errors.push({ field: 'evidence_files', message: 'evidence_files must be an array' });
    } else {
      body.evidence_files.forEach(function(file, index) {
        if (!file || typeof file !== 'object' || Array.isArray(file)) {
          errors.push({ field: 'evidence_files.' + index, message: 'evidence file must be an object' });
          return;
        }

        const fileData = getString(file.file_data);
        const url = getString(file.url);
        const type = getString(file.type);

        if (!fileData && !url) {
          errors.push({ field: 'evidence_files.' + index, message: 'file_data or url is required' });
        }

        if (fileData && !fileData.startsWith('data:')) {
          errors.push({ field: 'evidence_files.' + index + '.file_data', message: 'file_data must be a data URI' });
        }

        if (fileData && fileData.length > MAX_EVIDENCE_SOURCE_LENGTH) {
          errors.push({ field: 'evidence_files.' + index + '.file_data', message: 'file_data is too large' });
        }

        if (url && !url.startsWith('http://') && !url.startsWith('https://')) {
          errors.push({ field: 'evidence_files.' + index + '.url', message: 'url must use http or https' });
        }

        if (type && !ALLOWED_EVIDENCE_TYPES.includes(type)) {
          errors.push({ field: 'evidence_files.' + index + '.type', message: 'evidence type is not supported' });
        }

        evidenceFiles.push({
          file_data: fileData || undefined,
          url: url || undefined,
          type: type || undefined,
          file_name: getString(file.file_name) || undefined
        });
      });
    }
  }

  return evidenceFiles;
}

function validatePenalty(penalty, errors) {
  if (!penalty || typeof penalty !== 'object' || Array.isArray(penalty)) {
    errors.push({ field: 'penalty', message: 'penalty must be an object' });
    return {};
  }

  const payload = {
    type: getString(penalty.type),
    score_deduction: getNonNegativeNumber(penalty.score_deduction, 'penalty.score_deduction', errors),
    position_delta: getNonNegativeNumber(penalty.position_delta, 'penalty.position_delta', errors),
    time_penalty_seconds: getNonNegativeNumber(penalty.time_penalty_seconds, 'penalty.time_penalty_seconds', errors),
    suspension_days: getNonNegativeNumber(penalty.suspension_days, 'penalty.suspension_days', errors),
    fine_amount: getNonNegativeNumber(penalty.fine_amount, 'penalty.fine_amount', errors),
    disqualified: penalty.disqualified === true,
    note: getString(penalty.note)
  };

  if (!Object.values(PENALTY_TYPE).includes(payload.type)) {
    errors.push({ field: 'penalty.type', message: 'penalty.type is invalid' });
  }

  if (payload.type === PENALTY_TYPE.SCORE_DEDUCTION && payload.score_deduction <= 0) {
    errors.push({ field: 'penalty.score_deduction', message: 'score_deduction must be greater than 0' });
  }

  if (payload.type === PENALTY_TYPE.TIME_PENALTY && payload.time_penalty_seconds <= 0) {
    errors.push({ field: 'penalty.time_penalty_seconds', message: 'time_penalty_seconds must be greater than 0' });
  }

  if (payload.type === PENALTY_TYPE.POSITION_DEMOTION && payload.position_delta <= 0) {
    errors.push({ field: 'penalty.position_delta', message: 'position_delta must be greater than 0' });
  }

  if (payload.type === PENALTY_TYPE.SUSPENSION && payload.suspension_days <= 0) {
    errors.push({ field: 'penalty.suspension_days', message: 'suspension_days must be greater than 0' });
  }

  if (payload.type === PENALTY_TYPE.FINE && payload.fine_amount <= 0) {
    errors.push({ field: 'penalty.fine_amount', message: 'fine_amount must be greater than 0' });
  }

  if (payload.type === PENALTY_TYPE.DISQUALIFICATION) {
    payload.disqualified = true;
  } else if (payload.disqualified) {
    errors.push({
      field: 'penalty.disqualified',
      message: 'disqualified can only be true for a disqualification penalty'
    });
  }

  return payload;
}

function validateCreateViolation(req, res, next) {
  const errors = [];
  const body = req.body || {};
  const payload = {};

  validateIds(body, payload, errors);

  if (!payload.race_id) {
    errors.push({ field: 'race_id', message: 'race_id is required' });
  }

  payload.violation_type = getString(body.violation_type);
  payload.severity = getString(body.severity) || VIOLATION_SEVERITY.MINOR;
  payload.status = getString(body.status) || VIOLATION_STATUS.RECORDED;

  if (!Object.values(VIOLATION_TYPE).includes(payload.violation_type)) {
    errors.push({ field: 'violation_type', message: 'violation_type is invalid' });
  }

  if (!Object.values(VIOLATION_SEVERITY).includes(payload.severity)) {
    errors.push({ field: 'severity', message: 'severity is invalid' });
  }

  if (![VIOLATION_STATUS.RECORDED, VIOLATION_STATUS.UNDER_REVIEW].includes(payload.status)) {
    errors.push({ field: 'status', message: 'new violation status must be recorded or under_review' });
  }

  ['description', 'time_marker'].forEach(function(fieldName) {
    if (body[fieldName] !== undefined) {
      payload[fieldName] = getString(body[fieldName]);
    }
  });

  payload.evidence_files = validateEvidenceFiles(body, errors);

  if (body.penalty !== undefined) {
    errors.push({ field: 'penalty', message: 'penalty is calculated by the backend and cannot be provided when creating a violation' });
  }

  if (body.auto_confirm !== undefined) {
    if (typeof body.auto_confirm !== 'boolean') {
      errors.push({ field: 'auto_confirm', message: 'auto_confirm must be a boolean' });
    } else {
      payload.auto_confirm = body.auto_confirm;
    }
  }

  if (errors.length) {
    return next(new ApiError(400, 'Validation failed', errors));
  }

  req.validatedBody = payload;
  return next();
}

function validateUpdateViolation(req, res, next) {
  const errors = [];
  const body = req.body || {};
  const payload = {};

  ['description', 'time_marker'].forEach(function(fieldName) {
    if (body[fieldName] !== undefined) {
      payload[fieldName] = getString(body[fieldName]);
    }
  });

  if (body.severity !== undefined) {
    payload.severity = getString(body.severity);

    if (!Object.values(VIOLATION_SEVERITY).includes(payload.severity)) {
      errors.push({ field: 'severity', message: 'severity is invalid' });
    }
  }

  if (body.status !== undefined) {
    payload.status = getString(body.status);

    if (payload.status !== VIOLATION_STATUS.UNDER_REVIEW) {
      errors.push({ field: 'status', message: 'PATCH can only move violation to under_review' });
    }
  }

  if (body.evidence_files !== undefined || body.evidence_urls !== undefined) {
    payload.evidence_files = validateEvidenceFiles(body, errors);
  }

  if (!Object.keys(payload).length) {
    errors.push({ field: 'body', message: 'At least one violation field is required' });
  }

  if (errors.length) {
    return next(new ApiError(400, 'Validation failed', errors));
  }

  req.validatedBody = payload;
  return next();
}

function validateConfirmViolation(req, res, next) {
  const errors = [];
  const body = req.body || {};
  const decision = getString(body.decision);

  if (!decision) {
    errors.push({ field: 'decision', message: 'decision is required' });
  }

  const penalty = body.penalty === undefined ? undefined : validatePenalty(body.penalty, errors);
  const deviationReason = getString(body.deviation_reason);

  if (deviationReason.length > 1000) {
    errors.push({
      field: 'deviation_reason',
      message: 'deviation_reason must not exceed 1000 characters'
    });
  }

  if (errors.length) {
    return next(new ApiError(400, 'Validation failed', errors));
  }

  req.validatedBody = {
    decision: decision,
    penalty: penalty,
    deviation_reason: deviationReason || undefined
  };
  return next();
}

function validatePenaltyPreview(req, res, next) {
  const body = req.body || {};
  const violationType = getString(body.violation_type);
  const severity = getString(body.severity) || VIOLATION_SEVERITY.MINOR;
  const errors = [];

  if (!Object.values(VIOLATION_TYPE).includes(violationType)) {
    errors.push({ field: 'violation_type', message: 'violation_type is invalid' });
  }

  if (!Object.values(VIOLATION_SEVERITY).includes(severity)) {
    errors.push({ field: 'severity', message: 'severity is invalid' });
  }

  if (errors.length) {
    return next(new ApiError(400, 'Validation failed', errors));
  }

  req.validatedBody = {
    violation_type: violationType,
    severity: severity
  };
  return next();
}

function validateDismissViolation(req, res, next) {
  const decision = getString((req.body || {}).decision);

  if (!decision) {
    return next(new ApiError(400, 'Validation failed', [
      { field: 'decision', message: 'decision is required' }
    ]));
  }

  req.validatedBody = { decision: decision };
  return next();
}

function validateListViolations(req, res, next) {
  const errors = [];
  const query = req.query || {};
  const payload = {};

  ['race_id', 'horse_id', 'jockey_id', 'referee_id', 'horse_check_id'].forEach(function(fieldName) {
    if (query[fieldName] !== undefined) {
      const value = getString(query[fieldName]);

      if (!value || !isObjectId(value)) {
        errors.push({ field: fieldName, message: fieldName + ' must be a valid id' });
      } else {
        payload[fieldName] = value;
      }
    }
  });

  ['status', 'severity', 'violation_type'].forEach(function(fieldName) {
    if (query[fieldName] !== undefined) {
      payload[fieldName] = getString(query[fieldName]);
    }
  });

  if (payload.status && !Object.values(VIOLATION_STATUS).includes(payload.status)) {
    errors.push({ field: 'status', message: 'status is invalid' });
  }

  if (payload.severity && !Object.values(VIOLATION_SEVERITY).includes(payload.severity)) {
    errors.push({ field: 'severity', message: 'severity is invalid' });
  }

  if (payload.violation_type && !Object.values(VIOLATION_TYPE).includes(payload.violation_type)) {
    errors.push({ field: 'violation_type', message: 'violation_type is invalid' });
  }

  if (errors.length) {
    return next(new ApiError(400, 'Validation failed', errors));
  }

  req.validatedQuery = payload;
  return next();
}

module.exports = {
  validateConfirmViolation,
  validateCreateViolation,
  validateDismissViolation,
  validateListViolations,
  validatePenaltyPreview,
  validateUpdateViolation
};
