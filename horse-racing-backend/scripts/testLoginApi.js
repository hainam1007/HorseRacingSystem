/**
 * Test login API directly — check actual HTTP response
 */
require("dotenv").config();

const axios = require("axios");

const BASE = process.env.APP_URL || "http://localhost:3000";

const TEST_USERS = [
  "spectator1@racing.test",
  "admin@racing.test",
  "referee@racing.test",
  "horseowner@racing.test",
  "jockey1@racing.test",
];

async function main() {
  for (const email of TEST_USERS) {
    try {
      console.log(`\n=== LOGIN: ${email} ===`);
      const loginRes = await axios.post(`${BASE}/api/auth/login`, {
        email,
        password: "Password123",
      });
      const { token, roles, user } = loginRes.data.data;
      console.log(`  roles: [${roles.join(", ")}]`);
      console.log(`  user: ${user?.full_name} (${user?.email})`);

      // Call /auth/me
      const meRes = await axios.get(`${BASE}/api/auth/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const meData = meRes.data.data;
      console.log(`  /auth/me roles: [${(meData.roles || []).join(", ")}]`);
      console.log(`  /auth/me profiles: ${JSON.stringify(Object.keys(meData.profiles || {}))}`);

      // Call /wallet/me
      try {
        const walletRes = await axios.get(`${BASE}/api/wallet/me`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        console.log(`  /wallet/me: OK (status ${walletRes.status})`);
      } catch (w) {
        console.log(`  /wallet/me: ERROR ${w.response?.status} - ${w.response?.data?.message || w.message}`);
      }
    } catch (err) {
      const msg = err.response?.data?.message || err.message;
      const status = err.response?.status;
      console.log(`  ERROR ${status}: ${msg}`);
    }
  }
}

main().catch((e) => {
  console.error("Test failed:", e.message);
  process.exit(1);
});
