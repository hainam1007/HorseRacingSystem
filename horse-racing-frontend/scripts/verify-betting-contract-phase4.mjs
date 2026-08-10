import {
  FIXED_ODDS_CONTRACT_VERSION,
  FIXED_ODDS_MARKET_STATES,
  validateAcceptedBetReceipt,
  validateFixedOddsMarket,
} from "../src/pages/spectator/betting/fixedOddsContract.js";
import { BET_TYPES } from "../src/pages/spectator/betting/fixedOddsRules.js";
import { mkdir, writeFile } from "node:fs/promises";

function assert(value, message) {
  if (!value) throw new Error(message);
}

const selections = Object.fromEntries(BET_TYPES.map((type) => [type.id, { sample: 2.5 }]));
const validMarket = {
  contractVersion: FIXED_ODDS_CONTRACT_VERSION,
  id: "market-1",
  raceId: "race-1",
  status: FIXED_ODDS_MARKET_STATES.OPEN,
  currency: "PTS",
  minStake: 10,
  maxStake: 1000,
  supportedBetTypes: BET_TYPES.map((type) => type.id),
  runnerStatuses: { "horse-1": "active" },
  selections,
};

assert(validateFixedOddsMarket(validMarket, "race-1").isValid, "Valid market contract was rejected.");
assert(!validateFixedOddsMarket({ ...validMarket, contractVersion: 99 }, "race-1").isValid, "Unknown contract version was accepted.");
assert(!validateFixedOddsMarket({ ...validMarket, status: "unknown" }, "race-1").isValid, "Unknown market status was accepted.");
assert(!validateFixedOddsMarket({ ...validMarket, raceId: "race-2" }, "race-1").isValid, "Cross-race market was accepted.");
assert(!validateFixedOddsMarket({ ...validMarket, runnerStatuses: null }, "race-1").isValid, "Market without runner availability was accepted.");

const request = { race_id: "race-1", stake: 200 };
const validReceipt = {
  bet: {
    id: "bet-1",
    race_id: "race-1",
    stake: 200,
    status: "accepted",
    accepted_odds: 3.25,
    potential_return: 650,
  },
  wallet: { balance: 1080, currency: "PTS" },
};

assert(validateAcceptedBetReceipt(validReceipt, request).isValid, "Valid accepted receipt was rejected.");
assert(!validateAcceptedBetReceipt({ ...validReceipt, bet: { ...validReceipt.bet, accepted_odds: null } }, request).isValid, "Receipt without accepted odds was accepted.");
assert(!validateAcceptedBetReceipt({ ...validReceipt, bet: { ...validReceipt.bet, stake: 201 } }, request).isValid, "Receipt with mismatched stake was accepted.");
assert(!validateAcceptedBetReceipt({ ...validReceipt, wallet: {} }, request).isValid, "Receipt without wallet balance was accepted.");

const report = {
  passed: true,
  assertions: [
    "Accepted the versioned canonical market contract",
    "Rejected unknown versions, statuses, race IDs, and missing runner availability",
    "Accepted a receipt containing server-owned accepted odds and potential return",
    "Rejected malformed or mismatched accepted receipts",
  ],
};

await mkdir(new URL("../artifacts/betting-contract-phase-4/", import.meta.url), { recursive: true });
await writeFile(new URL("../artifacts/betting-contract-phase-4/verification-report.json", import.meta.url), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
