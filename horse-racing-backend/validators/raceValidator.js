const ApiError = require('../utils/ApiError');
const { isObjectId } = require('./commonValidator');
const {
  RACE_CLASSES,
  RACE_COURSES,
  RACE_GOINGS,
  RACE_SURFACES
} = require('../constants/raceModelInput');

function stringValue(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function addObjectId(body, payload, field, errors) {
  if (body[field] === undefined) return;
  const value = stringValue(body[field]);
  if (value === '' && field === 'referee_id') {
    payload[field] = null;
  } else if (!isObjectId(value)) {
    errors.push({ field: field, message: field + ' must be a valid id' });
  } else {
    payload[field] = value;
  }
}

function addNumber(body, payload, field, errors, options) {
  if (body[field] === undefined || body[field] === null || body[field] === '') return;
  const value = Number(body[field]);
  const config = options || {};
  if (!Number.isFinite(value) || (config.integer && !Number.isInteger(value)) || value < (config.min ?? -Infinity)) {
    errors.push({ field: field, message: field + ' is invalid' });
  } else {
    payload[field] = value;
  }
}

function addEnum(body, payload, field, values, errors) {
  if (body[field] === undefined) return;
  const value = stringValue(body[field]);
  if (!values.includes(value)) {
    errors.push({ field: field, message: field + ' is invalid' });
  } else {
    payload[field] = value;
  }
}

function buildRacePayload(body, errors) {
  const payload = {};

  ['tournament_id', 'round_id', 'referee_id', 'racetrack_id'].forEach(function(field) {
    addObjectId(body, payload, field, errors);
  });
  ['name', 'status', 'entry_fee_currency', 'prize_currency'].forEach(function(field) {
    if (body[field] !== undefined) payload[field] = stringValue(body[field]);
  });
  ['location', 'venue_code'].forEach(function(field) {
    if (body[field] !== undefined) {
      errors.push({ field: field, message: field + ' is derived from racetrack and cannot be set directly' });
    }
  });
  if (body.image_file_data !== undefined) {
    const imageFileData = stringValue(body.image_file_data);
    if (!imageFileData.startsWith('data:image/')) {
      errors.push({ field: 'image_file_data', message: 'image_file_data must be an image data URI' });
    } else {
      payload.image_file_data = imageFileData;
    }
  }
  if (body.race_date !== undefined && body.race_date !== null && body.race_date !== '') {
    const raceDate = new Date(body.race_date);
    if (Number.isNaN(raceDate.getTime())) errors.push({ field: 'race_date', message: 'race_date must be a valid date' });
    else payload.race_date = raceDate;
  }
  addNumber(body, payload, 'race_no', errors, { integer: true, min: 1 });
  addNumber(body, payload, 'distance', errors, { min: 1 });
  addNumber(body, payload, 'max_participants', errors, { integer: true, min: 1 });
  addNumber(body, payload, 'entry_fee', errors, { min: 0 });
  addNumber(body, payload, 'prize_pool', errors, { min: 0 });
  addEnum(body, payload, 'course', RACE_COURSES, errors);
  addEnum(body, payload, 'race_class', RACE_CLASSES, errors);
  addEnum(body, payload, 'going', RACE_GOINGS, errors);
  addEnum(body, payload, 'surface', RACE_SURFACES, errors);

  if (body.prize_distribution !== undefined) {
    if (!Array.isArray(body.prize_distribution)) errors.push({ field: 'prize_distribution', message: 'prize_distribution must be an array' });
    else payload.prize_distribution = body.prize_distribution;
  }

  return payload;
}

function validateCreateRace(req, res, next) {
  const errors = [];
  const payload = buildRacePayload(req.body || {}, errors);
  ['tournament_id', 'round_id', 'racetrack_id', 'name'].forEach(function(field) {
    if (!payload[field]) errors.push({ field: field, message: field + ' is required' });
  });
  if (errors.length) return next(new ApiError(400, 'Validation failed', errors));
  req.validatedBody = payload;
  return next();
}

function validateUpdateRace(req, res, next) {
  const errors = [];
  const payload = buildRacePayload(req.body || {}, errors);
  if (!Object.keys(payload).length) errors.push({ field: 'body', message: 'At least one race field is required' });
  if (errors.length) return next(new ApiError(400, 'Validation failed', errors));
  req.validatedBody = payload;
  return next();
}

module.exports = { validateCreateRace, validateUpdateRace };
