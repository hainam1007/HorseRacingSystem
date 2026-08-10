export const RACE_STATUS = Object.freeze({
  SCHEDULED: "scheduled",
  RUNNING: "running",
  COMPLETED: "completed",
  CANCELLED: "cancelled",
  POSTPONED: "postponed",
  UNKNOWN: "unknown",
});

export const BETTING_STATUS = Object.freeze({
  UNAVAILABLE: "unavailable",
  SCHEDULED: "scheduled",
  OPEN: "open",
  SUSPENDED: "suspended",
  CLOSED: "closed",
  SETTLED: "settled",
  VOID: "void",
});

export const raceStatusMeta = {
  [RACE_STATUS.SCHEDULED]: { label: "Scheduled", tone: "neutral" },
  [RACE_STATUS.RUNNING]: { label: "Live", tone: "live" },
  [RACE_STATUS.COMPLETED]: { label: "Completed", tone: "muted" },
  [RACE_STATUS.CANCELLED]: { label: "Cancelled", tone: "danger" },
  [RACE_STATUS.POSTPONED]: { label: "Postponed", tone: "amber" },
  [RACE_STATUS.UNKNOWN]: { label: "Status pending", tone: "neutral" },
};

export const bettingStatusMeta = {
  [BETTING_STATUS.UNAVAILABLE]: { label: "Market unavailable", tone: "muted" },
  [BETTING_STATUS.SCHEDULED]: { label: "Opening soon", tone: "neutral" },
  [BETTING_STATUS.OPEN]: { label: "Prediction open", tone: "open" },
  [BETTING_STATUS.SUSPENDED]: { label: "Market suspended", tone: "amber" },
  [BETTING_STATUS.CLOSED]: { label: "Prediction closed", tone: "muted" },
  [BETTING_STATUS.SETTLED]: { label: "Market settled", tone: "muted" },
  [BETTING_STATUS.VOID]: { label: "Market void", tone: "danger" },
};

export function normalizeRaceLifecycle(status) {
  const value = String(status || "").trim().toLowerCase();

  if (["scheduled", "upcoming", "pending"].includes(value)) return RACE_STATUS.SCHEDULED;
  if (["ready", "at_gate", "at-the-gate"].includes(value)) return RACE_STATUS.SCHEDULED;
  if (["active", "started", "running", "ongoing", "in_progress", "in-progress"].includes(value)) return RACE_STATUS.RUNNING;
  if (["completed", "finished", "published"].includes(value)) return RACE_STATUS.COMPLETED;
  if (["cancelled", "canceled"].includes(value)) return RACE_STATUS.CANCELLED;
  if (["postponed", "delayed"].includes(value)) return RACE_STATUS.POSTPONED;
  return RACE_STATUS.UNKNOWN;
}

export function normalizeBettingMarketStatus(status) {
  const value = String(status || "").trim().toLowerCase();

  if (["open", "active"].includes(value)) return BETTING_STATUS.OPEN;
  if (["scheduled", "upcoming", "pending", "generated"].includes(value)) return BETTING_STATUS.SCHEDULED;
  if (["suspended", "paused"].includes(value)) return BETTING_STATUS.SUSPENDED;
  if (["closed", "locked", "stopped"].includes(value)) return BETTING_STATUS.CLOSED;
  if (["settled", "completed"].includes(value)) return BETTING_STATUS.SETTLED;
  if (["void", "cancelled", "canceled"].includes(value)) return BETTING_STATUS.VOID;
  return BETTING_STATUS.UNAVAILABLE;
}

export function canBetOnRace(race) {
  return race?.bettingStatus === BETTING_STATUS.OPEN;
}

export function getRaceSortWeight(race) {
  if (race.raceStatus === RACE_STATUS.RUNNING) return 0;
  if (race.bettingStatus === BETTING_STATUS.OPEN) return 1;
  if (race.raceStatus === RACE_STATUS.SCHEDULED) return 2;
  if (race.raceStatus === RACE_STATUS.COMPLETED) return 3;
  return 4;
}
