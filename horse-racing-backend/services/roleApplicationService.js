const ApiError = require('../utils/ApiError');
const { ROLE_NAMES } = require('../constants/roles');
const roleApplicationRepository = require('../repositories/roleApplicationRepository');
const roleRepository = require('../repositories/roleRepository');
const userRepository = require('../repositories/userRepository');
const { HorseOwner, Jockey, RaceReferee } = require('../models');
const cloudinaryService = require('./cloudinaryService');

function getDocumentId(value) {
  return value && (value._id || value);
}

async function createApplication(req, payload) {
  const user = await userRepository.findById(req.user._id);

  if (!user) {
    throw new ApiError(404, 'User not found');
  }

  if (!user.email_verified || user.status !== 'active') {
    throw new ApiError(403, 'Account must be verified and active before applying for a professional role');
  }

  const roles = await userRepository.getRoleNamesByUserId(user._id);

  if (roles.includes(payload.requested_role)) {
    throw new ApiError(409, 'User already has this role');
  }

  const existingPendingApplication = await roleApplicationRepository.findOne({
    user_id: user._id,
    requested_role: payload.requested_role,
    status: 'pending'
  });

  if (existingPendingApplication) {
    throw new ApiError(409, 'A pending application for this role already exists');
  }

  const applicationData = await uploadApplicationData(payload.requested_role, payload.application_data || {});
  const documents = await uploadDocuments(payload.documents || [], payload.requested_role);
  const application = await roleApplicationRepository.create({
    user_id: user._id,
    requested_role: payload.requested_role,
    application_data: applicationData,
    documents: documents,
    status: 'pending'
  });

  return {
    application: application
  };
}

async function uploadApplicationData(roleName, applicationData) {
  const result = Object.assign({}, applicationData);
  const uploadFields = Array.from(new Set(
    Object.keys(result)
      .filter(function(fieldName) {
        return fieldName.endsWith('_url') || fieldName.endsWith('_file_data');
      })
      .map(function(fieldName) {
        return fieldName.endsWith('_file_data') ? fieldName.replace(/_file_data$/, '_url') : fieldName;
      })
  ));

  for (const fieldName of uploadFields) {
    const fileDataFieldName = fieldName.replace(/_url$/, '_file_data');
    const upload = await cloudinaryService.uploadOptionalSource(
      result[fileDataFieldName],
      result[fieldName],
      { folder: 'horse-racing/role-applications/' + roleName, resource_type: 'auto' }
    );

    if (upload) {
      result[fieldName] = upload.secure_url;
      result[fieldName.replace(/_url$/, '_public_id')] = upload.public_id;
    }

    delete result[fileDataFieldName];
  }

  Object.keys(result).forEach(function(fieldName) {
    if (fieldName.endsWith('_file_data')) {
      delete result[fieldName];
    }
  });

  return result;
}

async function uploadDocuments(documents, roleName) {
  const uploadedDocuments = [];

  for (const document of documents) {
    const upload = await cloudinaryService.uploadOptionalSource(
      document.file_data,
      document.url,
      { folder: 'horse-racing/role-applications/' + roleName + '/documents', resource_type: 'auto' }
    );

    uploadedDocuments.push({
      type: document.type,
      url: upload ? upload.secure_url : document.url,
      public_id: upload ? upload.public_id : undefined,
      note: document.note
    });
  }

  return uploadedDocuments;
}

async function listMyApplications(userId, query) {
  const filter = {
    user_id: userId
  };

  ['requested_role', 'status'].forEach(function(field) {
    if (query[field]) {
      filter[field] = query[field];
    }
  });

  return {
    applications: await roleApplicationRepository.find(filter)
  };
}

async function listApplications(query) {
  const filter = {};

  ['requested_role', 'status'].forEach(function(field) {
    if (query[field]) {
      filter[field] = query[field];
    }
  });

  return {
    applications: await roleApplicationRepository.find(filter)
  };
}

async function getApplication(id) {
  const application = await roleApplicationRepository.findById(id);

  if (!application) {
    throw new ApiError(404, 'Role application not found');
  }

  return {
    application: application
  };
}

async function ensureRoleAssigned(userId, roleName) {
  const role = await roleRepository.findByName(roleName);

  if (!role) {
    throw new ApiError(404, 'Role not found');
  }

  const existingUserRole = await userRepository.findUserRole(userId, role._id);

  if (!existingUserRole) {
    await userRepository.assignRole(userId, role._id);
  }
}

async function upsertProfileFromApplication(userId, roleName, applicationData) {
  if (roleName === ROLE_NAMES.HORSE_OWNER) {
    return HorseOwner.findOneAndUpdate(
      { user_id: userId },
      {
        stable_name: applicationData.stable_name,
        address: applicationData.address,
        license_number: applicationData.license_number,
        status: 'active'
      },
      {
        upsert: true,
        returnDocument: 'after',
        runValidators: true
      }
    );
  }

  if (roleName === ROLE_NAMES.JOCKEY) {
    return Jockey.findOneAndUpdate(
      { user_id: userId },
      {
        height: applicationData.height,
        weight_kg: applicationData.weight_kg,
        experience_years: applicationData.experience_years,
        license_number: applicationData.license_number,
        status: 'active'
      },
      {
        upsert: true,
        returnDocument: 'after',
        runValidators: true
      }
    );
  }

  if (roleName === ROLE_NAMES.RACE_REFEREE) {
    return RaceReferee.findOneAndUpdate(
      { user_id: userId },
      {
        experience_years: applicationData.experience_years,
        license_number: applicationData.license_number,
        status: 'active'
      },
      {
        upsert: true,
        returnDocument: 'after',
        runValidators: true
      }
    );
  }

  return null;
}

async function approveApplication(adminUserId, id, payload) {
  const application = await roleApplicationRepository.findById(id);

  if (!application) {
    throw new ApiError(404, 'Role application not found');
  }

  if (application.status !== 'pending') {
    throw new ApiError(400, 'Only pending applications can be approved');
  }

  const userId = getDocumentId(application.user_id);

  await ensureRoleAssigned(userId, application.requested_role);
  const profile = await upsertProfileFromApplication(userId, application.requested_role, application.application_data || {});
  const updatedApplication = await roleApplicationRepository.updateById(application._id, {
    status: 'approved',
    admin_note: payload.admin_note,
    reviewed_by: adminUserId,
    reviewed_at: new Date()
  });

  return {
    application: updatedApplication,
    profile: profile
  };
}

async function rejectApplication(adminUserId, id, payload) {
  const application = await roleApplicationRepository.findById(id);

  if (!application) {
    throw new ApiError(404, 'Role application not found');
  }

  if (application.status !== 'pending') {
    throw new ApiError(400, 'Only pending applications can be rejected');
  }

  const updatedApplication = await roleApplicationRepository.updateById(application._id, {
    status: 'rejected',
    admin_note: payload.admin_note,
    reviewed_by: adminUserId,
    reviewed_at: new Date()
  });

  return {
    application: updatedApplication
  };
}

module.exports = {
  approveApplication,
  createApplication,
  getApplication,
  listApplications,
  listMyApplications,
  rejectApplication
};
