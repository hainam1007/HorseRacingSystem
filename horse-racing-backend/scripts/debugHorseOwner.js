/**
 * Debug: check horseowner@racing.test HorseOwner record
 */
require("dotenv").config();
const axios = require("axios");

const BASE = process.env.APP_URL || "http://localhost:3000";

async function main() {
  const loginRes = await axios.post(`${BASE}/api/auth/login`, {
    email: "horseowner@racing.test",
    password: "Password123",
  });
  const { token, roles, user } = loginRes.data.data;
  const h = { Authorization: `Bearer ${token}` };

  console.log("=== DEBUG: Horse Owner ===");
  console.log("user from login:", JSON.stringify(user, null, 2));
  console.log("roles from login:", roles);
  console.log("user._id:", user._id);
  console.log("user.id:", user.id);

  // Get raw token payload
  const jwt = require('jsonwebtoken');
  const jwtSecret = process.env.JWT_SECRET || 'horse_racing_jwt_secret_key_2024';
  try {
    const decoded = jwt.decode(token);
    console.log("\nJWT payload:", JSON.stringify(decoded, null, 2));
  } catch (e) {
    console.log("JWT decode failed:", e.message);
  }

  // Check DB directly - use full path
  const path = require("path");
  const { getSequelize } = require(path.join(__dirname, "..", "config", "sequelize"));
  const seq = getSequelize();

  // Find user by email
  const [userRow] = await seq.query(
    `SELECT id, email, full_name FROM users WHERE email = 'horseowner@racing.test'`,
    { type: seq.QueryTypes.SELECT }
  );
  console.log("\nDB User row:", userRow);

  // Find horse owner by user id
  const [ownerRow] = await seq.query(
    `SELECT id, user_id, stable_name FROM horse_owners WHERE user_id = $1`,
    { bind: [userRow?.id], type: seq.QueryTypes.SELECT }
  );
  console.log("DB HorseOwner row:", ownerRow);

  // Check what req.user looks like from the API perspective
  try {
    const me = await axios.get(`${BASE}/api/auth/me`, { headers: h });
    console.log("\n/auth/me response:", JSON.stringify(me.data.data, null, 2));
  } catch (e) {
    console.log("/auth/me error:", e.response?.data);
  }

  // Try the exact API call
  try {
    const profile = await axios.get(`${BASE}/api/horse-owner/profile`, { headers: h });
    console.log("\nHorse Owner Profile: OK");
  } catch (e) {
    console.log("\nHorse Owner Profile error:", e.response?.status, e.response?.data);
  }

  await seq.close();
}

main().catch(e => { console.error(e); process.exit(1); });
