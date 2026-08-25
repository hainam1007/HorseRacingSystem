import { useEffect, useMemo, useState } from "react";
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

  // Countdown timer: shows remaining seconds while race is in "starting" state
  // then auto-fires when it hits 0
  const [countdown, setCountdown] = useState(null);
  useEffect(() => {
    if (race.status !== RACE_STATUSES.STARTING || !race.raw?.starting_at) {
      setCountdown(null);
      return;
    }
    const startsAt = new Date(race.raw.starting_at).getTime();
    const STALE_MS = 3 * 1000;

    const update = () => {
      const remaining = Math.max(0, Math.ceil((startsAt + STALE_MS - Date.now()) / 1000));
      setCountdown(remaining);
      if (remaining === 0 && !isUpdating) {
        // Auto-fire when countdown reaches 0
        fireRaceAuto();
      }
    };

    const fireRaceAuto = async () => {
      try {
        setIsUpdating(true);
        const response = await refereeApi.fireRace(race.id);
        setFeedback(response?.race?.status ? `Race status updated to ${formatStatus(response.race.status)}.` : "Race fired successfully.");
        await reload();
      } catch (error) {
        if (error.status !== 409) {
          setFeedback(error.message || "Failed to fire race automatically.");
        }
      } finally {
        setIsUpdating(false);
      }
    };

    update();
    const interval = setInterval(update, 100);
    return () => clearInterval(interval);
  }, [race.status, race.raw?.starting_at, race.id, isUpdating]);

  const updateStatus = async (action) => {
    try {
      setIsUpdating(true);
      setFeedback("");
      let response;
      if (action === "start") response = await refereeApi.startRace(race.id);
      else if (action === "fire") response = await refereeApi.fireRace(race.id);
      else response = await refereeApi.completeRace(race.id);
      const actionLabel = action === "start" ? "started" : action === "fire" ? "fired" : "completed";
      setFeedback(response?.race?.status ? `Race status updated to ${formatStatus(response.race.status)}.` : `Race ${actionLabel} successfully.`);
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
    <p>A scheduled race can be started with a countdown, then fired to run. Running races can be completed. Pause and stop controls are not available.</p>
    {startRestriction && <section className="admin-live-state" aria-live="polite">{startRestriction}</section>}
    {feedback && <section className="admin-live-state" aria-live="polite">{feedback}</section>}
    <div className="admin-tool-card__footer">
      {race.status === RACE_STATUSES.SCHEDULED && <button className="admin-header__button" type="button" disabled={Boolean(startRestriction) || isUpdating} onClick={() => updateStatus("start")}>{isUpdating ? "Starting..." : "Start Race"}</button>}
      {race.status === RACE_STATUSES.STARTING && countdown !== null && (
        <span className="admin-live-state" aria-live="polite">Countdown: {countdown}s</span>
      )}
      {race.status === RACE_STATUSES.RUNNING && <button className="admin-header__button" type="button" disabled={isUpdating} onClick={() => updateStatus("complete")}>{isUpdating ? "Completing..." : "Complete Race"}</button>}
      {![RACE_STATUSES.SCHEDULED, RACE_STATUSES.STARTING, RACE_STATUSES.RUNNING].includes(race.status) && <span>No lifecycle action is available for {formatStatus(race.status)} races.</span>}
    </div>
  </section>;
}

export default RaceLifecycleControls;
