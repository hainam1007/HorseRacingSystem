/**
 * One-shot script: ensure static role catalogue exists, then create
 * admin@racing.test if missing and assign admin role.
 * Idempotent — safe to re-run.
 * Usage: node scripts/seedAdmin.js
 */
require("dotenv").config();

const { getSequelize } = require("../config/sequelize");
const { loadSequelizeModels } = require("../models/sequelize");
const userRepo = require("../repositories/sequelize/userRepository");

const ADMIN_EMAIL = "admin@racing.test";
const ADMIN_PASSWORD = "Password123";
const ADMIN_FULL_NAME = "Racing Administrator";

const STATIC_ROLES = [
  { role_name: "admin", description: "System administrator" },
  { role_name: "horse_owner", description: "Horse owner" },
  { role_name: "jockey", description: "Jockey" },
  { role_name: "race_referee", description: "Race referee" },
  { role_name: "spectator", description: "Spectator" },
];

async function ensureRoles() {
  const { models } = loadSequelizeModels();
  for (const r of STATIC_ROLES) {
    await models.Role.findOrCreate({
      where: { role_name: r.role_name },
      defaults: r,
    });
  }
  const all = await models.Role.findAll({ attributes: ["id", "role_name"] });
  console.log(`Roles ensured (${all.length}):`);
  for (const r of all) {
    console.log(`  - ${r.role_name.padEnd(16)} id=${r.id}`);
  }
  return all;
}

async function ensureAdminRole(roles) {
  return roles.find((r) => r.role_name === "admin");
}

async function main() {
  const sequelize = getSequelize();
  await sequelize.authenticate();

  const allRoles = await ensureRoles();
  const adminRole = await ensureAdminRole(allRoles);

  if (!adminRole) {
    console.error("Admin role not found after ensure — aborting.");
    process.exit(1);
  }

  let user = await userRepo.findByEmail(ADMIN_EMAIL);

  if (!user) {
    const hashed = require("bcryptjs").hashSync(ADMIN_PASSWORD, 10);
    user = await userRepo.createUser({
      email: ADMIN_EMAIL,
      password: hashed,
      full_name: ADMIN_FULL_NAME,
    });
    console.log(`Created user: ${user.email} (${user.id})`);
  } else {
    console.log(`User exists: ${user.email} (${user.id})`);
  }

  // Direct sequelize insert (avoids findByNames timing issue)
  const { models } = loadSequelizeModels();
  const [existing, created] = await models.UserRole.findOrCreate({
    where: { user_id: user.id, role_id: adminRole.id },
    defaults: { user_id: user.id, role_id: adminRole.id },
  });
  console.log(
    `UserRole ${created ? "created" : "already existed"}: user_id=${user.id}, role_id=${adminRole.id}`
  );

  await sequelize.close();
  console.log("Done.");
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
