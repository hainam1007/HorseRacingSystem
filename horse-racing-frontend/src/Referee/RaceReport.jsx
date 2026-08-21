import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { refereeApi } from "../api/refereeApi";
import LoadingSkeleton from "../components/LoadingSkeleton";
import RefereeLayout from "./RefereeLayout";
import RefereeNotifications from "./RefereeNotifications";
import { formatStatus, RESULT_STATUSES } from "./refereeConstants";
import { useRefereeData } from "./useRefereeData";

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

function RaceReport() {
  const { raceId } = useParams();
  const { error, getRace, isLoading, reload } = useRefereeData();
  const race = getRace(raceId);
  const [form, setForm] = useState(buildReportForm(null));
  const [messages, setMessages] = useState([]);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    setForm(buildReportForm(race));
  }, [race]);

  if (isLoading) {
    return (
      <RefereeLayout title="Race Report" eyebrow="" description="">
        <LoadingSkeleton ariaLabel="Loading race report" variant="detail" />
      </RefereeLayout>
    );
  }

  if (!race) {
    return (
      <RefereeLayout title="Not Found" eyebrow="" description="">
        <p>Race not found.</p>
      </RefereeLayout>
    );
  }

  const reportStatus = race.report?.status || "draft";
  const isSubmitted = reportStatus === "submitted";
  const isPublished = race.resultStatus === RESULT_STATUSES.PUBLISHED || isSubmitted;
  const confirmedTime = race.report?.submittedAt ? new Date(race.report.submittedAt).toLocaleString() : new Date().toLocaleString();

  const addMsg = (notice) => setMessages((prev) => [
    { id: `${Date.now()}-${Math.random()}`, ...notice },
    ...prev,
  ].slice(0, 4));
  const dismissMessage = (id) => setMessages((prev) => prev.filter((message) => message.id !== id));
  const updateField = (field, value) => setForm((current) => ({ ...current, [field]: value }));

  const buildPayload = () => ({
    race_id: race.id,
    report_title: form.title,
    report_content: form.content,
    race_condition: form.raceCondition,
    weather: form.weather,
    track_condition: form.trackCondition,
    conclusion: form.conclusion,
  });

  const handleSaveDraft = async ({ notify = true } = {}) => {
    if (!form.title.trim()) {
      addMsg({ tone: "warning", title: "Report title required", detail: "Add a title before saving or submitting this report." });
      return null;
    }

    try {
      setIsSaving(true);

      {
        const payload = buildPayload();
        let savedReportId = race.report?.id;

        if (race.report?.id) {
          const data = await refereeApi.updateRefereeReport(race.report.id, payload);
          savedReportId = data.referee_report?._id || data.referee_report?.id || race.report.id;
        } else {
          const data = await refereeApi.createRefereeReport(payload);
          savedReportId = data.referee_report?._id || data.referee_report?.id;
        }

        await reload();
        if (notify) {
          addMsg({ tone: "success", title: "Draft saved", detail: "Your report changes are saved and remain editable." });
        }
        return savedReportId;
      }

    } catch (apiError) {
      addMsg({ tone: "error", title: "Could not save report", detail: apiError.message || "Unable to save the referee report. Try again." });
      return null;
    } finally {
      setIsSaving(false);
    }
  };

  const handleSubmit = async () => {
    const savedReportId = await handleSaveDraft({ notify: false });
    if (!savedReportId) return;

    try {
      setIsSaving(true);
      const reportId = typeof savedReportId === "string" ? savedReportId : race.report?.id;

      if (!reportId) {
        addMsg({ tone: "warning", title: "Reload required", detail: "The draft was saved, but its report ID is unavailable. Reload before submitting." });
        return;
      }

      await refereeApi.submitRefereeReport(reportId);
      await reload();
      addMsg({ tone: "success", title: "Report submitted", detail: "The official report is now locked and available to the results workflow." });
    } catch (apiError) {
      addMsg({ tone: "error", title: "Could not submit report", detail: apiError.message || "Unable to submit the referee report. Try again." });
    } finally {
      setIsSaving(false);
    }
  };

  const handleExport = () => {
    window.print();
  };

  return (
    <RefereeLayout
      title="Race Report"
      eyebrow={`Official document - ${race.name}`}
      description="Create, update, and submit the official referee report for this race."
      actions={
        <>
          {isPublished && (
            <button className="admin-header__button" type="button" onClick={handleExport}>
              Print Report
            </button>
          )}
          <Link className="admin-header__button admin-header__button--ghost" to={`/referee/races/${raceId}`}>
            Back to Race Detail
          </Link>
        </>
      }
    >
      {error && <section className="admin-live-state admin-live-state--warning" role="alert">{error}</section>}

      <RefereeNotifications items={messages} onDismiss={dismissMessage} />

      <section className="admin-panel">
        <div className="admin-panel__header">
          <p className="admin-panel__eyebrow">Report Draft</p>
          <h2>Referee Report</h2>
        </div>
        <form className="admin-form-grid" onSubmit={(event) => event.preventDefault()}>
          <label className="admin-field">
            <span>Report Title</span>
            <input value={form.title} onChange={(event) => updateField("title", event.target.value)} disabled={isSubmitted} />
          </label>
          <label className="admin-field">
            <span>Race Condition</span>
            <input value={form.raceCondition} onChange={(event) => updateField("raceCondition", event.target.value)} disabled={isSubmitted} />
          </label>
          <label className="admin-field">
            <span>Weather</span>
            <input value={form.weather} onChange={(event) => updateField("weather", event.target.value)} disabled={isSubmitted} />
          </label>
          <label className="admin-field">
            <span>Track Condition</span>
            <input value={form.trackCondition} onChange={(event) => updateField("trackCondition", event.target.value)} disabled={isSubmitted} />
          </label>
          <label className="admin-field">
            <span>Report Content</span>
            <textarea value={form.content} onChange={(event) => updateField("content", event.target.value)} disabled={isSubmitted} />
          </label>
          <label className="admin-field">
            <span>Conclusion</span>
            <textarea value={form.conclusion} onChange={(event) => updateField("conclusion", event.target.value)} disabled={isSubmitted} />
          </label>
        </form>
        <div className="admin-tool-card__footer" style={{ marginTop: 14 }}>
          <span className={`referee-status-badge referee-status-badge--${isSubmitted ? "green" : "gray"}`}>
            {isSubmitted ? "Submitted" : "Draft"}
          </span>
          {!isSubmitted && (
            <>
              <button className="admin-header__button admin-header__button--ghost" disabled={isSaving} type="button" onClick={handleSaveDraft}>
                {isSaving ? "Saving..." : "Save Draft"}
              </button>
              <button className="admin-header__button referee-btn--confirm" disabled={isSaving} type="button" onClick={handleSubmit}>
                Submit Report
              </button>
            </>
          )}
        </div>
      </section>

      <section className="admin-panel">
        <div className="admin-panel__header">
          <p className="admin-panel__eyebrow">01 - Race Information</p>
          <h2>{race.name}</h2>
        </div>
        <div className="referee-report-grid">
          <div><span className="referee-info-label">Race ID</span><span>{race.id}</span></div>
          <div><span className="referee-info-label">Tournament</span><span>{race.tournament}</span></div>
          <div><span className="referee-info-label">Track</span><span>{race.track}</span></div>
          <div><span className="referee-info-label">Date</span><span>{race.date}</span></div>
          <div><span className="referee-info-label">Start Time</span><span>{race.startTime}</span></div>
          <div><span className="referee-info-label">Status</span><span>{race.status}</span></div>
        </div>
      </section>

      <section className="admin-panel">
        <div className="admin-panel__header">
          <p className="admin-panel__eyebrow">02 - Participants</p>
          <h2>Horses &amp; Jockeys</h2>
        </div>
        {race.participants.filter((participant) => participant.eligible).length === 0 ? (
          <p style={{ color: "rgba(245,247,243,0.48)", fontStyle: "italic" }}>No participants are available for this race yet.</p>
        ) : (
          <div className="admin-data-table__wrap">
            <table className="admin-data-table">
              <thead>
                <tr><th>Draw</th><th>Horse</th><th>Owner</th><th>Jockey</th><th>License</th></tr>
              </thead>
              <tbody>
                {race.participants.filter((participant) => participant.eligible).map((participant) => (
                  <tr key={participant.horseId}>
                    <td>{participant.lane}</td>
                    <td><strong>{participant.horseName}</strong></td>
                    <td>{participant.owner}</td>
                    <td>{participant.jockeyName}</td>
                    <td>{participant.jockeyLicense}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="admin-panel">
        <div className="admin-panel__header">
          <p className="admin-panel__eyebrow">03 - Violations</p>
          <h2>Recorded Incidents</h2>
        </div>
        {race.violations.length === 0 ? (
          <p style={{ color: "rgba(245,247,243,0.48)", fontStyle: "italic" }}>No violations were recorded.</p>
        ) : (
          <div className="admin-data-table__wrap">
            <table className="admin-data-table">
              <thead>
                <tr><th>ID</th><th>Type</th><th>Subject</th><th>Penalty</th><th>Description</th></tr>
              </thead>
              <tbody>
                {race.violations.map((violation) => (
                  <tr key={violation.id}>
                    <td>{violation.id}</td>
                    <td>{violation.type}</td>
                    <td>{violation.subjectName}</td>
                    <td>{formatStatus(violation.penaltyType)}</td>
                    <td>{violation.description || "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="admin-panel">
        <div className="admin-panel__header">
          <p className="admin-panel__eyebrow">04 - Official Results</p>
          <h2>Final Rankings</h2>
        </div>
        {!race.result?.length ? (
          <p style={{ color: "rgba(245,247,243,0.48)", fontStyle: "italic" }}>No race results have been recorded yet.</p>
        ) : (
          <div className="admin-data-table__wrap">
            <table className="admin-data-table">
              <thead>
                <tr><th>Position</th><th>Horse</th><th>Jockey</th><th>Finish Time</th><th>Penalty</th></tr>
              </thead>
              <tbody>
                {[...(race.result || [])].sort((a, b) => a.position - b.position).map((result) => (
                  <tr key={result.horseId}>
                    <td><span className="referee-position-badge">#{result.position}</span></td>
                    <td><strong>{result.horseName}</strong></td>
                    <td>{result.jockeyName}</td>
                    <td>{result.finishTime}</td>
                    <td>{result.penaltyApplied ? <span className="referee-status-badge referee-status-badge--amber">Yes</span> : "No"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {isSubmitted && (
        <section className="admin-panel referee-report-footer">
          <div className="admin-panel__header">
            <p className="admin-panel__eyebrow">05 - Referee Information</p>
            <h2>Official Signature</h2>
          </div>
          <div className="referee-report-grid">
            <div><span className="referee-info-label">Submitted At</span><span>{confirmedTime}</span></div>
            <div><span className="referee-info-label">Report Status</span>
              <span className="referee-status-badge referee-status-badge--green">Submitted</span>
            </div>
          </div>
          <div className="referee-report-seal">
            <div>
              <strong>Officially Submitted</strong>
              <p>This report has been submitted by the assigned Race Referee.</p>
            </div>
          </div>
        </section>
      )}
    </RefereeLayout>
  );
}

export default RaceReport;
