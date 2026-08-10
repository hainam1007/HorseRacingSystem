export const RACE_PHASES = {
  PRE_RACE: "pre_race",
  DURING_RACE: "during_race",
  POST_RACE: "post_race",
};

export const RACE_STATUSES = {
  SCHEDULED: "scheduled",
  RUNNING: "running",
  COMPLETED: "completed",
  CANCELLED: "cancelled",
};

export const RESULT_STATUSES = {
  DRAFT: "draft",
  CONFIRMED: "confirmed",
  PUBLISHED: "published",
};

export function getRacePhase(status) {
  const value = String(status || "").toLowerCase();
  if (["running", "started", "ongoing", "in_progress"].includes(value)) return RACE_PHASES.DURING_RACE;
  if (["completed", "finished", "published"].includes(value)) return RACE_PHASES.POST_RACE;
  if (["cancelled", "canceled", "deleted"].includes(value)) return null;
  return RACE_PHASES.PRE_RACE;
}

export function formatStatus(value) {
  return String(value || "unknown")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}
