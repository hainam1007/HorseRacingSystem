const ApiError = require('../utils/ApiError');

function validateUpdateJockey(req, res, next) {
  const body = req.body || {};
  const payload = {};
  const errors = [];
  const ranges = {
    height: [120, 220],
    weight_kg: [30, 100],
    experience_years: [0, 80]
  };

  Object.keys(ranges).forEach(function(field) {
    if (body[field] === undefined || body[field] === '') return;
    const value = Number(body[field]);
    if (!Number.isFinite(value) || value < ranges[field][0] || value > ranges[field][1]) {
      errors.push({ field: field, message: field + ' is invalid' });
    } else {
      payload[field] = value;
    }
  });

  if (body.license_number !== undefined) {
    const licenseNumber = typeof body.license_number === 'string' ? body.license_number.trim() : '';
    if (!licenseNumber) errors.push({ field: 'license_number', message: 'license_number must be a non-empty string' });
    else payload.license_number = licenseNumber;
  }

  if (!Object.keys(payload).length) errors.push({ field: 'body', message: 'At least one jockey profile field is required' });
  if (errors.length) return next(new ApiError(400, 'Validation failed', errors));
  req.validatedBody = payload;
  return next();
}

module.exports = { validateUpdateJockey };
