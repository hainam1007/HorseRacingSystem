import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowRight, CalendarDays, CheckCircle2, Lock, RefreshCw } from "lucide-react";
import { adminApi } from "../api/adminApi";
import AdminLayout from "./AdminLayout";
import "./admin.css";

function idOf(value) {
  return String(value?.id || value?._id || value || "");
}

function pad(value) {
  return String(value).padStart(2, "0");
}

function toDateTimeLocal(value) {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return "";
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function futureDateTime(minutesFromNow) {
  return toDateTimeLocal(new Date(Date.now() + minutesFromNow * 60 * 1000));
}

function formatDateTime(value) {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return "Not set";
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit"
  }).format(date);
}

function isRegistrationOpen(race) {
  if (!race || race.registration_locked) return false;
  const deadline = race.registration_lock_at ? new Date(race.registration_lock_at) : null;
  return !deadline || Number.isNaN(deadline.getTime()) || deadline.getTime() > Date.now();
}

function TimelineStatus({ race }) {
  if (!race) return null;
  const open = isRegistrationOpen(race);
  return (
    <div className="admin-demo-timeline__status" aria-live="polite">
      <span className={open ? "admin-demo-timeline__status-dot admin-demo-timeline__status-dot--open" : "admin-demo-timeline__status-dot"} aria-hidden="true" />
      <div>
        <strong>{open ? "Registration is open" : "Registration is locked"}</strong>
        <small>Betting: {race.betting_status || "unavailable"} · Race status: {race.status || "scheduled"}</small>
      </div>
    </div>
  );
}

function AdminDemoTimelineModule() {
  const [races, setRaces] = useState([]);
  const [selectedRaceId, setSelectedRaceId] = useState("");
  const [timeline, setTimeline] = useState({ registration_lock_at: futureDateTime(25), race_date: futureDateTime(90) });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [action, setAction] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  const scheduledRaces = useMemo(
    () => races.filter((race) => String(race.status || "").toLowerCase() === "scheduled"),
    [races]
  );
  const selectedRace = useMemo(
    () => scheduledRaces.find((race) => idOf(race) === selectedRaceId) || null,
    [scheduledRaces, selectedRaceId]
  );

  const loadRaces = useCallback(async (quiet = false) => {
    quiet ? setRefreshing(true) : setLoading(true);
    setError("");
    try {
      const response = await adminApi.listRaces();
      const nextRaces = (response.races || []).filter((race) => race.status !== "deleted");
      const nextScheduled = nextRaces.filter((race) => String(race.status || "").toLowerCase() === "scheduled");
      setRaces(nextRaces);
      setSelectedRaceId((current) => nextScheduled.some((race) => idOf(race) === current) ? current : idOf(nextScheduled[0]));
    } catch (apiError) {
      setError(apiError.message || "Unable to load scheduled races.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { loadRaces(); }, [loadRaces]);
  useEffect(() => {
    if (!notice) return undefined;
    const timer = window.setTimeout(() => setNotice(""), 5500);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const selectRace = (raceId) => {
    setSelectedRaceId(raceId);
    const race = scheduledRaces.find((item) => idOf(item) === raceId);
    const existingLock = toDateTimeLocal(race?.registration_lock_at);
    const existingRaceDate = toDateTimeLocal(race?.race_date);
    const lockDate = existingLock && new Date(existingLock).getTime() > Date.now() ? existingLock : futureDateTime(25);
    const raceDate = existingRaceDate && new Date(existingRaceDate).getTime() > new Date(lockDate).getTime() ? existingRaceDate : futureDateTime(90);
    setTimeline({ registration_lock_at: lockDate, race_date: raceDate });
  };

  const applyPreset = () => {
    setTimeline({ registration_lock_at: futureDateTime(25), race_date: futureDateTime(90) });
    setNotice("90-minute demo preset applied. You can still adjust both times.");
  };

  const prepareTimeline = async () => {
    if (!selectedRace) return;
    const lockAt = new Date(timeline.registration_lock_at);
    const raceAt = new Date(timeline.race_date);
    if (Number.isNaN(lockAt.getTime()) || Number.isNaN(raceAt.getTime())) {
      setError("Enter a valid registration deadline and race time.");
      return;
    }
    if (lockAt.getTime() <= Date.now()) {
      setError("Registration deadline must still be in the future. Use ‘Lock registration now’ after the owner and jockey steps.");
      return;
    }
    if (raceAt.getTime() <= lockAt.getTime()) {
      setError("Race time must be after the registration deadline.");
      return;
    }
    if (!window.confirm(`Prepare ${selectedRace.name} for the demo? This opens registration for this race only and resets its pre-betting odds state.`)) return;

    setAction("prepare");
    setError("");
    try {
      const response = await adminApi.prepareRaceDemoTimeline(idOf(selectedRace), {
        registration_lock_at: lockAt.toISOString(),
        race_date: raceAt.toISOString(),
      });
      setNotice(response.market_reset
        ? "Timeline ready. Registration is open; old pre-betting odds were marked stale."
        : "Timeline ready. Registration is open for the selected race only.");
      await loadRaces(true);
    } catch (apiError) {
      setError(apiError.message || "Unable to prepare the demo timeline.");
    } finally {
      setAction("");
    }
  };

  const lockRegistrationNow = async () => {
    if (!selectedRace) return;
    if (!window.confirm(`Lock registration for ${selectedRace.name} now? New horse entries will no longer be accepted for this race.`)) return;

    setAction("lock");
    setError("");
    try {
      const response = await adminApi.lockRaceRegistrationForDemo(idOf(selectedRace));
      setNotice(response.locked ? "Registration locked for this race. You can now finalize entries and create odds." : "Registration was already locked for this race.");
      await loadRaces(true);
    } catch (apiError) {
      setError(apiError.message || "Unable to lock registration for this race.");
    } finally {
      setAction("");
    }
  };

  if (loading) {
    return <AdminLayout title="Demo timeline" eyebrow="Controlled demo mode" description="Preparing the selected race for an end-to-end demonstration."><section className="admin-panel admin-demo-timeline__loading">Loading scheduled races…</section></AdminLayout>;
  }

  return (
    <AdminLayout
      title="Demo timeline"
      eyebrow="Controlled demo mode"
      description="Set a private timeline for one race, then run the owner, jockey, betting, and referee demo without date conflicts."
      actions={<button className="admin-header__button admin-header__button--ghost" type="button" onClick={() => loadRaces(true)} disabled={refreshing || Boolean(action)}><RefreshCw size={16} className={refreshing ? "admin-competition__spin" : ""} aria-hidden="true" />{refreshing ? "Refreshing" : "Refresh races"}</button>}
    >
      <section className="admin-demo-timeline__guide" aria-label="Demo flow">
        {[
          ["01", "Open entries", "Set deadline and race time here."],
          ["02", "Owner + jockey", "Complete payment, approval, and jockey acceptance."],
          ["03", "Odds + prediction", "Lock entries, then use Race schedule for odds and betting."],
          ["04", "Referee closeout", "Run, report violations, publish results, and redeem reward."],
        ].map(([number, title, copy], index) => <div key={number}><span>{number}</span><strong>{title}</strong><small>{copy}</small>{index < 3 && <ArrowRight aria-hidden="true" />}</div>)}
      </section>

      {notice && <section className="admin-live-state admin-competition__success" aria-live="polite"><CheckCircle2 size={17} aria-hidden="true" />{notice}</section>}
      {error && <section className="admin-live-state admin-live-state--warning" aria-live="assertive">{error}</section>}

      <section className="admin-panel admin-demo-timeline__panel">
        <header className="admin-panel__header admin-demo-timeline__heading">
          <div>
            <p className="admin-panel__eyebrow">One race at a time</p>
            <h2>Prepare the demo clock</h2>
            <span>The selected race stays scheduled. Its existing entries are retained, but pre-betting odds are reset so they can be generated again after jockey assignment.</span>
          </div>
          <button className="admin-header__button admin-header__button--ghost" type="button" onClick={applyPreset} disabled={Boolean(action)}><CalendarDays size={16} aria-hidden="true" />Use 90-minute preset</button>
        </header>

        {!scheduledRaces.length ? (
          <div className="admin-demo-timeline__empty"><CalendarDays size={30} aria-hidden="true" /><div><h3>No scheduled race is available</h3><p>Create a new scheduled race in Race schedule before preparing an end-to-end demo.</p></div></div>
        ) : (
          <div className="admin-demo-timeline__form">
            <label className="admin-field admin-demo-timeline__race-field">
              <span>Demo race</span>
              <select value={selectedRaceId} onChange={(event) => selectRace(event.target.value)} disabled={Boolean(action)}>
                {scheduledRaces.map((race) => <option key={idOf(race)} value={idOf(race)}>R{race.race_no || 1} · {race.name}</option>)}
              </select>
            </label>

            <div className="admin-demo-timeline__date-grid">
              <label className="admin-field"><span>Registration deadline</span><input type="datetime-local" value={timeline.registration_lock_at} onChange={(event) => setTimeline((current) => ({ ...current, registration_lock_at: event.target.value }))} disabled={Boolean(action)} /></label>
              <label className="admin-field"><span>Race time</span><input type="datetime-local" value={timeline.race_date} onChange={(event) => setTimeline((current) => ({ ...current, race_date: event.target.value }))} disabled={Boolean(action)} /></label>
            </div>

            <TimelineStatus race={selectedRace} />
            <div className="admin-demo-timeline__summary">
              <span>Deadline: <strong>{formatDateTime(timeline.registration_lock_at)}</strong></span>
              <span>Race: <strong>{formatDateTime(timeline.race_date)}</strong></span>
            </div>

            <div className="admin-demo-timeline__actions">
              <button className="admin-header__button" type="button" onClick={prepareTimeline} disabled={Boolean(action)}><CalendarDays size={16} aria-hidden="true" />{action === "prepare" ? "Preparing…" : "Open registration & apply timeline"}</button>
              <button className="admin-header__button admin-header__button--ghost" type="button" onClick={lockRegistrationNow} disabled={Boolean(action) || !isRegistrationOpen(selectedRace)} title={isRegistrationOpen(selectedRace) ? "Use after the owner and jockey flow" : "Registration is already locked"}><Lock size={16} aria-hidden="true" />{action === "lock" ? "Locking…" : "Lock registration now"}</button>
            </div>
          </div>
        )}
      </section>

      <section className="admin-demo-timeline__notes">
        <div><strong>Why this avoids the conflict</strong><p>The regular race form calculates a standard lock time. This menu stores the exact deadline you choose for one selected demo race, so the owner/jockey hand-off and same-session betting do not depend on calendar dates.</p></div>
        <div><strong>Safety boundary</strong><p>A race with spectator bets, or a race that is no longer scheduled, cannot be rewound here. Use a new scheduled race for a fresh demo.</p></div>
      </section>
    </AdminLayout>
  );
}

export default AdminDemoTimelineModule;
