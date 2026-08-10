const ApiError = require('../utils/ApiError');
const { HORSE_GEAR_CODES } = require('../constants/raceModelInput');

function normalizeGears(value, errors) {
  if (!Array.isArray(value)) {
    errors.push({ field: 'gears', message: 'gears must be an array' });
    return [];
  }
  const gears = Array.from(new Set(value.map(function(item) {
    return String(item || '').trim().toUpperCase();
  }).filter(Boolean)));
  const invalid = gears.filter(function(item) { return !HORSE_GEAR_CODES.includes(item); });
  if (invalid.length) errors.push({ field: 'gears', message: 'Unsupported gear codes: ' + invalid.join(', ') });
  return gears;
}

function validateOwnerEntryDetails(req, res, next) {
  const errors = [];
  const payload = {};
  if ((req.body || {}).gears !== undefined) payload.gears = normalizeGears(req.body.gears, errors);
  if (!Object.keys(payload).length) errors.push({ field: 'body', message: 'gears is required' });
  if (errors.length) return next(new ApiError(400, 'Validation failed', errors));
  req.validatedBody = payload;
  return next();
}

function validateAdminRaceEntry(req, res, next) {
  const body = req.body || {};
  const payload = {};
  const errors = [];
  ['horse_no', 'draw'].forEach(function(field) {
    if (body[field] === undefined || body[field] === '') return;
    const value = Number(body[field]);
    if (!Number.isInteger(value) || value < 1) errors.push({ field: field, message: field + ' must be a positive integer' });
    else payload[field] = value;
  });
  if (body.declared_weight_kg !== undefined && body.declared_weight_kg !== '') {
    const value = Number(body.declared_weight_kg);
    if (!Number.isFinite(value) || value < 40 || value > 75) errors.push({ field: 'declared_weight_kg', message: 'declared_weight_kg must be between 40 and 75' });
    else payload.declared_weight_kg = value;
  }
  if (body.rating_snapshot !== undefined && body.rating_snapshot !== '') {
    const value = Number(body.rating_snapshot);
    if (!Number.isFinite(value) || value < 0 || value > 140) errors.push({ field: 'rating_snapshot', message: 'rating_snapshot must be between 0 and 140' });
    else payload.rating_snapshot = value;
  }
  if (body.gears !== undefined) payload.gears = normalizeGears(body.gears, errors);
  if (!Object.keys(payload).length) errors.push({ field: 'body', message: 'At least one race-entry field is required' });
  if (errors.length) return next(new ApiError(400, 'Validation failed', errors));
  req.validatedBody = payload;
  return next();
}

module.exports = { normalizeGears, validateAdminRaceEntry, validateOwnerEntryDetails };
