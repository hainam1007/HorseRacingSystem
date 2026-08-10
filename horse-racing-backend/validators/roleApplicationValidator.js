const ApiError = require('../utils/ApiError');
const { ROLE_NAMES } = require('../constants/roles');

const APPLICATION_ROLES = [
  ROLE_NAMES.HORSE_OWNER,
  ROLE_NAMES.JOCKEY,
  ROLE_NAMES.RACE_REFEREE
];

function getString(value) {
  if (typeof value !== 'string') {
    return '';
  }

  return value.trim();
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

  const value = Number(body[fieldName]);

  if (Number.isNaN(value)) {
    errors.push({ field: fieldName, message: fieldName + ' must be a number' });
    return undefined;
  }

  return value;
}

function pickDocuments(body) {
  if (!Array.isArray(body.documents)) {
    return [];
  }

  return body.documents
    .map(function(document) {
      return {
        type: getString(document.type),
        url: getString(document.url),
        file_data: getString(document.file_data),
        note: getString(document.note)
      };
    })
    .filter(function(document) {
      return document.type || document.url || document.file_data || document.note;
    });
}

function addRequiredString(payload, body, fieldName, errors) {
  const value = getString(body[fieldName]);

  if (!value) {
    errors.push({ field: fieldName, message: fieldName + ' is required' });
  } else {
    payload[fieldName] = value;
  }
}

function addRequiredFileSource(payload, body, urlFieldName, errors) {
  const urlValue = getString(body[urlFieldName]);
  const fileDataFieldName = urlFieldName.replace(/_url$/, '_file_data');
  const fileDataValue = getString(body[fileDataFieldName]);

  if (!urlValue && !fileDataValue) {
    errors.push({
      field: urlFieldName,
      message: urlFieldName + ' or ' + fileDataFieldName + ' is required'
    });
  }

  if (urlValue) {
    payload[urlFieldName] = urlValue;
  }

  if (fileDataValue) {
    payload[fileDataFieldName] = fileDataValue;
  }
}

function addOptionalFileSource(payload, body, urlFieldName) {
  const urlValue = getOptionalString(body, urlFieldName);
  const fileDataFieldName = urlFieldName.replace(/_url$/, '_file_data');
  const fileDataValue = getOptionalString(body, fileDataFieldName);

  if (urlValue !== undefined) {
    payload[urlFieldName] = urlValue;
  }

  if (fileDataValue !== undefined) {
    payload[fileDataFieldName] = fileDataValue;
  }
}

function buildHorseOwnerApplication(body, errors) {
  const payload = {};

  ['stable_name', 'address', 'license_number', 'ownership_type'].forEach(function(fieldName) {
    addRequiredString(payload, body, fieldName, errors);
  });

  ['tax_id'].forEach(function(fieldName) {
    const value = getOptionalString(body, fieldName);

    if (value !== undefined) {
      payload[fieldName] = value;
    }
  });
  ['identity_document_url', 'owner_license_document_url', 'horse_ownership_proof_url'].forEach(function(fieldName) {
    addOptionalFileSource(payload, body, fieldName);
  });

  return payload;
}

function buildJockeyApplication(body, errors) {
  const payload = {};

  ['license_number'].forEach(function(fieldName) {
    addRequiredString(payload, body, fieldName, errors);
  });
  ['medical_clearance_url', 'racing_license_document_url'].forEach(function(fieldName) {
    addRequiredFileSource(payload, body, fieldName, errors);
  });

  ['riding_certificate_url', 'identity_document_url'].forEach(function(fieldName) {
    addOptionalFileSource(payload, body, fieldName);
  });

  ['height', 'experience_years'].forEach(function(fieldName) {
    const value = getOptionalNumber(body, fieldName, errors);

    if (value === undefined) {
      errors.push({ field: fieldName, message: fieldName + ' is required' });
    } else {
      payload[fieldName] = value;
    }
  });
  const weightKgField = body.weight_kg !== undefined ? 'weight_kg' : 'weight';
  const weightKg = getOptionalNumber(body, weightKgField, errors);

  if (weightKg === undefined || weightKg < 30 || weightKg > 100) {
    errors.push({ field: 'weight_kg', message: 'weight_kg between 30 and 100 is required' });
  } else {
    payload.weight_kg = weightKg;
  }

  return payload;
}

function buildRaceRefereeApplication(body, errors) {
  const payload = {};

  [
    'license_number',
    'accreditation_body',
  ].forEach(function(fieldName) {
    addRequiredString(payload, body, fieldName, errors);
  });
  ['rules_training_certificate_url', 'background_check_url'].forEach(function(fieldName) {
    addRequiredFileSource(payload, body, fieldName, errors);
  });

  ['identity_document_url', 'previous_official_role'].forEach(function(fieldName) {
    if (fieldName.endsWith('_url')) {
      addOptionalFileSource(payload, body, fieldName);
    } else {
      const value = getOptionalString(body, fieldName);

      if (value !== undefined) {
        payload[fieldName] = value;
      }
    }
  });

  const experienceYears = getOptionalNumber(body, 'experience_years', errors);

  if (experienceYears === undefined) {
    errors.push({ field: 'experience_years', message: 'experience_years is required' });
  } else {
    payload.experience_years = experienceYears;
  }

  return payload;
}

function validateCreateApplication(roleName) {
  return function(req, res, next) {
    const errors = [];
    const body = req.body || {};
    let applicationData = {};

    if (roleName === ROLE_NAMES.HORSE_OWNER) {
      applicationData = buildHorseOwnerApplication(body, errors);
    }

    if (roleName === ROLE_NAMES.JOCKEY) {
      applicationData = buildJockeyApplication(body, errors);
    }

    if (roleName === ROLE_NAMES.RACE_REFEREE) {
      applicationData = buildRaceRefereeApplication(body, errors);
    }

    if (errors.length) {
      return next(new ApiError(400, 'Validation failed', errors));
    }

    req.validatedBody = {
      requested_role: roleName,
      application_data: applicationData,
      documents: pickDocuments(body)
    };

    return next();
  };
}

function validateListApplications(req, res, next) {
  const errors = [];
  const query = req.query || {};
  const payload = {};

  if (query.requested_role !== undefined) {
    const roleName = getString(query.requested_role).toLowerCase();

    if (!APPLICATION_ROLES.includes(roleName)) {
      errors.push({ field: 'requested_role', message: 'requested_role is invalid' });
    } else {
      payload.requested_role = roleName;
    }
  }

  if (query.status !== undefined) {
    const status = getString(query.status).toLowerCase();

    if (!['pending', 'approved', 'rejected'].includes(status)) {
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

function validateReviewApplication(req, res, next) {
  req.validatedBody = {
    admin_note: getOptionalString(req.body || {}, 'admin_note')
  };

  return next();
}

module.exports = {
  validateCreateApplication,
  validateListApplications,
  validateReviewApplication
};
