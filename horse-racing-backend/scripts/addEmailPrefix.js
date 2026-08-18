/**
 * Add a prefix to the local-part of all users holding a given role.
 * Idempotent — only renames when the local part does NOT already start with prefix.
 *
 * Usage: node scripts/addEmailPrefix.js <role_name> <prefix> [--dry-run]
 *   e.g. node scripts/addEmailPrefix.js horse_owner horse
 */
require("dotenv").config();

const { getSequelize } = require("../config/sequelize");
const { loadSequelizeModels } = require("../models/sequelize");

const roleName = process.argv[2];
const prefix = process.argv[3];
const DRY_RUN = process.argv.includes("--dry-run");

if (!roleName || !prefix) {
  console.error("Usage: node scripts/addEmailPrefix.js <role_name> <prefix> [--dry-run]");
  process.exit(1);
}

async function main() {
  const sequelize = getSequelize();
  await sequelize.authenticate();
  const { models } = loadSequelizeModels();

  const role = await models.Role.findOne({ where: { role_name: roleName } });
  if (!role) {
    console.error(`Role '${roleName}' not found.`);
    await sequelize.close();
    process.exit(1);
  }

  const userIds = await models.UserRole.findAll({
    where: { role_id: role.id },
    attributes: ["user_id"],
  }).then((rows) => rows.map((r) => r.user_id));

  const users = await models.User.findAll({
    where: { id: userIds },
    attributes: ["id", "email", "full_name"],
    order: [["email", "ASC"]],
  });

  if (users.length === 0) {
    console.log(`No users with role '${roleName}'.`);
    await sequelize.close();
    return;
  }

  console.log(`Role '${roleName}' has ${users.length} users.${DRY_RUN ? " (DRY RUN)" : ""}`);

  // Build set of currently taken emails (excluding rows we are about to rename)
  const existing = await models.User.findAll({ attributes: ["id", "email"], paranoid: false });
  const ownIds = new Set(users.map((u) => u.id));
  const taken = new Set(
    existing.filter((u) => !ownIds.has(u.id)).map((u) => u.email.toLowerCase())
  );

  const transaction = DRY_RUN ? null : await sequelize.transaction();
  let renamed = 0;
  let skipped = 0;

  for (const u of users) {
    const atIdx = u.email.indexOf("@");
    if (atIdx < 0) {
      console.log(`  SKIP ${u.email} (invalid)`);
      skipped++;
      continue;
    }
    const local = u.email.slice(0, atIdx);
    const domain = u.email.slice(atIdx);
    if (local.toLowerCase().startsWith(prefix.toLowerCase())) {
      console.log(`  SKIP ${u.email.padEnd(36)} (already has prefix '${prefix}')`);
      skipped++;
      continue;
    }
    const newEmail = `${prefix}${local}${domain}`;
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

main().catch((err) => {
  console.error("Rename failed:", err);
  process.exit(1);
});
