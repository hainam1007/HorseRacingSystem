import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { AlertCircle, Check, CheckCircle2, CheckSquare, Save, X } from "lucide-react";
import { refereeApi } from "../api/refereeApi";
import LoadingSkeleton from "../components/LoadingSkeleton";
import RefereeLayout from "./RefereeLayout";
import { formatStatus, RACE_PHASES } from "./refereeConstants";
import { useRefereeData } from "./useRefereeData";

const PRE_FIELDS = [
  "identity_verified",
  "registration_valid",
  "jockey_assigned",
  "jockey_contract_confirmed",
  "horse_health_status_ok",
  "no_visible_lameness",
  "no_visible_injury",
  "normal_gait",
  "normal_breathing",
  "equipment_ok",
  "fit_to_race"
];

const POST_FIELDS = [
  "horse_finished_safely",
  "post_race_lameness_check",
  "post_race_injury_check",
  "breathing_recovered",
  "heart_rate_recovered",
  "bleeding_check",
  "medical_follow_up_required"
];

const LABELS = {
  identity_verified: "Horse identity verified",
  registration_valid: "Registration is valid",
  jockey_assigned: "Jockey is assigned",
  jockey_contract_confirmed: "Jockey contract is confirmed",
  horse_health_status_ok: "Health status is acceptable",
  no_visible_lameness: "No visible lameness",
  no_visible_injury: "No visible injury",
  normal_gait: "Normal gait",
  normal_breathing: "Normal breathing",
  equipment_ok: "Equipment is safe",
  fit_to_race: "Fit to race",
  horse_finished_safely: "Horse finished safely",
  post_race_lameness_check: "Lameness check complete",
  post_race_injury_check: "Injury check complete",
  breathing_recovered: "Breathing recovered",
  heart_rate_recovered: "Heart rate recovered",
  bleeding_check: "Bleeding check complete",
  medical_follow_up_required: "Medical follow-up required",
};

const NOTE_REQUIRED_STATUSES = ["failed", "scratched", "injury_detected", "requires_vet_follow_up"];

function normalizeChecklist(checklist, phase) {
  const source = checklist || {};

  if (
    phase !== RACE_PHASES.PRE_RACE ||
    PRE_FIELDS.some((field) => Object.prototype.hasOwnProperty.call(source, field))
  ) {
    return source;
  }

  const hasLegacyPreRaceChecklist = ["identity", "health", "equipment", "weight", "eligibility"]
    .some((field) => Object.prototype.hasOwnProperty.call(source, field));

  if (!hasLegacyPreRaceChecklist) return source;

  return {
    identity_verified: Boolean(source.identity),
    registration_valid: Boolean(source.eligibility),
    jockey_assigned: Boolean(source.eligibility),
    jockey_contract_confirmed: Boolean(source.eligibility),
    horse_health_status_ok: Boolean(source.health),
    no_visible_lameness: Boolean(source.health),
    no_visible_injury: Boolean(source.health),
    normal_gait: Boolean(source.health),
    normal_breathing: Boolean(source.health),
    equipment_ok: Boolean(source.equipment),
    fit_to_race: Boolean(source.eligibility && source.weight),
  };
}

function initialRows(race, phase, fields) {
  return Object.fromEntries(
    (race?.participants || []).map((participant) => {
      const saved = race.checks.find(
        (check) => check.horseId === participant.horseId && check.phase === phase
      );
      const savedChecklist = normalizeChecklist(saved?.checklist, phase);
      const normalizedSaved = saved ? { ...saved, checklist: savedChecklist } : saved;
      return [
        participant.horseId,
        {
          status: saved?.status || "",
          note: saved?.note || "",
          weight: saved?.weight ?? participant.weight ?? "",
          checklist: Object.fromEntries(fields.map((field) => [field, Boolean(savedChecklist?.[field])])),
          saved: normalizedSaved
        }
      ];
    })
  );
}

function checklistProgress(row, fields) {
  const completed = fields.filter((field) => Boolean(row?.checklist?.[field])).length;
  return { completed, total: fields.length };
}

function isRowDirty(row, fields) {
  if (!row) return false;

  const savedStatus = row.saved?.status || "";
  const savedNote = row.saved?.note || "";
  const savedWeight = row.saved?.weight ?? "";
  if (row.status !== savedStatus || row.note !== savedNote || String(row.weight ?? "") !== String(savedWeight)) return true;

  return fields.some(
    (field) => Boolean(row.checklist?.[field]) !== Boolean(row.saved?.checklist?.[field])
  );
}

function rowSaveState(row, fields) {
  if (isRowDirty(row, fields)) return { label: "Unsaved", tone: "amber" };
  if (row?.saved) return { label: "Saved", tone: "green" };
  return { label: "Not started", tone: "gray" };
}

function statusTone(status) {
  if (["passed", "normal"].includes(status)) return "green";
  if (["failed", "scratched", "injury_detected"].includes(status)) return "red";
  if (status) return "amber";
  return "gray";
}

function getWeightEligibilityRule(race) {
  let snapshot = race?.raw?.eligibility_rule_snapshot;

  if (typeof snapshot === "string") {
    try {
      snapshot = JSON.parse(snapshot);
    } catch (_) {
      return null;
    }
  }

  return snapshot?.rule?.type === "horse_weight_range" ? snapshot.rule : null;
}

function HorseInspection() {
  const { raceId } = useParams();
  const [searchParams] = useSearchParams();
  const phase = searchParams.get("phase") === RACE_PHASES.POST_RACE ? RACE_PHASES.POST_RACE : RACE_PHASES.PRE_RACE;
  const fields = phase === RACE_PHASES.PRE_RACE ? PRE_FIELDS : POST_FIELDS;
  const statuses = phase === RACE_PHASES.PRE_RACE
    ? ["passed", "failed", "needs_review", "scratched"]
    : ["normal", "minor_issue", "injury_detected", "requires_vet_follow_up", "under_investigation"];

  const { getRace, isLoading, error, isUnavailable, reload } = useRefereeData();
  const race = getRace(raceId);
  const [rows, setRows] = useState({});
  const [savingId, setSavingId] = useState("");
  const [isSavingAll, setIsSavingAll] = useState(false);
  const [message, setMessage] = useState("");
  const [bulkIssues, setBulkIssues] = useState([]);
  const [ballastInputs, setBallastInputs] = useState({});
  const [confirmingBallastId, setConfirmingBallastId] = useState("");
  const [selectedHorseId, setSelectedHorseId] = useState("");
  const [showPassAllConfirmation, setShowPassAllConfirmation] = useState(false);
  const passAllConfirmationRef = useRef(null);
  const editable = race?.phase === phase;
  const participantsUnavailable = Boolean(isUnavailable || race?.participantsUnavailable);
  const weightRule = getWeightEligibilityRule(race);
  const usesWeightRule = phase === RACE_PHASES.PRE_RACE && Boolean(weightRule);

  useEffect(() => {
    setRows(initialRows(race, phase, fields));
  }, [race, phase]);

  const title = phase === RACE_PHASES.PRE_RACE ? "Pre-race Horse Inspection" : "Post-race Recovery Check";
  const participants = useMemo(() => {
    const rows = race?.participants || [];

    if (phase === RACE_PHASES.POST_RACE) {
      return rows.filter((participant) => participant.eligible);
    }

    return rows;
  }, [race, phase]);

  useEffect(() => {
    setSelectedHorseId((current) => {
      if (participants.some((participant) => participant.horseId === current)) return current;
      return participants[0]?.horseId || "";
    });
    setShowPassAllConfirmation(false);
    setBulkIssues([]);
  }, [participants]);

  useEffect(() => {
    if (showPassAllConfirmation) passAllConfirmationRef.current?.focus();
  }, [showPassAllConfirmation]);

  if (isLoading) {
    return (
      <RefereeLayout title={title} eyebrow="Horse checks" description="">
        <LoadingSkeleton ariaLabel="Loading horse checks" rows={5} variant="list" />
      </RefereeLayout>
    );
  }

  if (error || !race) {
    return (
      <RefereeLayout title={title} eyebrow="Horse checks" description="">
        <section className="admin-live-state admin-live-state--warning">
          {error || "Race not found."}
        </section>
      </RefereeLayout>
    );
  }

  const update = (horseId, patch) =>
    setRows((current) => ({
      ...current,
      [horseId]: { ...current[horseId], ...patch }
    }));

  const handlePassAll = () => {
    const nextRows = { ...rows };
    participants.forEach((p) => {
      nextRows[p.horseId] = {
        ...nextRows[p.horseId],
        status: phase === RACE_PHASES.PRE_RACE ? "passed" : "normal",
        checklist: Object.fromEntries(fields.map((field) => [field, true])),
      };
    });
    setRows(nextRows);
    setShowPassAllConfirmation(false);
    setBulkIssues([]);
    setMessage(
      `Marked ${participants.length} runners as ${phase === RACE_PHASES.PRE_RACE ? "passed" : "normal"}. Review the unsaved rows before saving.`
    );
  };

  const handleSaveAll = async () => {
    setIsSavingAll(true);
    setMessage("Saving all checks...");
    const checks = [];
    const validationIssues = [];

    for (const participant of participants) {
      const row = rows[participant.horseId];

      if (!row || !row.status) {
        validationIssues.push({
          horseId: participant.horseId,
          horseName: participant.horseName,
          reason: "Status is required."
        });
        continue;
      }

      const requiresNote = NOTE_REQUIRED_STATUSES.includes(row.status);
      const note = row.note.trim();
      const requiresCompleteChecklist = ["passed", "normal"].includes(row.status);
      const measuredWeight = Number(row.weight);
      if (usesWeightRule && (!Number.isFinite(measuredWeight) || measuredWeight < 0)) {
        validationIssues.push({
          horseId: participant.horseId,
          horseName: participant.horseName,
          reason: "A non-negative actual measured weight is required for this race."
        });
        continue;
      }
      if (requiresCompleteChecklist && checklistProgress(row, fields).completed !== fields.length) {
        validationIssues.push({
          horseId: participant.horseId,
          horseName: participant.horseName,
          reason: `${formatStatus(row.status)} requires every checklist item to be completed.`
        });
        continue;
      }
      if (requiresNote && !note) {
        validationIssues.push({
          horseId: participant.horseId,
          horseName: participant.horseName,
          reason: `${formatStatus(row.status)} requires a specific inspection note.`
        });
        continue;
      }

      checks.push({
        horse_id: participant.horseId,
        jockey_id: participant.jockeyId || undefined,
        status: row.status,
        checklist: row.checklist,
        check_note: note,
        weight: usesWeightRule ? measuredWeight : undefined
      });
    }

    setBulkIssues(validationIssues);

    if (!checks.length) {
      setIsSavingAll(false);
      setMessage(`No checks were saved. Resolve ${validationIssues.length} validation issue(s) first.`);
      return;
    }

    try {
      const response = await refereeApi.bulkSaveHorseChecks(phase, {
        race_id: race.id,
        checks
      });
      const summary = response.summary || {};
      const failed = response.failed || [];
      const apiIssues = failed.map((item) => {
        const failedHorseId = item.horse_id || item.horseId || "";
        const participant = participants.find((entry) => entry.horseId === failedHorseId);
        return {
          horseId: failedHorseId,
          horseName: participant?.horseName || item.horse_name || "Unknown runner",
          reason: item.message || item.error || "The API rejected this check."
        };
      });

      await reload();
      setBulkIssues([...validationIssues, ...apiIssues]);
      setMessage(
        `Bulk save complete. Created: ${summary.created_count || 0}. Updated: ${summary.updated_count || 0}. ` +
        `Failed: ${summary.failed_count || failed.length || 0}. Skipped: ${validationIssues.length}.`
      );
    } catch (apiError) {
      setMessage(apiError.message || "Unable to bulk save horse checks.");
    } finally {
      setIsSavingAll(false);
    }
  };

  const save = async (participant) => {
    const row = rows[participant.horseId];
    const requiresNote = NOTE_REQUIRED_STATUSES.includes(row.status);
    const measuredWeight = Number(row.weight);
    if (!row.status) {
      setBulkIssues([{ horseId: participant.horseId, horseName: participant.horseName, reason: "Status is required." }]);
      return setMessage("Select a check status before saving.");
    }
    if (["passed", "normal"].includes(row.status) && checklistProgress(row, fields).completed !== fields.length) {
      setBulkIssues([{
        horseId: participant.horseId,
        horseName: participant.horseName,
        reason: `${formatStatus(row.status)} requires every checklist item to be completed.`
      }]);
      return setMessage("Complete every checklist item before saving a passing status.");
    }
    if (requiresNote && !row.note.trim()) {
      setBulkIssues([{
        horseId: participant.horseId,
        horseName: participant.horseName,
        reason: `${formatStatus(row.status)} requires a specific inspection note.`
      }]);
      return setMessage("This status requires a note or issue description.");
    }
    if (usesWeightRule && (!Number.isFinite(measuredWeight) || measuredWeight < 0)) {
      setBulkIssues([{
        horseId: participant.horseId,
        horseName: participant.horseName,
        reason: "A non-negative actual measured weight is required for this race."
      }]);
      return setMessage("Record the actual measured weight before saving the pre-race check.");
    }

    try {
      setSavingId(participant.horseId);
      setMessage("");
      setBulkIssues([]);
      const payload = {
        race_id: race.id,
        horse_id: participant.horseId,
        jockey_id: participant.jockeyId || undefined,
        status: row.status,
        checklist: row.checklist,
        check_note: row.note,
        weight: usesWeightRule ? measuredWeight : undefined
      };

      if (row.saved?.id) await refereeApi.updateHorseCheck(row.saved.id, payload);
      else await refereeApi.createHorseCheck(phase, payload);

      await reload();
      setMessage(`${participant.horseName}: ${formatStatus(row.status)} saved.`);
    } catch (apiError) {
      setMessage(apiError.message || "Unable to save horse check.");
    } finally {
      setSavingId("");
    }
  };

  const selectedParticipant = participants.find(
    (participant) => participant.horseId === selectedHorseId
  );
  const selectedRow = selectedParticipant ? rows[selectedParticipant.horseId] : null;
  const selectedSaveState = rowSaveState(selectedRow, fields);
  const passAllLabel = phase === RACE_PHASES.PRE_RACE ? "Mark All Passed" : "Mark All Normal";
  const selectedEligibility = selectedRow?.saved?.eligibilityResult;
  const selectedEligibilityRule = selectedEligibility?.rule;
  const actualMeasuredWeight = Number(selectedEligibility?.measured_weight_kg ?? selectedRow?.saved?.weight);
  const minimumWeight = Number(selectedEligibilityRule?.min_kg);
  const missingWeight = Number(selectedEligibility?.required_ballast_kg ?? selectedRow?.saved?.ballastRequiredKg);
  const canConfirmBallast = editable &&
    phase === RACE_PHASES.PRE_RACE &&
    selectedEligibilityRule?.type === "horse_weight_range" &&
    selectedEligibilityRule?.ballast_allowed === true &&
    Number.isFinite(actualMeasuredWeight) &&
    Number.isFinite(minimumWeight) &&
    actualMeasuredWeight < minimumWeight &&
    !selectedRow?.saved?.ballastConfirmed;

  const confirmBallast = async () => {
    const checkId = selectedRow?.saved?.id;
    const ballastAddedKg = Number(ballastInputs[checkId] ?? missingWeight);

    if (!checkId || !Number.isFinite(ballastAddedKg) || ballastAddedKg < 0) {
      setMessage("Enter a non-negative ballast amount before confirming.");
      return;
    }

    try {
      setConfirmingBallastId(checkId);
      setMessage("");
      await refereeApi.confirmHorseCheckBallast(checkId, { ballast_added_kg: ballastAddedKg });
      await reload();
      setMessage(`${selectedParticipant.horseName}: ballast confirmed.`);
    } catch (apiError) {
      setMessage(apiError.message || "Unable to confirm ballast.");
    } finally {
      setConfirmingBallastId("");
    }
  };

  return (
    <RefereeLayout
      title={title}
      eyebrow={`${formatStatus(phase)} | ${race.name}`}
      description={editable ? "This is the current race phase. Saved records will appear here automatically." : "This phase is read only for the current race status."}
      actions={
        <Link className="admin-header__button admin-header__button--ghost" to={`/referee/races/${raceId}`}>
          Race Detail
        </Link>
      }
    >
      {participantsUnavailable && (
        <section className="admin-live-state">
          Participant API is unavailable, so checks cannot be created.
        </section>
      )}
      
      {message && (
        <section className="admin-live-state" aria-live="polite">
          {message}
        </section>
      )}

      <nav className="referee-phase-strip" aria-label="Race control phases">
        {phase === RACE_PHASES.PRE_RACE
          ? <span className="active" aria-current="step">1. Pre-race checks</span>
          : <Link to={`/referee/races/${raceId}/horse-inspection?phase=pre_race`}>1. Pre-race checks</Link>}
        <Link to={`/referee/races/${raceId}/monitor`}>2. Live monitoring</Link>
        {phase === RACE_PHASES.POST_RACE
          ? <span className="active" aria-current="step">3. Post-race checks</span>
          : <Link to={`/referee/races/${raceId}/horse-inspection?phase=post_race`}>3. Post-race checks</Link>}
        <Link to={`/referee/races/${raceId}/closure`}>4. Closure</Link>
      </nav>

      {bulkIssues.length > 0 && (
        <section
          className="admin-live-state admin-live-state--warning referee-inspection-workspace__issues"
          aria-live="polite"
        >
          <AlertCircle aria-hidden="true" size={18} />
          <div>
            <strong>{bulkIssues.length} runner check(s) need attention</strong>
            <ul>
              {bulkIssues.map((issue, index) => (
                <li key={`${issue.horseId || "unknown"}-${index}`}>
                  <button
                    type="button"
                    onClick={() => issue.horseId && setSelectedHorseId(issue.horseId)}
                    disabled={!issue.horseId}
                  >
                    {issue.horseName}
                  </button>
                  {`: ${issue.reason}`}
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}

      {editable && participants.length > 0 && (
        <div className="referee-global-actions-bar referee-inspection-workspace__toolbar">
          <div className="referee-global-actions-bar__title">
            <CheckSquare size={16} />
            <span>Perform inspections for {participants.length} runners</span>
          </div>
          <div className="referee-global-actions-bar__buttons">
            <button
              type="button"
              className="admin-header__button admin-header__button--ghost referee-inspection-workspace__mark-all"
              disabled={participantsUnavailable}
              onClick={() => setShowPassAllConfirmation(true)}
            >
              <CheckCircle2 aria-hidden="true" size={15} /> {passAllLabel}
            </button>
            <button
              type="button"
              className="referee-global-btn referee-global-btn--save"
              disabled={isSavingAll || participantsUnavailable}
              onClick={handleSaveAll}
            >
              <Save size={15} /> {isSavingAll ? "Saving All..." : "Save All Checks"}
            </button>
          </div>
        </div>
      )}

      {showPassAllConfirmation && (
        <section
          ref={passAllConfirmationRef}
          className="admin-panel referee-inspection-workspace__confirmation"
          role="alertdialog"
          aria-labelledby="mark-all-confirmation-title"
          aria-describedby="mark-all-confirmation-description"
          tabIndex="-1"
          onKeyDown={(event) => {
            if (event.key === "Escape") setShowPassAllConfirmation(false);
          }}
        >
          <div>
            <p className="admin-panel__eyebrow">Bulk change confirmation</p>
            <h2 id="mark-all-confirmation-title">{passAllLabel}?</h2>
            <p id="mark-all-confirmation-description">
              This checks every item and changes all {participants.length} runner statuses. Nothing is saved until
              you select Save All Checks.
            </p>
          </div>
          <div className="referee-inspection-workspace__confirmation-actions">
            <button
              type="button"
              className="admin-header__button admin-header__button--ghost"
              onClick={() => setShowPassAllConfirmation(false)}
            >
              <X aria-hidden="true" size={15} /> Cancel
            </button>
            <button type="button" className="referee-global-btn referee-global-btn--pass" onClick={handlePassAll}>
              <CheckCircle2 aria-hidden="true" size={15} /> Confirm {passAllLabel}
            </button>
          </div>
        </section>
      )}

      {participants.length === 0 && (
        <section className="admin-panel">
          <p>No approved race participants are available.</p>
        </section>
      )}

      {participants.length > 0 && (
        <section className="admin-panel referee-inspection-workspace">
          <div className="admin-panel__header referee-inspection-workspace__heading">
            <div>
              <p className="admin-panel__eyebrow">Runner inspection workspace</p>
              <h2>Select a runner to inspect</h2>
            </div>
            <span>{participants.length} runners</span>
          </div>

          <div
            className="admin-data-table__wrap referee-inspection-workspace__runner-list"
            role="region"
            aria-label={`${title} runners`}
            tabIndex="0"
          >
            <table className="admin-data-table">
              <thead>
                <tr>
                  <th>Draw</th>
                  <th>Runner</th>
                  <th>Jockey</th>
                  <th>Checklist</th>
                  <th>Status</th>
                  <th>Record</th>
                  <th><span className="sr-only">Selected runner</span></th>
                </tr>
              </thead>
              <tbody>
                {participants.map((participant) => {
                  const row = rows[participant.horseId];
                  if (!row) return null;

                  const progress = checklistProgress(row, fields);
                  const saveState = rowSaveState(row, fields);
                  const selected = selectedHorseId === participant.horseId;

                  return (
                    <tr
                      key={participant.horseId}
                      className={selected ? "admin-command-row--selected referee-inspection-workspace__runner--selected" : ""}
                      aria-selected={selected}
                      tabIndex="0"
                      onClick={() => setSelectedHorseId(participant.horseId)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          setSelectedHorseId(participant.horseId);
                        }
                      }}
                    >
                      <td>{participant.lane ?? "-"}</td>
                      <td>
                        <strong>{participant.horseName}</strong>
                        <span className="referee-table-subline">{participant.owner || "Owner not recorded"}</span>
                      </td>
                      <td>{participant.jockeyName || "Not assigned"}</td>
                      <td>
                        <span>{progress.completed}/{progress.total}</span>
                        <progress
                          max={progress.total}
                          value={progress.completed}
                          aria-label={`${participant.horseName} checklist progress`}
                        />
                      </td>
                      <td>
                        <span className={`referee-status-badge referee-status-badge--${statusTone(row.status)}`}>
                          {row.status ? formatStatus(row.status) : "Pending"}
                        </span>
                      </td>
                      <td>
                        <span className={`referee-status-badge referee-status-badge--${saveState.tone}`}>
                          {saveState.label}
                        </span>
                      </td>
                      <td>
                        {selected && (
                          <span className="referee-inspection-workspace__selected-icon" title="Selected runner">
                            <Check aria-hidden="true" size={15} />
                            <span className="sr-only">Selected runner</span>
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {selectedParticipant && selectedRow && (
            <article
              id="selected-runner-inspection"
              className="referee-inspection-card referee-inspection-workspace__detail"
              aria-labelledby="selected-runner-name"
            >
              <div className="referee-inspection-card__header-row">
                <div className="referee-inspection-card__title-group">
                  <p className="admin-panel__eyebrow">
                    {selectedParticipant.lane == null ? "Draw not assigned" : `Draw ${selectedParticipant.lane}`}
                  </p>
                  <h2 id="selected-runner-name">{selectedParticipant.horseName}</h2>
                </div>
                <span className={`referee-status-badge referee-status-badge--${selectedSaveState.tone}`}>
                  {selectedSaveState.label}
                </span>
              </div>

              <div className="referee-info-grid-compact">
                <div>
                  <span className="referee-info-label">Owner</span>
                  <span>{selectedParticipant.owner || "Not recorded"}</span>
                </div>
                <div>
                  <span className="referee-info-label">Jockey</span>
                  <span>{selectedParticipant.jockeyName || "Not assigned"}</span>
                </div>
                <div>
                  <span className="referee-info-label">Registered weight</span>
                  <span>{selectedParticipant.weight ?? "Not recorded"}</span>
                </div>
                <div>
                  <span className="referee-info-label">Assignment</span>
                  <span>{formatStatus(selectedParticipant.assignmentStatus)}</span>
                </div>
              </div>

              <div className="referee-checklist-container">
                <div className="referee-checklist-header">
                  <span className="referee-checklist-title-label">Checklist</span>
                  <span>
                    {checklistProgress(selectedRow, fields).completed}/{fields.length} complete
                  </span>
                </div>
                <div className="referee-checklist-grid-compact">
                  {fields.map((field) => (
                    <label key={field} className="referee-check-item-compact">
                      <input
                        type="checkbox"
                        disabled={!editable}
                        checked={Boolean(selectedRow.checklist[field])}
                        onChange={(event) =>
                          update(selectedParticipant.horseId, {
                            checklist: { ...selectedRow.checklist, [field]: event.target.checked }
                          })
                        }
                      />
                      <span>{LABELS[field]}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="referee-card-form-grid">
                {usesWeightRule && (
                  <label className="admin-field">
                    <span>Actual measured weight (kg)</span>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      required
                      disabled={!editable}
                      value={selectedRow.weight}
                      onChange={(event) => update(selectedParticipant.horseId, { weight: event.target.value })}
                    />
                  </label>
                )}
                <label className="admin-field">
                  <span>Status</span>
                  <select
                    disabled={!editable}
                    value={selectedRow.status}
                    onChange={(event) => update(selectedParticipant.horseId, { status: event.target.value })}
                  >
                    <option value="">Select status</option>
                    {statuses.map((status) => (
                      <option key={status} value={status}>
                        {formatStatus(status)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="admin-field">
                  <span>
                    Notes
                    {NOTE_REQUIRED_STATUSES.includes(selectedRow.status) ? " (required)" : ""}
                  </span>
                  <textarea
                    disabled={!editable}
                    value={selectedRow.note}
                    required={NOTE_REQUIRED_STATUSES.includes(selectedRow.status)}
                    aria-describedby={
                      NOTE_REQUIRED_STATUSES.includes(selectedRow.status) ? "selected-runner-note-requirement" : undefined
                    }
                    placeholder="Record runner-specific observations..."
                    onChange={(event) => update(selectedParticipant.horseId, { note: event.target.value })}
                  />
                  {NOTE_REQUIRED_STATUSES.includes(selectedRow.status) && !selectedRow.note.trim() && (
                    <small id="selected-runner-note-requirement" role="alert">
                      Explain the observed failure, scratch, injury, or required follow-up before saving.
                    </small>
                  )}
                </label>
              </div>

              {selectedEligibilityRule?.type === "horse_weight_range" && Number.isFinite(actualMeasuredWeight) && (
                <section className="referee-ballast-panel" aria-label="Ballast eligibility">
                  <div>
                    <span className="referee-info-label">Actual measured</span>
                    <strong>{actualMeasuredWeight} kg</strong>
                  </div>
                  <div>
                    <span className="referee-info-label">Minimum</span>
                    <strong>{minimumWeight} kg</strong>
                  </div>
                  <div>
                    <span className="referee-info-label">Missing</span>
                    <strong>{Number.isFinite(missingWeight) ? `${missingWeight} kg` : "—"}</strong>
                  </div>
                  {selectedRow.saved?.ballastConfirmed && (
                    <div>
                      <span className="referee-info-label">Confirmed ballast</span>
                      <strong>{selectedRow.saved.ballastAddedKg ?? 0} kg</strong>
                    </div>
                  )}
                  {canConfirmBallast && (
                    <div className="referee-ballast-panel__action">
                      <label className="admin-field">
                        <span>Ballast added (kg)</span>
                        <input
                          type="number"
                          min={Math.max(0, missingWeight || 0)}
                          step="0.01"
                          value={ballastInputs[selectedRow.saved.id] ?? String(missingWeight)}
                          onChange={(event) => setBallastInputs((current) => ({
                            ...current,
                            [selectedRow.saved.id]: event.target.value
                          }))}
                        />
                      </label>
                      <button
                        type="button"
                        className="referee-save-btn"
                        disabled={confirmingBallastId === selectedRow.saved.id || participantsUnavailable}
                        onClick={confirmBallast}
                      >
                        <Check aria-hidden="true" size={13} />
                        {confirmingBallastId === selectedRow.saved.id ? "Confirming..." : "Confirm ballast"}
                      </button>
                    </div>
                  )}
                </section>
              )}

              {editable && (
                <div className="referee-card-footer">
                  <button
                    type="button"
                    className="referee-save-btn"
                    disabled={savingId === selectedParticipant.horseId || participantsUnavailable}
                    onClick={() => save(selectedParticipant)}
                  >
                    <Save aria-hidden="true" size={13} />
                    {savingId === selectedParticipant.horseId
                      ? "Saving..."
                      : selectedRow.saved
                        ? "Update inspection"
                        : "Save inspection"}
                  </button>
                </div>
              )}
            </article>
          )}
        </section>
      )}
    </RefereeLayout>
  );
}

export default HorseInspection;
