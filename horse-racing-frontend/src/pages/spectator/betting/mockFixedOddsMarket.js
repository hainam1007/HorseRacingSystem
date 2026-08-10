import { mockContenders } from "../live-race/mockRaceFixtures.js";
import { BET_TYPES, getSelectionKey } from "./fixedOddsRules.js";
import { FIXED_ODDS_CONTRACT_VERSION, FIXED_ODDS_MARKET_STATES, ODDS_CHANGE_POLICY, PAYOUT_ROUNDING } from "./fixedOddsContract.js";

const winOdds = [2.1, 2.8, 3.4, 4.2, 5.6, 6.8, 7.5, 9.0];

function buildSelections(type) {
  const ids = mockContenders.map((horse) => horse.id);
  return Object.fromEntries(ids.map((id, index) => [getSelectionKey(type, [id]), winOdds[index]]));
}

export const mockFixedOddsMarket = Object.freeze({
  contractVersion: FIXED_ODDS_CONTRACT_VERSION,
  id: "market-race-opening-sprint-fixed",
  raceId: "race-opening-sprint",
  status: FIXED_ODDS_MARKET_STATES.OPEN,
  currency: "PTS",
  minStake: 10,
  maxStake: 1000,
  oddsChangePolicy: ODDS_CHANGE_POLICY,
  payoutRounding: PAYOUT_ROUNDING,
  runnerStatuses: {
    "thunderbolt": "active",
    "silver-flash": "active",
    "golden-gallop": "active",
    "midnight-run": "scratched",
    "crimson-comet": "active",
    "blazing-speed": "active",
    "emerald-shadow": "active",
    "sapphire-wind": "active",
  },
  supportedBetTypes: BET_TYPES.map((type) => type.id),
  selections: Object.fromEntries(BET_TYPES.map((type) => [type.id, buildSelections(type)])),
});

export function createMockFixedOddsMarket(raceId) {
  return {
    ...mockFixedOddsMarket,
    id: `market-${raceId}-fixed`,
    raceId,
  };
}

export function getMarketOdds(market, type, horseIds) {
  if (horseIds.length !== type.cardinality) return 0;
  return market.selections[type.id]?.[getSelectionKey(type, horseIds)] || 0;
}
