/**
 * Trace data loading for ALL roles - CORRECT API PATHS
 */
require("dotenv").config();
const axios = require("axios");

const BASE = process.env.APP_URL || "http://localhost:3000";

const users = [
  { email: "admin@racing.test",        role: "admin",        expectedRoute: "/admin" },
  { email: "spectator1@racing.test",   role: "spectator",    expectedRoute: "/spectator" },
  { email: "referee@racing.test",      role: "race_referee", expectedRoute: "/referee" },
  { email: "horseowner@racing.test",   role: "horse_owner",  expectedRoute: "/owner" },
  { email: "jockey1@racing.test",      role: "jockey",       expectedRoute: "/jockey" },
];

async function testUser(u) {
  const loginRes = await axios.post(`${BASE}/api/auth/login`, {
    email: u.email,
    password: "Password123",
  });
  const { token, roles, user } = loginRes.data.data;
  const h = { Authorization: `Bearer ${token}` };

  console.log(`\n${"=".repeat(60)}`);
  console.log(`  User: ${user.full_name} (${u.email})`);
  console.log(`  Backend roles: [${roles.join(", ")}]`);
  console.log(`  Expected route: ${u.expectedRoute}`);
  console.log("=".repeat(60));

  // Always test wallet
  try {
    const w = await axios.get(`${BASE}/api/wallet/me`, { headers: h });
    console.log(`  ✅ Wallet: token_balance = ${w.data.data.wallet.token_balance}`);
  } catch (e) {
    console.log(`  ❌ Wallet: ${e.response?.status} - ${e.response?.data?.message}`);
  }

  if (u.role === "admin") {
    const tests = [
      ["Dashboard",           () => axios.get(`${BASE}/api/admin/dashboard`, { headers: h })],
      ["Users list",         () => axios.get(`${BASE}/api/admin/users?page=1&limit=5`, { headers: h })],
      ["Rewards statistics", () => axios.get(`${BASE}/api/admin/rewards/statistics`, { headers: h })],
      ["Rewards list",       () => axios.get(`${BASE}/api/admin/rewards`, { headers: h })],
      ["Deposit Packages",   () => axios.get(`${BASE}/api/admin/deposit-packages`, { headers: h })],
      ["Deposit Requests",   () => axios.get(`${BASE}/api/admin/deposit-requests`, { headers: h })],
    ];
    for (const [label, fn] of tests) {
      try {
        const r = await fn();
        const keys = Object.keys(r.data.data || {});
        console.log(`  ✅ ${label}: keys=[${keys.join(", ")}]`);
      } catch (e) {
        console.log(`  ❌ ${label}: ${e.response?.status} - ${e.response?.data?.message || e.response?.data?.error}`);
      }
    }

  } else if (u.role === "spectator") {
    const tests = [
      ["Bets",             () => axios.get(`${BASE}/api/bets/me?page=1&limit=5`, { headers: h })],
      ["Deposit Packages", () => axios.get(`${BASE}/api/deposit/packages`, { headers: h })],
      ["Rewards",          () => axios.get(`${BASE}/api/rewards`, { headers: h })],
      ["Transactions",     () => axios.get(`${BASE}/api/wallet/transactions`, { headers: h })],
      ["Tournaments",      () => axios.get(`${BASE}/api/tournaments`, { headers: h })],
    ];
    for (const [label, fn] of tests) {
      try {
        const r = await fn();
        const d = r.data.data;
        const keys = Object.keys(d);
        console.log(`  ✅ ${label}: keys=[${keys.join(", ")}]`);
      } catch (e) {
        console.log(`  ❌ ${label}: ${e.response?.status} - ${e.response?.data?.message}`);
      }
    }

  } else if (u.role === "race_referee") {
    const tests = [
      ["Workspace",          () => axios.get(`${BASE}/api/referees/me/workspace`, { headers: h })],
      ["Races (GET /races)", () => axios.get(`${BASE}/api/races?page=1&limit=5`, { headers: h })],
      ["Violations",         () => axios.get(`${BASE}/api/violations?page=1&limit=5`, { headers: h })],
      ["Horse Checks",       () => axios.get(`${BASE}/api/horse-checks?page=1&limit=5`, { headers: h })],
    ];
    for (const [label, fn] of tests) {
      try {
        const r = await fn();
        const d = r.data.data;
        const keys = Object.keys(d);
        console.log(`  ✅ ${label}: keys=[${keys.join(", ")}]`);
      } catch (e) {
        console.log(`  ❌ ${label}: ${e.response?.status} - ${e.response?.data?.message || e.response?.data?.error}`);
      }
    }

  } else if (u.role === "horse_owner") {
    const tests = [
      ["Profile",  () => axios.get(`${BASE}/api/horse-owner/profile`, { headers: h })],
      ["Horses",   () => axios.get(`${BASE}/api/horse-owner/horses`, { headers: h })],
      ["Tournaments", () => axios.get(`${BASE}/api/horse-owner/tournaments`, { headers: h })],
    ];
    for (const [label, fn] of tests) {
      try {
        const r = await fn();
        const d = r.data.data;
        const keys = Object.keys(d);
        console.log(`  ✅ ${label}: keys=[${keys.join(", ")}]`);
      } catch (e) {
        console.log(`  ❌ ${label}: ${e.response?.status} - ${e.response?.data?.message || e.response?.data?.error}`);
      }
    }

  } else if (u.role === "jockey") {
    const tests = [
      ["Me",           () => axios.get(`${BASE}/api/jockeys/me`, { headers: h })],
      ["Assignments", () => axios.get(`${BASE}/api/jockeys/me/assignments?page=1&limit=5`, { headers: h })],
      ["Schedule",     () => axios.get(`${BASE}/api/jockeys/me/schedule`, { headers: h })],
      ["Results",      () => axios.get(`${BASE}/api/jockeys/me/results`, { headers: h })],
      ["Stats",        () => axios.get(`${BASE}/api/jockeys/me/stats`, { headers: h })],
    ];
    for (const [label, fn] of tests) {
      try {
        const r = await fn();
        const d = r.data.data;
        const keys = Object.keys(d);
        console.log(`  ✅ ${label}: keys=[${keys.join(", ")}]`);
      } catch (e) {
        console.log(`  ❌ ${label}: ${e.response?.status} - ${e.response?.data?.message || e.response?.data?.error}`);
      }
    }
  }
}

async function main() {
  console.log("TRACE DATA FOR ALL ROLES - CORRECT PATHS");

  for (const u of users) {
    try {
      await testUser(u);
    } catch (e) {
      console.error(`  FATAL for ${u.email}:`, e.response?.data || e.message);
    }
  }

  console.log(`\n${"=".repeat(60)}`);
  console.log("DONE");
}

main().catch(e => { console.error(e); process.exit(1); });
