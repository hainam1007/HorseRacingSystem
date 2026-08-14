import { useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import {
  Activity,
  ArrowRight,
  CalendarDays,
  CircleDollarSign,
  ClipboardCheck,
  Clock,
  MapPin,
  Plus,
  ShieldCheck,
  UsersRound,
} from "lucide-react";
import LoadingSkeleton from "../../components/LoadingSkeleton.jsx";
import { findAcceptedPrimaryAssignment, findPrimaryAssignmentForRegistration, toOwnerScheduleEntry } from "./ownerAdapters";
import { useOwnerHorses, useOwnerJockeyAssignments, useOwnerJockeys, useOwnerPrizeAwards, useOwnerProfile, useOwnerRegistrations } from "./useOwnerData";

const quickActions = [
  { label: "Add Horse", meta: "Create a new horse profile", to: "/owner/horses/new", icon: Plus },
  { label: "Register Tournament", meta: "Submit horse entries", to: "/owner/registrations", icon: ClipboardCheck },
  { label: "Assign Jockey", meta: "Invite or confirm riders", to: "/owner/jockeys", icon: UsersRound },
];

const dashboardImages = {
  stable: "https://i.pinimg.com/1200x/a9/46/9e/a9469ee3363098f154678502a9eeef9b.jpg",
  track: "https://i.pinimg.com/1200x/3d/ff/a1/3dffa140ed55cb85b21a9e021e4cb2c8.jpg",
  trophy: "https://i.pinimg.com/1200x/30/d4/ec/30d4ec1fb8d7efed15adf856c338efe6.jpg",
};

const horseImages = [
  "https://i.pinimg.com/736x/16/b4/e0/16b4e0814c679b1a64548914e499497d.jpg",
  "https://i.pinimg.com/736x/28/b6/ab/28b6ab0f95a9f5945b17ba17a3800ae8.jpg",
  "https://i.pinimg.com/736x/94/98/ab/9498ab5a8136f433c8d716fec64a7556.jpg",
  "https://i.pinimg.com/1200x/0b/9c/f0/0b9cf065f5a0823c9870113e206bfbd6.jpg",
];

const isMongoObjectId = (value) => /^[a-f\d]{24}$/i.test(String(value || ""));
const isUuidLike = (value) => /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(String(value || ""));

const compactRecordCode = (prefix, value) => {
  if (!value) return prefix;
  if (isMongoObjectId(value)) return `${prefix}-${String(value).slice(-6).toUpperCase()}`;
  if (isUuidLike(value)) return `${prefix}-${String(value).slice(-6).toUpperCase()}`;
  return value;
};

const formatMoney = (value, currency = "VND") => new Intl.NumberFormat("en-US", {
  style: "currency",
  currency,
  maximumFractionDigits: currency === "VND" ? 0 : 2,
}).format(Number(value || 0));

function OwnerDashboard() {
  const dashboardRef = useRef(null);
  const {
    horses: liveHorses,
    isLoading: horsesLoading,
    error: horsesError,
  } = useOwnerHorses();
  const {
    jockeys: liveJockeys,
    isLoading: jockeysLoading,
    error: jockeysError,
  } = useOwnerJockeys();
  const {
    profile: liveProfile,
    isLoading: profileLoading,
    error: profileError,
  } = useOwnerProfile();
  const {
    registrations: liveRegistrations,
    isLoading: registrationsLoading,
    error: registrationsError,
  } = useOwnerRegistrations();
  const {
    assignments: liveAssignments,
    isLoading: assignmentsLoading,
    error: assignmentsError,
  } = useOwnerJockeyAssignments();
  const {
    awards: liveAwards,
    isLoading: awardsLoading,
    error: awardsError,
  } = useOwnerPrizeAwards();

  const horses = liveHorses;
  const jockeys = liveJockeys;
  const profile = liveProfile;
  const registrations = liveRegistrations;
  const schedule = registrations.map((registration) => toOwnerScheduleEntry(
    registration,
    findPrimaryAssignmentForRegistration(liveAssignments, registration)
      ?? findAcceptedPrimaryAssignment(liveAssignments, registration)
  ));
  const nextRace = schedule.find((race) => race.date !== "Date unavailable");
  const isLoading = horsesLoading || jockeysLoading || profileLoading || registrationsLoading || assignmentsLoading || awardsLoading;
  const liveError = horsesError || jockeysError || profileError || registrationsError || assignmentsError || awardsError;
  const raceReadyCount = horses.filter((horse) => horse.status === "Ready").length;
  const pendingRegistrationCount = registrations.filter((item) => item.status !== "Approved").length;
  const ownerEarnings = liveAwards.reduce((total, award) => total + Number(award.ownerAmount || 0), 0);
  const ownerEarningsCurrency = liveAwards[0]?.currency || "VND";
  const ownerStats = [
    {
      label: "Active Horses",
      value: String(horses.length).padStart(2, "0"),
      note: `${raceReadyCount} race-ready this season`,
      icon: Activity,
    },
    {
      label: "Pending Registrations",
      value: String(pendingRegistrationCount).padStart(2, "0"),
      note: "Awaiting admin review",
      icon: ClipboardCheck,
    },
    {
      label: "Available Jockeys",
      value: String(jockeys.length).padStart(2, "0"),
      note: "Active profiles open for invitation",
      icon: UsersRound,
    },
    {
      label: "Season Earnings",
      value: formatMoney(ownerEarnings, ownerEarningsCurrency),
      note: `${liveAwards.length} prize award${liveAwards.length === 1 ? "" : "s"}`,
      icon: CircleDollarSign,
    },
  ];

  useEffect(() => {
    if (isLoading) return undefined;

    const root = dashboardRef.current;
    if (!root) return undefined;

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const revealItems = Array.from(root.querySelectorAll(".owner-reveal"));

    if (reduceMotion || !("IntersectionObserver" in window)) {
      revealItems.forEach((item) => item.classList.add("is-visible"));
      return undefined;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.16, rootMargin: "0px 0px -60px 0px" },
    );

    revealItems.forEach((item) => observer.observe(item));
    return () => observer.disconnect();
  }, [isLoading]);

  if (isLoading) {
    return (
      <div className="owner-dashboard" ref={dashboardRef}>
        <LoadingSkeleton ariaLabel="Loading owner dashboard" rows={5} />
      </div>
    );
  }

  return (
    <div className="owner-dashboard" ref={dashboardRef}>
      {liveError && (
        <section className="admin-live-state admin-live-state--warning" aria-live="polite">
          {liveError}
        </section>
      )}

      <section className="owner-hero owner-dashboard-hero owner-reveal">
        <div className="owner-hero__content">
          <p className="owner-eyebrow">Horse Owner Command Center</p>
          <h1>Manage your stable, entries, and race readiness.</h1>
          <p>
            Track horse profiles, tournament registrations, jockey assignments, schedules, and prize outcomes from one focused owner dashboard.
          </p>
          <div className="owner-hero__actions">
            <Link className="owner-button owner-button--primary" to="/owner/horses/new">
              <Plus size={18} />
              Add Horse
            </Link>
            <Link className="owner-button" to="/owner/registrations">
              Open Registrations
              <ArrowRight size={18} />
            </Link>
          </div>
        </div>

        <aside className="owner-hero-media" aria-label="Stable command visuals">
          <img src={dashboardImages.stable} alt="Premium stable interior for horse care" />
          <div className="owner-hero-media__overlay">
            <span className="owner-badge owner-badge--green"><ShieldCheck size={14} /> Verified Owner</span>
            <strong>{profile?.stable || "Stable unavailable"}</strong>
            <p>{horses.length} horses registered, {jockeys.length} riders available.</p>
          </div>
        </aside>
      </section>

      <section className="owner-stable-showcase owner-reveal" aria-label="Active stable horses">
        <div className="owner-stable-showcase__header">
          <div>
            <p className="owner-eyebrow">Stable Spotlight</p>
            <h2>Four horses to watch this race window.</h2>
          </div>
          <Link className="owner-badge" to="/owner/horses">
            View stable
            <ArrowRight size={14} />
          </Link>
        </div>

        <div className="owner-visual-strip">
          {horses.slice(0, 4).map((horse, index) => {
            const horseDetailPath = isMongoObjectId(horse.id) ? `/owner/horses/${horse.id}` : "/owner/horses";

            return (
              <Link className="owner-visual-horse" to={horseDetailPath} key={horse.id || horse.name}>
                <img src={horse.imageUrl || horseImages[index % horseImages.length]} alt={`${horse.name} profile`} />
                <div className="owner-visual-horse__content">
                  <strong>{horse.name}</strong>
                  <small>{horse.breed} / {horse.nextRace || "No race assigned"}</small>
                </div>
                <div className="owner-visual-horse__reveal">
                  <span>{horse.record || "No race record"}</span>
                  <span>Jockey: {horse.jockey || "Unassigned"}</span>
                  <b>Open profile <ArrowRight size={15} /></b>
                </div>
              </Link>
            );
          })}
          {horses.length === 0 && (
            <div className="owner-empty" role="status">No horse profiles are available.</div>
          )}
        </div>
      </section>

      <section className="owner-layout owner-reveal">
        <aside className="owner-hero__panel owner-season-panel">
          <div className="owner-hero__panel-header">
            <span className="owner-badge owner-badge--green"><ShieldCheck size={14} /> Verified Owner</span>
            <span className="owner-meta">{profile?.season || "Unavailable"}</span>
          </div>
          <strong>{profile?.stable || "Stable unavailable"}</strong>
          <p>{horses.length} horses registered, {jockeys.length} jockey profiles available, and {pendingRegistrationCount} tournament entries under review.</p>
          <div className="owner-hero__panel-grid">
            <div><span>Next Race</span><b>{nextRace?.date || "Unavailable"}</b></div>
            <div><span>Win Rate</span><b>{profile?.winRate || "Unavailable"}</b></div>
          </div>
        </aside>

        <article className="owner-image-card">
          <img src={dashboardImages.track} alt="Race track before an upcoming horse race" />
          <div>
            <span className="owner-eyebrow">Track window</span>
            <h2>{schedule.length ? `${schedule.length} registered race slots are on your schedule.` : "No registered race slots are available."}</h2>
            <Link className="owner-badge" to="/owner/schedule">Review schedule</Link>
          </div>
        </article>
      </section>

      <section className="owner-stats owner-reveal" aria-label="Owner dashboard summary">
        {ownerStats.map((item) => {
          const Icon = item.icon;
          return (
            <article className="owner-stat-card" key={item.label}>
              <div className="owner-stat-card__icon"><Icon size={20} /></div>
              <span>{item.label}</span>
              <strong>{item.value}</strong>
              <small>{item.note}</small>
            </article>
          );
        })}
      </section>

      <section className="owner-layout owner-schedule-band owner-reveal">
        <article className="owner-card owner-card--wide">
          <div className="owner-card__header">
            <div>
              <p className="owner-eyebrow">Race Calendar</p>
              <h2>Upcoming Schedule</h2>
            </div>
            <Link className="owner-badge" to="/owner/schedule">View all</Link>
          </div>

          <div className="owner-timeline">
            {schedule.slice(0, 3).map((race) => (
              <div className="owner-timeline__item" key={race.id}>
                <div className="owner-timeline__time">
                  <CalendarDays size={16} />
                  <span>{race.time}</span>
                </div>
                <div>
                  <h3>{race.race}</h3>
                  <div className="owner-race-meta">
                    <span>{race.horse}</span>
                    <span>{race.jockey}</span>
                    <small><MapPin size={13} /> {race.venue}</small>
                  </div>
                </div>
                <span className={`owner-badge ${race.status === "Confirmed" ? "owner-badge--green" : "owner-badge--amber"}`}>
                  {race.status}
                </span>
              </div>
            ))}
            {schedule.length === 0 && (
              <div className="owner-empty owner-empty--compact" role="status">
                Approved and pending race registrations will appear here.
              </div>
            )}
          </div>
        </article>
      </section>

      <section className="owner-layout owner-layout--lower owner-reveal">
        <article className="owner-card">
          <div className="owner-card__header">
            <div>
              <p className="owner-eyebrow">Approval Flow</p>
              <h2>Registration Queue</h2>
            </div>
            <ClipboardCheck size={20} />
          </div>

          <div className="owner-registration-list">
            {registrations.slice(0, 3).map((item) => (
              <div className="owner-registration" key={item.id}>
                <span>{compactRecordCode("REG", item.id)}</span>
                <div className="owner-registration__body">
                  <strong>{item.horse}</strong>
                  <small>{item.tournament}</small>
                </div>
                <span className={`owner-badge ${item.status === "Approved" ? "owner-badge--green" : "owner-badge--amber"}`}>
                  {item.status}
                </span>
              </div>
            ))}
            {registrations.length === 0 && (
              <div className="owner-empty owner-empty--compact" role="status">
                No registrations have been submitted yet.
              </div>
            )}
          </div>
        </article>

        <article className="owner-card">
          <div className="owner-card__header">
            <div>
              <p className="owner-eyebrow">Quick Actions</p>
              <h2>Next Steps</h2>
            </div>
            <Clock size={20} />
          </div>

          <div className="owner-action-grid">
            {quickActions.map((action) => {
              const Icon = action.icon;
              return (
                <Link className="owner-action" to={action.to} key={action.label}>
                  <span><Icon size={18} /></span>
                  <strong>{action.label}</strong>
                  <small>{action.meta}</small>
                </Link>
              );
            })}
          </div>
        </article>

      </section>
    </div>
  );
}

export default OwnerDashboard;
