const ApiError = require('../utils/ApiError');
const { isObjectId } = require('./commonValidator');
const { ASSIGNMENT_TYPE } = require('../constants/statuses');

const ALLOWED_CONTRACT_FILE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
const MAX_CONTRACT_SOURCE_LENGTH = 10 * 1024 * 1024;

function getString(value) {
  if (typeof value !== 'string') {
    return '';
  }

  return value.trim();
}

function isHttpUrl(value) {
  return value.startsWith('http://') || value.startsWith('https://');
}

function isDataUri(value) {
  return value.startsWith('data:');
}

function getValidDate(value, fieldName, errors) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    errors.push({ field: fieldName, message: fieldName + ' must be a valid date' });
    return null;
  }

  return date;
}

function validateContractPayload(contract, errors) {
  const contractPayload = {};

  ['contract_number', 'title', 'file_url', 'file_data', 'file_type', 'file_name', 'note'].forEach(function(fieldName) {
    if (contract[fieldName] !== undefined) {
      contractPayload[fieldName] = getString(contract[fieldName]);
    }
  });

  if (contractPayload.file_url && !isHttpUrl(contractPayload.file_url)) {
    errors.push({ field: 'contract.file_url', message: 'contract.file_url must be an http or https URL' });
  }

  if (contractPayload.file_data && !isDataUri(contractPayload.file_data)) {
    errors.push({ field: 'contract.file_data', message: 'contract.file_data must be a data URI' });
  }

  if (contractPayload.file_data && contractPayload.file_data.length > MAX_CONTRACT_SOURCE_LENGTH) {
    errors.push({ field: 'contract.file_data', message: 'contract.file_data is too large' });
  }

  if (contractPayload.file_type && !ALLOWED_CONTRACT_FILE_TYPES.includes(contractPayload.file_type)) {
    errors.push({ field: 'contract.file_type', message: 'contract.file_type is not supported' });
  }

  ['contract_number', 'title', 'file_name'].forEach(function(fieldName) {
    if (contractPayload[fieldName] && contractPayload[fieldName].length > 255) {
      errors.push({ field: 'contract.' + fieldName, message: 'contract.' + fieldName + ' is too long' });
    }
  });

  if (contractPayload.note && contractPayload.note.length > 1000) {
    errors.push({ field: 'contract.note', message: 'contract.note must be at most 1000 characters' });
  }

  if (contract.signed_at !== undefined) {
    const signedAt = getValidDate(contract.signed_at, 'contract.signed_at', errors);

    if (signedAt) {
      contractPayload.signed_at = signedAt;
    }
  }

  if (!contractPayload.file_url && !contractPayload.file_data) {
    errors.push({
      field: 'contract.file',
      message: 'contract.file_url or contract.file_data is required'
    });
  }

  return contractPayload;
}

function validateCreateAssignment(req, res, next) {
  const errors = [];
  const body = req.body || {};
  const payload = {};

  ['race_id', 'horse_id', 'jockey_id'].forEach(function(fieldName) {
    const value = getString(body[fieldName]);

    if (!value) {
      errors.push({ field: fieldName, message: fieldName + ' is required' });
    } else if (!isObjectId(value)) {
      errors.push({ field: fieldName, message: fieldName + ' must be a valid id' });
    } else {
      payload[fieldName] = value;
    }
  });

  if (body.owner_id !== undefined) {
    const ownerId = getString(body.owner_id);

    if (!ownerId || !isObjectId(ownerId)) {
      errors.push({ field: 'owner_id', message: 'owner_id must be a valid id' });
    } else {
      payload.owner_id = ownerId;
    }
  }

  const assignmentType = getString(body.assignment_type) || ASSIGNMENT_TYPE.PRIMARY;

  if (!Object.values(ASSIGNMENT_TYPE).includes(assignmentType)) {
    errors.push({ field: 'assignment_type', message: 'assignment_type must be primary or backup' });
  } else {
    payload.assignment_type = assignmentType;
  }

  if (body.backup_priority !== undefined && body.backup_priority !== '') {
    const backupPriority = Number(body.backup_priority);

    if (!Number.isInteger(backupPriority) || backupPriority !== 1) {
      errors.push({ field: 'backup_priority', message: 'backup_priority must be 1 because only one backup jockey is supported' });
    } else {
      payload.backup_priority = backupPriority;
    }
  }

  if (body.invitation_message !== undefined) {
    payload.invitation_message = getString(body.invitation_message);

    if (payload.invitation_message.length > 1000) {
      errors.push({ field: 'invitation_message', message: 'invitation_message must be at most 1000 characters' });
    }
  }

  const meeting = body.meeting || {};
  const meetingPayload = {};

  [
    'title',
    'meeting_url',
    'location_name',
    'address',
    'city',
    'district',
    'ward',
    'map_url',
    'contact_name',
    'contact_phone',
    'note'
  ].forEach(function(fieldName) {
    if (meeting[fieldName] !== undefined) {
      meetingPayload[fieldName] = getString(meeting[fieldName]);
    }
  });

  if (!meetingPayload.title) {
    errors.push({ field: 'meeting.title', message: 'meeting.title is required' });
  } else if (meetingPayload.title.length > 255) {
    errors.push({ field: 'meeting.title', message: 'meeting.title is too long' });
  }

  if (!meetingPayload.location_name) {
    errors.push({ field: 'meeting.location_name', message: 'meeting.location_name is required' });
  } else if (meetingPayload.location_name.length > 255) {
    errors.push({ field: 'meeting.location_name', message: 'meeting.location_name is too long' });
  }

  if (!meetingPayload.address) {
    errors.push({ field: 'meeting.address', message: 'meeting.address is required' });
  } else if (meetingPayload.address.length > 500) {
    errors.push({ field: 'meeting.address', message: 'meeting.address must be at most 500 characters' });
  }

  ['city', 'district', 'ward', 'contact_name'].forEach(function(fieldName) {
    if (meetingPayload[fieldName] && meetingPayload[fieldName].length > 255) {
      errors.push({ field: 'meeting.' + fieldName, message: 'meeting.' + fieldName + ' is too long' });
    }
  });

  if (meetingPayload.contact_phone && meetingPayload.contact_phone.length > 30) {
    errors.push({ field: 'meeting.contact_phone', message: 'meeting.contact_phone must be at most 30 characters' });
  }

  if (meetingPayload.meeting_url && !isHttpUrl(meetingPayload.meeting_url)) {
    errors.push({ field: 'meeting.meeting_url', message: 'meeting.meeting_url must be an http or https URL' });
  }

  if (meetingPayload.map_url && !isHttpUrl(meetingPayload.map_url)) {
    errors.push({ field: 'meeting.map_url', message: 'meeting.map_url must be an http or https URL' });
  }

  if (!meeting.meeting_time) {
    errors.push({ field: 'meeting.meeting_time', message: 'meeting.meeting_time is required' });
  } else {
    const meetingTime = getValidDate(meeting.meeting_time, 'meeting.meeting_time', errors);

    if (meetingTime) {
      if (meetingTime <= new Date()) {
        errors.push({ field: 'meeting.meeting_time', message: 'meeting.meeting_time must be in the future' });
      }

      meetingPayload.meeting_time = meetingTime;
    }
  }

  if (meetingPayload.note && meetingPayload.note.length > 1000) {
    errors.push({ field: 'meeting.note', message: 'meeting.note must be at most 1000 characters' });
  }

  payload.meeting = meetingPayload;

  if (body.contract !== undefined) {
    errors.push({ field: 'contract', message: 'contract cannot be uploaded during invitation create' });
  }

  if (errors.length) {
    return next(new ApiError(400, 'Validation failed', errors));
  }

  req.validatedBody = payload;

  return next();
}

function validatePromoteBackup(req, res, next) {
  const body = req.body || {};
  const reason = getString(body.reason);

  if (reason.length > 1000) {
    return next(new ApiError(400, 'Validation failed', [
      { field: 'reason', message: 'reason must be at most 1000 characters' }
    ]));
  }

  req.validatedBody = {
    reason: reason || 'Backup jockey promoted by owner'
  };

  return next();
}

function validateCancellationRequest(req, res, next) {
  const reason = getString((req.body || {}).reason);
  const errors = [];

  if (!reason) {
    errors.push({ field: 'reason', message: 'reason is required' });
  } else if (reason.length > 1000) {
    errors.push({ field: 'reason', message: 'reason must be at most 1000 characters' });
  }

  if (errors.length) {
    return next(new ApiError(400, 'Validation failed', errors));
  }

  req.validatedBody = { reason };
  return next();
}

function validateWithdrawal(req, res, next) {
  const reason = getString((req.body || {}).reason);
  const errors = [];

  if (!reason) {
    errors.push({ field: 'reason', message: 'reason is required' });
  } else if (reason.length > 1000) {
    errors.push({ field: 'reason', message: 'reason must be at most 1000 characters' });
  }

  if (errors.length) {
    return next(new ApiError(400, 'Validation failed', errors));
  }

  req.validatedBody = { reason };
  return next();
}

function validateCancellationResponse(req, res, next) {
  const body = req.body || {};
  const decision = getString(body.decision).toLowerCase();
  const responseMessage = getString(body.response_message);
  const errors = [];

  if (!['approve', 'reject'].includes(decision)) {
    errors.push({ field: 'decision', message: 'decision must be approve or reject' });
  }

  if (responseMessage.length > 1000) {
    errors.push({ field: 'response_message', message: 'response_message must be at most 1000 characters' });
  }

  if (errors.length) {
    return next(new ApiError(400, 'Validation failed', errors));
  }

  req.validatedBody = {
    decision,
    response_message: responseMessage
  };
  return next();
}

function validateUpdateTerms(req, res, next) {
  const errors = [];
  const body = req.body || {};
  const payload = {};

  payload.agreed_terms = getString(body.agreed_terms);

  if (!payload.agreed_terms) {
    errors.push({ field: 'agreed_terms', message: 'agreed_terms is required' });
  } else if (payload.agreed_terms.length > 5000) {
    errors.push({ field: 'agreed_terms', message: 'agreed_terms must be at most 5000 characters' });
  }

  if (body.meeting_note !== undefined) {
    payload.meeting_note = getString(body.meeting_note);

    if (payload.meeting_note.length > 2000) {
      errors.push({ field: 'meeting_note', message: 'meeting_note must be at most 2000 characters' });
    }
  }

  if (body.agreed_at !== undefined) {
    const agreedAt = getValidDate(body.agreed_at, 'agreed_at', errors);

    if (agreedAt) {
      payload.agreed_at = agreedAt;
    }
  }

  if (errors.length) {
    return next(new ApiError(400, 'Validation failed', errors));
  }

  req.validatedBody = payload;

  return next();
}

function validateUploadContract(req, res, next) {
  const errors = [];
  const body = req.body || {};
  const contractPayload = validateContractPayload(body.contract || body, errors);

  if (errors.length) {
    return next(new ApiError(400, 'Validation failed', errors));
  }

  req.validatedBody = {
    contract: contractPayload
  };

  return next();
}

module.exports = {
  validateCreateAssignment,
  validateWithdrawal,
  validateCancellationRequest,
  validateCancellationResponse,
  validatePromoteBackup,
  validateUpdateTerms,
  validateUploadContract
};
