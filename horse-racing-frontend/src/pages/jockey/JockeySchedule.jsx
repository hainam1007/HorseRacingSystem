import { useMemo, useState } from "react";
import {
  ArrowUpRight,
  BadgeCheck,
  CalendarDays,
  ClipboardCheck,
  Clock3,
  ChevronRight,
  XCircle,
  MapPin,
  Trophy,
} from "lucide-react";
import LoadingSkeleton from "../../components/LoadingSkeleton.jsx";
import {
  jockeyActionImages,
  jockeyTrackImages,
} from "./jockeyData";
import { useJockeyApiData } from "./useJockeyApiData";

const statusClass = (status) => {
  if (["Accepted", "Confirmed", "Published", "Complete", "Available"].includes(status)) {
    return "jockey-badge--green";
  }
  if (["Rejected", "Expired"].includes(status)) {
    return "jockey-badge--muted";
  }
  return "jockey-badge--amber";
};

const preferredFilterOrder = ["Accepted", "Pending", "Review", "Complete", "Rejected", "Cancelled"];

function JockeySchedule() {
  const [filter, setFilter] = useState("All");
  const { error, isLoading, schedule } = useJockeyApiData();

  const filterOptions = useMemo(() => {
    const discoveredStatuses = [...new Set(schedule.map((race) => race.status))];
    return [
      "All",
      ...preferredFilterOrder.filter((status) => discoveredStatuses.includes(status)),
      ...discoveredStatuses.filter((status) => !preferredFilterOrder.includes(status)),
    ];
  }, [schedule]);

  const visibleRaces = useMemo(
    () => schedule.filter((race) => filter === "All" || race.status === filter),
    [filter, schedule]
  );

  const acceptedCount = schedule.filter((race) => ["Accepted", "Confirmed"].includes(race.status)).length;
  const completeCount = schedule.filter((race) => race.status === "Complete").length;
  const pendingCount = schedule.filter((race) => race.status === "Pending").length;
  const reviewCount = schedule.filter((race) => race.status === "Review").length;
  const nextRace = schedule.find((race) => ["Accepted", "Pending", "Review", "Confirmed"].includes(race.status)) ?? schedule[0];
  const nextRaceDate = nextRace?.time?.split(", ")[0] || "Race day";
  const nextRaceTime = nextRace?.time?.split(", ")[1] || "Time TBA";

  if (isLoading) {
    return <div className="jockey-schedule-page"><LoadingSkeleton ariaLabel="Loading race schedule" rows={5} variant="list" /></div>;
  }

  return (
    <div className="jockey-schedule-page">
      {error && (
        <div className={`jockey-sync-note ${error ? "jockey-sync-note--warning" : ""}`}>
          {error}
        </div>
      )}
      <section className="jockey-schedule-hero" aria-labelledby="jockey-schedule-title">
        <img src={jockeyTrackImages[3]} alt="Race track schedule view for jockey" />
        <div className="jockey-schedule-hero__copy">
          <div className="jockey-schedule-hero__eyebrow">
            <p className="jockey-kicker">Jockey workspace / schedule</p>
            <span>{schedule.length} race slots · Season 2026</span>
          </div>
          <h1 id="jockey-schedule-title">Your week, at a glance.</h1>
          <p>Every ride, venue, and check-in window in one focused race-day board.</p>
          <a className="jockey-button jockey-button--primary jockey-schedule-hero__action" href="#schedule-board">
            <CalendarDays size={17} />
            Open race board
            <ArrowUpRight size={16} />
          </a>
        </div>
        <aside className="jockey-schedule-hero__panel">
          {nextRace ? (
            <>
              <div className="jockey-schedule-hero__panel-head">
                <span className="jockey-kicker">Next on deck</span>
                <span className={`jockey-badge ${statusClass(nextRace.status)}`}>{nextRace.status}</span>
              </div>
              <div className="jockey-schedule-hero__panel-time">
                <strong>{nextRaceDate}</strong>
                <span>{nextRaceTime}</span>
              </div>
              <div className="jockey-schedule-hero__panel-copy">
                <strong>{nextRace.race}</strong>
                <p><MapPin size={14} /> {nextRace.venue}</p>
              </div>
            </>
          ) : (
            <>
              <span className="jockey-badge jockey-badge--muted">Clear</span>
              <strong>No scheduled race</strong>
              <p>Accepted assignments will appear on this board.</p>
            </>
          )}
        </aside>
      </section>

      <section className="jockey-schedule-stats" aria-label="Schedule summary">
        {[
          { label: "All slots", value: schedule.length, note: "On your board", icon: CalendarDays },
          { label: "Accepted", value: acceptedCount, note: "Locked rides", icon: BadgeCheck },
          { label: "Pending", value: pendingCount, note: "Awaiting decision", icon: ClipboardCheck },
          { label: "Review", value: reviewCount, note: "Needs a closer look", icon: XCircle },
          { label: "Complete", value: completeCount, note: "Results published", icon: Trophy },
        ].map((item) => {
          const Icon = item.icon;
          return (
            <article className="jockey-schedule-stat" key={item.label}>
              <Icon size={18} />
              <span>{item.label}</span>
              <strong>{item.value}</strong>
              <small>{item.note}</small>
            </article>
          );
        })}
      </section>

      <section className="jockey-schedule-board" id="schedule-board" aria-labelledby="jockey-schedule-board-title">
        <div className="jockey-schedule-board__header">
          <div>
            <span className="jockey-kicker">Race-day board</span>
            <h2 id="jockey-schedule-board-title">{filter === "All" ? "Your race calendar" : `${filter} race slots`}</h2>
            <p>Stay ahead of the gate with the details that matter before every start.</p>
          </div>
          <div className="jockey-schedule-board__toolbar">
            <span className="jockey-schedule-board__count">Showing {visibleRaces.length} of {schedule.length} slots</span>
            <div className="jockey-segmented" aria-label="Filter race slots">
              {filterOptions.map((item) => (
                <button
                  aria-pressed={filter === item}
                  className={filter === item ? "jockey-segmented__active" : ""}
                  key={item}
                  onClick={() => setFilter(item)}
                  type="button"
                >
                  {item}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="jockey-schedule-list">
          {visibleRaces.map((race, index) => {
            const [date, time] = race.time.split(", ");
            return (
              <article className={`jockey-schedule-slot ${nextRace?.id === race.id ? "jockey-schedule-slot--next" : ""}`} key={race.id}>
                <div className="jockey-schedule-slot__media">
                  <img src={jockeyActionImages[index % jockeyActionImages.length]} alt={`${race.race} schedule`} />
                  <span className={`jockey-badge ${statusClass(race.status)}`}>{race.status}</span>
                  {nextRace?.id === race.id && <span className="jockey-schedule-slot__next">Next ride</span>}
                </div>

                <div className="jockey-schedule-slot__body">
                  <div className="jockey-schedule-slot__topline">
                    <div className="jockey-schedule-slot__time">
                      <span>{date}</span>
                      <strong>{time}</strong>
                    </div>
                    <span className="jockey-schedule-slot__round">{race.id} · {race.round}</span>
                  </div>

                  <div className="jockey-schedule-slot__race">
                    <span className="jockey-kicker">Race assignment</span>
                    <h3>{race.race}</h3>
                    <small><MapPin size={13} /> {race.venue}</small>
                  </div>

                  <div className="jockey-schedule-slot__meta">
                    <div><span>Horse</span><strong>{race.horse}</strong></div>
                    <div><span>Tournament</span><strong>{race.tournament}</strong></div>
                  </div>

                  <div className="jockey-schedule-slot__footer">
                    <small><Clock3 size={13} /> Check-in opens 45 minutes before start.</small>
                    <span className="jockey-schedule-slot__footer-mark"><Trophy size={16} /> {nextRace?.id === race.id ? "Prepare for this ride" : "Race slot"}<ChevronRight size={15} /></span>
                  </div>
                </div>
              </article>
            );
          })}
        </div>

        {visibleRaces.length === 0 && <div className="jockey-empty">No race slots match this filter.</div>}
      </section>
    </div>
  );
}

export default JockeySchedule;
