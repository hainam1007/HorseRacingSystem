/**
 * Assign roles to users who don't have any in user_roles.
 * Auto-detects role based on email pattern or profile table.
 * Usage: node scripts/seedAllUserRoles.js
 */
require("dotenv").config();

const { getSequelize } = require("../config/sequelize");
const { loadSequelizeModels } = require("../models/sequelize");

async function main() {
  const sequelize = getSequelize();
  await sequelize.authenticate();
  const { models } = loadSequelizeModels();

  // Map role_name -> role_id
  const roles = await models.Role.findAll();
  const roleMap = {};
  for (const r of roles) roleMap[r.role_name] = r.id;
  console.log("Available roles:", Object.keys(roleMap));

  // Get all users with their current roles
  const users = await models.User.findAll({
    attributes: ["id", "email", "full_name"],
    order: [["created_at", "ASC"]],
  });

  // Get existing user_roles
  const existingURs = await models.UserRole.findAll();
  const userWithRoles = new Set(existingURs.map(ur => ur.user_id));

  // Profile tables to role mapping
  const profileToRole = {
    "HorseOwner": "horse_owner",
    "Jockey": "jockey",
    "RaceReferee": "race_referee",
  };

  // Build profile map: user_id -> set of profile types
  const userProfiles = {};
  for (const [modelName, roleName] of Object.entries(profileToRole)) {
    const profileModel = models[modelName];
    if (!profileModel) continue;
    const rows = await profileModel.findAll({ attributes: ["user_id"] });
    for (const row of rows) {
      if (!userProfiles[row.user_id]) userProfiles[row.user_id] = new Set();
      userProfiles[row.user_id].add(roleName);
    }
  }

  // Known email patterns
  const emailRoleMap = {
    "horseowner": "horse_owner",
    "jockey": "jockey",
    "referee": "race_referee",
    "spectator": "spectator",
  };

  console.log(`\nProcessing ${users.length} users...`);

  const toAssign = [];
  for (const user of users) {
    const hasRole = userWithRoles.has(user.id);
    const profiles = userProfiles[user.id] || new Set();

    let suggestedRole = null;

    // 1. From profile table
    if (profiles.size > 0) {
      suggestedRole = [...profiles][0];
    } else {
      // 2. From email pattern
      const emailLower = user.email.toLowerCase();
      for (const [pattern, role] of Object.entries(emailRoleMap)) {
        if (emailLower.includes(pattern)) {
          suggestedRole = role;
          break;
        }
      }
    }

    // 3. Default to spectator if nothing matched
    if (!suggestedRole) suggestedRole = "spectator";

    if (hasRole) {
      const currentRoles = existingURs
        .filter(ur => ur.user_id === user.id)
        .map(ur => {
          const r = roles.find(role => role.id === ur.role_id);
          return r ? r.role_name : ur.role_id;
        });
      console.log(`  ✅ ${user.email.padEnd(45)} has [${currentRoles.join(", ")}]`);
    } else {
      toAssign.push({ user, role: suggestedRole });
      console.log(`  ➕ ${user.email.padEnd(45)} → ${suggestedRole} (will add)`);
    }
  }

  // Assign missing roles
  console.log(`\nAssigning ${toAssign.length} missing roles...`);
  const transaction = await sequelize.transaction();
  let assigned = 0;
  let skipped = 0;

  for (const { user, role } of toAssign) {
    const roleId = roleMap[role];
    if (!roleId) {
      console.log(`  ⚠️  Role '${role}' not found for ${user.email}`);
      skipped++;
      continue;
    }

    // Check if already exists (race condition)
    const existing = await models.UserRole.findOne({
      where: { user_id: user.id, role_id: roleId },
      transaction,
    });
    if (existing) {
      skipped++;
      continue;
    }

    await models.UserRole.create(
      { user_id: user.id, role_id: roleId },
      { transaction }
    );
    console.log(`  ✅ ${user.email} → ${role}`);
    assigned++;
  }

  await transaction.commit();
  console.log(`\nDone: ${assigned} assigned, ${skipped} skipped.`);
  await sequelize.close();
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
