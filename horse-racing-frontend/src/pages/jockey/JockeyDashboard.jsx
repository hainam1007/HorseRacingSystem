import { Link } from "react-router-dom";
import LoadingSkeleton from "../../components/LoadingSkeleton.jsx";
import {
  Award,
  BadgeCheck,
  CalendarDays,
  CheckCircle2,
  Clock3,
  ClipboardCheck,
  Flag,
  MapPin,
  Send,
  Trophy,
  UserRound,
} from "lucide-react";
import {
  celebrationImages,
  horseJockeyImages,
  jockeyActionImages,
} from "./jockeyData";
import { useJockeyApiData } from "./useJockeyApiData";

const statusClass = (status) => {
  if (["Accepted", "Confirmed", "Published", "Available"].includes(status)) {
    return "jockey-badge--green";
  }
  if (["Rejected", "Expired", "Cancelled", "Replaced", "Unavailable", "Contract rejected"].includes(status)) {
    return "jockey-badge--muted";
  }
  return "jockey-badge--amber";
};

const isOpenInvitation = (status) =>
  !["Accepted", "Confirmed", "Published", "Rejected", "Expired", "Cancelled"].includes(status);

const splitRaceTime = (value = "") => {
  const [date = "Race day", time = "TBA"] = String(value).split(", ");
  return { date, time };
};

function JockeyDashboard() {
  const { assignments, error, invitations, isLoading, profile, results, schedule } = useJockeyApiData();
  const pendingInvitations = invitations.filter((item) => isOpenInvitation(item.status));
  const confirmedRaces = schedule.filter((race) => ["Accepted", "Confirmed"].includes(race.status));
  const nextRace = schedule[0] || null;
  const latestResult = results[0] || null;
  const primaryAssignment = assignments[0] || null;
  const nextRaceTime = splitRaceTime(nextRace?.time);

  if (isLoading) {
    return <div className="jockey-dashboard"><LoadingSkeleton ariaLabel="Loading jockey dashboard" variant="page" /></div>;
  }

  return (
    <div className="jockey-dashboard">
      {error && (
        <div className={`jockey-sync-note ${error ? "jockey-sync-note--warning" : ""}`}>
          {error}
        </div>
      )}
      <section className="jockey-hero jockey-dashboard-hero">
        <img src={jockeyActionImages[1]} alt="Jockey accelerating on a race track" />
        <div className="jockey-hero__copy">
          <span className={`jockey-badge ${statusClass(profile.status)}`}><BadgeCheck size={14} /> {profile.status}</span>
          <p className="jockey-kicker">Jockey command desk</p>
          <h1>Race-day cockpit for {profile.name}.</h1>
          <p>Review owner invitations, lock the next horse pairing, and scan confirmed race work without leaving the athlete workspace.</p>
          <div className="jockey-hero__actions">
            <Link className="jockey-button jockey-button--primary" to="/jockey/invitations"><Send size={18} /> Review Invitations</Link>
            <Link className="jockey-button" to="/jockey/schedule"><CalendarDays size={17} /> View Schedule</Link>
          </div>
        </div>
        <aside className="jockey-hero__panel jockey-command-panel">
          <div className="jockey-command-panel__header">
            <span className="jockey-kicker">Next call-up</span>
            {nextRace && <span className={`jockey-badge ${statusClass(nextRace.status)}`}>{nextRace.status}</span>}
          </div>
          {nextRace ? (
            <>
              <div className="jockey-next-race__body">
                <div className="jockey-date-block">
                  <span>{nextRaceTime.date}</span>
                  <strong>{nextRaceTime.time}</strong>
                </div>
                <div>
                  <strong>{nextRace.race}</strong>
                  <span>{nextRace.horse}</span>
                  <small><MapPin size={13} /> {nextRace.venue}</small>
                </div>
              </div>
              <div className="jockey-command-panel__meta">
                <div><span>Tournament</span><strong>{nextRace.tournament}</strong></div>
                <div><span>Round</span><strong>{nextRace.round}</strong></div>
              </div>
            </>
          ) : (
            <div className="jockey-empty-panel">
              <strong>No race assigned</strong>
              <span>New owner invitations will appear here after approval.</span>
            </div>
          )}
        </aside>
      </section>

      <section className="jockey-stats" aria-label="Jockey dashboard summary">
        {[
          { label: "Pending invites", value: pendingInvitations.length, note: "Need response", icon: Send },
          { label: "Confirmed races", value: confirmedRaces.length, note: "Locked race slots", icon: CalendarDays },
          { label: "Win rate", value: profile.winRate, note: "Season form", icon: Trophy },
          { label: "Podium rate", value: profile.podiumRate, note: "Top-three finishes", icon: Award },
        ].map((item) => {
          const Icon = item.icon;
          return (
            <article className="jockey-stat-card" key={item.label}>
              <Icon size={18} />
              <span>{item.label}</span>
              <strong>{item.value}</strong>
              <small>{item.note}</small>
            </article>
          );
        })}
      </section>

      <section className="jockey-cockpit-grid" aria-label="Jockey race-day cockpit">
        <article className="jockey-card jockey-invite-card">
          <div className="jockey-card__header">
            <div>
              <span className="jockey-kicker">Invitation queue</span>
              <h2>Owner decisions waiting</h2>
            </div>
            <Send size={20} />
          </div>
          <div className="jockey-invite-list">
            {pendingInvitations.length ? pendingInvitations.slice(0, 3).map((invite) => (
              <div className="jockey-invite-item" key={invite.id}>
                <div>
                  <span>{invite.id}</span>
                  <strong>{invite.horse}</strong>
                  <small>{invite.race} / {invite.owner}</small>
                </div>
                <Link className="jockey-badge jockey-badge--amber" to="/jockey/invitations">Review</Link>
              </div>
            )) : (
              <div className="jockey-empty-panel">
                <strong>No pending invitation</strong>
                <span>You are clear for the moment. Confirmed rides stay visible in schedule.</span>
              </div>
            )}
          </div>
          <Link className="jockey-inline-link" to="/jockey/invitations">
            Open invitation board <ClipboardCheck size={15} />
          </Link>
        </article>

        <article className="jockey-visual-card jockey-pairing-spotlight">
          <img src={horseJockeyImages[0]} alt="Horse and jockey pairing before a race" />
          <div>
            <span className="jockey-kicker">Current pairing</span>
            {primaryAssignment ? (
              <>
                <h2>{primaryAssignment.horse}</h2>
                <p>{primaryAssignment.note}</p>
                <span className={`jockey-badge ${statusClass(primaryAssignment.status)}`}>{primaryAssignment.status}</span>
              </>
            ) : (
              <>
                <h2>No horse locked</h2>
                <p>Owner-approved invitations will create your next pairing.</p>
              </>
            )}
          </div>
        </article>

        <article className="jockey-card jockey-result-card">
          <div className="jockey-card__header">
            <div>
              <span className="jockey-kicker">Latest result</span>
              <h2>{latestResult ? latestResult.race : "No published result"}</h2>
            </div>
            <Trophy size={20} />
          </div>
          <img src={celebrationImages[0]} alt="Jockey celebration after race result" />
          <div className="jockey-result-card__stats">
            <div><span>Finish</span><strong>{latestResult ? `#${latestResult.position}` : "-"}</strong></div>
            <div><span>Time</span><strong>{latestResult?.time || "-"}</strong></div>
            <div><span>Prize</span><strong>{latestResult?.prize || "-"}</strong></div>
          </div>
        </article>
      </section>

      <section className="jockey-dashboard-lower">
        <article className="jockey-card">
          <div className="jockey-card__header">
            <div>
              <span className="jockey-kicker">Assignments</span>
              <h2>Horse pairings</h2>
            </div>
            <UserRound size={20} />
          </div>
          <div className="jockey-assignment-list">
            {assignments.length ? assignments.slice(0, 4).map((assignment) => (
              <div className="jockey-assignment-item" key={assignment.id}>
                <span className={`jockey-badge ${statusClass(assignment.status)}`}>{assignment.status}</span>
                <div>
                  <strong>{assignment.horse}</strong>
                  <small>{assignment.race} / {assignment.owner}</small>
                </div>
              </div>
            )) : (
              <div className="jockey-empty-panel">
                <strong>No active pairing</strong>
                <span>Accepted invitations will create assignment records.</span>
              </div>
            )}
          </div>
        </article>

        <article className="jockey-card jockey-readiness-card">
          <div className="jockey-card__header">
            <div>
              <span className="jockey-kicker">Athlete file</span>
              <h2>License and form</h2>
            </div>
            <BadgeCheck size={20} />
          </div>
          <div className="jockey-command-panel__meta">
            <div><span>License</span><strong>{profile.license}</strong></div>
            <div><span>Weight class</span><strong>{profile.weightClass}</strong></div>
            <div><span>Stable</span><strong>{profile.stableConnection}</strong></div>
            <div><span>Earnings</span><strong>{profile.earnings}</strong></div>
          </div>
          <Link className="jockey-inline-link" to="/jockey/profile">
            View profile <CheckCircle2 size={15} />
          </Link>
        </article>
      </section>

      <section className="jockey-race-strip" aria-label="Upcoming race strip">
        {schedule.length ? schedule.map((race) => (
          <article className="jockey-race-strip__item" key={race.id}>
            <div><Clock3 size={16} /><span>{race.time}</span></div>
            <strong>{race.race}</strong>
            <small><Flag size={13} /> {race.horse}</small>
            <span className={`jockey-badge ${statusClass(race.status)}`}>{race.status}</span>
          </article>
        )) : (
          <article className="jockey-race-strip__item">
            <div><Clock3 size={16} /><span>Schedule clear</span></div>
            <strong>No upcoming race</strong>
            <small><Flag size={13} /> Awaiting owner invitation</small>
            <span className="jockey-badge jockey-badge--muted">Idle</span>
          </article>
        )}
      </section>
    </div>
  );
}

export default JockeyDashboard;
