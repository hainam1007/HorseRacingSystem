import { Link, useParams } from "react-router-dom";
import LoadingSkeleton from "../components/LoadingSkeleton";
import RefereeLayout from "./RefereeLayout";
import { formatStatus } from "./refereeConstants";
import { useRefereeData } from "./useRefereeData";

function JockeyInspection() {
  const { raceId } = useParams();
  const { getRace, isLoading, error } = useRefereeData();
  const race = getRace(raceId);
  if (isLoading) return <RefereeLayout title="Jockey Eligibility" eyebrow="Read only" description=""><LoadingSkeleton ariaLabel="Loading jockey assignments" variant="table" /></RefereeLayout>;
  if (error || !race) return <RefereeLayout title="Jockey Eligibility" eyebrow="Read only" description=""><section className="admin-live-state admin-live-state--warning">{error || "Race not found."}</section></RefereeLayout>;
  return <RefereeLayout title="Jockey Eligibility" eyebrow={`Assignment context | ${race.name}`} description="Review the assigned jockey information for this race. This information is read only." actions={<Link className="admin-header__button admin-header__button--ghost" to={`/referee/races/${raceId}`}>Race Detail</Link>}><section className="admin-live-state">Jockey inspection decisions are not available in the current workflow.</section><section className="admin-panel"><div className="admin-data-table__wrap"><table className="admin-data-table"><thead><tr><th>Horse</th><th>Jockey</th><th>License</th><th>Assignment status</th></tr></thead><tbody>{race.participants.map((participant) => <tr key={participant.horseId}><td>{participant.horseName}</td><td>{participant.jockeyName}</td><td>{participant.jockeyLicense}</td><td>{formatStatus(participant.assignmentStatus)}</td></tr>)}</tbody></table></div></section></RefereeLayout>;
}

export default JockeyInspection;
