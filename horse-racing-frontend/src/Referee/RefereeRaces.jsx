import { AlertTriangle, ArrowUpRight, CalendarDays, Filter, MapPin, Search, Users } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import LoadingSkeleton from "../components/LoadingSkeleton";
import RefereeLayout from "./RefereeLayout";
import { formatStatus, getRacePhase, RACE_PHASES } from "./refereeConstants";
import { useRefereeData } from "./useRefereeData";

const phaseNumber = { [RACE_PHASES.PRE_RACE]: "01", [RACE_PHASES.DURING_RACE]: "02", [RACE_PHASES.POST_RACE]: "03" };

function statusTone(status) {
  if (status === "running") return "in-progress";
  if (["completed", "finished"].includes(status)) return "green";
  if (["cancelled", "canceled"].includes(status)) return "red";
  return "amber";
}

function RefereeRaces() {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const { races, isLoading, error, isEmpty, isUnavailable, reload } = useRefereeData();
  const statuses = [...new Set(races.map((race) => race.status))];
  const filtered = races.filter((race) => (status === "all" || race.status === status) && `${race.name} ${race.tournament} ${race.track}`.toLowerCase().includes(query.toLowerCase()));

  return <RefereeLayout title="Assigned race board" eyebrow="Official programme" description="Scan race state, runner count, incidents, and scheduled time before opening the operational file." actions={<Link className="admin-header__button admin-header__button--ghost" to="/referee">Control desk</Link>}>
    {isLoading && <LoadingSkeleton ariaLabel="Loading assigned races" rows={4} variant="cards" />}
    {!isLoading && error && <section className="admin-live-state admin-live-state--warning" role="alert">{error} <button type="button" className="admin-header__button admin-header__button--ghost" onClick={reload}>Retry</button></section>}
    {!isLoading && !error && isUnavailable && <section className="admin-live-state">Participant data is partly unavailable. Race metadata remains readable.</section>}
    {!isLoading && !error && <>
      <section className="referee-filter-bar" aria-label="Race filters"><div className="referee-filter-bar__count"><Filter aria-hidden="true" size={16} /><span>{filtered.length} of {races.length} races</span></div><label className="referee-search-field"><Search aria-hidden="true" size={18} /><span className="sr-only">Search assigned races</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search race, tournament, or track" /></label><label className="referee-select-field"><span className="sr-only">Filter by status</span><select value={status} onChange={(event) => setStatus(event.target.value)}><option value="all">All statuses</option>{statuses.map((value) => <option key={value} value={value}>{formatStatus(value)}</option>)}</select></label></section>

      {isEmpty ? <section className="admin-panel referee-empty-state"><CalendarDays aria-hidden="true" size={28} /><div><h2>No assigned races</h2><p>Ask an administrator to assign a race to your referee profile.</p></div></section> : <section className="referee-race-grid" aria-label="Assigned races">{filtered.length === 0 && <article className="admin-panel referee-empty-state"><Search aria-hidden="true" size={26} /><div><h2>No matching race</h2><p>Adjust the search term or status filter.</p></div></article>}{filtered.map((race) => { const phase = getRacePhase(race.status); return <article key={race.id} className="admin-panel referee-race-card"><div className="referee-race-card__rail"><span>PHASE</span><strong>{phaseNumber[phase] || "—"}</strong></div><div className="referee-race-card__body"><div className="referee-race-card__header"><div><p className="admin-panel__eyebrow">{race.tournament}</p><h2>{race.name}</h2></div><span className={`referee-status-badge referee-status-badge--${statusTone(race.status)}`}>{formatStatus(race.status)}</span></div><div className="referee-race-card__meta"><div><MapPin aria-hidden="true" size={16} /><span>{race.track}</span></div><div><CalendarDays aria-hidden="true" size={16} /><span>{race.date} · {race.startTime}</span></div><div><Users aria-hidden="true" size={16} /><span>{race.participants.length} runners</span></div><div><AlertTriangle aria-hidden="true" size={16} /><span>{race.violations.length} violations</span></div></div><div className="referee-race-card__footer"><span>{formatStatus(phase || "read_only")}</span><Link to={`/referee/races/${race.id}`}>Open race file <ArrowUpRight aria-hidden="true" size={16} /></Link></div></div></article>; })}</section>}
    </>}
  </RefereeLayout>;
}

export default RefereeRaces;
