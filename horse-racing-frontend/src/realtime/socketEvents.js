export const REALTIME_EVENTS = Object.freeze({
  CONNECTION_STATE: "connection_state",
  BETTING_STATE: "betting_state",
  COUNTDOWN_SYNC: "countdown_sync",
  STOP_BETTING: "stop_betting",
  WALLET_UPDATED: "wallet_updated",
  BET_ACCEPTED: "bet_accepted",
  BET_REJECTED: "bet_rejected",
  RACE_SCRIPT: "race_script",
  RACE_FINISHED: "race_finished",
  ERROR: "realtime_error",
});

export const CONNECTION_STATES = Object.freeze({
  CONNECTING: "connecting",
  CONNECTED: "connected",
  RECONNECTING: "reconnecting",
  DISCONNECTED: "disconnected",
  ERROR: "error",
});

export const MARKET_STATES = Object.freeze({
  SCHEDULED: "scheduled",
  OPEN: "open",
  LOCKED: "locked",
  SETTLED: "settled",
});

export const MOCK_SCENARIO_STATES = Object.freeze([
  "waiting",
  "open",
  "locked",
  "racing",
  "finished",
  "disconnected",
  "error",
]);
