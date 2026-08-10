import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, CalendarDays, CircleDollarSign, Clock3, LineChart, Radio, Sparkles, Trophy } from "lucide-react";
import { betApi } from "../../api/betApi.js";
import { walletApi } from "../../api/walletApi.js";
import { formatTokenAmount, getWalletBalance } from "./walletFormatters.js";
import "./spectator.css";

const raceImages = [
  "https://agrifutures.com.au/wp-content/uploads/2022/08/a8-scaled.jpg",
  "https://images.squarespace-cdn.com/content/v1/5f99b7932a3e654c26fd0c52/39d267e3-5397-4600-b49c-322d4b14e4f8/Screenshot+2023-02-10+at+11.52.07+AM.png",
  "https://www.worcester-racecourse.co.uk/WorcesterRacecourse/images/upload/bb03d37b-d42a-486d-b913-cc62a889bf70.webp",
];

const nextRaces = [
  { time: "14:00", title: "Emerald Sprint", venue: "Grandstand A", status: "Open", distance: "1,200m", entries: 8 },
  { time: "15:30", title: "Derby Trial", venue: "Turf Circuit", status: "Live", distance: "1,600m", entries: 10 },
  { time: "17:00", title: "Sunset Stakes", venue: "Main Track", status: "Open", distance: "2,000m", entries: 7 },
  { time: "18:20", title: "Royal Mile", venue: "Inner Rail", status: "Open", distance: "1,600m", entries: 9 },
  { time: "19:10", title: "Night Circuit Qualifier", venue: "Floodlit Track", status: "Open", distance: "1,400m", entries: 11 },
  { time: "20:00", title: "Champion Trial", venue: "Main Track", status: "Open", distance: "2,200m", entries: 6 },
];

const topPicks = [
  {
    rank: 1,
    name: "Thunderbolt",
    meta: "12 wins - 64% form",
    odds: "2.1x",
    image: "https://i.pinimg.com/236x/34/b4/a8/34b4a897a11e246d4e7d97a2981c22b1.jpg",
  },
  {
    rank: 2,
    name: "Silver Flash",
    meta: "10 wins - 58% form",
    odds: "2.8x",
    image: "https://i.pinimg.com/236x/ab/6b/71/ab6b714886cbdfbe68e6c9e016060ae9.jpg",
  },
  {
    rank: 3,
    name: "Golden Gallop",
    meta: "8 wins - 51% form",
    odds: "3.4x",
    image: "https://i.pinimg.com/474x/86/9b/90/869b907e8b730e84c65df991bad2203d.jpg",
  },
];

const quickActions = [
  { label: "Tournament Hub", meta: "Active and upcoming events", to: "/spectator/tournaments" },
  { label: "Prediction Room", meta: "Place picks before gates open", to: "/spectator/predictions" },
  { label: "Reward Exchange", meta: "Redeem TOKEN for active rewards", to: "/spectator/rewards" },
  { label: "Deposit Ledger", meta: "Top-ups, predictions, and wins", to: "/spectator/deposit" },
];

const ACTIVE_BET_STATUSES = new Set(["pending", "accepted", "open"]);
const SETTLED_BET_STATUSES = new Set(["won", "lost", "cancelled"]);

function normalizeBets(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.bets)) return payload.bets;
  if (Array.isArray(payload?.data?.bets)) return payload.data.bets;
  return [];
}

const SpectatorHome = () => {
  const [walletState, setWalletState] = useState({ balance: null, isLoading: true, error: "" });
  const [betsState, setBetsState] = useState({ bets: [], isLoading: true, error: "" });

  useEffect(() => {
    let cancelled = false;

    async function loadAccountOverview() {
      setWalletState((current) => ({ ...current, isLoading: true, error: "" }));
      setBetsState((current) => ({ ...current, isLoading: true, error: "" }));

      const [walletResult, betsResult] = await Promise.allSettled([
        walletApi.getMyWallet(),
        betApi.getMyBets({ page: 1, limit: 100 }),
      ]);

      if (cancelled) return;

      if (walletResult.status === "fulfilled") {
        setWalletState({ balance: getWalletBalance(walletResult.value), isLoading: false, error: "" });
      } else {
        setWalletState({
          balance: null,
          isLoading: false,
          error: walletResult.reason?.message || "Unable to load wallet.",
        });
      }

      if (betsResult.status === "fulfilled") {
        setBetsState({ bets: normalizeBets(betsResult.value), isLoading: false, error: "" });
      } else {
        setBetsState({
          bets: [],
          isLoading: false,
          error: betsResult.reason?.message || "Unable to load predictions.",
        });
      }
    }

    loadAccountOverview();
    return () => { cancelled = true; };
  }, []);

  const accountMetrics = useMemo(() => {
    const activePredictions = betsState.bets.filter((bet) => ACTIVE_BET_STATUSES.has(String(bet?.status || "").toLowerCase())).length;
    const settledPredictions = betsState.bets.filter((bet) => SETTLED_BET_STATUSES.has(String(bet?.status || "").toLowerCase()));
    const wonPredictions = settledPredictions.filter((bet) => String(bet?.status || "").toLowerCase() === "won").length;
    const winRate = settledPredictions.length ? Math.round((wonPredictions / settledPredictions.length) * 100) : 0;

    return {
      activePredictions,
      settledCount: settledPredictions.length,
      winRate,
    };
  }, [betsState.bets]);

  const walletBalanceLabel = walletState.isLoading ? "Loading..." : formatTokenAmount(walletState.balance ?? 0);
  const activePredictionsLabel = betsState.isLoading ? "--" : String(accountMetrics.activePredictions).padStart(2, "0");
  const winRateLabel = betsState.isLoading ? "--" : `${accountMetrics.winRate}%`;
  const walletNote = walletState.error || (Number(walletState.balance) > 0 ? "available now" : "no tokens yet");
  const predictionsNote = betsState.error || (accountMetrics.activePredictions ? "tracking now" : "no active picks");
  const winRateNote = betsState.error || (accountMetrics.settledCount ? `${accountMetrics.settledCount} settled picks` : "no settled picks");

  const overviewStats = [
    { label: "Reward balance", value: walletBalanceLabel, note: walletNote, icon: CircleDollarSign },
    { label: "Active predictions", value: activePredictionsLabel, note: predictionsNote, icon: Radio },
    { label: "Win rate", value: winRateLabel, note: winRateNote, icon: LineChart },
    { label: "Next gate", value: "14:00", note: "Emerald Sprint", icon: Clock3 },
  ];

  return (
    <section className="spectator-page spectator-overview">
      <div className="spectator-overview-hero spectator-overview-hero--redesign">
        <div className="spectator-overview-hero__content">
          <span className="spectator-live-pill"><Radio size={15} /> Live circuit</span>
          <h1 className="spectator-title">Follow every race signal before the gate opens.</h1>
          <p className="spectator-copy">
            A sharper overview for tournaments, race timing, prediction balance, contender form, and official reward outcomes.
          </p>
          <div className="spectator-actions">
            <Link className="spectator-button spectator-button--primary" to="/spectator/predictions">
              Make Prediction
              <ArrowRight size={17} />
            </Link>
            <Link className="spectator-button" to="/spectator/tournaments">
              View Tournaments
            </Link>
          </div>

          <dl className="spectator-hero-signal-grid">
            <div>
              <dt>Current circuit</dt>
              <dd>Grand Circuit 2026</dd>
            </div>
            <div>
              <dt>Confirmed contenders</dt>
              <dd>42 horses</dd>
            </div>
          </dl>
        </div>

        <div className="spectator-overview-hero__media">
          <img src={raceImages[0]} alt="Horse racecourse grandstand" />
          <div className="spectator-live-race-card">
            <span className="spectator-badge spectator-badge--green">Live season</span>
            <strong>Emerald Sprint</strong>
            <span>Grandstand A - 1,200m - 8 entries</span>
          </div>
        </div>
      </div>

      <div className="spectator-overview-stats spectator-overview-stats--redesign">
        {overviewStats.map((stat) => {
          const Icon = stat.icon;
          return (
            <article key={stat.label}>
              <Icon size={18} />
              <span>{stat.label}</span>
              <strong>{stat.value}</strong>
              <small>{stat.note}</small>
            </article>
          );
        })}
      </div>

      <div className="spectator-command-grid">
        <article className="spectator-card spectator-race-board">
          <div className="spectator-card__header">
            <div>
              <p className="spectator-eyebrow">Race Timeline</p>
              <h2>Today at the track</h2>
            </div>
            <Link className="spectator-badge" to="/spectator/results">Results</Link>
          </div>

          <div className="spectator-race-board__list">
            {nextRaces.map((race) => (
              <Link className="spectator-race-row" to="/spectator/predictions" key={race.title}>
                <span className="spectator-race-row__time">{race.time}</span>
                <span className="spectator-race-row__body">
                  <strong>{race.title}</strong>
                  <small>{race.venue} - {race.distance} - {race.entries} entries</small>
                </span>
                <span className={`spectator-badge ${race.status === "Live" ? "spectator-badge--green" : "spectator-badge--amber"}`}>
                  {race.status}
                </span>
              </Link>
            ))}
          </div>
        </article>

        <aside className="spectator-card spectator-wallet-card spectator-wallet-card--redesign">
          <div className="spectator-card__header">
            <div>
              <p className="spectator-eyebrow">Reward Wallet</p>
              <h2>{walletBalanceLabel}</h2>
            </div>
            <span className="spectator-badge spectator-badge--amber">{walletState.isLoading ? "Loading" : "Ready"}</span>
          </div>
          <div className="spectator-wallet-card__bar" aria-hidden="true"><span style={{ width: `${Math.min(accountMetrics.winRate, 100)}%` }} /></div>
          <p className="spectator-meta">{walletState.error || (Number(walletState.balance) > 0 ? "Your balance is ready for upcoming predictions." : "Deposit tokens to start making predictions.")}</p>
          <div className="spectator-wallet-card__split">
            <span>Prediction win rate</span>
            <strong>{winRateLabel}</strong>
          </div>
          <Link className="spectator-button" to="/spectator/deposit">View Deposit</Link>
        </aside>

        <article className="spectator-card spectator-popular-card">
          <div className="spectator-card__header">
            <div>
              <p className="spectator-eyebrow">Public Picks</p>
              <h2>Market favorites</h2>
            </div>
          </div>
          <ul className="spectator-list">
            {topPicks.map((pick) => (
              <li className="spectator-list__item" key={pick.name}>
                <img className="spectator-list__thumb" src={pick.image} alt={pick.name} />
                <div>
                  <h3>{pick.name}</h3>
                  <span className="spectator-meta">{pick.meta}</span>
                </div>
                <span className="spectator-badge">{pick.odds}</span>
              </li>
            ))}
          </ul>
        </article>
      </div>

      <div className="spectator-feature-strip">
        <article className="spectator-feature-strip__image">
          <img src={raceImages[1]} alt="Racecourse event overview" />
        </article>
        <article className="spectator-feature-strip__content">
          <span className="spectator-badge"><Trophy size={14} /> Featured tournament</span>
          <h2>Wolverhampton Night Circuit</h2>
          <p>Track the June 15 opening card, $500,000 prize pool, and the first 12 confirmed horses.</p>
          <Link className="spectator-button spectator-button--primary" to="/spectator/tournaments">
            Tournament Details
            <ArrowRight size={17} />
          </Link>
        </article>
        <article className="spectator-feature-strip__meta">
          <CalendarDays size={20} />
          <strong>June 15</strong>
          <span>Opening date</span>
        </article>
      </div>

      <div className="spectator-overview-actions spectator-overview-actions--redesign">
        {quickActions.map((action, index) => (
          <Link className="spectator-overview-action" key={action.label} to={action.to}>
            <span>{String(index + 1).padStart(2, "0")}</span>
            <strong>{action.label}</strong>
            <small>{action.meta}</small>
            <Sparkles size={16} aria-hidden="true" />
          </Link>
        ))}
      </div>
    </section>
  );
};

export default SpectatorHome;
