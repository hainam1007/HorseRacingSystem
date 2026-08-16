require("dotenv").config();
const { getSequelize } = require("../config/sequelize");

async function main() {
  const seq = getSequelize();
  await seq.authenticate();

  // Wallet columns
  const cols = await seq.query(
    'SELECT column_name FROM information_schema.columns WHERE table_name = \'wallets\'',
    { type: seq.QueryTypes.SELECT }
  );
  console.log("Wallet columns:", cols.map(c => c.column_name));

  // Sample wallet row
  const row = await seq.query("SELECT * FROM wallets LIMIT 1", { type: seq.QueryTypes.SELECT });
  console.log("\nSample wallet:", row[0]);

  // Count wallets
  const count = await seq.query("SELECT COUNT(*) FROM wallets", { type: seq.QueryTypes.SELECT });
  console.log("\nWallet count:", count[0].count);

  // Get all user_ids from wallets
  const walletUsers = await seq.query(
    "SELECT user_id FROM wallets",
    { type: seq.QueryTypes.SELECT }
  );
  console.log("\nWallets by user_id:", walletUsers.map(r => r.user_id));

  await seq.close();
}

main().catch(e => { console.error(e.message); process.exit(1); });
