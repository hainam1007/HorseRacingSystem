import { useMemo, useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  CircleDollarSign,
  Clock3,
  Flag,
  MapPin,
  Radio,
  Shield,
  Trophy,
  Users,
} from "lucide-react";
import LoadingSkeleton from "../../components/LoadingSkeleton.jsx";
import { useSpectatorTournamentDetail } from "./useSpectatorData.js";
import { getTournamentFallbackImage } from "./spectatorAdapters.js";
import {
  BETTING_STATUS,
  RACE_STATUS,
  bettingStatusMeta,
  canBetOnRace,
  getRaceSortWeight,
  raceStatusMeta,
} from "./race/raceStatus.js";
import "./spectator.css";

// ─── Constants ────────────────────────────────────────────────────────────────
const FILTERS = [
  { id: "all", label: "All races" },
  { id: "betting", label: "Prediction open" },
  { id: "live", label: "Live" },
  { id: "completed", label: "Completed" },
];

const TOURNAMENT_STATUS_CLASS = {
  Active: "spectator-badge--green",
  Upcoming: "spectator-badge--amber",
  Completed: "",
};

function handleTournamentImageError(event, tournamentId) {
  if (event.currentTarget.dataset.fallbackApplied === "true") return;
  event.currentTarget.dataset.fallbackApplied = "true";
  event.currentTarget.src = getTournamentFallbackImage(tournamentId);
}

function raceMatchesFilter(race, filter) {
  if (filter === "betting") return isRaceBettable(race);
  if (filter === "live") return race.raceStatus === RACE_STATUS.RUNNING;
  if (filter === "completed") return race.raceStatus === RACE_STATUS.COMPLETED;
  return true;
}

function isRaceBettable(race) {
  return (
    canBetOnRace(race) &&
    race?.raceStatus !== RACE_STATUS.COMPLETED &&
    race?.resultStatus !== "published" &&
    race?.bettingStatus !== BETTING_STATUS.SETTLED
  );
}

// ─── Status Badge ─────────────────────────────────────────────────────────────
function RaceStatusBadge({ status, type }) {
  const meta =
    type === "betting"
      ? bettingStatusMeta[status] || bettingStatusMeta[BETTING_STATUS.UNAVAILABLE]
      : raceStatusMeta[status] || raceStatusMeta[RACE_STATUS.UNKNOWN];

  if (type === "betting" && status === BETTING_STATUS.UNAVAILABLE) return null;
  if (type !== "betting" && status === RACE_STATUS.UNKNOWN) return null;

  return (
    <span className={`race-hub-status race-hub-status--${meta.tone}`}>{meta.label}</span>
  );
}

// ─── Race Row ─────────────────────────────────────────────────────────────────
function RaceRow({ race, tournament }) {
  const canBet = isRaceBettable(race);
  const detailPath = `/spectator/tournaments/${tournament.id}/races/${race.id}`;
  const bettingPath = `/spectator/predictions/races/${encodeURIComponent(race.id)}`;

  const isLive = race.raceStatus === RACE_STATUS.RUNNING;
  const isCompleted = race.raceStatus === RACE_STATUS.COMPLETED;

  return (
    <article className={`rhrow rhrow--${race.raceStatus}${isLive ? " rhrow--live" : ""}${canBet ? " rhrow--betting-open" : ""}`}>
      {/* Time block */}
      <div className="rhrow__time">
        {race.time && <span>{race.time}</span>}
        {race.raceDateDisplay && <small>{race.raceDateDisplay}</small>}
        {race.roundName && <span className="rhrow__round-tag">{race.roundName}</span>}
      </div>

      {/* Identity */}
      <div className="rhrow__identity">
        <div className="rhrow__status-row">
          <RaceStatusBadge status={race.raceStatus} type="race" />
          <RaceStatusBadge status={race.bettingStatus} type="betting" />
        </div>
        <h3 className="rhrow__name">{race.name}</h3>
        <div className="rhrow__facts">
          {race.distance && (
            <span>
              <Flag size={12} /> {race.distance}
            </span>
          )}
          {(race.location || tournament.location) && (
            <span>
              <MapPin size={12} /> {race.location || tournament.location}
            </span>
          )}
          {race.maxParticipants != null && (
            <span>
              <Users size={12} /> {race.runnerCount != null ? `${race.runnerCount}/` : ""}{race.maxParticipants} runners
            </span>
          )}
          {race.refereeName && (
            <span className="rhrow__referee">
              <Shield size={12} /> {race.refereeName}
            </span>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="rhrow__actions">
        <Link className="race-hub-action race-hub-action--secondary" to={detailPath}>
          {isLive ? "Watch" : isCompleted ? "Results" : "Details"}
          <ArrowRight size={14} />
        </Link>
        {canBet && (
          <Link className="race-hub-action race-hub-action--primary" to={bettingPath}>
            Predict <CircleDollarSign size={14} />
          </Link>
        )}
      </div>
    </article>
  );
}

// ─── Round Group ──────────────────────────────────────────────────────────────
function RoundGroup({ roundName, roundOrder, races, tournament }) {
  return (
    <div className="rh-round-group">
      <div className="rh-round-group__header">
        <span className="rh-round-group__num">Round {roundOrder ?? ""}</span>
        <h3 className="rh-round-group__name">{roundName}</h3>
        <span className="rh-round-group__count">{races.length} race{races.length !== 1 ? "s" : ""}</span>
      </div>
      <div className="rh-round-group__races">
        {races.map((race) => (
          <RaceRow key={race.id || race.name} race={race} tournament={tournament} />
        ))}
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
function TournamentDetail() {
  const { tournamentId } = useParams();
  const { error, isLoading, races, tournament } = useSpectatorTournamentDetail(tournamentId);
  const [activeFilter, setActiveFilter] = useState("all");

  const displayedRaces = useMemo(() => {
    return races.filter(
      (r) =>
        r.raceStatus !== RACE_STATUS.CANCELLED &&
        r.raceStatus !== RACE_STATUS.POSTPONED
    );
  }, [races]);

  const sortedRaces = useMemo(
    () =>
      [...displayedRaces].sort((a, b) => {
        const weight = getRaceSortWeight(a) - getRaceSortWeight(b);
        if (weight !== 0) return weight;
        // within same weight, sort by round_order then race_date
        if ((a.roundOrder ?? 99) !== (b.roundOrder ?? 99))
          return (a.roundOrder ?? 99) - (b.roundOrder ?? 99);
        return new Date(a.raceDate || 0).getTime() - new Date(b.raceDate || 0).getTime();
      }),
    [displayedRaces]
  );

  const counts = useMemo(
    () => ({
      all: displayedRaces.length,
      betting: displayedRaces.filter(isRaceBettable).length,
      live: displayedRaces.filter((r) => r.raceStatus === RACE_STATUS.RUNNING).length,
      completed: displayedRaces.filter((r) => r.raceStatus === RACE_STATUS.COMPLETED).length,
    }),
    [displayedRaces]
  );

  const visibleRaces = sortedRaces.filter((r) => raceMatchesFilter(r, activeFilter));

  // Group by round when showing all
  const roundGroups = useMemo(() => {
    if (activeFilter !== "all") return null;
    const groups = new Map();
    visibleRaces.forEach((race) => {
      const key = race.roundId || race.roundName || "ungrouped";
      if (!groups.has(key)) {
        groups.set(key, {
          roundName: race.roundName || "Race Day",
          roundOrder: race.roundOrder,
          races: [],
        });
      }
      groups.get(key).races.push(race);
    });
    return Array.from(groups.values()).sort(
      (a, b) => (a.roundOrder ?? 99) - (b.roundOrder ?? 99)
    );
  }, [visibleRaces, activeFilter]);

  const headerFacts = [
    tournament?.location ? { icon: MapPin, term: "Venue", value: tournament.location } : null,
    tournament?.date
      ? {
          icon: CalendarDays,
          term: "Race days",
          value: tournament.endDate
            ? `${tournament.dateDisplay} - ${tournament.endDateDisplay}`
            : tournament.dateDisplay || tournament.date,
        }
      : null,
    tournament?.track ? { icon: Flag, term: "Surface", value: tournament.track } : null,
    tournament?.prize ? { icon: Trophy, term: "Total race prizes", value: tournament.prize } : null,
  ].filter(Boolean);

  if (isLoading) {
    return (
      <section className="spectator-page tournament-detail-page">
        <LoadingSkeleton ariaLabel="Loading tournament race hub" rows={5} variant="detail" />
        <LoadingSkeleton ariaLabel="Loading tournament races" rows={5} variant="list" />
      </section>
    );
  }

  if (!tournament) return <Navigate to="/spectator/tournaments" replace />;

  return (
    <section className="spectator-page tournament-detail-page rh-page">
      <Link className="tournament-detail-back" to="/spectator/tournaments">
        <ArrowLeft size={16} /> Back to tournaments
      </Link>

      {error && (
        <div className="admin-live-state admin-live-state--warning" aria-live="polite">
          {error} No sample schedule substituted.
        </div>
      )}

      {/* ── Hero ── */}
      <header className="rh-hero">
        <div className="rh-hero__image-wrap">
          <img
            src={tournament.image}
            alt={`Race horses at ${tournament.name}`}
            onError={(event) => handleTournamentImageError(event, tournament.id)}
          />
          <div className="rh-hero__image-overlay" />
        </div>
        <div className="rh-hero__content">
          <div className="rh-hero__topline">
            <span
              className={`spectator-badge ${TOURNAMENT_STATUS_CLASS[tournament.status] || ""}`}
            >
              {tournament.status}
            </span>
            {displayedRaces.length > 0 && (
              <span className="rh-hero__race-count">{displayedRaces.length} races scheduled</span>
            )}
          </div>
          <p className="spectator-eyebrow">Tournament Race Hub</p>
          <h1 className="rh-hero__title">{tournament.name}</h1>
          {tournament.description && (
            <p className="rh-hero__description">{tournament.description}</p>
          )}
          {headerFacts.length > 0 && (
            <dl className="rh-hero__facts">
              {headerFacts.map(({ icon: Icon, term, value }) => (
                <div key={term} className="rh-hero__fact">
                  <dt>
                    <Icon size={14} /> {term}
                  </dt>
                  <dd>{value}</dd>
                </div>
              ))}
            </dl>
          )}
        </div>
      </header>

      {/* ── Race Stats ── */}
      {displayedRaces.length > 0 && (
        <div className="rh-stats-strip">
          <div className="rh-stat">
            <strong>{counts.all}</strong>
            <span>Total races</span>
          </div>
          {counts.betting > 0 && (
            <div className="rh-stat rh-stat--open">
              <strong>{counts.betting}</strong>
              <span>Prediction open</span>
            </div>
          )}
          {counts.live > 0 && (
            <div className="rh-stat rh-stat--live">
              <strong>{counts.live}</strong>
              <span>Live now</span>
            </div>
          )}
          {counts.completed > 0 && (
            <div className="rh-stat">
              <strong>{counts.completed}</strong>
              <span>Completed</span>
            </div>
          )}
        </div>
      )}

      {/* ── Schedule Section ── */}
      <section className="rh-schedule">
        <div className="rh-schedule__heading">
          <div>
            <Clock3 size={15} />
            <h2>Race schedule</h2>
          </div>
          {/* Filter tabs */}
          <div className="rh-filters" role="tablist" aria-label="Filter races">
            {FILTERS.map((f) => (
              <button
                key={f.id}
                type="button"
                role="tab"
                aria-selected={activeFilter === f.id}
                className={`rh-filter-tab${activeFilter === f.id ? " is-active" : ""}`}
                onClick={() => setActiveFilter(f.id)}
              >
                {f.id === "live" && <Radio size={12} />}
                <span>{f.label}</span>
                <b>{counts[f.id]}</b>
              </button>
            ))}
          </div>
        </div>

        {/* Race list / round groups */}
        <div className="rh-race-list">
          {visibleRaces.length === 0 ? (
            <div className="race-hub-empty" role="status">
              <Flag size={22} />
              <strong>
                {displayedRaces.length ? "No races match this filter" : "No races published"}
              </strong>
              <span>
                {displayedRaces.length
                  ? "Choose another status to see the full schedule."
                  : "The live API has no race schedule for this tournament yet."}
              </span>
              {displayedRaces.length > 0 && (
                <button type="button" onClick={() => setActiveFilter("all")}>
                  Show all races
                </button>
              )}
            </div>
          ) : roundGroups ? (
            roundGroups.map((g) => (
              <RoundGroup
                key={g.roundName}
                roundName={g.roundName}
                roundOrder={g.roundOrder}
                races={g.races}
                tournament={tournament}
              />
            ))
          ) : (
            visibleRaces.map((race) => (
              <RaceRow key={race.id || race.name} race={race} tournament={tournament} />
            ))
          )}
        </div>
      </section>
    </section>
  );
}

export default TournamentDetail;
