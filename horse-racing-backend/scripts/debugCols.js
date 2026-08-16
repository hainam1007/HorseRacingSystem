require("dotenv").config();
const { getSequelize } = require("../config/sequelize");

async function main() {
  const seq = getSequelize();
  await seq.authenticate();

  const betsCols = await seq.query(
    "SELECT column_name FROM information_schema.columns WHERE table_name = 'bets'",
    { type: seq.QueryTypes.SELECT }
  );
  console.log("Bets columns:", betsCols.map(r => r.column_name));

  const txnCols = await seq.query(
    "SELECT column_name FROM information_schema.columns WHERE table_name = 'transaction_histories'",
    { type: seq.QueryTypes.SELECT }
  );
  console.log("Txn columns:", txnCols.map(r => r.column_name));

  const sampleBet = await seq.query("SELECT * FROM bets LIMIT 1", { type: seq.QueryTypes.SELECT });
  console.log("Sample bet:", sampleBet[0]);

  await seq.close();
}

main().catch(e => { console.error(e.message); process.exit(1); });
