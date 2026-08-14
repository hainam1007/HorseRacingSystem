/**
 * Debug: login flow trace for a specific user
 * Usage: node scripts/debugLogin.js <email>
 */
require("dotenv").config();

const { getSequelize } = require("../config/sequelize");
const { loadSequelizeModels } = require("../models/sequelize");
const userRepo = require("../repositories/sequelize/userRepository");
const profileRepo = require("../repositories/sequelize/profileRepository");

async function main() {
  const email = process.argv[2] || "spectator1@racing.test";
  const sequelize = getSequelize();
  await sequelize.authenticate();
  const { models } = loadSequelizeModels();

  console.log(`\n=== DEBUG: ${email} ===`);

  // Step 1: findByEmailWithPassword
  const user = await userRepo.findByEmailWithPassword(email);
  if (!user) { console.log("User not found"); process.exit(1); }

  console.log("\n1. findByEmailWithPassword result:");
  console.log("   user.id        =", user.id);
  console.log("   user._id       =", user._id);
  console.log("   user.email     =", user.email);
  console.log("   user.dataValues.id =", user.dataValues?.id);
  console.log("   typeof user.id =", typeof user.id);

  // Step 2: getRoleNamesByUserId with different ID forms
  console.log("\n2. getRoleNamesByUserId tests:");
  const ids = [
    { label: "user.id",        value: user.id },
    { label: "user._id",       value: user._id },
    { label: "String(user.id)", value: String(user.id) },
    { label: "String(user._id)", value: user._id ? String(user._id) : null },
  ];
  for (const { label, value } of ids) {
    if (!value) { console.log(`   ${label}: (null/undefined)`); continue; }
    const roles = await userRepo.getRoleNamesByUserId(value);
    console.log(`   ${label} (${value}): [${roles.join(", ")}]`);
  }

  // Step 3: Direct SQL
  console.log("\n3. Direct SQL query:");
  const rows = await sequelize.query(
    `SELECT ur.id, ur.user_id, ur.role_id, r.role_name
     FROM user_roles ur
     JOIN roles r ON r.id = ur.role_id
     WHERE ur.user_id = $1`,
    { bind: [user.id], type: sequelize.QueryTypes.SELECT }
  );
  console.log("   Rows:", rows);

  // Step 4: profiles
  console.log("\n4. getProfilesByUserId:");
  const profiles = await profileRepo.getProfilesByUserId(user.id);
  console.log("   Profiles:", profiles);

  await sequelize.close();
}

main().catch((err) => {
  console.error("Debug failed:", err);
  process.exit(1);
});
