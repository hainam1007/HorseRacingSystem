/**
 * Trace all API calls that a Spectator dashboard makes after login
 */
require("dotenv").config();
const axios = require("axios");

const BASE = process.env.APP_URL || "http://localhost:3000";

async function main() {
  // Login as spectator1
  console.log("=== 1. LOGIN ===");
  const loginRes = await axios.post(`${BASE}/api/auth/login`, {
    email: "spectator1@racing.test",
    password: "Password123",
  });
  const { token, roles, user } = loginRes.data.data;
  console.log(`  ✅ Logged in: ${user.full_name} | roles: [${roles.join(", ")}]`);

  const headers = { Authorization: `Bearer ${token}` };

  // 2. Wallet
  console.log("\n=== 2. WALLET ===");
  try {
    const w = await axios.get(`${BASE}/api/wallet/me`, { headers });
    console.log("  ✅ GET /api/wallet/me:", JSON.stringify(w.data.data, null, 2));
  } catch (e) {
    console.log(`  ❌ GET /api/wallet/me: ${e.response?.status} - ${e.response?.data?.message}`);
  }

  // 3. My Bets
  console.log("\n=== 3. BETS ===");
  try {
    const b = await axios.get(`${BASE}/api/bets/me?page=1&limit=100`, { headers });
    console.log("  ✅ GET /api/bets/me:", JSON.stringify(b.data.data, null, 2));
  } catch (e) {
    console.log(`  ❌ GET /api/bets/me: ${e.response?.status} - ${e.response?.data?.message}`);
  }

  // 4. Profile
  console.log("\n=== 4. PROFILE ===");
  try {
    const p = await axios.get(`${BASE}/api/profile/me`, { headers });
    console.log("  ✅ GET /api/profile/me:", JSON.stringify(p.data.data, null, 2));
  } catch (e) {
    console.log(`  ❌ GET /api/profile/me: ${e.response?.status} - ${e.response?.data?.message}`);
  }

  // 5. Tournaments
  console.log("\n=== 5. TOURNAMENTS ===");
  try {
    const t = await axios.get(`${BASE}/api/tournaments`, { headers });
    console.log("  ✅ GET /api/tournaments:", JSON.stringify(t.data.data, null, 2));
  } catch (e) {
    console.log(`  ❌ GET /api/tournaments: ${e.response?.status} - ${e.response?.data?.message}`);
  }

  // 6. Races
  console.log("\n=== 6. RACES ===");
  try {
    const r = await axios.get(`${BASE}/api/races/upcoming`, { headers });
    console.log("  ✅ GET /api/races/upcoming:", JSON.stringify(r.data.data, null, 2));
  } catch (e) {
    console.log(`  ❌ GET /api/races/upcoming: ${e.response?.status} - ${e.response?.data?.message}`);
  }

  // 7. Transaction history
  console.log("\n=== 7. TRANSACTIONS ===");
  try {
    const tx = await axios.get(`${BASE}/api/wallet/transactions`, { headers });
    console.log("  ✅ GET /api/wallet/transactions:", JSON.stringify(tx.data.data, null, 2));
  } catch (e) {
    console.log(`  ❌ GET /api/wallet/transactions: ${e.response?.status} - ${e.response?.data?.message}`);
  }

  // 8. Rewards
  console.log("\n=== 8. REWARDS ===");
  try {
    const rw = await axios.get(`${BASE}/api/rewards/me`, { headers });
    console.log("  ✅ GET /api/rewards/me:", JSON.stringify(rw.data.data, null, 2));
  } catch (e) {
    console.log(`  ❌ GET /api/rewards/me: ${e.response?.status} - ${e.response?.data?.message}`);
  }

  // 9. Deposit packages
  console.log("\n=== 9. DEPOSIT PACKAGES ===");
  try {
    const dp = await axios.get(`${BASE}/api/deposit-packages`, { headers });
    console.log("  ✅ GET /api/deposit-packages:", JSON.stringify(dp.data.data, null, 2));
  } catch (e) {
    console.log(`  ❌ GET /api/deposit-packages: ${e.response?.status} - ${e.response?.data?.message}`);
  }

  // 10. Check spectator profile table
  console.log("\n=== 10. SPOT CHECK DB ===");
  const seq = require("./config/sequelize").getSequelize();
  await seq.authenticate();

  const spectators = await seq.query(
    `SELECT u.email, ur.role_name as role
     FROM users u
     JOIN user_roles ur ON ur.user_id = u.id
     JOIN roles r ON r.id = ur.role_id
     WHERE r.role_name = 'spectator'`,
    { type: seq.QueryTypes.SELECT }
  );
  console.log("  Spectators:", spectators);

  const bets = await seq.query(
    `SELECT b.id, b.spectator_id, b.status, b.stake_amount
     FROM bets b
     JOIN users u ON u.id = b.spectator_id
     WHERE u.email = 'spectator1@racing.test'`,
    { type: seq.QueryTypes.SELECT }
  );
  console.log("  Bets for spectator1:", bets.length, "bets");

  const wallets = await seq.query(
    `SELECT w.token_balance, w.created_at
     FROM wallets w
     JOIN users u ON u.id = w.user_id
     WHERE u.email = 'spectator1@racing.test'`,
    { type: seq.QueryTypes.SELECT }
  );
  console.log("  Wallet for spectator1:", wallets);

  await seq.close();
  console.log("\n=== DONE ===");
}

main().catch((e) => {
  console.error("Error:", e.response?.data || e.message);
  process.exit(1);
});
