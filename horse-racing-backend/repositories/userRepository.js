const { User, UserRole, Role } = require('../models');

async function findById(id) {
  return User.findById(id);
}

async function find(filter, options) {
  const page = options && options.page ? options.page : 1;
  const limit = options && options.limit ? options.limit : 20;
  const skip = (page - 1) * limit;

  const [users, total] = await Promise.all([
    User.aggregate([
      { $match: filter || {} },
      {
        $addFields: {
          admin_status_rank: {
            $switch: {
              branches: [
                { case: { $eq: ['$status', 'pending_verification'] }, then: 0 },
                { case: { $eq: ['$status', 'active'] }, then: 1 },
                { case: { $eq: ['$status', 'blocked'] }, then: 2 },
                { case: { $eq: ['$status', 'disabled'] }, then: 3 }
              ],
              default: 4
            }
          }
        }
      },
      { $sort: { admin_status_rank: 1, created_at: -1 } },
      { $skip: skip },
      { $limit: limit },
      {
        $project: {
          password: 0,
          email_verification_token: 0,
          password_reset_token: 0,
          admin_status_rank: 0
        }
      }
    ]),
    User.countDocuments(filter || {})
  ]);

  return {
    users: users,
    pagination: {
      page: page,
      limit: limit,
      total: total,
      total_pages: Math.ceil(total / limit)
    }
  };
}

async function findByEmail(email) {
  return User.findOne({ email: email.toLowerCase() });
}

async function findByEmailWithPassword(email) {
  return User.findOne({ email: email.toLowerCase() }).select('+password');
}

async function findByIdWithPassword(id) {
  return User.findById(id).select('+password');
}

async function findByEmailWithAuthSecrets(email) {
  return User.findOne({ email: email.toLowerCase() }).select(
    '+password +email_verification_token +email_verification_expires_at +password_reset_token +password_reset_expires_at'
  );
}

async function findByVerificationToken(tokenHash) {
  return User.findOne({
    email_verification_token: tokenHash,
    email_verification_expires_at: {
      $gt: new Date()
    }
  }).select('+email_verification_token +email_verification_expires_at');
}

async function findByPasswordResetToken(tokenHash) {
  return User.findOne({
    password_reset_token: tokenHash,
    password_reset_expires_at: {
      $gt: new Date()
    }
  }).select('+password +password_reset_token +password_reset_expires_at');
}

async function createUser(userData) {
  return User.create(userData);
}

async function updateById(id, updateData) {
  return User.findByIdAndUpdate(id, updateData, {
    returnDocument: 'after',
    runValidators: true
  });
}

async function getRoleNamesByUserId(userId) {
  const userRoles = await UserRole.find({ user_id: userId }).populate('role_id', 'role_name');

  return userRoles
    .map(function(userRole) {
      return userRole.role_id && userRole.role_id.role_name;
    })
    .filter(Boolean);
}

async function getUserWithRoles(userId) {
  const user = await User.findById(userId).lean();

  if (!user) {
    return null;
  }

  const roles = await getRoleNamesByUserId(user._id);

  return {
    user: user,
    roles: roles
  };
}

async function getUserRoleDocsByUserId(userId) {
  return UserRole.find({ user_id: userId }).populate('role_id', 'role_name description').lean();
}

async function findUserRole(userId, roleId) {
  return UserRole.findOne({ user_id: userId, role_id: roleId });
}

async function assignRoles(userId, roles) {
  const roleIds = roles.map(function(role) {
    return role._id;
  });

  await UserRole.insertMany(
    roleIds.map(function(roleId) {
      return {
        user_id: userId,
        role_id: roleId
      };
    }),
    { ordered: false }
  );
}

async function assignRole(userId, roleId) {
  return UserRole.create({
    user_id: userId,
    role_id: roleId
  });
}

async function removeRole(userId, roleId) {
  return UserRole.findOneAndDelete({
    user_id: userId,
    role_id: roleId
  });
}

module.exports = {
  findById,
  find,
  findByEmail,
  findByEmailWithPassword,
  findByIdWithPassword,
  findByEmailWithAuthSecrets,
  findByVerificationToken,
  findByPasswordResetToken,
  createUser,
  updateById,
  getRoleNamesByUserId,
  getUserWithRoles,
  getUserRoleDocsByUserId,
  findUserRole,
  assignRoles,
  assignRole,
  removeRole
};
