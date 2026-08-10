import { useEffect, useMemo, useState } from "react";
import { Award, Clock3, Flag, History, Medal, Timer, Trophy } from "lucide-react";
import DataTable from "../../components/DataTable.jsx";
import LoadingSkeleton from "../../components/LoadingSkeleton.jsx";
import { betApi } from "../../api/betApi.js";
import { useSpectatorRaceResults } from "./useSpectatorData.js";
import "./spectator.css";

function getEntityName(value, fallback = "") {
  if (!value || typeof value === "string") return fallback;
  return value.name || value.full_name || fallback;
}

function formatBetStatus(value) {
  const normalized = String(value || "pending").toLowerCase();
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

function formatTokenAmount(value, currency = "TOKEN") {
  const number = Number(value || 0);
  return `${number.toLocaleString(undefined, { maximumFractionDigits: 2 })} ${currency || "TOKEN"}`;
}

function formatBetDate(value) {
  if (!value) return "Not settled";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not settled";
  return date.toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" });
}

function toBetHistoryRow(bet) {
  const status = String(bet?.status || "pending").toLowerCase();
  const payoutAmount = Number(bet?.payout_amount ?? 0);
  const potentialPayout = Number(bet?.potential_payout ?? 0);
  const raceName = getEntityName(bet?.race_id, "Race");
  const horseName =
    bet?.odds_snapshot?.horse_name ||
    getEntityName(bet?.predicted_horse_id, "Selected runner");
  const currency =
    bet?.odds_snapshot?.currency ||
    bet?.race_id?.betting_market?.currency ||
    "TOKEN";

  return {
    id: bet?._id || bet?.id,
    submittedAt: bet?.submitted_at,
    settledAt: bet?.settled_at,
    race: raceName,
    selection: horseName,
    status,
    statusLabel: formatBetStatus(status),
    stake: Number(bet?.stake_amount ?? 0),
    odds: Number(bet?.odds_snapshot?.game_odds ?? 0),
    potentialPayout,
    payoutAmount,
    resultAmount: status === "won" ? payoutAmount : status === "cancelled" ? Number(bet?.stake_amount ?? 0) : status === "lost" ? 0 : potentialPayout,
    resultLabel: status === "won" ? "Paid out" : status === "cancelled" ? "Refunded" : status === "lost" ? "No payout" : "Potential",
    currency,
  };
}

function summarizePaidBets(bets) {
  const byCurrency = new Map();
  bets.forEach((bet) => {
    byCurrency.set(bet.currency, (byCurrency.get(bet.currency) || 0) + Number(bet.payoutAmount || 0));
  });
  return Array.from(byCurrency.entries())
    .map(([currency, amount]) => formatTokenAmount(amount, currency))
    .join(" / ");
}

const Results = () => {
  const [view, setView] = useState("results");
  const [betHistory, setBetHistory] = useState({ bets: [], isLoading: true, error: "" });
  const { error, isLoading, results: liveResults } = useSpectatorRaceResults();
  const displayResults = liveResults;
  const settledBets = useMemo(() => betHistory.bets.filter((bet) => ["won", "lost", "cancelled"].includes(bet.status)), [betHistory.bets]);
  const latestWinner = displayResults.find((result) => Number(result.position) === 1) || null;
  const publishedRaceCount = new Set(displayResults.map((result) => result.raceId || result.race)).size;
  const scoredResults = displayResults.filter((result) => Number.isFinite(Number(result.score)));
  const timedResults = displayResults.filter((result) => Number.isFinite(Number(result.time)));
  const fastestResult = timedResults.reduce((fastest, result) => !fastest || Number(result.time) < Number(fastest.time) ? result : fastest, null);
  const summaryStats = [
    { label: "Published races", value: publishedRaceCount, detail: `${displayResults.length} official finishes`, icon: Flag },
    { label: "Fastest time", value: fastestResult?.time ?? "-", detail: fastestResult?.horse || "No timed result", icon: Timer },
    { label: "Result entries", value: displayResults.length, detail: "Published by Admin", icon: Medal },
    { label: "Scored entries", value: scoredResults.length, detail: "Backend final score", icon: Award },
  ];

  useEffect(() => {
    let cancelled = false;

    async function loadBetHistory() {
      setBetHistory((current) => ({ ...current, isLoading: true, error: "" }));
      try {
        const payload = await betApi.getMyBets();
        if (cancelled) return;
        const bets = Array.isArray(payload.bets) ? payload.bets.map(toBetHistoryRow) : [];
        setBetHistory({ bets, isLoading: false, error: "" });
      } catch (apiError) {
        if (!cancelled) {
          setBetHistory({ bets: [], isLoading: false, error: apiError.message || "Unable to load prediction history." });
        }
      }
    }

    loadBetHistory();
    return () => { cancelled = true; };
  }, []);

  const resultColumns = [
    { header: "Pos", field: "position", render: (row) => (
      <strong className={row.position === 1 ? "results-rank results-rank--winner" : "results-rank"}>#{row.position}</strong>
    ) },
    { header: "Horse", field: "horse", render: (row) => (
      <span className="results-competitor">
        <strong>{row.horse}</strong>
        <small>Lane {row.lane} / {row.margin}</small>
      </span>
    ) },
    { header: "Jockey", field: "jockey" },
    { header: "Race", field: "race" },
    { header: "Time", field: "time", render: (row) => <span className="results-time">{row.time}</span> },
    { header: "Status", field: "status", render: (row) => (
      <span className={`results-status ${row.status === "Official" ? "results-status--official" : "results-status--review"}`}>
        {row.status}
      </span>
    ) },
    { header: "Score", field: "score", render: (row) => <span className="results-reward">{row.score}</span> },
  ];

  const betColumns = [
    { header: "Race", field: "race", render: (row) => (
      <span className="results-competitor">
        <strong>{row.race}</strong>
        <small>{formatBetDate(row.settledAt || row.submittedAt)}</small>
      </span>
    ) },
    { header: "Selection", field: "selection", render: (row) => (
      <span className="results-competitor">
        <strong>{row.selection}</strong>
        <small>Win / {row.odds ? `${row.odds.toFixed(2)}x` : "odds snapshot"}</small>
      </span>
    ) },
    { header: "Stake", field: "stake", render: (row) => <span className="results-time">{formatTokenAmount(row.stake, row.currency)}</span> },
    { header: "Status", field: "status", render: (row) => (
      <span className={`results-status results-status--${row.status}`}>
        {row.statusLabel}
      </span>
    ) },
    { header: "Return", field: "resultAmount", render: (row) => (
      <span className={`results-bet-return results-bet-return--${row.status}`}>
        <strong>{formatTokenAmount(row.resultAmount, row.currency)}</strong>
        <small>{row.resultLabel}</small>
      </span>
    ) },
  ];

  if (isLoading) {
    return <section className="spectator-page results-page"><LoadingSkeleton ariaLabel="Loading race results" rows={5} variant="table" /></section>;
  }

  return (
    <section className="spectator-page results-page">
      {error && (
        <section className="admin-live-state admin-live-state--warning" aria-live="polite">
          {error} No sample results are being substituted.
        </section>
      )}

      <div className="results-hero">
        <div className="results-hero__copy">
          <p className="spectator-eyebrow">Official results</p>
          <h1 className="results-title">Official race standings from the published ledger.</h1>
          <p className="results-copy">
            Track final positions, confirmed times, and backend scores after each result is published.
          </p>
          <div className="results-hero__meta" aria-label="Latest result summary">
            <span><Clock3 size={15} /> {latestWinner?.publishedAt ? `Published ${new Date(latestWinner.publishedAt).toLocaleDateString()}` : "Awaiting published result"}</span>
            <span><Trophy size={15} /> {latestWinner?.horse || "No winner yet"}</span>
            <span><Medal size={15} /> {displayResults.length} official finishes</span>
          </div>
        </div>
        {latestWinner ? (
          <aside className="results-winner-card" aria-label="Latest winner">
            <span className="results-winner-card__label">Latest winner</span>
            <strong>{latestWinner.horse}</strong>
            <p>{latestWinner.race} / lane {latestWinner.lane} / official time {latestWinner.time}</p>
            <div className="results-winner-card__footer">
              <span className="results-status results-status--official">Published</span>
              <span>{latestWinner.score === "-" ? "Score unavailable" : `${latestWinner.score} pts`}</span>
            </div>
          </aside>
        ) : (
          <aside className="results-winner-card" aria-label="No published winner">
            <span className="results-winner-card__label">Latest winner</span>
            <strong>No published results</strong>
            <p>Published race results will appear here after admin confirmation.</p>
          </aside>
        )}
      </div>

      <div className="results-summary" aria-label="Results summary">
        {summaryStats.map((stat) => {
          const Icon = stat.icon;
          return (
            <article className="results-summary-card" key={stat.label}>
              <Icon size={18} />
              <span>{stat.label}</span>
              <strong>{stat.value}</strong>
              <small>{stat.detail}</small>
            </article>
          );
        })}
      </div>

      <div className="results-board">
        <div className="results-board__header">
          <div>
            <span className="results-kicker">{view === "results" ? "Race control" : "Wallet history"}</span>
            <h2>{view === "results" ? "Published race results" : "Settled prediction history"}</h2>
          </div>

          <div className="results-tabs" role="tablist" aria-label="Results views">
            <button className={`results-tab ${view === "results" ? "results-tab--active" : ""}`} type="button" onClick={() => setView("results")}>
              <Flag size={16} />
              Race results
              <span>{displayResults.length}</span>
            </button>
            <button className={`results-tab ${view === "history" ? "results-tab--active" : ""}`} type="button" onClick={() => setView("history")}>
              <History size={16} />
              Prediction history
              <span>{betHistory.isLoading ? "..." : betHistory.bets.length}</span>
            </button>
          </div>
        </div>

        {view === "results" ? (
          <DataTable columns={resultColumns} data={displayResults} emptyMessage="No published race results are available." />
        ) : betHistory.isLoading ? (
          <LoadingSkeleton ariaLabel="Loading prediction history" rows={4} variant="table" />
        ) : betHistory.error ? (
          <div className="spectator-empty-state results-unavailable-state" role="status">
            <History size={22} />
            <strong>Prediction history is unavailable</strong>
            <span>{betHistory.error}</span>
          </div>
        ) : (
          <>
            <div className="results-history-summary" aria-label="Prediction history summary">
              <span>{betHistory.bets.length} total predictions</span>
              <span>{settledBets.length} settled</span>
              <span>{summarizePaidBets(settledBets) || formatTokenAmount(0, "TOKEN")} paid</span>
            </div>
            <DataTable columns={betColumns} data={betHistory.bets} emptyMessage="No prediction history is available yet." />
          </>
        )}
      </div>
    </section>
  );
};

export default Results;
