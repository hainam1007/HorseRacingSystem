/**
 * Check which users have wallets vs which don't
 */
require("dotenv").config();

const { getSequelize } = require("../config/sequelize");
const { loadSequelizeModels } = require("../models/sequelize");

async function main() {
  const seq = getSequelize();
  await seq.authenticate();
  const { models } = loadSequelizeModels();

  // All users
  const users = await models.User.findAll({
    attributes: ["id", "email", "created_at"],
    order: [["created_at", "ASC"]],
  });

  // Wallet user_ids
  const walletRows = await seq.query(
    "SELECT user_id, token_balance FROM wallets",
    { type: seq.QueryTypes.SELECT }
  );
  const walletMap = {};
  for (const r of walletRows) walletMap[r.user_id] = r.token_balance;

  // Transaction counts by user
  const txnRows = await seq.query(
    "SELECT user_id, COUNT(*) as cnt FROM transaction_histories GROUP BY user_id",
    { type: seq.QueryTypes.SELECT }
  );
  const txnMap = {};
  for (const r of txnRows) txnMap[r.user_id] = parseInt(r.cnt);

  // Bet counts by user
  const betRows = await seq.query(
    "SELECT user_id, COUNT(*) as cnt FROM bets GROUP BY user_id",
    { type: seq.QueryTypes.SELECT }
  );
  const betMap = {};
  for (const r of betRows) betMap[r.user_id] = parseInt(r.cnt);

  console.log("╔══════════════════════════════════════════════════════════════════════════╗");
  console.log("║  USER           │ ROLE         │ WALLET      │ TXN  │ BETS  │ ACCOUNT AGE ║");
  console.log("╠══════════════════════════════════════════════════════════════════════════╣");

  // Get roles
  const urRows = await seq.query(
    "SELECT ur.user_id, r.role_name FROM user_roles ur JOIN roles r ON r.id = ur.role_id",
    { type: seq.QueryTypes.SELECT }
  );
  const roleMap = {};
  for (const r of urRows) {
    if (!roleMap[r.user_id]) roleMap[r.user_id] = [];
    roleMap[r.user_id].push(r.role_name);
  }

  for (const user of users) {
    const roles = roleMap[user.id] || [];
    const roleStr = roles.join(", ");
    const wallet = walletMap[user.id] ? `$${walletMap[user.id]}` : "❌ NONE";
    const txn = txnMap[user.id] || 0;
    const bets = betMap[user.id] || 0;
    const days = Math.floor((Date.now() - new Date(user.created_at).getTime()) / 86400000);
    const label = roleStr.includes("spectator")
      ? "spectator"
      : roleStr.includes("admin")
      ? "admin     "
      : roleStr.includes("horse_owner")
      ? "horse_owner"
      : roleStr.includes("jockey")
      ? "jockey    "
      : roleStr.includes("race_referee")
      ? "referee   "
      : roleStr;
    console.log(
      `║ ${user.email.substring(0, 20).padEnd(20)} │ ${label.padEnd(12)} │ ${wallet.padEnd(11)} │ ${String(txn).padStart(4)} │ ${String(bets).padStart(5)} │ ${String(days + "d").padStart(10)} ║`
    );
  }
  console.log("╚══════════════════════════════════════════════════════════════════════════╝");

  console.log("\n⚠️  USERS WITHOUT WALLETS:");
  const noWallet = users.filter(u => !walletMap[u.id]);
  for (const u of noWallet) {
    const roles = roleMap[u.id] || [];
    console.log(`  ❌ ${u.email.padEnd(45)} roles=[${roles.join(", ")}]`);
  }

  console.log("\n✅ USERS WITH WALLETS:");
  for (const u of users.filter(u => walletMap[u.id])) {
    const roles = roleMap[u.id] || [];
    console.log(`  ✅ ${u.email.padEnd(45)} roles=[${roles.join(", ")}]`);
  }

  await seq.close();
}

main().catch(e => { console.error(e.message); process.exit(1); });
