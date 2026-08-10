import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Eye,
  Flag,
  RefreshCw,
  Search,
  ShieldAlert,
  X,
} from "lucide-react";
import LoadingSkeleton from "../components/LoadingSkeleton";
import PenaltyDecisionEditor, {
  buildPenaltyFromPolicy,
  penaltiesEqual,
} from "../components/PenaltyDecisionEditor";
import { adminApi } from "../api/adminApi";
import AdminLayout from "./AdminLayout";

const CHECK_ACTIONS = [
  {
    label: "Investigate",
    status: "under_investigation",
    note: "Moved to admin investigation from incident desk.",
  },
  {
    label: "Needs review",
    status: "needs_review",
    note: "Flagged for steward review from incident desk.",
  },
  {
    label: "Race stopped",
    status: "race_stopped",
    note: "Race stop confirmed by admin incident desk.",
    danger: true,
  },
  {
    label: "Clear incident",
    status: "normal",
    note: "Incident cleared by admin incident desk.",
  },
];

const PAGE_SIZE = 20;

const openStatuses = new Set(["recorded", "under_review"]);
const abnormalCheckStatuses = new Set([
  "failed",
  "needs_review",
  "scratched",
  "incident_recorded",
  "race_stopped",
  "minor_issue",
  "injury_detected",
  "requires_vet_follow_up",
  "under_investigation",
]);

function asArray(value) {
  if (Array.isArray(value)) return value;
  return [];
}

function extractList(payload, keys) {
  if (Array.isArray(payload)) return payload;
  for (const key of keys) {
    if (Array.isArray(payload?.[key])) return payload[key];
  }
  return [];
}

function getId(value) {
  if (!value) return "";
  if (typeof value === "string") return value;
  return value._id || value.id || "";
}

function getUserName(value, fallback = "Not recorded") {
  const user = value?.user_id || value?.user || {};
  return user.full_name || value?.full_name || value?.name || fallback;
}

function formatLabel(value, fallback = "Not recorded") {
  if (value === undefined || value === null || value === "") return fallback;
  return String(value)
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatDate(value) {
  if (!value) return "No timestamp";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString([], {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function raceName(value) {
  const race = value?.race_id || value?.race || {};
  return race.name || value?.race_name || "Race not recorded";
}

function tournamentName(value) {
  const race = value?.race_id || value?.race || {};
  return race.tournament_id?.name || race.tournament?.name || value?.tournament_name || "Tournament not recorded";
}

function horseName(value) {
  const horse = value?.horse_id || value?.horse || {};
  return horse.name || "Horse not recorded";
}

function jockeyName(value) {
  const jockey = value?.jockey_id || value?.jockey || {};
  return getId(jockey) ? getUserName(jockey, "Jockey not recorded") : "Jockey not recorded";
}

function refereeName(value) {
  const referee = value?.referee_id || value?.referee || {};
  return getUserName(referee, "Referee not recorded");
}

function subjectName(violation) {
  const jockey = violation?.jockey_id || {};
  const horse = violation?.horse_id || {};
  if (getId(jockey)) return getUserName(jockey, "Jockey not recorded");
  return horse.name || "Subject not recorded";
}

function describePenalty(penalty) {
  if (!penalty?.type) return "Policy pending";
  const facts = [formatLabel(penalty.type)];
  if (penalty.time_penalty_seconds) facts.push(`+${penalty.time_penalty_seconds}s`);
  if (penalty.position_delta) facts.push(`${penalty.position_delta} position`);
  if (penalty.score_deduction) facts.push(`-${penalty.score_deduction} score`);
  if (penalty.suspension_days) facts.push(`${penalty.suspension_days} day suspension`);
  if (penalty.fine_amount) facts.push(`${penalty.fine_amount} fine`);
  if (penalty.disqualified) facts.push("Disqualification");
  return facts.join(" - ");
}

function toneForStatus(value) {
  const status = String(value || "").toLowerCase();
  if (["normal", "passed", "confirmed", "resolved"].includes(status)) return "green";
  if (["recorded", "under_review", "needs_review", "minor_issue", "incident_recorded"].includes(status)) return "amber";
  if (["race_stopped", "injury_detected", "failed", "scratched"].includes(status)) return "red";
  if (["under_investigation"].includes(status)) return "blue";
  return "gray";
}

function statusPriority(value) {
  const status = String(value || "").toLowerCase();
  if (["recorded", "under_review", "needs_review", "under_investigation"].includes(status)) return 0;
  if (["race_stopped", "injury_detected", "failed", "scratched"].includes(status)) return 1;
  if (["minor_issue", "incident_recorded"].includes(status)) return 2;
  if (["confirmed", "resolved", "normal", "passed"].includes(status)) return 3;
  if (["dismissed"].includes(status)) return 4;
  return 9;
}

function StatusBadge({ value }) {
  return <span className={`admin-status-badge admin-status-badge--${toneForStatus(value)}`}>{formatLabel(value, "Unknown")}</span>;
}

function adaptCheck(check, linkedViolations = []) {
  const primaryViolation = linkedViolations[0] || null;
  return {
    id: getId(check),
    kind: "check",
    typeLabel: primaryViolation ? "Check + violation" : "Race incident",
    race: raceName(check),
    tournament: tournamentName(check),
    subject: horseName(check),
    secondarySubject: jockeyName(check),
    referee: refereeName(check),
    status: check.status || "unknown",
    phase: check.phase || "during_race",
    severity: check.severity || primaryViolation?.severity || "none",
    eventType: check.event_type || primaryViolation?.violation_type || "other",
    timeMarker: check.time_marker || primaryViolation?.time_marker || "Not recorded",
    description: check.description || check.check_note || primaryViolation?.description || "No description recorded.",
    checkedAt: check.checked_at || primaryViolation?.created_at || null,
    rawCheck: check,
    violations: linkedViolations,
  };
}

function adaptViolation(violation) {
  return {
    id: getId(violation),
    kind: "violation",
    typeLabel: "Policy violation",
    race: raceName(violation),
    tournament: tournamentName(violation),
    subject: subjectName(violation),
    secondarySubject: violation.horse_id?.name && getId(violation.jockey_id) ? violation.horse_id.name : "Race subject",
    referee: refereeName(violation),
    status: violation.status || "recorded",
    phase: "violation",
    severity: violation.severity || "minor",
    eventType: violation.violation_type || "other",
    timeMarker: violation.time_marker || "Not recorded",
    description: violation.description || "No description recorded.",
    checkedAt: violation.created_at || violation.decided_at || null,
    rawCheck: null,
    violations: [violation],
  };
}

function AdminIncidentModule() {
  const [checks, setChecks] = useState([]);
  const [violations, setViolations] = useState([]);
  const [selectedId, setSelectedId] = useState("");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("open");
  const [page, setPage] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [actionLoading, setActionLoading] = useState("");
  const [decisionNote, setDecisionNote] = useState("");
  const [violationOptions, setViolationOptions] = useState(null);
  const [activeViolationId, setActiveViolationId] = useState("");
  const [penaltyDecision, setPenaltyDecision] = useState(null);
  const [deviationReason, setDeviationReason] = useState("");

  const loadData = useCallback(async () => {
    setIsLoading(true);
    setError("");
    try {
      const [checkPayload, violationPayload, optionPayload] = await Promise.all([
        adminApi.listHorseChecks(),
        adminApi.listViolations(),
        adminApi.getViolationOptions(),
      ]);
      setChecks(extractList(checkPayload, ["horse_checks", "checks", "data"]));
      setViolations(extractList(violationPayload, ["violations", "data"]));
      setViolationOptions(optionPayload);
    } catch (apiError) {
      setError(apiError.message || "We couldn't load the incident queue.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    if (!notice) return undefined;
    const timer = window.setTimeout(() => setNotice(""), 4200);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const records = useMemo(() => {
    const violationByCheckId = new Map();
    violations.forEach((violation) => {
      const checkId = getId(violation.horse_check_id);
      if (!checkId) return;
      const rows = violationByCheckId.get(checkId) || [];
      rows.push(violation);
      violationByCheckId.set(checkId, rows);
    });

    const checkRecords = checks
      .filter((check) => abnormalCheckStatuses.has(String(check.status || "").toLowerCase()))
      .map((check) => adaptCheck(check, violationByCheckId.get(getId(check)) || []));

    const linkedCheckIds = new Set(checkRecords.map((record) => record.id));
    const standaloneViolations = violations
      .filter((violation) => !linkedCheckIds.has(getId(violation.horse_check_id)))
      .map(adaptViolation);

    return [...checkRecords, ...standaloneViolations].sort((left, right) => {
      const priority = statusPriority(left.status) - statusPriority(right.status);
      if (priority !== 0) return priority;
      const leftDate = new Date(left.checkedAt || 0).getTime();
      const rightDate = new Date(right.checkedAt || 0).getTime();
      return rightDate - leftDate;
    });
  }, [checks, violations]);

  const filteredRecords = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return records.filter((record) => {
      const isOpen = record.kind === "check"
        ? record.status !== "normal"
        : openStatuses.has(record.status);
      const matchesStatus =
        statusFilter === "all" ||
        (statusFilter === "open" && isOpen) ||
        record.status === statusFilter ||
        record.severity === statusFilter;
      const matchesQuery =
        !needle ||
        [
          record.race,
          record.tournament,
          record.subject,
          record.secondarySubject,
          record.referee,
          record.status,
          record.eventType,
          record.description,
        ].join(" ").toLowerCase().includes(needle);
      return matchesStatus && matchesQuery;
    });
  }, [query, records, statusFilter]);

  const selectedRecord = useMemo(
    () => filteredRecords.find((record) => record.id === selectedId) || filteredRecords[0] || null,
    [filteredRecords, selectedId]
  );
  const totalPages = Math.max(1, Math.ceil(filteredRecords.length / PAGE_SIZE));
  const pagedRecords = useMemo(() => filteredRecords.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE), [filteredRecords, page]);

  useEffect(() => { setPage(1); }, [query, statusFilter]);
  useEffect(() => { setPage((current) => Math.min(current, totalPages)); }, [totalPages]);

  useEffect(() => {
    if (!filteredRecords.length) {
      setSelectedId("");
      return;
    }
    if (!selectedRecord) {
      setSelectedId(filteredRecords[0].id);
    }
  }, [filteredRecords, selectedRecord]);

  const summary = useMemo(() => {
    const openCount = records.filter((record) => (
      record.kind === "check" ? record.status !== "normal" : openStatuses.has(record.status)
    )).length;
    return [
      { label: "Open incidents", value: openCount },
      { label: "Race stopped", value: records.filter((record) => record.status === "race_stopped").length },
      { label: "Policy violations", value: violations.length },
      { label: "Under review", value: records.filter((record) => ["under_review", "under_investigation", "needs_review"].includes(record.status)).length },
    ];
  }, [records, violations.length]);

  const refreshAfterAction = async (message) => {
    await loadData();
    setNotice(message);
    setDecisionNote("");
    setActiveViolationId("");
    setPenaltyDecision(null);
    setDeviationReason("");
  };

  const updateCheckStatus = async (action) => {
    if (!selectedRecord.rawCheck) return;
    setActionLoading(action.label);
    setError("");
    try {
      await adminApi.updateHorseCheck(selectedRecord.id, {
        status: action.status,
        check_note: action.note,
      });
      await refreshAfterAction(`${action.label} completed for ${selectedRecord.subject}.`);
    } catch (apiError) {
      setError(apiError.message || "We couldn't update this incident.");
    } finally {
      setActionLoading("");
    }
  };

  const decideViolation = async (violation, mode) => {
    if (!decisionNote.trim()) {
      setError("Decision note is required for violation decisions.");
      return;
    }
    setActionLoading(`${mode}:${getId(violation)}`);
    setError("");
    try {
      if (mode === "confirm") {
        const policy = violationOptions?.penalty_policies?.find(
          (item) => item.violation_type === violation.violation_type && item.severity === violation.severity
        );
        if (policy && !penaltiesEqual(penaltyDecision, policy.suggested_penalty) && !deviationReason.trim()) {
          setError("Explain why the administrative decision differs from the system recommendation.");
          return;
        }
        const approvesExistingProposal = violation.proposed_penalty &&
          penaltiesEqual(penaltyDecision, violation.proposed_penalty);
        await adminApi.confirmViolation(getId(violation), {
          decision: decisionNote.trim(),
          penalty: approvesExistingProposal ? undefined : penaltyDecision,
          deviation_reason: deviationReason.trim() || undefined,
        });
      } else {
        await adminApi.dismissViolation(getId(violation), decisionNote.trim());
      }
      await refreshAfterAction(mode === "confirm" ? "Policy penalty applied." : "Violation dismissed.");
    } catch (apiError) {
      setError(apiError.message || "We couldn't resolve this violation.");
    } finally {
      setActionLoading("");
    }
  };

  const openPenaltyDecision = (violation) => {
    const violationId = getId(violation);
    const policy = violationOptions?.penalty_policies?.find(
      (item) => item.violation_type === violation.violation_type && item.severity === violation.severity
    );
    setActiveViolationId(violationId);
    setPenaltyDecision(
      violation.proposed_penalty ||
      violation.penalty ||
      violation.suggested_penalty ||
      buildPenaltyFromPolicy(policy)
    );
    setDeviationReason(violation.deviation_reason || "");
    setDecisionNote(violation.decision || "");
    setError("");
  };

  const filters = [
    ["open", "Open"],
    ["all", "All"],
    ["under_investigation", "Investigating"],
    ["under_review", "Review"],
    ["race_stopped", "Race stopped"],
    ["critical", "Critical"],
  ];

  return (
    <AdminLayout
      title="Race incident desk"
      eyebrow="Steward operations"
      description="Review race incidents, update horse-check state, and resolve policy-backed violations before results are published."
      actions={(
        <button className="admin-header__button admin-header__button--ghost" disabled={isLoading} type="button" onClick={loadData}>
          <RefreshCw size={16} className={isLoading ? "admin-competition__spin" : ""} aria-hidden="true" />
          Refresh data
        </button>
      )}
    >
      <section className="admin-command-metrics" aria-label="Incident summary">
        {summary.map((item, index) => (
          <article key={item.label}><span>{String(index + 1).padStart(2, "0")}</span><div><strong>{item.value}</strong><small>{item.label}</small></div></article>
        ))}
      </section>

      {notice && <section className="admin-live-state admin-command-notice" aria-live="polite"><CheckCircle2 size={17} aria-hidden="true" />{notice}</section>}
      {error && <section className="admin-live-state admin-live-state--warning" aria-live="assertive"><AlertTriangle size={17} aria-hidden="true" />{error}</section>}

      <section className="admin-command-toolbar" aria-label="Incident filters">
        <label><Search size={17} aria-hidden="true" /><span className="sr-only">Search incidents</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search race, horse, jockey, referee or incident..." /></label>
        <div className="admin-command-filters" role="group" aria-label="Filter incidents">
          {filters.map(([value, label]) => <button key={value} className={statusFilter === value ? "active" : ""} type="button" onClick={() => setStatusFilter(value)}>{label}</button>)}
        </div>
        {(query || statusFilter !== "open") && <button className="admin-command-reset" type="button" onClick={() => { setQuery(""); setStatusFilter("open"); }}><X size={15} aria-hidden="true" /> Clear</button>}
      </section>

      {isLoading ? (
        <LoadingSkeleton ariaLabel="Loading incident queue" rows={7} variant="table" />
      ) : (
        <section className="admin-incident-workspace">
          <article className="admin-command-ledger admin-incident-ledger">
            <header><div><ShieldAlert size={19} aria-hidden="true" /><span><strong>Incident queue</strong><small>{filteredRecords.length} records</small></span></div><span>Race checks and violations</span></header>
            {filteredRecords.length ? (
              <div className="admin-data-table__wrap" role="region" aria-label="Incident queue" tabIndex="0">
                <table className="admin-data-table">
                  <thead><tr><th>Race</th><th>Subject</th><th>Incident</th><th>Status</th><th>Time</th><th><span className="sr-only">Inspect</span></th></tr></thead>
                  <tbody>
                    {pagedRecords.map((record) => (
                      <tr className={selectedRecord?.id === record.id ? "admin-command-row--selected" : ""} key={`${record.kind}-${record.id}`}>
                        <td><strong>{record.race}</strong><span className="admin-incident-subline">{record.tournament}</span></td>
                        <td>{record.subject}<span className="admin-incident-subline">{record.secondarySubject}</span></td>
                        <td>{formatLabel(record.eventType)}<span className="admin-incident-subline">{record.typeLabel} - {formatLabel(record.severity)}</span></td>
                        <td><StatusBadge value={record.status} /></td>
                        <td>{record.timeMarker}<span className="admin-incident-subline">{formatDate(record.checkedAt)}</span></td>
                        <td><button className="admin-command-review" type="button" onClick={() => setSelectedId(record.id)} aria-label={`Inspect ${record.subject}`}><Eye size={15} aria-hidden="true" /> Inspect</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="admin-command-empty"><ShieldAlert size={28} aria-hidden="true" /><div><h3>No incidents match this view</h3><p>Adjust filters or refresh after a referee records race checks.</p></div></div>
            )}
            {filteredRecords.length > PAGE_SIZE && (
              <nav className="admin-command-pagination" aria-label="Incident queue pages">
                <span>Page {page} of {totalPages}</span>
                <div>
                  <button disabled={page === 1} type="button" onClick={() => setPage((current) => current - 1)}>Previous</button>
                  {Array.from({ length: totalPages }, (_, index) => index + 1).map((number) => (
                    <button key={number} className={number === page ? "active" : ""} type="button" aria-current={number === page ? "page" : undefined} onClick={() => setPage(number)}>{number}</button>
                  ))}
                  <button disabled={page === totalPages} type="button" onClick={() => setPage((current) => current + 1)}>Next</button>
                </div>
              </nav>
            )}
          </article>

          <aside className="admin-panel admin-incident-detail" aria-label="Incident detail">
            {selectedRecord ? (
              <>
                <div className="admin-panel__header">
                  <p className="admin-panel__eyebrow">Selected incident</p>
                  <h2>{selectedRecord.subject}</h2>
                </div>
                <div className="admin-incident-detail__status">
                  <StatusBadge value={selectedRecord.status} />
                  <span>{selectedRecord.typeLabel}</span>
                </div>
                <div className="admin-incident-facts">
                  <div><span>Race</span><strong>{selectedRecord.race}</strong></div>
                  <div><span>Tournament</span><strong>{selectedRecord.tournament}</strong></div>
                  <div><span>Referee</span><strong>{selectedRecord.referee}</strong></div>
                  <div><span>Time marker</span><strong>{selectedRecord.timeMarker}</strong></div>
                  <div><span>Event type</span><strong>{formatLabel(selectedRecord.eventType)}</strong></div>
                  <div><span>Severity</span><strong>{formatLabel(selectedRecord.severity)}</strong></div>
                </div>
                <section className="admin-incident-copy">
                  <span>Description</span>
                  <p>{selectedRecord.description}</p>
                </section>

                {selectedRecord.rawCheck && (
                  <section className="admin-incident-actions">
                    <div><Flag size={17} aria-hidden="true" /><span>Horse-check decision</span></div>
                    <div>
                      {CHECK_ACTIONS.map((action) => (
                        <button
                          className={action.danger ? "admin-header__button admin-header__button--red" : "admin-header__button admin-header__button--ghost"}
                          disabled={Boolean(actionLoading)}
                          key={action.label}
                          type="button"
                          onClick={() => updateCheckStatus(action)}
                        >
                          {actionLoading === action.label ? "Saving..." : action.label}
                        </button>
                      ))}
                    </div>
                  </section>
                )}

                <section className="admin-incident-violations">
                  <div className="admin-incident-section-title">
                    <ShieldAlert size={17} aria-hidden="true" />
                    <span>Policy violations</span>
                  </div>
                  {selectedRecord.violations.length ? (
                    <>
                      {selectedRecord.violations.map((violation) => {
                        const violationId = getId(violation);
                        const canDecide = openStatuses.has(violation.status);
                        const policy = violationOptions?.penalty_policies?.find(
                          (item) => item.violation_type === violation.violation_type && item.severity === violation.severity
                        );
                        const isActive = activeViolationId === violationId;
                        return (
                          <article className="admin-incident-violation" key={violationId}>
                            <div>
                              <strong>{formatLabel(violation.violation_type)}</strong>
                              <StatusBadge value={violation.status} />
                            </div>
                            <p>{violation.description || "No description recorded."}</p>
                            <small>
                              {formatLabel(violation.severity)} - System recommendation: {describePenalty(violation.suggested_penalty || policy?.suggested_penalty)}
                            </small>
                            {violation.proposed_penalty && (
                              <small>Referee proposal: {describePenalty(violation.proposed_penalty)}</small>
                            )}
                            {canDecide && (
                              <>
                                {!isActive && (
                                  <button className="admin-header__button admin-header__button--ghost" disabled={Boolean(actionLoading)} type="button" onClick={() => openPenaltyDecision(violation)}>
                                    <Eye size={15} aria-hidden="true" /> Review decision
                                  </button>
                                )}
                                {isActive && (
                                  <div className="admin-incident-penalty-review">
                                    {policy ? (
                                      <PenaltyDecisionEditor
                                        policy={policy}
                                        value={penaltyDecision}
                                        onChange={setPenaltyDecision}
                                        deviationReason={deviationReason}
                                        onDeviationReasonChange={setDeviationReason}
                                        disabled={Boolean(actionLoading)}
                                        reviewer="admin"
                                      />
                                    ) : (
                                      <section className="admin-live-state admin-live-state--warning">Penalty policy is unavailable for this record.</section>
                                    )}
                                    <label className="admin-field">
                                      <span>Administrative decision note</span>
                                      <textarea value={decisionNote} onChange={(event) => setDecisionNote(event.target.value)} placeholder="Record why this decision is approved, modified, or dismissed." />
                                    </label>
                                    <div className="admin-incident-violation__actions">
                                      <button className="admin-header__button" disabled={Boolean(actionLoading) || !policy} type="button" onClick={() => decideViolation(violation, "confirm")}>
                                        <Check size={15} aria-hidden="true" /> {actionLoading === `confirm:${violationId}` ? "Saving..." : "Confirm decision"}
                                      </button>
                                      <button className="admin-header__button admin-header__button--red" disabled={Boolean(actionLoading)} type="button" onClick={() => decideViolation(violation, "dismiss")}>
                                        <X size={15} aria-hidden="true" /> {actionLoading === `dismiss:${violationId}` ? "Dismissing..." : "Dismiss"}
                                      </button>
                                    </div>
                                  </div>
                                )}
                              </>
                            )}
                          </article>
                        );
                      })}
                    </>
                  ) : (
                    <p className="admin-incident-muted">No policy violation is linked to this incident yet.</p>
                  )}
                </section>
              </>
            ) : (
              <div className="admin-command-empty"><ShieldAlert size={28} aria-hidden="true" /><div><h3>No incident selected</h3><p>Select a row from the queue to inspect and resolve it.</p></div></div>
            )}
          </aside>
        </section>
      )}
    </AdminLayout>
  );
}

export default AdminIncidentModule;
