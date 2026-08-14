const ApiError = require('../utils/ApiError');
const { HORSE_GEAR_CODES } = require('../constants/raceModelInput');

const OBJECT_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function getString(value) {
  if (typeof value !== 'string') {
    return '';
  }

  return value.trim();
}

function getTodayDateKey() {
  const today = new Date();
  return [
    today.getFullYear(),
    String(today.getMonth() + 1).padStart(2, '0'),
    String(today.getDate()).padStart(2, '0')
  ].join('-');
}

function getOptionalString(body, fieldName) {
  if (body[fieldName] === undefined) {
    return undefined;
  }

  return getString(body[fieldName]);
}

function getOptionalNumber(body, fieldName, errors) {
  if (body[fieldName] === undefined || body[fieldName] === null || body[fieldName] === '') {
    return undefined;
  }

  const numberValue = Number(body[fieldName]);

  if (Number.isNaN(numberValue)) {
    errors.push({ field: fieldName, message: fieldName + ' must be a number' });
    return undefined;
  }

  return numberValue;
}

function getOptionalGears(body, fieldName, errors) {
  if (body[fieldName] === undefined) return undefined;
  if (!Array.isArray(body[fieldName])) {
    errors.push({ field: fieldName, message: fieldName + ' must be an array' });
    return undefined;
  }
  const gears = Array.from(new Set(body[fieldName].map(function(item) {
    return String(item || '').trim().toUpperCase();
  }).filter(Boolean)));
  const invalid = gears.filter(function(item) { return !HORSE_GEAR_CODES.includes(item); });
  if (invalid.length) errors.push({ field: fieldName, message: 'Unsupported gear codes: ' + invalid.join(', ') });
  return gears;
}

function validateObjectId(value, fieldName, errors) {
  if (!getString(value) || !OBJECT_ID_PATTERN.test(getString(value))) {
    errors.push({ field: fieldName, message: fieldName + ' must be a valid id' });
  }
}

function validateObjectIdParam(paramName) {
  return function(req, res, next) {
    const errors = [];

    validateObjectId(req.params[paramName], paramName, errors);

    if (errors.length) {
      return next(new ApiError(400, 'Validation failed', errors));
    }

    return next();
  };
}

function validateRegistrationOrderIdParam(req, res, next) {
  const orderId = getString(req.params.orderId);

  if (!/^REG-[A-Za-z0-9-]+$/.test(orderId)) {
    return next(new ApiError(400, 'Validation failed', [{
      field: 'orderId',
      message: 'Invalid registration payment order ID'
    }]));
  }

  return next();
}

function validateUpdateProfile(req, res, next) {
  const body = req.body || {};
  const payload = {};

  ['stable_name', 'address', 'license_number', 'status', 'avatar_url', 'avatar_file_data'].forEach(function(fieldName) {
    const value = getOptionalString(body, fieldName);

    if (value !== undefined) {
      payload[fieldName] = value;
    }
  });

  if (!Object.keys(payload).length) {
    return next(new ApiError(400, 'Validation failed', [
      { field: 'body', message: 'At least one profile field is required' }
    ]));
  }

  req.validatedBody = payload;

  return next();
}

function buildHorsePayload(body, errors) {
  const payload = {};
  const stringFields = [
    'name',
    'breed',
    'gender',
    'color',
    'health_status',
    'registration_number',
    'image_url',
    'image_file_data',
    'status'
  ];

  stringFields.forEach(function(fieldName) {
    const value = getOptionalString(body, fieldName);

    if (value !== undefined) {
      payload[fieldName] = value;
    }
  });

  if (body.date_of_birth !== undefined) {
    const dateInput = getString(body.date_of_birth);
    const dateValue = new Date(dateInput);
    const isDateOnlyInput = /^\d{4}-\d{2}-\d{2}$/.test(dateInput);
    const isFutureDate = isDateOnlyInput
      ? dateInput > getTodayDateKey()
      : dateValue > new Date();

    if (Number.isNaN(dateValue.getTime())) {
      errors.push({ field: 'date_of_birth', message: 'date_of_birth must be a valid date' });
    } else if (isFutureDate) {
      errors.push({ field: 'date_of_birth', message: 'date_of_birth cannot be in the future' });
    } else {
      payload.date_of_birth = dateValue;
    }
  }

  const weight = getOptionalNumber(body, 'weight', errors);

  if (weight !== undefined) {
    payload.weight = weight;
  }

  const defaultGears = getOptionalGears(body, 'default_gears', errors);
  if (defaultGears !== undefined) payload.default_gears = defaultGears;

  return payload;
}

function validateCreateHorse(req, res, next) {
  const errors = [];
  const body = req.body || {};
  const payload = buildHorsePayload(body, errors);

  if (!payload.name) {
    errors.push({ field: 'name', message: 'name is required' });
  }

  if (!payload.registration_number) {
    errors.push({ field: 'registration_number', message: 'registration_number is required' });
  }

  if (errors.length) {
    return next(new ApiError(400, 'Validation failed', errors));
  }

  req.validatedBody = payload;

  return next();
}

function validateUpdateHorse(req, res, next) {
  const errors = [];
  const body = req.body || {};
  const payload = buildHorsePayload(body, errors);

  if (!Object.keys(payload).length) {
    errors.push({ field: 'body', message: 'At least one horse field is required' });
  }

  if (errors.length) {
    return next(new ApiError(400, 'Validation failed', errors));
  }

  req.validatedBody = payload;

  return next();
}

function validateUpdateHorseMedia(req, res, next) {
  const imageUrl = getString((req.body || {}).image_url);
  const imageFileData = getString((req.body || {}).image_file_data);

  if (!imageUrl && !imageFileData) {
    return next(new ApiError(400, 'Validation failed', [
      { field: 'image', message: 'image_url or image_file_data is required' }
    ]));
  }

  req.validatedBody = {
    image_url: imageUrl,
    image_file_data: imageFileData
  };

  return next();
}

function validateRaceRegistration(req, res, next) {
  const errors = [];
  const body = req.body || {};

  validateObjectId(body.horse_id, 'horse_id', errors);
  validateObjectId(body.race_id, 'race_id', errors);

  if (errors.length) {
    return next(new ApiError(400, 'Validation failed', errors));
  }

  const gears = getOptionalGears(body, 'gears', errors);

  if (errors.length) {
    return next(new ApiError(400, 'Validation failed', errors));
  }

  req.validatedBody = {
    horse_id: getString(body.horse_id),
    race_id: getString(body.race_id),
    note: getOptionalString(body, 'note'),
    gears: gears,
    payment_method: 'VNPAY'
  };

  return next();
}

module.exports = {
  validateHorseIdParam: validateObjectIdParam('horseId'),
  validateJockeyIdParam: validateObjectIdParam('jockeyId'),
  validateTournamentIdParam: validateObjectIdParam('tournamentId'),
  validateRaceIdParam: validateObjectIdParam('raceId'),
  validateRegistrationOrderIdParam,
  validateRegistrationIdParam: validateObjectIdParam('registrationId'),
  validateUpdateProfile,
  validateCreateHorse,
  validateUpdateHorse,
  validateUpdateHorseMedia,
  validateRaceRegistration
};
