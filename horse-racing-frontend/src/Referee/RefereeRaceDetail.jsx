import { Link, useParams } from "react-router-dom";
import LoadingSkeleton from "../components/LoadingSkeleton";
import RaceLifecycleControls from "./RaceLifecycleControls";
import RefereeLayout from "./RefereeLayout";
import { formatStatus, RACE_PHASES } from "./refereeConstants";
import { useRefereeData } from "./useRefereeData";

const phaseOrder = [RACE_PHASES.PRE_RACE, RACE_PHASES.DURING_RACE, RACE_PHASES.POST_RACE];

function RefereeRaceDetail() {
  const { raceId } = useParams();
  const { getRace, isLoading, error, isUnavailable, reload } = useRefereeData();
  const race = getRace(raceId);

  if (isLoading) return <RefereeLayout title="Race Detail" eyebrow="Assigned race" description=""><LoadingSkeleton ariaLabel="Loading race detail" variant="detail" /></RefereeLayout>;
  if (error) return <RefereeLayout title="Race Detail" eyebrow="Assigned race" description=""><section className="admin-live-state admin-live-state--warning" role="alert">{error} <button type="button" className="admin-header__button admin-header__button--ghost" onClick={reload}>Retry</button></section></RefereeLayout>;
  if (!race) return <RefereeLayout title="Race Not Found" eyebrow="Assigned race" description=""><section className="admin-panel"><p>This race is not assigned to the current referee or no longer exists.</p><Link to="/referee/races">Back to races</Link></section></RefereeLayout>;

  const preChecks = race.checks.filter((check) => check.phase === RACE_PHASES.PRE_RACE);
  const postChecks = race.checks.filter((check) => check.phase === RACE_PHASES.POST_RACE);
  const participantsUnavailable = Boolean(isUnavailable || race.participantsUnavailable);
  const links = [
    { phase: RACE_PHASES.PRE_RACE, title: "Pre-race inspections", text: "Horse identity, health, equipment, and eligibility.", to: `/referee/races/${raceId}/horse-inspection?phase=pre_race`, count: `${preChecks.length}/${race.participants.length}` },
    { phase: RACE_PHASES.DURING_RACE, title: "Race monitoring", text: "Record incidents against official race time markers.", to: `/referee/races/${raceId}/monitor`, count: `${race.checks.filter((check) => check.phase === RACE_PHASES.DURING_RACE).length} incidents` },
    { phase: RACE_PHASES.POST_RACE, title: "Post-race checks", text: "Record recovery, injury, and veterinary follow-up.", to: `/referee/races/${raceId}/horse-inspection?phase=post_race`, count: `${postChecks.length}/${race.participants.length}` },
  ];

  return <RefereeLayout title={race.name} eyebrow={race.tournament} description={`${race.track} | ${race.date} at ${race.startTime} | ${formatStatus(race.status)}`} actions={<Link className="admin-header__button admin-header__button--ghost" to="/referee/races">My Races</Link>}>
    {participantsUnavailable && <section className="admin-live-state">Participant data is unavailable. Participant-dependent actions remain disabled.</section>}
    <RaceLifecycleControls race={race} participantsUnavailable={participantsUnavailable} reload={reload} />
    <section className="admin-metrics admin-metrics--module"><article className="admin-metric-card"><p className="admin-metric-card__label">Current phase</p><div className="admin-metric-card__value" style={{ fontSize: "1.35rem" }}>{race.phase ? formatStatus(race.phase) : "Read only"}</div></article><article className="admin-metric-card"><p className="admin-metric-card__label">Participants</p><div className="admin-metric-card__value">{race.participants.length}</div></article><article className="admin-metric-card"><p className="admin-metric-card__label">Violations</p><div className="admin-metric-card__value">{race.violations.length}</div></article></section>
    <section className="admin-panel"><div className="admin-panel__header"><p className="admin-panel__eyebrow">Race lifecycle</p><h2>Operational phases</h2></div><div className="referee-action-grid">{links.map((item) => { const editable = race.phase === item.phase; const previous = race.phase && phaseOrder.indexOf(item.phase) < phaseOrder.indexOf(race.phase); return <Link key={item.phase} to={item.to} className="referee-action-card" aria-label={`${item.title}, ${editable ? "editable" : "read only"}`}><div><strong>{item.title}</strong><p>{item.text}</p><span className={`referee-insp-badge ${editable ? "referee-insp-badge--done" : "referee-insp-badge--pending"}`}>{item.count} | {editable ? "Editable" : previous ? "Read only" : "Not active"}</span></div></Link>; })}</div></section>
    <section className="admin-panel"><div className="admin-panel__header"><p className="admin-panel__eyebrow">Handoff</p><h2>Results, violations, and report</h2></div><div className="referee-action-grid"><Link className="referee-action-card" to={`/referee/races/${raceId}/closure`}><div><strong>Race closure</strong><p>Finalize results, review penalties, and submit the official report in one workspace.</p></div></Link><Link className="referee-action-card" to={`/referee/races/${raceId}/violations`}><div><strong>Violations</strong><p>Review and update incident decisions and penalties.</p></div></Link><Link className="referee-action-card" to={`/referee/races/${raceId}/jockey-inspection`}><div><strong>Jockey eligibility</strong><p>Read assignment context. Dedicated persistence is unavailable.</p></div></Link></div></section>
    <section className="admin-panel"><div className="admin-panel__header"><p className="admin-panel__eyebrow">Participants</p><h2>Approved race registrations</h2></div>{race.participants.length === 0 ? <p>No approved participants are available for this race.</p> : <div className="admin-data-table__wrap"><table className="admin-data-table"><thead><tr><th>Draw</th><th>Horse</th><th>Owner</th><th>Jockey</th><th>Assignment</th><th>Pre-race</th></tr></thead><tbody>{race.participants.map((participant) => { const check = preChecks.find((item) => item.horseId === participant.horseId); return <tr key={participant.horseId}><td>{participant.lane ?? "Not assigned"}</td><td><strong>{participant.horseName}</strong></td><td>{participant.owner}</td><td>{participant.jockeyName}</td><td>{formatStatus(participant.assignmentStatus)}</td><td>{check ? formatStatus(check.status) : "Pending"}</td></tr>; })}</tbody></table></div>}</section>
  </RefereeLayout>;
}

export default RefereeRaceDetail;
