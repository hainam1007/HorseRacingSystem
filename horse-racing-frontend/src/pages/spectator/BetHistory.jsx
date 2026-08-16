import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowLeft,
  ArrowRight,
  CircleDollarSign,
  Clock3,
  History,
  RefreshCw,
  TicketCheck,
  TrendingDown,
  Trophy,
} from "lucide-react";
import { betApi } from "../../api/betApi.js";
import LoadingSkeleton from "../../components/LoadingSkeleton.jsx";
import "./spectator.css";

const FILTERS = [
  { id: "all", label: "All bets" },
  { id: "pending", label: "Awaiting result" },
  { id: "won", label: "Won" },
  { id: "lost", label: "Lost" },
  { id: "cancelled", label: "Refunded" },
];

const STATUS_META = {
  pending: { label: "Pending", result: "Awaiting official result" },
  won: { label: "Won", result: "Winning pick" },
  lost: { label: "Lost", result: "Race settled" },
  cancelled: { label: "Refunded", result: "Stake returned" },
};

function getEntityName(value, fallback) {
  if (!value || typeof value === "string") return fallback;
  return value.name || value.full_name || fallback;
}

function getEntityId(value) {
  if (!value) return "";
  if (typeof value === "string") return value;
  return value._id || value.id || "";
}

function formatAmount(value, currency = "TOKEN") {
  const amount = Number(value || 0);
  return `${amount.toLocaleString(undefined, { maximumFractionDigits: 2 })} ${currency}`;
}

function formatDate(value) {
  if (!value) return "Date unavailable";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Date unavailable";
  return date.toLocaleString(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function normalizeBet(bet) {
  // The legacy API embedded the race under race_id. Sequelize returns the
  // scalar race_id plus the eager-loaded race association under race.
  const race = bet?.race && typeof bet.race === "object"
    ? bet.race
    : bet?.race_id && typeof bet.race_id === "object"
      ? bet.race_id
      : {};
  const tournament = race?.tournament && typeof race.tournament === "object"
    ? race.tournament
    : race?.tournament_id && typeof race.tournament_id === "object"
      ? race.tournament_id
      : {};
  const status = String(bet?.status || "pending").toLowerCase();
  const safeStatus = STATUS_META[status] ? status : "pending";
  const stake = Number(bet?.stake_amount ?? 0);
  const payout = Number(bet?.payout_amount ?? 0);
  const potentialPayout = Number(bet?.potential_payout ?? 0);
  const raceId = getEntityId(bet?.race_id) || getEntityId(race);
  const tournamentId = getEntityId(race?.tournament_id) || getEntityId(tournament);
  const currency = race?.betting_market?.currency || "TOKEN";
  const odds = Number(bet?.odds_snapshot?.game_odds ?? 0);
  const selection =
    bet?.odds_snapshot?.horse_name ||
    getEntityName(bet?.predicted_horse_id, "Selected runner");

  return {
    id: getEntityId(bet) || `${raceId}-${bet?.submitted_at || selection}`,
    raceId,
    raceName: getEntityName(race, "Race"),
    tournamentName: getEntityName(tournament, "Tournament"),
    racePath: raceId && tournamentId
      ? `/spectator/tournaments/${encodeURIComponent(tournamentId)}/races/${encodeURIComponent(raceId)}`
      : "",
    raceDate: race?.race_date,
    submittedAt: bet?.submitted_at,
    settledAt: bet?.settled_at,
    selection,
    status: safeStatus,
    stake,
    payout,
    potentialPayout,
    odds,
    currency,
    net: safeStatus === "won"
      ? payout - stake
      : safeStatus === "lost"
        ? -stake
        : safeStatus === "cancelled"
          ? 0
          : null,
  };
}

export default function BetHistory() {
  const [filter, setFilter] = useState("all");
  const [state, setState] = useState({ bets: [], isLoading: true, error: "" });

  const loadBets = useCallback(async () => {
    setState((current) => ({ ...current, isLoading: true, error: "" }));
    try {
      const payload = await betApi.getMyBets();
      const bets = Array.isArray(payload?.bets) ? payload.bets.map(normalizeBet) : [];
      setState({ bets, isLoading: false, error: "" });
    } catch (error) {
      setState({
        bets: [],
        isLoading: false,
        error: error.message || "Unable to load bet history.",
      });
    }
  }, []);

  useEffect(() => {
    loadBets();
  }, [loadBets]);

  const counts = useMemo(() => {
    const next = { all: state.bets.length, pending: 0, won: 0, lost: 0, cancelled: 0 };
    state.bets.forEach((bet) => {
      next[bet.status] = (next[bet.status] || 0) + 1;
    });
    return next;
  }, [state.bets]);

  const visibleBets = useMemo(
    () => filter === "all" ? state.bets : state.bets.filter((bet) => bet.status === filter),
    [filter, state.bets],
  );

  const settledCount = counts.won + counts.lost;
  const winRate = settledCount ? Math.round((counts.won / settledCount) * 100) : 0;

  if (state.isLoading && !state.bets.length) {
    return (
      <section className="spectator-page bet-history-page">
        <LoadingSkeleton ariaLabel="Loading bet history" rows={5} variant="list" />
      </section>
    );
  }

  return (
    <section className="spectator-page bet-history-page">
      <header className="bet-history-hero">
        <div className="bet-history-hero__copy">
          <Link className="bet-history-back" to="/spectator/predictions">
            <ArrowLeft size={15} aria-hidden="true" />
            Race markets
          </Link>
          <p className="spectator-eyebrow">Personal bet ledger</p>
          <h1>Every pick, from stake to settlement.</h1>
          <p>Review the races you backed, the odds you accepted, and the official win, loss, or refund recorded for each bet.</p>
        </div>

        <aside className="bet-history-performance" aria-label="Settled bet performance">
          <span>Settled win rate</span>
          <strong>{winRate}%</strong>
          <div>
            <span>{counts.won} won</span>
            <span>{counts.lost} lost</span>
          </div>
          <small>Calculated from won and lost bets only.</small>
        </aside>
      </header>

      <section className="bet-history-summary" aria-label="Bet history summary">
        <article>
          <TicketCheck size={18} aria-hidden="true" />
          <span>Total bets</span>
          <strong>{counts.all}</strong>
          <small>All recorded picks</small>
        </article>
        <article>
          <Clock3 size={18} aria-hidden="true" />
          <span>Awaiting result</span>
          <strong>{counts.pending}</strong>
          <small>Not settled yet</small>
        </article>
        <article className="is-won">
          <Trophy size={18} aria-hidden="true" />
          <span>Winning bets</span>
          <strong>{counts.won}</strong>
          <small>Official payouts</small>
        </article>
        <article className="is-lost">
          <TrendingDown size={18} aria-hidden="true" />
          <span>Losing bets</span>
          <strong>{counts.lost}</strong>
          <small>Settled without payout</small>
        </article>
      </section>

      <section className="bet-history-board">
        <div className="bet-history-board__header">
          <div>
            <span className="results-kicker">Settlement record</span>
            <h2>Bet history</h2>
          </div>
          <button className="bet-history-refresh" disabled={state.isLoading} type="button" onClick={loadBets}>
            <RefreshCw className={state.isLoading ? "is-spinning" : ""} size={15} aria-hidden="true" />
            Refresh
          </button>
        </div>

        <div className="bet-history-filters" role="tablist" aria-label="Filter bet history">
          {FILTERS.map((item) => (
            <button
              aria-selected={filter === item.id}
              className={filter === item.id ? "is-active" : ""}
              key={item.id}
              role="tab"
              type="button"
              onClick={() => setFilter(item.id)}
            >
              <span>{item.label}</span>
              <b>{counts[item.id] || 0}</b>
            </button>
          ))}
        </div>

        {state.error ? (
          <div className="bet-history-state is-error" role="status">
            <History size={23} aria-hidden="true" />
            <strong>Bet history is unavailable</strong>
            <span>{state.error}</span>
            <button type="button" onClick={loadBets}><RefreshCw size={14} /> Try again</button>
          </div>
        ) : visibleBets.length ? (
          <div className="bet-history-list">
            {visibleBets.map((bet) => {
              const meta = STATUS_META[bet.status];
              const returnAmount = bet.status === "pending"
                ? bet.potentialPayout
                : bet.status === "cancelled"
                  ? bet.stake
                  : bet.payout;
              const returnLabel = bet.status === "pending" ? "Potential return" : bet.status === "cancelled" ? "Refunded stake" : "Payout";

              return (
                <article className={`bet-history-row bet-history-row--${bet.status}`} key={bet.id}>
                  <div className="bet-history-row__race">
                    <span>{bet.tournamentName}</span>
                    <h3>{bet.raceName}</h3>
                    <small>{formatDate(bet.raceDate || bet.submittedAt)}</small>
                  </div>

                  <div className="bet-history-row__selection">
                    <span>Your pick</span>
                    <strong>{bet.selection}</strong>
                    <small>Win market {bet.odds ? `· ${bet.odds.toFixed(2)}x` : ""}</small>
                  </div>

                  <div className="bet-history-row__money">
                    <div><span>Stake</span><strong>{formatAmount(bet.stake, bet.currency)}</strong></div>
                    <div><span>{returnLabel}</span><strong>{formatAmount(returnAmount, bet.currency)}</strong></div>
                  </div>

                  <div className="bet-history-row__outcome">
                    <span className={`results-status results-status--${bet.status}`}>{meta.label}</span>
                    <strong className={bet.net > 0 ? "is-positive" : bet.net < 0 ? "is-negative" : ""}>
                      {bet.net === null
                        ? meta.result
                        : `${bet.net > 0 ? "+" : ""}${formatAmount(bet.net, bet.currency)}`}
                    </strong>
                    <small>{bet.settledAt ? `Settled ${formatDate(bet.settledAt)}` : `Placed ${formatDate(bet.submittedAt)}`}</small>
                  </div>

                  {bet.racePath ? (
                    <Link className="bet-history-row__link" to={bet.racePath}>
                      Race details <ArrowRight size={14} aria-hidden="true" />
                    </Link>
                  ) : (
                    <span className="bet-history-row__link is-disabled">Race unavailable</span>
                  )}
                </article>
              );
            })}
          </div>
        ) : (
          <div className="bet-history-state">
            <CircleDollarSign size={24} aria-hidden="true" />
            <strong>{filter === "all" ? "No bets recorded yet" : `No ${FILTERS.find((item) => item.id === filter)?.label.toLowerCase()} bets`}</strong>
            <span>{filter === "all" ? "Place a prediction on an open race market and it will appear here." : "Choose another filter to review the rest of your history."}</span>
            {filter === "all" && <Link to="/spectator/predictions">Browse race markets <ArrowRight size={14} /></Link>}
          </div>
        )}
      </section>
    </section>
  );
}
