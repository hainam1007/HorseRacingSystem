const ApiError = require('../utils/ApiError');
const { ROLE_NAMES } = require('../constants/roles');
const { Op } = require('sequelize');
const profileRepository = require('../repositories/profileRepository');
const roleRepository = require('../repositories/roleRepository');
const userRepository = require('../repositories/userRepository');
const { loadSequelizeModels } = require('../models/sequelize/index.js');

function getModels() { return loadSequelizeModels().models; }

function sanitizeUser(user) {
  const plainUser = user && typeof user.toJSON === 'function' ? user.toJSON() : (user && typeof user.toObject === 'function' ? user.toObject() : user);
  const safeUser = Object.assign({}, plainUser);

  delete safeUser.password;
  delete safeUser.email_verification_token;
  delete safeUser.password_reset_token;

  return safeUser;
}

async function buildUserDetail(user) {
  const [roles, profiles] = await Promise.all([
    userRepository.getRoleNamesByUserId(user._id),
    profileRepository.getProfilesByUserId(user._id)
  ]);

  return {
    user: sanitizeUser(user),
    roles: roles,
    profiles: profiles
  };
}

async function listUsers(query) {
  const filter = {};

  if (query.email) {
    filter.email = { [Op.iLike]: `%${query.email}%` };
  }

  if (query.status) {
    filter.status = query.status;
  }

  if (query.role) {
    const role = await roleRepository.findByName(query.role);

    if (!role) {
      return {
        users: [],
        pagination: {
          page: query.page,
          limit: query.limit,
          total: 0,
          total_pages: 0
        }
      };
    }

    const userRoles = await getModels().UserRole.findAll({
      where: { role_id: role._id },
      attributes: ['user_id'],
      raw: true
    });

    filter.id = {
      [Op.in]: userRoles.map(function(userRole) {
        return userRole.user_id;
      })
    };
  }

  const result = await userRepository.find(filter, {
    page: query.page,
    limit: query.limit
  });

  const users = await Promise.all(
    result.users.map(async function(user) {
      return buildUserDetail(user);
    })
  );

  return {
    users: users,
    pagination: result.pagination
  };
}

async function getUserDetail(userId) {
  const user = await userRepository.findById(userId);

  if (!user) {
    throw new ApiError(404, 'User not found');
  }

  return buildUserDetail(user);
}

async function updateUserStatus(userId, payload) {
  const user = await userRepository.updateById(userId, {
    $set: {
      status: payload.status
    }
  });

  if (!user) {
    throw new ApiError(404, 'User not found');
  }

  return buildUserDetail(user);
}

async function ensureProfileForRole(userId, roleName) {
  if (roleName === ROLE_NAMES.HORSE_OWNER) {
    const profile = await getModels().HorseOwner.findOne({ where: { user_id: userId } });
    if (!profile) await getModels().HorseOwner.create({ user_id: userId });
  }

  if (roleName === ROLE_NAMES.JOCKEY) {
    const profile = await getModels().Jockey.findOne({ where: { user_id: userId } });
    if (!profile) await getModels().Jockey.create({ user_id: userId });
  }

  if (roleName === ROLE_NAMES.RACE_REFEREE) {
    const profile = await getModels().RaceReferee.findOne({ where: { user_id: userId } });
    if (!profile) await getModels().RaceReferee.create({ user_id: userId });
  }
}

async function assignRole(userId, roleName) {
  const [user, role] = await Promise.all([
    userRepository.findById(userId),
    roleRepository.findByName(roleName)
  ]);

  if (!user) {
    throw new ApiError(404, 'User not found');
  }

  if (!role) {
    throw new ApiError(404, 'Role not found');
  }

  const existingUserRole = await userRepository.findUserRole(user._id, role._id);

  if (existingUserRole) {
    throw new ApiError(409, 'User already has this role');
  }

  await userRepository.assignRole(user._id, role._id);
  await ensureProfileForRole(user._id, roleName);

  return buildUserDetail(user);
}

async function removeRole(userId, roleName) {
  const [user, role] = await Promise.all([
    userRepository.findById(userId),
    roleRepository.findByName(roleName)
  ]);

  if (!user) {
    throw new ApiError(404, 'User not found');
  }

  if (!role) {
    throw new ApiError(404, 'Role not found');
  }

  const roles = await userRepository.getUserRoleDocsByUserId(user._id);

  if (!roles.some(function(r) {
    return r.role_name === roleName;
  })) {
    throw new ApiError(404, 'User role not found');
  }

  if (roles.length <= 1) {
    throw new ApiError(400, 'User must keep at least one role');
  }

  await userRepository.removeRole(user._id, role._id);

  return buildUserDetail(user);
}

module.exports = {
  assignRole,
  getUserDetail,
  listUsers,
  removeRole,
  updateUserStatus
};
