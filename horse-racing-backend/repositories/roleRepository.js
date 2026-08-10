const { Role } = require('../models');
const { ROLE_OPTIONS } = require('../constants/roles');

async function ensureDefaultRoles() {
  await Promise.all(
    ROLE_OPTIONS.map(function(role) {
      return Role.updateOne(
        { role_name: role.value },
        {
          $setOnInsert: {
            role_name: role.value,
            description: role.description
          }
        },
        { upsert: true }
      );
    })
  );
}

async function findByNames(roleNames) {
  await ensureDefaultRoles();

  return Role.find({
    role_name: {
      $in: roleNames
    }
  });
}

async function findByName(roleName) {
  await ensureDefaultRoles();

  return Role.findOne({ role_name: roleName });
}

async function getAllRoles() {
  await ensureDefaultRoles();

  return Role.find({}).sort({ role_name: 1 }).lean();
}

module.exports = {
  ensureDefaultRoles,
  findByNames,
  findByName,
  getAllRoles
};
