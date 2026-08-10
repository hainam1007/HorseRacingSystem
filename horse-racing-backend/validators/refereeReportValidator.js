const ApiError = require('../utils/ApiError');
const { isObjectId } = require('./commonValidator');

function getString(value) {
  if (typeof value !== 'string') {
    return '';
  }

  return value.trim();
}

function validateCreateRefereeReport(req, res, next) {
  const errors = [];
  const body = req.body || {};
  const payload = {};
  const raceId = getString(body.race_id);
  const reportTitle = getString(body.report_title);

  if (!raceId) {
    errors.push({ field: 'race_id', message: 'race_id is required' });
  } else if (!isObjectId(raceId)) {
    errors.push({ field: 'race_id', message: 'race_id must be a valid id' });
  } else {
    payload.race_id = raceId;
  }

  if (body.referee_id !== undefined) {
    const refereeId = getString(body.referee_id);

    if (!refereeId || !isObjectId(refereeId)) {
      errors.push({ field: 'referee_id', message: 'referee_id must be a valid id' });
    } else {
      payload.referee_id = refereeId;
    }
  }

  if (!reportTitle) {
    errors.push({ field: 'report_title', message: 'report_title is required' });
  } else {
    payload.report_title = reportTitle;
  }

  ['report_content', 'race_condition', 'weather', 'track_condition', 'conclusion'].forEach(function(fieldName) {
    const value = getString(body[fieldName]);

    if (value) {
      payload[fieldName] = value;
    }
  });

  if (errors.length) {
    return next(new ApiError(400, 'Validation failed', errors));
  }

  req.validatedBody = payload;

  return next();
}

function validateListRefereeReports(req, res, next) {
  const errors = [];
  const query = req.query || {};
  const payload = {};

  ['race_id', 'referee_id'].forEach(function(fieldName) {
    if (query[fieldName] !== undefined) {
      const value = getString(query[fieldName]);

      if (!value || !isObjectId(value)) {
        errors.push({ field: fieldName, message: fieldName + ' must be a valid id' });
      } else {
        payload[fieldName] = value;
      }
    }
  });

  if (query.status !== undefined) {
    const status = getString(query.status);

    if (!status) {
      errors.push({ field: 'status', message: 'status is invalid' });
    } else {
      payload.status = status;
    }
  }

  if (errors.length) {
    return next(new ApiError(400, 'Validation failed', errors));
  }

  req.validatedQuery = payload;

  return next();
}

function validateUpdateRefereeReport(req, res, next) {
  const body = req.body || {};
  const payload = {};

  ['report_title', 'report_content', 'race_condition', 'weather', 'track_condition', 'conclusion'].forEach(
    function(fieldName) {
      if (body[fieldName] !== undefined) {
        payload[fieldName] = getString(body[fieldName]);
      }
    }
  );

  if (!Object.keys(payload).length) {
    return next(new ApiError(400, 'Validation failed', [
      { field: 'body', message: 'At least one referee report field is required' }
    ]));
  }

  if (payload.report_title !== undefined && !payload.report_title) {
    return next(new ApiError(400, 'Validation failed', [
      { field: 'report_title', message: 'report_title cannot be empty' }
    ]));
  }

  req.validatedBody = payload;

  return next();
}

module.exports = {
  validateCreateRefereeReport,
  validateListRefereeReports,
  validateUpdateRefereeReport
};
