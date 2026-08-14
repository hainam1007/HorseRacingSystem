/**
 * Inspect DB — print counts and samples of users, roles, user_roles, profiles.
 * Usage: node scripts/inspectDb.js
 */
require("dotenv").config();

const { getSequelize } = require("../config/sequelize");
const { loadSequelizeModels } = require("../models/sequelize");

async function main() {
  const sequelize = getSequelize();
  await sequelize.authenticate();
  const { models } = loadSequelizeModels();

  console.log("=== ROLES ===");
  const roles = await models.Role.findAll({ order: [["role_name", "ASC"]] });
  console.log(`Total: ${roles.length}`);
  for (const r of roles) {
    console.log(`  - ${r.role_name.padEnd(16)} desc=${r.description ?? "null"}`);
  }

  console.log("\n=== USERS ===");
  const users = await models.User.findAll({
    attributes: ["id", "email", "full_name", "status", "email_verified"],
    order: [["created_at", "ASC"]],
  });
  console.log(`Total: ${users.length}`);
  for (const u of users) {
    const ur = await models.UserRole.findAll({ where: { user_id: u.id } });
    const roleIds = ur.map((x) => x.role_id);
    const roleNames = (
      await models.Role.findAll({ where: { id: roleIds } })
    ).map((r) => r.role_name);
    console.log(
      `  - ${u.email.padEnd(28)} status=${u.status.padEnd(20)} verified=${u.email_verified} roles=[${roleNames.join(", ")}]`
    );
  }

  console.log("\n=== USER_ROLES ===");
  const urs = await models.UserRole.findAll();
  console.log(`Total: ${urs.length}`);

  console.log("\n=== PROFILE TABLES ===");
  for (const [name, model] of Object.entries(models)) {
    if (["Wallet", "HorseOwner", "Jockey", "RaceReferee", "Spectator"].includes(name)) {
      const count = await model.count();
      console.log(`  - ${name.padEnd(16)} count=${count}`);
    }
  }

  await sequelize.close();
}

main().catch((err) => {
  console.error("Inspect failed:", err);
  process.exit(1);
});
