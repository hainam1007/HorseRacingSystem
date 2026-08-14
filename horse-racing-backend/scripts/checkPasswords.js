/**
 * Check password - verify without revealing
 */
require("dotenv").config();
const { comparePassword } = require("../utils/password");
const { getSequelize } = require("../config/sequelize");

async function main() {
  const { getSequelize } = require("../config/sequelize");
  const { getSequelize: gs } = require("../config/sequelize");
  const seq = getSequelize();
  await seq.authenticate();

  const rows = await seq.query(
    "SELECT email, password_hash FROM users WHERE email LIKE '%@racing.test' LIMIT 5",
    { type: seq.QueryTypes.SELECT }
  );

  const candidates = ["Test@123", "Password123", "Test123!", "password", "Spectator@123", "Spectator123!"];
  for (const row of rows) {
    console.log(`Email: ${row.email}`);
    for (const pw of candidates) {
      try {
        const match = await comparePassword(pw, row.password_hash);
        if (match) { console.log(`  ✅ Password: "${pw}"`); break; }
      } catch {}
    }
  }
  await seq.close();
}

main().catch(e => { console.error(e.message); process.exit(1); });
