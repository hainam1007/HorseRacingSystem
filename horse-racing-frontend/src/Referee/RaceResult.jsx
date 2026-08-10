import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { refereeApi } from "../api/refereeApi";
import LoadingSkeleton from "../components/LoadingSkeleton";
import RefereeLayout from "./RefereeLayout";
import { formatStatus, RESULT_STATUSES } from "./refereeConstants";
import { getId } from "./refereeAdapters";
import { useRefereeData } from "./useRefereeData";

const blockerLabels = {
  accepted_jockey_assignment_required: "Accepted jockey assignment required",
  jockey_suspension_active: "Jockey suspension is active",
  passed_pre_race_check_required: "Passed pre-race check required",
};

function userName(profile, fallback) {
  return profile?.user_id?.full_name || profile?.full_name || profile?.name || fallback;
}

function adaptWorkflowParticipant(value) {
  const horse = value.horse || {};
  const jockey = value.jockey || {};
  return {
    horseId: getId(horse),
    horseName: horse.name || "Unknown horse",
    jockeyName: userName(jockey, getId(jockey) ? "Assigned jockey" : "Not assigned"),
    eligible: value.eligible === true,
    blockers: Array.isArray(value.blockers) ? value.blockers : [],
    preCheckStatus: value.pre_race_check?.status || "missing",
    postCheckStatus: value.post_race_check?.status || "missing",
  };
}

function formatNumber(value, suffix = "") {
  if (value === undefined || value === null) return "—";
  const num = Number(value);
  if (!Number.isNaN(num) && suffix === "s") {
    return `${num.toFixed(2)}${suffix}`;
  }
  return `${value}${suffix}`;
}

function RaceResult() {
  const { raceId } = useParams();
  const { error, getRace, isLoading, reload } = useRefereeData();
  const race = getRace(raceId);
  const [participants, setParticipants] = useState([]);
  const [readiness, setReadiness] = useState(null);
  const [workflowError, setWorkflowError] = useState("");
  const [message, setMessage] = useState("");
  const [isWorkflowLoading, setIsWorkflowLoading] = useState(true);
  const [activeAction, setActiveAction] = useState("");

  const loadWorkflow = useCallback(async () => {
    setIsWorkflowLoading(true);
    setWorkflowError("");
    try {
      const [participantData, readinessData] = await Promise.all([
        refereeApi.getRaceResultParticipants(raceId),
        refereeApi.getRaceResultReadiness(raceId),
      ]);
      setParticipants((participantData?.participants || []).map(adaptWorkflowParticipant));
      setReadiness(readinessData || null);
    } catch (apiError) {
      setParticipants([]);
      setReadiness(null);
      setWorkflowError(apiError.status === 403
        ? "Only the referee assigned to this race can access its result workflow."
        : apiError.message || "Unable to load result readiness.");
    } finally {
      setIsWorkflowLoading(false);
    }
  }, [raceId]);

  useEffect(() => { loadWorkflow(); }, [loadWorkflow]);

  const runAction = async (action) => {
    try {
      setActiveAction(action);
      setMessage("");
      if (action === "finalize") await refereeApi.finalizeRaceResults(raceId);
      else await refereeApi.applyRaceResultPenalties(raceId);
      await Promise.all([reload(), loadWorkflow()]);
      setMessage(action === "finalize"
        ? "Penalty-adjusted final summary was sent to Admin."
        : "Confirmed penalties were applied. Review the adjusted rankings before sending them to Admin.");
    } catch (apiError) {
      setMessage(apiError.status === 403
        ? "You are not authorized to manage results for this race."
        : apiError.message || `Unable to ${action === "finalize" ? "finalize results" : "apply penalties"}.`);
    } finally {
      setActiveAction("");
    }
  };

  if (isLoading) return <RefereeLayout title="Race Result" eyebrow="" description=""><LoadingSkeleton ariaLabel="Loading race results" rows={5} variant="table" /></RefereeLayout>;
  if (!race) return <RefereeLayout title="Not Found" eyebrow="" description=""><section className="admin-live-state admin-live-state--warning">{error || "Race not found."}</section></RefereeLayout>;

  const hasResults = race.result.length > 0;
  const penaltiesApplied = readiness?.penalties_applied === true ||
    (hasResults && race.result.every((result) => result.penaltyApplied));
  const submittedToAdmin = readiness?.submitted_to_admin === true ||
    (hasResults && race.result.every((result) => result.submittedToAdmin));
  const lockedResults = submittedToAdmin ||
    [RESULT_STATUSES.CONFIRMED, RESULT_STATUSES.PUBLISHED].includes(race.resultStatus);
  const readinessChecks = readiness ? [
    ["Race date passed", readiness.race_date_passed],
    ["Registration locked", readiness.registration_locked],
    ["Race completed", ["completed", "finished"].includes(String(readiness.race_status).toLowerCase())],
    ["Eligible participants", readiness.eligible_participant_count > 0],
    ["Referee report submitted", !readiness.missing_report],
    ["Post-race checks complete", readiness.missing_post_check_horse_ids?.length === 0],
    ["No horse under investigation", readiness.under_investigation_horse_ids?.length === 0],
    ["No unresolved violations", readiness.unresolved_violation_ids?.length === 0],
    ["Confirmed penalties applied", readiness.penalties_applied],
    ["Final summary sent to Admin", readiness.submitted_to_admin],
  ] : [];
  const sortedResults = [...race.result].sort((a, b) => (a.finalPosition ?? Number.MAX_SAFE_INTEGER) - (b.finalPosition ?? Number.MAX_SAFE_INTEGER));

  return <RefereeLayout title="Race Result" eyebrow={`Authoritative workflow | ${race.name}`} description="Apply confirmed penalties, review the adjusted rankings, then send the final summary to Admin." actions={<Link className="admin-header__button admin-header__button--ghost" to={`/referee/races/${raceId}`}>Back to Race Detail</Link>}>
    {(error || workflowError) && <section className="admin-live-state admin-live-state--warning" role="alert">{error || workflowError} <button type="button" className="admin-header__button admin-header__button--ghost" onClick={loadWorkflow}>Retry</button></section>}
    {message && <section className="admin-live-state" aria-live="polite">{message}</section>}
    {isWorkflowLoading && <LoadingSkeleton ariaLabel="Loading result readiness" rows={3} variant="cards" />}

    {!isWorkflowLoading && !workflowError && <>
      <section className="admin-panel">
        <div className="admin-panel__header"><div><p className="admin-panel__eyebrow">Finalization gate</p><h2>{submittedToAdmin ? "Sent to Admin" : penaltiesApplied ? "Review final summary" : readiness?.ready ? "Apply confirmed penalties" : "Readiness requirements"}</h2></div><span className={`referee-status-badge referee-status-badge--${submittedToAdmin ? "blue" : readiness?.ready ? "green" : "amber"}`}>{submittedToAdmin ? "Pending Admin" : readiness?.ready ? "Ready" : "Blocked"}</span></div>
        <div className="referee-checklist">{readinessChecks.map(([label, passed]) => <div className="referee-check-item" key={label}><span className={`referee-insp-badge referee-insp-badge--${passed ? "done" : "pending"}`}>{passed ? "Ready" : "Required"}</span><span>{label}</span></div>)}</div>
        <div className="admin-tool-card__footer">
          <button className={`admin-header__button${penaltiesApplied ? " admin-header__button--ghost" : ""}`} type="button" disabled={!readiness?.ready_to_apply_penalties || penaltiesApplied || lockedResults || Boolean(activeAction)} onClick={() => runAction("penalties")}>{activeAction === "penalties" ? "Applying..." : penaltiesApplied ? "Penalties Applied" : "Apply Confirmed Penalties"}</button>
          <button className={`admin-header__button${penaltiesApplied && !submittedToAdmin ? "" : " admin-header__button--ghost"}`} type="button" disabled={!readiness?.ready_to_finalize || submittedToAdmin || lockedResults || Boolean(activeAction)} onClick={() => runAction("finalize")}>{activeAction === "finalize" ? "Sending..." : submittedToAdmin ? "Sent to Admin" : "Finalize and Send to Admin"}</button>
        </div>
        {lockedResults && <p>These results are {formatStatus(race.resultStatus)} and can no longer be changed by a Referee.</p>}
      </section>

      <section className="admin-panel"><div className="admin-panel__header"><div><p className="admin-panel__eyebrow">Participant gate</p><h2>Eligibility returned by result workflow</h2></div><span>{participants.filter((item) => item.eligible).length}/{participants.length} eligible</span></div>
        {participants.length === 0 ? <p>No approved participants were returned.</p> : <div className="admin-data-table__wrap"><table className="admin-data-table"><thead><tr><th>Horse</th><th>Jockey</th><th>Pre-race</th><th>Post-race</th><th>Eligibility</th><th>Blockers</th></tr></thead><tbody>{participants.map((participant) => <tr key={participant.horseId}><td><strong>{participant.horseName}</strong></td><td>{participant.jockeyName}</td><td>{formatStatus(participant.preCheckStatus)}</td><td>{formatStatus(participant.postCheckStatus)}</td><td><span className={`referee-status-badge referee-status-badge--${participant.eligible ? "green" : "amber"}`}>{participant.eligible ? "Eligible" : "Blocked"}</span></td><td>{participant.blockers.length ? participant.blockers.map((item) => blockerLabels[item] || formatStatus(item)).join(", ") : "None"}</td></tr>)}</tbody></table></div>}
      </section>
    </>}

    <section className="admin-panel"><div className="admin-panel__header"><div><p className="admin-panel__eyebrow">Engine result</p><h2>Raw and penalty-adjusted rankings</h2></div>{race.resultStatus && <span className={`referee-status-badge referee-status-badge--${race.resultStatus === RESULT_STATUSES.PUBLISHED ? "green" : race.resultStatus === RESULT_STATUSES.CONFIRMED ? "blue" : "gray"}`}>{formatStatus(race.resultStatus)}</span>}</div>
      {!hasResults ? <p>Apply confirmed penalties to generate the raw draft and adjusted rankings.</p> : <div className="admin-data-table__wrap"><table className="admin-data-table"><thead><tr><th>Final</th><th>Horse / Jockey</th><th>Raw position</th><th>Raw time</th><th>Final time</th><th>Final score</th><th>Applied violations</th></tr></thead><tbody>{sortedResults.map((result) => <tr key={result.id}><td><span className="referee-position-badge">{result.finalPosition ? `#${result.finalPosition}` : "DQ"}</span></td><td><strong>{result.horseName}</strong><br />{result.jockeyName}</td><td>{formatNumber(result.rawPosition, result.finalPosition !== result.rawPosition ? ` → ${result.finalPosition ?? "DQ"}` : "")}</td><td>{formatNumber(result.rawFinishTime, "s")}</td><td>{formatNumber(result.finalFinishTime, "s")}</td><td>{formatNumber(result.finalScore)}</td><td>{result.appliedViolationIds.length}</td></tr>)}</tbody></table></div>}
    </section>
  </RefereeLayout>;
}

export default RaceResult;
