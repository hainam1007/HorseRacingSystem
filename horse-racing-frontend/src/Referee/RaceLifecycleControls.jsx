import { useMemo, useState } from "react";
import { refereeApi } from "../api/refereeApi";
import { formatStatus, RACE_STATUSES } from "./refereeConstants";

function getStartRestriction(race, participantsUnavailable) {
  if (race.status !== RACE_STATUSES.SCHEDULED) return "";
  if (participantsUnavailable) return "Participant eligibility is unavailable, so the race cannot be started from this screen.";

  const raceDate = race.raw?.race_date ? new Date(race.raw.race_date) : null;
  if (!raceDate || Number.isNaN(raceDate.getTime())) return "A valid race date is required before this race can start.";
  if (race.participants.filter((participant) => participant.eligible).length === 0) return "At least one eligible participant is required before this race can start.";
  return "";
}

function RaceLifecycleControls({ race, participantsUnavailable = false, reload }) {
  const [isUpdating, setIsUpdating] = useState(false);
  const [feedback, setFeedback] = useState("");
  const startRestriction = useMemo(() => getStartRestriction(race, participantsUnavailable), [race, participantsUnavailable]);

  const updateStatus = async (action) => {
    try {
      setIsUpdating(true);
      setFeedback("");
      const response = action === "start" ? await refereeApi.startRace(race.id) : await refereeApi.completeRace(race.id);
      setFeedback(response?.race?.status ? `Race status updated to ${formatStatus(response.race.status)}.` : `Race ${action === "start" ? "started" : "completed"} successfully.`);
      await reload();
    } catch (error) {
      if (error.status === 403) setFeedback("You are not authorized to control this race. Only its assigned referee can perform this action.");
      else if (error.status === 400 || error.status === 409) setFeedback(error.message || "The race is no longer in a valid state for this action.");
      else setFeedback(error.message || "Unable to update the race status.");
    } finally {
      setIsUpdating(false);
    }
  };

  return <section className="admin-panel">
    <div className="admin-panel__header"><div><p className="admin-panel__eyebrow">Lifecycle contract</p><h2>Authoritative race controls</h2></div></div>
    <p>A scheduled race can be started and a running race can be completed. Pause and stop controls are not available.</p>
    {startRestriction && <section className="admin-live-state" aria-live="polite">{startRestriction}</section>}
    {feedback && <section className="admin-live-state" aria-live="polite">{feedback}</section>}
    <div className="admin-tool-card__footer">
      {race.status === RACE_STATUSES.SCHEDULED && <button className="admin-header__button" type="button" disabled={Boolean(startRestriction) || isUpdating} onClick={() => updateStatus("start")}>{isUpdating ? "Starting..." : "Start Race"}</button>}
      {race.status === RACE_STATUSES.RUNNING && <button className="admin-header__button" type="button" disabled={isUpdating} onClick={() => updateStatus("complete")}>{isUpdating ? "Completing..." : "Complete Race"}</button>}
      {![RACE_STATUSES.SCHEDULED, RACE_STATUSES.RUNNING].includes(race.status) && <span>No lifecycle action is available for {formatStatus(race.status)} races.</span>}
    </div>
  </section>;
}

export default RaceLifecycleControls;
