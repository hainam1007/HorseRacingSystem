/**
 * Drop the "demo." prefix from all demo user emails seeded by seedFullDemo.js.
 * Idempotent — only renames where email starts with "demo.".
 * Usage: node scripts/renameDemoUsers.js [--dry-run]
 */
require("dotenv").config();

const { getSequelize } = require("../config/sequelize");
const { loadSequelizeModels } = require("../models/sequelize");

const PREFIX = "demo.";
const DRY_RUN = process.argv.includes("--dry-run");

async function main() {
  const sequelize = getSequelize();
  await sequelize.authenticate();
  const { models } = modelsSafeLoad();

  const users = await models.User.findAll({
    where: sequelize.literal(`lower(email) LIKE 'demo.%'`),
    attributes: ["id", "email", "full_name"],
    order: [["email", "ASC"]],
  });

  if (users.length === 0) {
    console.log("No demo.* users found — nothing to rename.");
    await sequelize.close();
    return;
  }

  console.log(`Found ${users.length} users to rename.${DRY_RUN ? " (DRY RUN)" : ""}`);
  const existing = await models.User.findAll({
    where: sequelize.literal(`lower(email) NOT LIKE 'demo.%'`),
    attributes: ["email"],
    paranoid: false,
  });
  const taken = new Set(existing.map((u) => u.email.toLowerCase()));

  const transaction = DRY_RUN ? null : await sequelize.transaction();
  let renamed = 0;
  let skipped = 0;

  for (const u of users) {
    const newEmail = u.email.startsWith(PREFIX)
      ? u.email.slice(PREFIX.length)
      : u.email.replace(/^demo\./, "");
    if (taken.has(newEmail.toLowerCase())) {
      console.log(`  SKIP ${u.email.padEnd(36)} -> ${newEmail} (target exists)`);
      skipped++;
      continue;
    }
    if (DRY_RUN) {
      console.log(`  DRY  ${u.email.padEnd(36)} -> ${newEmail}`);
      renamed++;
      continue;
    }
    await u.update({ email: newEmail }, { transaction });
    taken.add(newEmail.toLowerCase());
    console.log(`  OK   ${u.email.padEnd(36)} -> ${newEmail}`);
    renamed++;
  }

  if (transaction) await transaction.commit();
  console.log(`\nDone. Renamed=${renamed} Skipped=${skipped} DryRun=${DRY_RUN}`);
  await sequelize.close();
}

function modelsSafeLoad() {
  return loadSequelizeModels();
}

main().catch((err) => {
  console.error("Rename failed:", err);
  process.exit(1);
});
