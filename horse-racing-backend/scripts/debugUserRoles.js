/**
 * Check raw user_roles data mismatch
 * Usage: node scripts/debugUserRoles.js
 */
require("dotenv").config();

const { getSequelize } = require("../config/sequelize");

async function main() {
  const sequelize = getSequelize();
  await sequelize.authenticate();

  // All user_roles
  const urs = await sequelize.query(
    "SELECT ur.id, ur.user_id, r.role_name FROM user_roles ur JOIN roles r ON r.id = ur.role_id",
    { type: sequelize.QueryTypes.SELECT }
  );
  console.log("All user_roles:");
  for (const ur of urs) {
    console.log(`  ${ur.role_name.padEnd(16)} user_id=${ur.user_id}`);
  }

  // All users
  const users = await sequelize.query(
    "SELECT id, email FROM users ORDER BY email",
    { type: sequelize.QueryTypes.SELECT }
  );
  console.log("\nAll users:");
  for (const u of users) {
    console.log(`  ${u.email.padEnd(40)} id=${u.id}`);
  }

  // Cross-reference: which user_roles.user_id exists in users?
  console.log("\n=== CROSS-CHECK ===");
  const userIds = new Set(users.map(u => u.id));
  for (const ur of urs) {
    const exists = userIds.has(ur.user_id) ? "✅ EXISTS" : "❌ MISSING from users!";
    const email = users.find(u => u.id === ur.user_id)?.email || "(not found)";
    console.log(`  ${ur.role_name.padEnd(16)} user_id=${ur.user_id} ${exists} (${email})`);
  }

  await sequelize.close();
}

main().catch((err) => {
  console.error("Failed:", err);
  process.exit(1);
});
