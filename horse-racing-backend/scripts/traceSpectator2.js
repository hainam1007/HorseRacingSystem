/**
 * Test exact endpoints the frontend Spectator uses
 */
require("dotenv").config();
const axios = require("axios");

const BASE = process.env.APP_URL || "http://localhost:3000";

async function main() {
  // Login
  const loginRes = await axios.post(`${BASE}/api/auth/login`, {
    email: "spectator1@racing.test",
    password: "Password123",
  });
  const token = loginRes.data.data.token;

  const h = { Authorization: `Bearer ${token}` };

  console.log("=== SPECTATOR DASHBOARD API TRACE ===\n");

  const tests = [
    { label: "Wallet", fn: () => axios.get(`${BASE}/api/wallet/me`, { headers: h }) },
    { label: "Bets", fn: () => axios.get(`${BASE}/api/bets/me?page=1&limit=100`, { headers: h }) },
    { label: "Deposit Packages", fn: () => axios.get(`${BASE}/api/deposit/packages`, { headers: h }) },
    { label: "Rewards", fn: () => axios.get(`${BASE}/api/rewards`, { headers: h }) },
    { label: "My Redemptions", fn: () => axios.get(`${BASE}/api/rewards/redemptions`, { headers: h }) },
    { label: "Transactions", fn: () => axios.get(`${BASE}/api/wallet/transactions`, { headers: h }) },
    { label: "Deposit History", fn: () => axios.get(`${BASE}/api/deposit/history`, { headers: h }) },
  ];

  for (const t of tests) {
    try {
      const r = await t.fn();
      const data = r.data.data;
      const keys = Object.keys(data);
      console.log(`✅ ${t.label.padEnd(22)} [${r.status}] keys: [${keys.join(", ")}]`);
      if (data.items) console.log(`   items count: ${data.items.length}`);
      if (data.packages) console.log(`   packages count: ${data.packages.length}`);
      if (data.tournaments) console.log(`   tournaments count: ${data.tournaments.length}`);
      if (data.total !== undefined) console.log(`   total: ${data.total}`);
    } catch (e) {
      const st = e.response?.status;
      const msg = e.response?.data?.message || e.message;
      const err = e.response?.data?.error || "";
      console.log(`❌ ${t.label.padEnd(22)} [${st}] ${msg} ${err}`);
    }
  }
}

main().catch(e => { console.error(e.response?.data || e.message); process.exit(1); });
