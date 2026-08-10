import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { refereeApi } from "../api/refereeApi";
import LoadingSkeleton from "../components/LoadingSkeleton";
import RaceLifecycleControls from "./RaceLifecycleControls";
import RefereeLayout from "./RefereeLayout";
import { formatStatus, RACE_PHASES } from "./refereeConstants";
import { useRefereeData } from "./useRefereeData";

const fallbackSeverities = ["minor", "major", "critical"];
const initialForm = {
  horseId: "",
  status: "incident_recorded",
  eventType: "",
  severity: "minor",
  timeMarker: "",
  description: "",
  evidence: "",
  requiresViolation: true,
};

function describePenalty(penalty) {
  if (!penalty) return "Pending policy decision";

  const facts = [formatStatus(penalty.type)];

  if (penalty.time_penalty_seconds) facts.push(`+${penalty.time_penalty_seconds}s`);
  if (penalty.position_delta) facts.push(`${penalty.position_delta} position demotion`);
  if (penalty.score_deduction) facts.push(`${penalty.score_deduction} point deduction`);
  if (penalty.suspension_days) facts.push(`${penalty.suspension_days} day suspension`);
  if (penalty.fine_amount) facts.push(`${penalty.fine_amount} fine`);
  if (penalty.disqualified) facts.push("Disqualification");

  return facts.join(" / ");
}

function RaceMonitor() {
  const { raceId } = useParams();
  const { getRace, isLoading, error, isUnavailable, reload } = useRefereeData();
  const race = getRace(raceId);
  const [form, setForm] = useState(initialForm);
  const [message, setMessage] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [violationOptions, setViolationOptions] = useState(null);
  const [optionsError, setOptionsError] = useState("");
  const [isOptionsLoading, setIsOptionsLoading] = useState(true);
  const [policyPreview, setPolicyPreview] = useState(null);
  const [previewError, setPreviewError] = useState("");
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);
  const isIncident = form.status !== "normal";

  useEffect(() => {
    let cancelled = false;

    async function loadOptions() {
      try {
        setIsOptionsLoading(true);
        setOptionsError("");
        const data = await refereeApi.getViolationOptions();

        if (cancelled) return;

        setViolationOptions(data);
        setForm((current) => ({
          ...current,
          eventType: current.eventType || data.violation_types?.[0] || "",
          severity: current.severity || data.severities?.[0] || "minor",
        }));
      } catch (apiError) {
        if (!cancelled) {
          setViolationOptions(null);
          setOptionsError(apiError.message || "Unable to load violation policy options.");
        }
      } finally {
        if (!cancelled) setIsOptionsLoading(false);
      }
    }

    loadOptions();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!isIncident || !form.eventType || !form.severity) {
      setPolicyPreview(null);
      setPreviewError("");
      setIsPreviewLoading(false);
      return undefined;
    }

    let active = true;
    const timer = setTimeout(async () => {
      try {
        setIsPreviewLoading(true);
        setPreviewError("");
        const data = await refereeApi.previewViolationPenalty({
          violation_type: form.eventType,
          severity: form.severity,
        });

        if (active) setPolicyPreview(data.policy || null);
      } catch (apiError) {
        if (active) {
          setPolicyPreview(null);
          setPreviewError(apiError.message || "Unable to preview penalty policy.");
        }
      } finally {
        if (active) setIsPreviewLoading(false);
      }
    }, 220);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [form.eventType, form.severity, isIncident]);

  if (isLoading) {
    return (
      <RefereeLayout title="Race Monitor" eyebrow="During race" description="">
        <LoadingSkeleton ariaLabel="Loading race monitor" variant="detail" />
      </RefereeLayout>
    );
  }

  if (error || !race) {
    return (
      <RefereeLayout title="Race Monitor" eyebrow="During race" description="">
        <section className="admin-live-state admin-live-state--warning">{error || "Race not found."}</section>
      </RefereeLayout>
    );
  }

  const editable = race.phase === RACE_PHASES.DURING_RACE;
  const participantsUnavailable = Boolean(isUnavailable || race.participantsUnavailable);
  const raceParticipants = race.participants.filter((participant) => participant.eligible);
  const incidents = race.checks.filter((check) => check.phase === RACE_PHASES.DURING_RACE);
  const selected = raceParticipants.find((participant) => participant.horseId === form.horseId);
  const severities = violationOptions?.severities?.length ? violationOptions.severities : fallbackSeverities;
  const cannotSubmit = isSaving ||
    participantsUnavailable ||
    raceParticipants.length === 0 ||
    (isIncident && (isOptionsLoading || Boolean(optionsError) || Boolean(previewError)));

  const updateStatus = (status) => {
    setForm((current) => ({
      ...current,
      status,
      requiresViolation: status !== "normal",
    }));
  };

  const save = async (event) => {
    event.preventDefault();
    const evidenceNote = form.evidence.trim();
    const incidentDescription = evidenceNote
      ? `${form.description.trim()}\n\nEvidence note: ${evidenceNote}`
      : form.description.trim();

    if (!selected) {
      setMessage("Select a participant.");
      return;
    }

    if (isIncident && (!form.eventType || !form.description.trim())) {
      setMessage("Event type and description are required for an incident.");
      return;
    }

    try {
      setIsSaving(true);
      setMessage("");
      await refereeApi.createHorseCheck(RACE_PHASES.DURING_RACE, {
        race_id: race.id,
        horse_id: selected.horseId,
        jockey_id: selected.jockeyId || undefined,
        status: form.status,
        event_type: isIncident ? form.eventType : undefined,
        severity: isIncident ? form.severity : undefined,
        time_marker: form.timeMarker || undefined,
        description: isIncident ? incidentDescription : undefined,
        check_note: isIncident ? incidentDescription : undefined,
        requires_violation: isIncident,
        auto_confirm_violation: false,
      });
      await reload();
      setForm((current) => ({
        ...initialForm,
        eventType: current.eventType || violationOptions?.violation_types?.[0] || "",
        severity: current.severity || violationOptions?.severities?.[0] || "minor",
      }));
      setMessage(isIncident
        ? "Incident recorded. Review the linked violation before submitting a penalty decision."
        : "Race observation recorded.");
    } catch (apiError) {
      setMessage(apiError.message || "Unable to record race event.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <RefereeLayout
      title="Race Monitor"
      eyebrow={`During race | ${race.name}`}
      description="Record race incidents and use the official start or complete action when the race status allows it."
      actions={<Link className="admin-header__button admin-header__button--ghost" to={`/referee/races/${raceId}`}>Race Detail</Link>}
    >
      {!editable && <section className="admin-live-state">Current race status is {formatStatus(race.status)}. During-race records are read only.</section>}
      {participantsUnavailable && <section className="admin-live-state">Participants are unavailable. Incident creation is disabled.</section>}
      {optionsError && <section className="admin-live-state admin-live-state--warning">{optionsError}</section>}
      {message && <section className="admin-live-state" aria-live="polite">{message}</section>}

      <nav className="referee-phase-strip" aria-label="Race control phases">
        <Link to={`/referee/races/${raceId}/horse-inspection?phase=pre_race`}>1. Pre-race checks</Link>
        <span className="active" aria-current="step">2. Live monitoring</span>
        <Link to={`/referee/races/${raceId}/horse-inspection?phase=post_race`}>3. Post-race checks</Link>
        <Link to={`/referee/races/${raceId}/closure`}>4. Closure</Link>
      </nav>

      <RaceLifecycleControls race={race} participantsUnavailable={participantsUnavailable} reload={reload} />

      {editable && (
        <section className="admin-panel referee-monitor-entry">
          <div className="admin-panel__header">
            <p className="admin-panel__eyebrow">New event</p>
            <h2>Record race observation</h2>
          </div>

          <form className="admin-form-grid" onSubmit={save}>
            <label className="admin-field">
              <span>Participant</span>
              <select value={form.horseId} onChange={(event) => setForm({ ...form, horseId: event.target.value })}>
                <option value="">Select horse</option>
                {raceParticipants.map((participant) => (
                  <option key={participant.horseId} value={participant.horseId}>
                    {participant.horseName} | {participant.jockeyName}
                  </option>
                ))}
              </select>
            </label>

            <label className="admin-field">
              <span>Status</span>
              <select value={form.status} onChange={(event) => updateStatus(event.target.value)}>
                {["normal", "incident_recorded", "race_stopped", "under_investigation"].map((value) => (
                  <option key={value} value={value}>{formatStatus(value)}</option>
                ))}
              </select>
            </label>

            <label className="admin-field">
              <span>Event type</span>
              <select
                disabled={!isIncident || isOptionsLoading || Boolean(optionsError)}
                value={form.eventType}
                onChange={(event) => setForm({ ...form, eventType: event.target.value })}
              >
                <option value="">{isOptionsLoading ? "Loading policy..." : "Select violation type"}</option>
                {violationOptions?.violation_types?.map((type) => (
                  <option key={type} value={type}>{formatStatus(type)}</option>
                ))}
              </select>
            </label>

            <label className="admin-field">
              <span>Severity</span>
              <select
                disabled={!isIncident}
                value={form.severity}
                onChange={(event) => setForm({ ...form, severity: event.target.value })}
              >
                {severities.map((value) => (
                  <option key={value} value={value}>{formatStatus(value)}</option>
                ))}
              </select>
            </label>

            <label className="admin-field">
              <span>Race time marker</span>
              <input value={form.timeMarker} onChange={(event) => setForm({ ...form, timeMarker: event.target.value })} placeholder="00:01:24" />
            </label>

            <label className="admin-field">
              <span>Description</span>
              <textarea value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} />
            </label>

            <label className="admin-field">
              <span>Evidence note</span>
              <textarea
                value={form.evidence}
                onChange={(event) => setForm({ ...form, evidence: event.target.value })}
                placeholder="Camera angle, timestamp, steward observation, or photo reference..."
              />
            </label>

            {isIncident && (
              <section className="referee-policy-preview" aria-live="polite">
                {isPreviewLoading ? (
                  <LoadingSkeleton ariaLabel="Loading penalty preview" variant="inline" />
                ) : previewError ? (
                  <p>{previewError}</p>
                ) : policyPreview ? (
                  <>
                    <div><span>System penalty recommendation</span></div>
                    <strong>{describePenalty(policyPreview.suggested_penalty)}</strong>
                    <p>{policyPreview.suggested_penalty?.note}</p>
                    <small>This is guidance. The Referee records the final decision after reviewing the incident.</small>
                  </>
                ) : (
                  <p>Select event type and severity to preview the policy.</p>
                )}
              </section>
            )}

            <div className="admin-tool-card__footer">
              <button className="admin-header__button" type="submit" disabled={cannotSubmit}>
                {isSaving ? "Saving..." : "Record observation"}
              </button>
            </div>
          </form>
        </section>
      )}

      <section className="admin-panel referee-monitor-timeline">
        <div className="admin-panel__header">
          <p className="admin-panel__eyebrow">Event log</p>
          <h2>During-race timeline</h2>
          <Link className="admin-header__button admin-header__button--ghost" to={`/referee/races/${raceId}/violations`}>Review penalties</Link>
        </div>
        {incidents.length === 0 ? (
          <p>No events recorded.</p>
        ) : (
          <div className="admin-data-table__wrap">
            <table className="admin-data-table">
              <thead>
                <tr>
                  <th>Horse</th>
                  <th>Status</th>
                  <th>Type</th>
                  <th>Severity</th>
                  <th>Time</th>
                  <th>Description</th>
                  <th>Decision</th>
                </tr>
              </thead>
              <tbody>
                {incidents.map((incident) => {
                  const participant = race.participants.find((item) => item.horseId === incident.horseId);

                  return (
                    <tr key={incident.id}>
                      <td>{participant?.horseName || incident.horseId}</td>
                      <td>{formatStatus(incident.status)}</td>
                      <td>{formatStatus(incident.eventType)}</td>
                      <td>{formatStatus(incident.severity)}</td>
                      <td>{incident.timeMarker || "Not recorded"}</td>
                      <td>{incident.description || incident.note}</td>
                      <td>{incident.linkedViolationId ? <Link to={`/referee/races/${raceId}/violations`}>Review</Link> : "Observation only"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </RefereeLayout>
  );
}

export default RaceMonitor;
