import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { refereeApi } from "../api/refereeApi";
import LoadingSkeleton from "../components/LoadingSkeleton";
import RefereeLayout from "./RefereeLayout";
import RefereeNotifications from "./RefereeNotifications";
import { formatStatus, RESULT_STATUSES } from "./refereeConstants";
import { getId } from "./refereeAdapters";
import { useRefereeData } from "./useRefereeData";

const tabs = [
  { key: "report", label: "Report" },
  { key: "result", label: "Results" },
  { key: "audit", label: "Audit Summary" },
];

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
  if (value === undefined || value === null) return "-";
  const num = Number(value);
  if (!Number.isNaN(num) && suffix === "s") return `${num.toFixed(2)}${suffix}`;
  return `${value}${suffix}`;
}

function buildReportForm(race) {
  return {
    title: race?.report?.title || `${race?.name || "Race"} official report`,
    content: race?.report?.content || "",
    raceCondition: race?.report?.raceCondition || "normal",
    weather: race?.report?.weather || "",
    trackCondition: race?.report?.trackCondition || "",
    conclusion: race?.report?.conclusion || "",
  };
}

function RaceClosure() {
  const { raceId } = useParams();
  const { error, getRace, isLoading, reload } = useRefereeData();
  const race = getRace(raceId);
  const [activeTab, setActiveTab] = useState("report");
  const [participants, setParticipants] = useState([]);
  const [readiness, setReadiness] = useState(null);
  const [workflowError, setWorkflowError] = useState("");
  const [isWorkflowLoading, setIsWorkflowLoading] = useState(true);
  const [activeAction, setActiveAction] = useState("");
  const [form, setForm] = useState(buildReportForm(null));
  const [messages, setMessages] = useState([]);
  const [isSavingReport, setIsSavingReport] = useState(false);
  const [resultEdits, setResultEdits] = useState({});
  const [resultSaving, setResultSaving] = useState("");

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
      setWorkflowError(apiError.message || "Unable to load closure readiness.");
    } finally {
      setIsWorkflowLoading(false);
    }
  }, [raceId]);

  useEffect(() => { loadWorkflow(); }, [loadWorkflow]);
  useEffect(() => { setForm(buildReportForm(race)); }, [race]);
  useEffect(() => {
    if (!race?.result?.length) {
      setResultEdits({});
      return;
    }

    setResultEdits(race.result.reduce((edits, result) => {
      edits[result.id] = {
        position: result.rawPosition ?? result.position ?? "",
        finish_time: result.rawFinishTime ?? result.finishTime ?? "",
        score: result.rawScore ?? result.score ?? "",
        note: result.note || "",
      };
      return edits;
    }, {}));
  }, [race]);

  const addMsg = (notice) => setMessages((current) => [
    { id: `${Date.now()}-${Math.random()}`, ...notice },
    ...current,
  ].slice(0, 4));
  const dismissMessage = (id) => setMessages((current) => current.filter((message) => message.id !== id));
  const updateField = (field, value) => setForm((current) => ({ ...current, [field]: value }));
  const updateResultEdit = (resultId, field, value) => {
    setResultEdits((current) => ({
      ...current,
      [resultId]: {
        ...(current[resultId] || {}),
        [field]: value,
      },
    }));
  };

  const runAction = async (action) => {
    try {
      setActiveAction(action);
      if (action === "finalize") await refereeApi.finalizeRaceResults(raceId);
      else if (action === "publish") {
        if (race.resultStatus === RESULT_STATUSES.DRAFT) {
          await refereeApi.confirmRaceResults(raceId);
        }
        await refereeApi.publishRaceResults(raceId);
      } else await refereeApi.applyRaceResultPenalties(raceId);
      await Promise.all([reload(), loadWorkflow()]);
      addMsg(action === "finalize"
        ? { tone: "success", title: "Results finalized", detail: "Penalty-adjusted rankings are ready for approval and publication." }
        : action === "publish"
          ? { tone: "success", title: "Results published", detail: "The official race result is approved and visible to the competition." }
          : { tone: "success", title: "Penalties applied", detail: "Confirmed penalties are reflected in the adjusted rankings." });
    } catch (apiError) {
      if (action === "publish") {
        await Promise.allSettled([reload(), loadWorkflow()]);
      }
      addMsg({ tone: "error", title: "Could not update results", detail: apiError.message || "Unable to update race results. Try again." });
    } finally {
      setActiveAction("");
    }
  };

  const saveResultEdit = async (resultId) => {
    const draft = resultEdits[resultId];
    if (!draft) return;

    const payload = {
      position: draft.position === "" ? undefined : Number(draft.position),
      finish_time: draft.finish_time === "" ? undefined : Number(draft.finish_time),
      score: draft.score === "" ? undefined : Number(draft.score),
      note: draft.note || "",
    };

    try {
      setResultSaving(resultId);
      await refereeApi.updateRaceResult(resultId, payload);
      await Promise.all([reload(), loadWorkflow()]);
      addMsg({ tone: "info", title: "Draft result updated", detail: "The edited result row has been saved." });
    } catch (apiError) {
      addMsg({ tone: "error", title: "Could not update result", detail: apiError.message || "Unable to update the draft result. Try again." });
    } finally {
      setResultSaving("");
    }
  };

  const reportPayload = () => ({
    race_id: race.id,
    report_title: form.title,
    report_content: form.content,
    race_condition: form.raceCondition,
    weather: form.weather,
    track_condition: form.trackCondition,
    conclusion: form.conclusion,
  });

  const saveDraft = async ({ notify = true } = {}) => {
    if (!form.title.trim()) {
      addMsg({ tone: "warning", title: "Report title required", detail: "Add a title before saving or submitting this report." });
      return null;
    }

    try {
      setIsSavingReport(true);
      let reportId = race.report?.id;
      if (reportId) {
        const data = await refereeApi.updateRefereeReport(reportId, reportPayload());
        reportId = data.referee_report?._id || data.referee_report?.id || reportId;
      } else {
        const data = await refereeApi.createRefereeReport(reportPayload());
        reportId = data.referee_report?._id || data.referee_report?.id;
      }
      await Promise.all([reload(), loadWorkflow()]);
      if (notify) {
        addMsg({ tone: "success", title: "Draft saved", detail: "Your report changes are saved and remain editable." });
      }
      return reportId;
    } catch (apiError) {
      addMsg({ tone: "error", title: "Could not save report", detail: apiError.message || "Unable to save the referee report. Try again." });
      return null;
    } finally {
      setIsSavingReport(false);
    }
  };

  const submitReport = async () => {
    const reportId = await saveDraft({ notify: false });
    if (!reportId) return;

    try {
      setIsSavingReport(true);
      await refereeApi.submitRefereeReport(reportId);
      await Promise.all([reload(), loadWorkflow()]);
      setActiveTab("result");
      addMsg({ tone: "success", title: "Report submitted", detail: "The official report is now locked and the results workflow is ready to continue." });
    } catch (apiError) {
      addMsg({ tone: "error", title: "Could not submit report", detail: apiError.message || "Unable to submit the referee report. Try again." });
    } finally {
      setIsSavingReport(false);
    }
  };

  if (isLoading) {
    return <RefereeLayout title="Race Closure" eyebrow="" description=""><LoadingSkeleton ariaLabel="Loading race closure" variant="detail" /></RefereeLayout>;
  }

  if (!race) {
    return <RefereeLayout title="Race Closure" eyebrow="" description=""><section className="admin-live-state admin-live-state--warning">{error || "Race not found."}</section></RefereeLayout>;
  }

  const hasResults = race.result.length > 0;
  const penaltiesApplied = readiness
    ? readiness.penalties_applied === true
    : hasResults && race.result.every((result) => result.penaltyApplied);
  const resultsFinalized = readiness
    ? readiness.results_finalized === true
    : hasResults && race.result.every((result) => result.submittedToAdmin);
  const resultsPublished = race.resultStatus === RESULT_STATUSES.PUBLISHED;
  const lockedResults = resultsFinalized ||
    [RESULT_STATUSES.CONFIRMED, RESULT_STATUSES.PUBLISHED].includes(race.resultStatus);
  const correctionResult = race.result.find((result) => result.correctionRequested);
  const hasCorrectionRequest = Boolean(correctionResult);
  const isSubmitted = (race.report?.status || "draft") === "submitted";
  const readinessChecks = readiness ? [
    ["Registration locked", readiness.registration_locked],
    ["Race completed", ["completed", "finished"].includes(String(readiness.race_status).toLowerCase())],
    ["Eligible participants", readiness.eligible_participant_count > 0],
    ["Referee report submitted", !readiness.missing_report],
    ["Post-race checks complete", readiness.missing_post_check_horse_ids?.length === 0],
    ["No horse under investigation", readiness.under_investigation_horse_ids?.length === 0],
    ["No unresolved violations", readiness.unresolved_violation_ids?.length === 0],
    ["Confirmed penalties applied", readiness.penalties_applied],
    ["Results finalized", readiness.results_finalized],
  ] : [];
  const sortedResults = [...race.result].sort((a, b) => (a.finalPosition ?? Number.MAX_SAFE_INTEGER) - (b.finalPosition ?? Number.MAX_SAFE_INTEGER));
  const sortedDraftResults = [...race.result].sort((a, b) => (a.rawPosition ?? a.position ?? Number.MAX_SAFE_INTEGER) - (b.rawPosition ?? b.position ?? Number.MAX_SAFE_INTEGER));

  return (
    <RefereeLayout
      title="Race Closure"
      eyebrow={`Official closure | ${race.name}`}
      description="Apply confirmed penalties, review the adjusted rankings, then approve and publish the official result."
      actions={<Link className="admin-header__button admin-header__button--ghost" to={`/referee/races/${raceId}`}>Race Detail</Link>}
    >
      {(error || workflowError) && <section className="admin-live-state admin-live-state--warning">{error || workflowError}</section>}
      <RefereeNotifications items={messages} onDismiss={dismissMessage} />

      <nav className="referee-phase-strip" aria-label="Race control phases">
        <Link to={`/referee/races/${raceId}/horse-inspection?phase=pre_race`}>1. Pre-race checks</Link>
        <Link to={`/referee/races/${raceId}/monitor`}>2. Live monitoring</Link>
        <Link to={`/referee/races/${raceId}/horse-inspection?phase=post_race`}>3. Post-race checks</Link>
        <span className="active" aria-current="step">4. Closure</span>
      </nav>

      <section className="referee-closure-tabs" aria-label="Race closure tabs">
        {tabs.map((tab) => (
          <button className={activeTab === tab.key ? "is-active" : ""} key={tab.key} onClick={() => setActiveTab(tab.key)} type="button">
            {tab.label}
          </button>
        ))}
      </section>

      {activeTab === "result" && (
        <>
          {isWorkflowLoading && <LoadingSkeleton ariaLabel="Loading result readiness" rows={3} variant="cards" />}
          {!isWorkflowLoading && (
            <section className="admin-panel">
              <div className="admin-panel__header"><div><p className="admin-panel__eyebrow">Finalization gate</p><h2>{resultsPublished ? "Official results published" : resultsFinalized ? "Approve and publish" : penaltiesApplied ? "Review final summary" : readiness?.ready ? "Apply confirmed penalties" : "Readiness requirements"}</h2></div><span className={`referee-status-badge referee-status-badge--${resultsPublished ? "green" : resultsFinalized ? "blue" : readiness?.ready ? "green" : "amber"}`}>{resultsPublished ? "Published" : resultsFinalized ? "Awaiting your approval" : readiness?.ready ? "Ready" : "Blocked"}</span></div>
              <div className="referee-checklist">{readinessChecks.map(([label, passed]) => <div className="referee-check-item" key={label}><span className={`referee-insp-badge referee-insp-badge--${passed ? "done" : "pending"}`}>{passed ? "Ready" : "Required"}</span><span>{label}</span></div>)}</div>
              {readiness?.missing_report && (
                <section className="admin-live-state admin-live-state--warning">
                  Submit the referee report before finalizing race results.
                  <button className="admin-header__button admin-header__button--ghost" type="button" onClick={() => setActiveTab("report")}>Open Report</button>
                </section>
              )}
              <div className="admin-tool-card__footer">
                <button className={`admin-header__button${penaltiesApplied ? " admin-header__button--ghost" : ""}`} type="button" disabled={!readiness?.ready_to_apply_penalties || penaltiesApplied || lockedResults || Boolean(activeAction)} onClick={() => runAction("penalties")}>{activeAction === "penalties" ? "Applying..." : penaltiesApplied ? "Penalties Applied" : "Apply Confirmed Penalties"}</button>
                <button className={`admin-header__button${penaltiesApplied && !resultsFinalized ? "" : " admin-header__button--ghost"}`} type="button" disabled={!readiness?.ready_to_finalize || resultsFinalized || lockedResults || Boolean(activeAction)} onClick={() => runAction("finalize")}>{activeAction === "finalize" ? "Finalizing..." : resultsFinalized ? "Results Finalized" : "Finalize Results"}</button>
                <button className="admin-header__button" type="button" disabled={!resultsFinalized || resultsPublished || Boolean(activeAction)} onClick={() => runAction("publish")}>{activeAction === "publish" ? "Publishing..." : race.resultStatus === RESULT_STATUSES.CONFIRMED ? "Publish Official Result" : "Approve and Publish"}</button>
              </div>
            </section>
          )}

          {hasCorrectionRequest && (
            <section className="admin-live-state admin-live-state--warning">
              Admin requested correction: {correctionResult.correctionNote || "Review and update the draft result before admin confirmation."}
            </section>
          )}

          <section className="admin-panel"><div className="admin-panel__header"><div><p className="admin-panel__eyebrow">Engine result</p><h2>Raw and penalty-adjusted rankings</h2></div>{race.resultStatus && <span className={`referee-status-badge referee-status-badge--${race.resultStatus === RESULT_STATUSES.PUBLISHED ? "green" : race.resultStatus === RESULT_STATUSES.CONFIRMED ? "blue" : "gray"}`}>{formatStatus(race.resultStatus)}</span>}</div>
            {!hasResults ? <p>Apply confirmed penalties to generate the raw draft and adjusted rankings.</p> : <div className="admin-data-table__wrap"><table className="admin-data-table"><thead><tr><th>Final</th><th>Horse / Jockey</th><th>Raw position</th><th>Raw time</th><th>Final time</th><th>Final score</th><th>Violations</th></tr></thead><tbody>{sortedResults.map((result) => <tr key={result.id}><td><span className="referee-position-badge">{result.finalPosition ? `#${result.finalPosition}` : "DQ"}</span></td><td><strong>{result.horseName}</strong><br />{result.jockeyName}</td><td>{formatNumber(result.rawPosition, result.finalPosition !== result.rawPosition ? ` -> ${result.finalPosition ?? "DQ"}` : "")}</td><td>{formatNumber(result.rawFinishTime, "s")}</td><td>{formatNumber(result.finalFinishTime, "s")}</td><td>{formatNumber(result.finalScore)}</td><td>{result.appliedViolationIds.length}</td></tr>)}</tbody></table></div>}
          </section>

          {hasResults && (
            <section className="admin-panel">
              <div className="admin-panel__header"><div><p className="admin-panel__eyebrow">Referee correction</p><h2>Draft result editor</h2></div><span className={`referee-status-badge referee-status-badge--${lockedResults ? "gray" : "amber"}`}>{lockedResults ? "Locked" : "Draft editable"}</span></div>
              {lockedResults ? <p>{resultsPublished ? "These official results can no longer be edited." : resultsFinalized ? "These results are finalized. Publish them or use the correction workflow before editing." : `These results are ${formatStatus(race.resultStatus)}.`}</p> : (
                <div className="admin-data-table__wrap">
                  <table className="admin-data-table referee-result-editor">
                    <thead><tr><th>Horse / Jockey</th><th>Position</th><th>Finish time</th><th>Score</th><th>Note</th><th>Action</th></tr></thead>
                    <tbody>{sortedDraftResults.map((result) => {
                      const edit = resultEdits[result.id] || {};
                      return (
                        <tr key={result.id}>
                          <td><strong>{result.horseName}</strong><br />{result.jockeyName}</td>
                          <td><input min="1" type="number" value={edit.position ?? ""} disabled={Boolean(resultSaving)} onChange={(event) => updateResultEdit(result.id, "position", event.target.value)} /></td>
                          <td><input min="0" step="0.01" type="number" value={edit.finish_time ?? ""} disabled={Boolean(resultSaving)} onChange={(event) => updateResultEdit(result.id, "finish_time", event.target.value)} /></td>
                          <td><input min="0" step="0.01" type="number" value={edit.score ?? ""} disabled={Boolean(resultSaving)} onChange={(event) => updateResultEdit(result.id, "score", event.target.value)} /></td>
                          <td><input value={edit.note ?? ""} disabled={Boolean(resultSaving)} onChange={(event) => updateResultEdit(result.id, "note", event.target.value)} /></td>
                          <td><button className="admin-header__button admin-header__button--ghost" disabled={Boolean(resultSaving)} type="button" onClick={() => saveResultEdit(result.id)}>{resultSaving === result.id ? "Saving..." : "Save"}</button></td>
                        </tr>
                      );
                    })}</tbody>
                  </table>
                </div>
              )}
            </section>
          )}
        </>
      )}

      {activeTab === "report" && (
        <section className="admin-panel">
          <div className="admin-panel__header"><div><p className="admin-panel__eyebrow">Official report</p><h2>Referee report</h2></div><span className={`referee-status-badge referee-status-badge--${isSubmitted ? "green" : "gray"}`}>{isSubmitted ? "Submitted" : "Draft"}</span></div>
          <form className="admin-form-grid" onSubmit={(event) => event.preventDefault()}>
            <label className="admin-field"><span>Report Title</span><input value={form.title} onChange={(event) => updateField("title", event.target.value)} disabled={isSubmitted} /></label>
            <label className="admin-field"><span>Race condition</span><select value={form.raceCondition} onChange={(event) => updateField("raceCondition", event.target.value)} disabled={isSubmitted}><option value="normal">Normal</option><option value="delayed">Delayed</option><option value="interrupted">Interrupted</option><option value="stopped">Stopped</option></select></label>
            <label className="admin-field"><span>Weather</span><select value={form.weather} onChange={(event) => updateField("weather", event.target.value)} disabled={isSubmitted}><option value="">Select weather</option><option value="clear">Clear</option><option value="cloudy">Cloudy</option><option value="light_rain">Light rain</option><option value="heavy_rain">Heavy rain</option><option value="windy">Windy</option></select></label>
            <label className="admin-field"><span>Track condition</span><select value={form.trackCondition} onChange={(event) => updateField("trackCondition", event.target.value)} disabled={isSubmitted}><option value="">Select track condition</option><option value="firm">Firm</option><option value="good">Good</option><option value="soft">Soft</option><option value="heavy">Heavy</option><option value="unsafe">Unsafe</option></select></label>
            <label className="admin-field"><span>Material events and observations</span><textarea value={form.content} onChange={(event) => updateField("content", event.target.value)} disabled={isSubmitted} placeholder="Summarize starts, incidents, stoppages, inquiries, and evidence reviewed." /></label>
            <label className="admin-field"><span>Official conclusion</span><textarea value={form.conclusion} onChange={(event) => updateField("conclusion", event.target.value)} disabled={isSubmitted} placeholder="State whether the race can proceed to result finalization and note any outstanding review." /></label>
          </form>
          {!isSubmitted && <div className="admin-tool-card__footer" style={{ marginTop: 14 }}><button className="admin-header__button admin-header__button--ghost" disabled={isSavingReport} type="button" onClick={saveDraft}>{isSavingReport ? "Saving..." : "Save Draft"}</button><button className="admin-header__button referee-btn--confirm" disabled={isSavingReport} type="button" onClick={submitReport}>Submit Report</button></div>}
          {isSubmitted && <div className="admin-tool-card__footer" style={{ marginTop: 14 }}><button className="admin-header__button" type="button" onClick={() => setActiveTab("result")}>Continue to Results</button></div>}
        </section>
      )}

      {activeTab === "audit" && (
        <>
          <section className="admin-panel"><div className="admin-panel__header"><p className="admin-panel__eyebrow">Participants</p><h2>Eligibility returned by result workflow</h2></div>{participants.length === 0 ? <p>No approved participants were returned.</p> : <div className="admin-data-table__wrap"><table className="admin-data-table"><thead><tr><th>Horse</th><th>Jockey</th><th>Pre-race</th><th>Post-race</th><th>Eligibility</th><th>Blockers</th></tr></thead><tbody>{participants.map((participant) => <tr key={participant.horseId}><td><strong>{participant.horseName}</strong></td><td>{participant.jockeyName}</td><td>{formatStatus(participant.preCheckStatus)}</td><td>{formatStatus(participant.postCheckStatus)}</td><td><span className={`referee-status-badge referee-status-badge--${participant.eligible ? "green" : "amber"}`}>{participant.eligible ? "Eligible" : "Blocked"}</span></td><td>{participant.blockers.length ? participant.blockers.map((item) => blockerLabels[item] || formatStatus(item)).join(", ") : "None"}</td></tr>)}</tbody></table></div>}</section>
          <section className="admin-panel"><div className="admin-panel__header"><p className="admin-panel__eyebrow">Violations</p><h2>Recorded incidents</h2></div>{race.violations.length === 0 ? <p>No violations were recorded.</p> : <div className="admin-data-table__wrap"><table className="admin-data-table"><thead><tr><th>Type</th><th>Subject</th><th>Penalty</th><th>Status</th><th>Description</th></tr></thead><tbody>{race.violations.map((violation) => <tr key={violation.id}><td>{formatStatus(violation.type)}</td><td>{violation.subjectName}</td><td>{formatStatus(violation.penaltyType)}</td><td>{formatStatus(violation.status)}</td><td>{violation.description || "-"}</td></tr>)}</tbody></table></div>}<div className="admin-tool-card__footer"><Link className="admin-header__button admin-header__button--ghost" to={`/referee/races/${raceId}/violations`}>Open violation decisions</Link></div></section>
        </>
      )}
    </RefereeLayout>
  );
}

export default RaceClosure;
