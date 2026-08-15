import { getRacePhase } from "./refereeConstants";

const asArray = (value) => (Array.isArray(value) ? value : []);

export function getId(value) {
  if (!value) return "";
  if (typeof value === "string") return value;
  return value._id || value.id || "";
}

function getUserName(value, fallback) {
  // `user_id` is usually just a UUID while `user` is the eagerly loaded
  // profile. Prefer the object so full_name is not masked by the ID.
  const user = value?.user && typeof value.user === "object"
    ? value.user
    : (value?.user_id && typeof value.user_id === "object" ? value.user_id : null);
  return user?.full_name || value?.full_name || value?.name || fallback;
}

function extract(payload, keys) {
  for (const key of keys) {
    if (Array.isArray(payload?.[key])) return payload[key];
  }
  return [];
}

function groupMap(source, adapter) {
  if (!source || Array.isArray(source) || typeof source !== "object") {
    return null;
  }

  return new Map(
    Object.entries(source).map(([raceId, rows]) => [
      raceId,
      asArray(rows).map(adapter),
    ])
  );
}

function raceIdOf(value) {
  return getId(value?.race_id || value?.race);
}

function normalizeRaceStatus(status) {
  const value = String(status || "scheduled").trim().toLowerCase();
  if (["ready", "at_gate", "at-the-gate"].includes(value)) return "scheduled";
  return value || "scheduled";
}

function formatDateTime(value) {
  if (!value) return { date: "Unscheduled", time: "TBD" };
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return { date: String(value), time: "TBD" };
  return {
    date: date.toLocaleDateString(),
    time: date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
  };
}

function adaptParticipant(item) {
  const registration = item.registration || item;
  const horse = item.horse && typeof item.horse === "object" ? item.horse : (registration.horse && typeof registration.horse === "object" ? registration.horse : {});
  const owner = item.owner && typeof item.owner === "object"
    ? item.owner
    : (registration.owner && typeof registration.owner === "object" ? registration.owner : (horse.owner && typeof horse.owner === "object" ? horse.owner : {}));
  const assignment = item.assignment || null;
  const jockey = item.jockey && typeof item.jockey === "object"
    ? item.jockey
    : (assignment?.jockey && typeof assignment.jockey === "object" ? assignment.jockey : {});

  return {
    registrationId: getId(registration),
    horseId: getId(horse),
    horseName: horse.name || "Unknown horse",
    horseNo: registration.horse_no ?? null,
    breed: horse.breed || "Not recorded",
    age: horse.date_of_birth ? Math.max(0, new Date().getFullYear() - new Date(horse.date_of_birth).getFullYear()) : null,
    weight: horse.weight ?? null,
    owner: getUserName(owner, owner.stable_name || "Unknown owner"),
    jockeyId: getId(jockey),
    jockeyName: assignment ? getUserName(jockey, "Unknown jockey") : "Not assigned",
    jockeyLicense: jockey.license_number || "Not recorded",
    assignmentId: getId(assignment),
    assignmentStatus: assignment?.status || "unassigned",
    lane: registration.draw ?? registration.lane ?? assignment?.lane ?? null,
    declaredWeightKg: registration.declared_weight_kg ?? null,
    eligible: item.eligible === true,
    blockers: asArray(item.blockers),
    preRaceCheckStatus: item.pre_race_check?.status || "missing",
    preRaceEligible: item.pre_race_check?.is_eligible,
  };
}

function adaptCheck(check) {
  return {
    id: getId(check),
    raceId: raceIdOf(check),
    horseId: getId(check.horse_id),
    jockeyId: getId(check.jockey_id),
    phase: check.phase || "pre_race",
    status: check.status,
    checklist: check.checklist || {},
    issues: asArray(check.issues),
    eventType: check.event_type || "",
    severity: check.severity || "",
    timeMarker: check.time_marker || "",
    description: check.description || "",
    evidenceUrls: asArray(check.evidence_urls),
    linkedViolationId: getId(check.linked_violation_id),
    healthStatus: check.health_status || "",
    weight: check.weight ?? null,
    note: check.check_note || "",
    isEligible: check.is_eligible,
    checkedAt: check.checked_at || null,
  };
}

function adaptViolation(value) {
  const horse = value.horse_id || {};
  const jockey = value.jockey_id || {};
  return {
    id: getId(value),
    raceId: raceIdOf(value),
    horseId: getId(horse),
    jockeyId: getId(jockey),
    horseCheckId: getId(value.horse_check_id),
    type: value.violation_type || "other",
    subjectName: getId(jockey) ? getUserName(jockey, "Unknown jockey") : horse.name || "Unknown horse",
    severity: value.severity || "",
    timeMarker: value.time_marker || "",
    evidenceUrls: asArray(value.evidence_urls),
    evidenceFiles: asArray(value.evidence_files),
    decision: value.decision || "",
    suggestedPenalty: value.suggested_penalty || null,
    proposedPenalty: value.proposed_penalty || null,
    penalty: value.penalty || null,
    penaltyType: value.penalty?.type || value.proposed_penalty?.type || value.suggested_penalty?.type || "pending_review",
    penaltyNote: value.penalty?.note || "",
    penaltySource: value.penalty_source || "",
    policyVersion: value.policy_version || "",
    deviatesFromPolicy: value.deviates_from_policy === true,
    deviationReason: value.deviation_reason || "",
    decisionScope: value.decision_scope || "",
    decidedAt: value.decided_at || null,
    description: value.description || "",
    status: value.status || "recorded",
    timestamp: value.created_at || value.updated_at || null,
  };
}

function adaptResult(value) {
  const horse = value.horse_id || {};
  const jockey = value.jockey_id || {};
  return {
    id: getId(value),
    raceId: raceIdOf(value),
    horseId: getId(horse),
    horseName: horse.name || "Unknown horse",
    jockeyId: getId(jockey),
    jockeyName: getUserName(jockey, "Unknown jockey"),
    position: value.position,
    finishTime: value.finish_time != null && !Number.isNaN(Number(value.finish_time)) ? Number(value.finish_time).toFixed(2) : value.finish_time,
    score: value.score,
    rawPosition: value.raw_position ?? value.position,
    rawFinishTime: (value.raw_finish_time ?? value.finish_time) != null && !Number.isNaN(Number(value.raw_finish_time ?? value.finish_time)) ? Number(value.raw_finish_time ?? value.finish_time).toFixed(2) : (value.raw_finish_time ?? value.finish_time),
    rawScore: value.raw_score ?? value.score,
    finalPosition: value.final_position ?? value.position,
    finalFinishTime: (value.final_finish_time ?? value.finish_time) != null && !Number.isNaN(Number(value.final_finish_time ?? value.finish_time)) ? Number(value.final_finish_time ?? value.finish_time).toFixed(2) : (value.final_finish_time ?? value.finish_time),
    finalScore: value.final_score ?? value.score,
    appliedViolationIds: asArray(value.applied_violation_ids).map(getId).filter(Boolean),
    penaltySnapshotViolationIds: asArray(value.penalty_snapshot_violation_ids).map(getId).filter(Boolean),
    penaltiesAppliedAt: value.penalties_applied_at || null,
    submittedToAdminAt: value.submitted_to_admin_at || null,
    penaltyApplied: Boolean(value.penalties_applied_at),
    submittedToAdmin: Boolean(value.submitted_to_admin_at),
    note: value.note || "",
    correctionRequested: value.correction_requested === true,
    correctionNote: value.correction_note || "",
    correctionRequestedAt: value.correction_requested_at || null,
    status: value.status || "draft",
  };
}

function adaptReport(value) {
  return {
    id: getId(value),
    raceId: raceIdOf(value),
    title: value.report_title || "",
    content: value.report_content || "",
    raceCondition: value.race_condition || "",
    weather: value.weather || "",
    trackCondition: value.track_condition || "",
    conclusion: value.conclusion || "",
    status: value.status || "draft",
    submittedAt: value.submitted_at || null,
  };
}

export function adaptRefereeApiData(payload = {}) {
  const { races, participantPayloads, unavailableRaceIds = [], results, violations, checks, reports } = payload;
  const raceRows = Array.isArray(races) ? races : extract(races, ["races", "data"]);
  const groupedParticipantMap = groupMap(payload.participants_by_race, adaptParticipant);
  const participantMap = groupedParticipantMap || new Map(
    asArray(participantPayloads).map(({ raceId, payload }) => [raceId, extract(payload, ["participants", "data"]).map(adaptParticipant)])
  );
  const unavailableRaceSet = new Set(asArray(unavailableRaceIds));
  const groupedCheckMap = groupMap(payload.horse_checks_by_race, adaptCheck);
  const groupedViolationMap = groupMap(payload.violations_by_race, adaptViolation);
  const groupedResultMap = groupMap(payload.results_by_race, adaptResult);
  const groupedReportMap = groupMap(payload.reports_by_race, adaptReport);
  const allChecks = groupedCheckMap ? [] : extract(checks, ["horse_checks", "checks", "data"]).map(adaptCheck);
  const allViolations = groupedViolationMap ? [] : extract(violations, ["violations", "data"]).map(adaptViolation);
  const allResults = groupedResultMap ? [] : extract(results, ["race_results", "results", "data"]).map(adaptResult);
  const allReports = groupedReportMap ? [] : extract(reports, ["referee_reports", "reports", "data"]).map(adaptReport);

  return raceRows.map((race) => {
    const id = getId(race);
    const schedule = formatDateTime(race.race_date);
    const raceResults = groupedResultMap ? groupedResultMap.get(id) || [] : allResults.filter((item) => item.raceId === id);
    return {
      id,
      name: race.name || "Unnamed race",
      tournament: race.tournament_id?.name || "Tournament not recorded",
      track: race.location || "Track not recorded",
      date: schedule.date,
      startTime: schedule.time,
      status: normalizeRaceStatus(race.status),
      phase: getRacePhase(normalizeRaceStatus(race.status)),
      participants: participantMap.get(id) || [],
      participantsUnavailable: unavailableRaceSet.has(id),
      checks: groupedCheckMap ? groupedCheckMap.get(id) || [] : allChecks.filter((item) => item.raceId === id),
      violations: groupedViolationMap ? groupedViolationMap.get(id) || [] : allViolations.filter((item) => item.raceId === id),
      result: raceResults,
      resultStatus: raceResults.find((item) => ["published", "confirmed"].includes(item.status))?.status || raceResults[0]?.status || null,
      report: groupedReportMap ? (groupedReportMap.get(id) || [])[0] || null : allReports.find((item) => item.raceId === id) || null,
      raw: race,
    };
  });
}
