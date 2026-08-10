import { useMemo, useState } from "react";
import { Award, BadgeCheck, Clock3, Flag, Trophy } from "lucide-react";
import LoadingSkeleton from "../../components/LoadingSkeleton.jsx";
import {
  celebrationImages,
} from "./jockeyData";
import { useJockeyApiData } from "./useJockeyApiData";

const statusClass = (status) => {
  if (["Accepted", "Confirmed", "Published", "Available", "Approved", "Paid"].includes(status)) {
    return "jockey-badge--green";
  }
  if (["Rejected", "Expired"].includes(status)) {
    return "jockey-badge--muted";
  }
  return "jockey-badge--amber";
};

const finishLabel = (position) => {
  if (position === 1) return "Winner";
  if (position === 2) return "Runner-up";
  if (position === 3) return "Podium";
  return `Place ${position}`;
};

function JockeyResults() {
  const [filter, setFilter] = useState("All");
  const { error, isLoading, profile, results } = useJockeyApiData();

  const visibleResults = useMemo(() => {
    return results.filter((result) => {
      if (filter === "Wins") return result.position === 1;
      if (filter === "Podiums") return result.position <= 3;
      if (filter === "Published") return ["Published", "Calculated", "Approved", "Paid"].includes(result.status);
      return true;
    });
  }, [filter, results]);

  const bestResult = results.reduce((best, result) => (
    result.position < best.position ? result : best
  ), results[0]);
  const podiumCount = results.filter((result) => result.position <= 3).length;
  const winCount = results.filter((result) => result.position === 1).length;
  const latestResult = results[0];

  if (isLoading) {
    return <div className="jockey-results-page"><LoadingSkeleton ariaLabel="Loading jockey results" rows={5} variant="table" /></div>;
  }

  return (
    <div className="jockey-results-page">
      {error && (
        <div className={`jockey-sync-note ${error ? "jockey-sync-note--warning" : ""}`}>
          {error}
        </div>
      )}
      <section className="jockey-results-hero">
        <img src={celebrationImages[1]} alt="Jockey celebrating a published race result" />
        <div className="jockey-results-hero__copy">
          <p className="jockey-kicker">Performance results</p>
          <h1>Read the season through finish, pace, and prize.</h1>
          <p>Review published race outcomes with clean finish ranking, horse context, official time, and earned prize money.</p>
        </div>
        <aside className="jockey-results-hero__panel">
          {bestResult ? (
            <>
              <span className="jockey-badge jockey-badge--green"><Trophy size={14} /> Best finish</span>
              <strong>#{bestResult.position}</strong>
              <p>{bestResult.race} / {bestResult.horse}</p>
            </>
          ) : (
            <>
              <span className="jockey-badge jockey-badge--muted">No results</span>
              <strong>-</strong>
              <p>Published race outcomes will appear after results are approved.</p>
            </>
          )}
        </aside>
      </section>

      <section className="jockey-results-stats" aria-label="Jockey result summary">
        {[
          { label: "Season earnings", value: profile.earnings, note: "Published purse", icon: Award },
          { label: "Win rate", value: profile.winRate, note: `${winCount} season win`, icon: Trophy },
          { label: "Podium rate", value: profile.podiumRate, note: `${podiumCount} top-three finishes`, icon: BadgeCheck },
          { label: "Best time", value: bestResult?.time || "-", note: bestResult?.horse || "No published time", icon: Clock3 },
        ].map((item) => {
          const Icon = item.icon;
          return (
            <article className="jockey-results-stat" key={item.label}>
              <Icon size={18} />
              <span>{item.label}</span>
              <strong>{item.value}</strong>
              <small>{item.note}</small>
            </article>
          );
        })}
      </section>

      <section className="jockey-results-layout">
        <aside className="jockey-results-feature">
          <img src={celebrationImages[0]} alt="Jockey after winning a race" />
          {latestResult ? (
            <>
              <div>
                <span className="jockey-kicker">Latest result</span>
                <h2>{latestResult.race}</h2>
                <p>{latestResult.horse} finished #{latestResult.position} with an official time of {latestResult.time}.</p>
              </div>
              <div className="jockey-results-feature__metrics">
                <div><span>Finish</span><strong>#{latestResult.position}</strong></div>
                <div><span>Prize</span><strong>{latestResult.prize}</strong></div>
              </div>
            </>
          ) : (
            <div>
              <span className="jockey-kicker">Latest result</span>
              <h2>No published result</h2>
              <p>Race results and prize awards will appear here after publication.</p>
            </div>
          )}
        </aside>

        <article className="jockey-results-board">
          <div className="jockey-results-board__header">
            <div>
              <span className="jockey-kicker">Official ledger</span>
              <h2>{filter === "All" ? "All published results" : `${filter} results`}</h2>
            </div>
            <div className="jockey-segmented">
              {["All", "Wins", "Podiums", "Published"].map((item) => (
                <button className={filter === item ? "jockey-segmented__active" : ""} key={item} onClick={() => setFilter(item)} type="button">
                  {item}
                </button>
              ))}
            </div>
          </div>

          <div className="jockey-results-list">
            {visibleResults.map((result) => (
              <article className="jockey-results-row" key={result.id}>
                <div className="jockey-results-row__date">
                  <span>{result.date.split(" ")[0]}</span>
                  <strong>{result.date.split(" ")[1]}</strong>
                </div>

                <div className="jockey-results-row__main">
                  <span className="jockey-kicker">{result.id}</span>
                  <h3>{result.race}</h3>
                  <p><Flag size={13} /> {result.horse} / {finishLabel(result.position)}</p>
                </div>

                <div className="jockey-results-row__metrics" aria-label={`${result.race} metrics`}>
                  <div><span>Finish</span><strong>#{result.position}</strong></div>
                  <div><span>Time</span><strong>{result.time}</strong></div>
                  <div><span>Prize</span><strong>{result.prize}</strong></div>
                </div>

                <span className={`jockey-badge ${statusClass(result.status)}`}>{result.status}</span>
              </article>
            ))}
          </div>

          {visibleResults.length === 0 && <div className="jockey-empty">No results match this filter.</div>}
        </article>
      </section>
    </div>
  );
}

export default JockeyResults;
