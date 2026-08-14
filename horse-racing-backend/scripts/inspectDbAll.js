/**
 * Inspect all business tables — print row counts.
 * Usage: node scripts/inspectDbAll.js
 */
require("dotenv").config();

const { getSequelize } = require("../config/sequelize");
const { loadSequelizeModels } = require("../models/sequelize");

const SKIP = new Set([
  "sequelize",
  "Sequelize",
  "User",
  "Role",
  "UserRole",
  "HorseOwner",
  "Jockey",
  "RaceReferee",
]);

async function main() {
  const sequelize = getSequelize();
  await sequelize.authenticate();
  const { models, sequelize: seq } = loadSequelizeModels();

  // Get all table names from sequelize
  const tables = await seq.getQueryInterface().showAllTables();
  console.log("=== TABLES IN DB ===");
  console.log(tables.sort().join("\n"));

  console.log("\n=== ROW COUNTS ===");
  for (const [name, model] of Object.entries(models)) {
    if (SKIP.has(name)) continue;
    if (typeof model.count !== "function") continue;
    try {
      const count = await model.count();
      const padded = name.padEnd(30);
      console.log(`  ${padded} ${String(count).padStart(6)}`);
    } catch (e) {
      console.log(`  ${name.padEnd(30)} (error: ${e.message})`);
    }
  }

  await sequelize.close();
}

main().catch((err) => {
  console.error("Inspect failed:", err);
  process.exit(1);
});
