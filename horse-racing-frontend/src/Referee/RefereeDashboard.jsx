import { ArrowUpRight, CalendarDays, CheckCircle2, Flag, Radio, ShieldAlert, Users } from "lucide-react";
import { Link } from "react-router-dom";
import LoadingSkeleton from "../components/LoadingSkeleton";
import RefereeLayout from "./RefereeLayout";
import { formatStatus, getRacePhase, RACE_PHASES } from "./refereeConstants";
import { useRefereeData } from "./useRefereeData";

const phaseMeta = [
  { key: "pre", label: "Pre-race", phase: RACE_PHASES.PRE_RACE, icon: CalendarDays },
  { key: "during", label: "Live control", phase: RACE_PHASES.DURING_RACE, icon: Radio },
  { key: "post", label: "Post-race", phase: RACE_PHASES.POST_RACE, icon: CheckCircle2 },
];

function statusTone(status) {
  if (status === "running") return "in-progress";
  if (["completed", "finished"].includes(status)) return "green";
  return "amber";
}

function RefereeDashboard() {
  const { races, isLoading, error, isEmpty, isUnavailable, reload } = useRefereeData();
  const counts = Object.fromEntries(phaseMeta.map(({ key, phase }) => [key, races.filter((race) => getRacePhase(race.status) === phase).length]));
  const focusRace = races.find((race) => race.status === "running") || races.find((race) => race.status === "scheduled") || races[0];
  const totalParticipants = races.reduce((total, race) => total + race.participants.length, 0);
  const openViolations = races.reduce((total, race) => total + race.violations.filter((item) => !["resolved", "dismissed"].includes(item.status)).length, 0);

  return <RefereeLayout title="Race control desk" eyebrow="Assigned race operations" description="One operational view for inspections, live incidents, penalties, draft results, and official reports." actions={<Link className="admin-header__button" to="/referee/races">View race board <ArrowUpRight aria-hidden="true" size={17} /></Link>}>
    {isLoading && <LoadingSkeleton ariaLabel="Loading referee dashboard" variant="page" />}
    {!isLoading && error && <section className="admin-live-state admin-live-state--warning" role="alert">{error} <button className="admin-header__button admin-header__button--ghost" type="button" onClick={reload}>Retry</button></section>}
    {!isLoading && !error && isUnavailable && <section className="admin-live-state" aria-live="polite">Some participant records are unavailable. Participant-dependent controls remain disabled.</section>}
    {!isLoading && !error && isEmpty && <section className="admin-panel referee-empty-state"><Flag aria-hidden="true" size={28} /><div><h2>No assigned races</h2><p>Your account has no races assigned by an administrator.</p></div></section>}

    {!isLoading && !error && !isEmpty && <>
      <section className="referee-command-grid" aria-label="Assigned race summary">
        <article className="referee-command-card referee-command-card--primary"><div className="referee-command-card__top"><span>Assigned programme</span><Flag aria-hidden="true" size={20} /></div><strong>{races.length}</strong><p>races under your authority</p><div className="referee-command-card__foot"><Users aria-hidden="true" size={16} /> {totalParticipants} approved runners</div></article>
        <div className="referee-command-stack">
          <article><Users aria-hidden="true" size={18} /><div><strong>{totalParticipants}</strong><span>Participants</span></div></article>
          <article><ShieldAlert aria-hidden="true" size={18} /><div><strong>{openViolations}</strong><span>Open violations</span></div></article>
        </div>
        <article className="referee-focus-card"><div className="referee-focus-card__label"><span className="referee-focus-card__pulse" />Operational focus</div><div><p>{focusRace?.tournament}</p><h2>{focusRace?.name}</h2></div><dl><div><dt>Status</dt><dd><span className={`referee-status-badge referee-status-badge--${statusTone(focusRace?.status)}`}>{formatStatus(focusRace?.status)}</span></dd></div><div><dt>Race time</dt><dd>{focusRace?.date} · {focusRace?.startTime}</dd></div><div><dt>Track</dt><dd>{focusRace?.track}</dd></div></dl><Link to={`/referee/races/${focusRace?.id}`}>Open operational file <ArrowUpRight aria-hidden="true" size={16} /></Link></article>
      </section>

      <section className="referee-phase-rail" aria-label="Race phases">{phaseMeta.map(({ key, label, icon: Icon }, index) => <article key={key}><div className="referee-phase-rail__index">0{index + 1}</div><Icon aria-hidden="true" size={19} /><div><strong>{label}</strong><span>{counts[key]} {counts[key] === 1 ? "race" : "races"}</span></div></article>)}</section>

      <section className="admin-panel referee-ledger"><div className="admin-panel__header referee-section-heading"><div><p className="admin-panel__eyebrow">Programme ledger</p><h2>Assigned races</h2></div><Link to="/referee/races">Filter and inspect <ArrowUpRight aria-hidden="true" size={16} /></Link></div><div className="admin-data-table__wrap"><table className="admin-data-table"><thead><tr><th>Race file</th><th>Tournament</th><th>Scheduled</th><th>Status</th><th>Runners</th></tr></thead><tbody>{races.map((race) => <tr key={race.id}><td><Link className="referee-table-link" to={`/referee/races/${race.id}`}>{race.name}<ArrowUpRight aria-hidden="true" size={14} /></Link></td><td>{race.tournament}</td><td>{race.date}<span className="referee-table-subline">{race.startTime}</span></td><td><span className={`referee-status-badge referee-status-badge--${statusTone(race.status)}`}>{formatStatus(race.status)}</span></td><td>{race.participants.length}</td></tr>)}</tbody></table></div></section>
    </>}
  </RefereeLayout>;
}

export default RefereeDashboard;
