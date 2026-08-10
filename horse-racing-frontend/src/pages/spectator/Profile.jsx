import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Award, BadgeCheck, Calendar, CreditCard, MapPin, Radio, RefreshCw, Target, TrendingUp, Trophy, UserRound, Wallet } from "lucide-react";
import { walletApi } from "../../api/walletApi.js";
import { useAuth } from "../../auth/AuthContext.jsx";
import {
  formatTokenAmount,
  formatTransactionAmount,
  formatTransactionDate,
  getWalletBalance,
  transactionLabel,
} from "./walletFormatters.js";
import "./spectator.css";

const spectator = {
  name: "Guest User",
  username: "@guest.spectator",
  tier: "Gold Spectator",
  joined: "Joined May 2026",
  email: "guest@horseracing.example",
  location: "Ho Chi Minh City, VN",
  balance: "1,280 pts",
  totalWon: "$4,860",
  winRate: "62%",
  predictions: 48,
  trustScore: "94.6",
  nextRace: "Emerald Sprint",
};

const activePredictions = [
  { race: "Emerald Sprint", pick: "Thunderbolt", stake: "200 pts", potential: "420 pts", status: "Open" },
  { race: "Derby Trial", pick: "Silver Flash", stake: "180 pts", potential: "504 pts", status: "Pending" },
  { race: "Worcester Chase", pick: "Golden Gallop", stake: "120 pts", potential: "408 pts", status: "Locked" },
];

const Profile = () => {
  const { user } = useAuth();
  const [walletState, setWalletState] = useState({ balance: null, isLoading: true, error: "" });
  const [transactionsState, setTransactionsState] = useState({ transactions: [], isLoading: true, error: "" });

  const displayUser = {
    name: user?.full_name || spectator.name,
    username: user?.email ? `@${user.email.split("@")[0]}` : spectator.username,
    email: user?.email || spectator.email,
    joined: user?.created_at ? `Joined ${new Date(user.created_at).toLocaleDateString(undefined, { month: "short", year: "numeric" })}` : spectator.joined,
  };

  async function loadWalletData() {
    setWalletState((current) => ({ ...current, isLoading: true, error: "" }));
    setTransactionsState((current) => ({ ...current, isLoading: true, error: "" }));

    try {
      const [walletPayload, transactionPayload] = await Promise.all([
        walletApi.getMyWallet(),
        walletApi.getTransactions({ page: 1, limit: 6 }),
      ]);

      setWalletState({ balance: getWalletBalance(walletPayload), isLoading: false, error: "" });
      setTransactionsState({
        transactions: transactionPayload.transactions || [],
        isLoading: false,
        error: "",
      });
    } catch (error) {
      setWalletState((current) => ({
        ...current,
        isLoading: false,
        error: error.message || "Unable to load wallet.",
      }));
      setTransactionsState((current) => ({
        ...current,
        isLoading: false,
        error: error.message || "Unable to load wallet transactions.",
      }));
    }
  }

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setWalletState((current) => ({ ...current, isLoading: true, error: "" }));
      setTransactionsState((current) => ({ ...current, isLoading: true, error: "" }));

      try {
        const [walletPayload, transactionPayload] = await Promise.all([
          walletApi.getMyWallet(),
          walletApi.getTransactions({ page: 1, limit: 6 }),
        ]);

        if (cancelled) return;
        setWalletState({ balance: getWalletBalance(walletPayload), isLoading: false, error: "" });
        setTransactionsState({
          transactions: transactionPayload.transactions || [],
          isLoading: false,
          error: "",
        });
      } catch (error) {
        if (cancelled) return;
        setWalletState((current) => ({
          ...current,
          isLoading: false,
          error: error.message || "Unable to load wallet.",
        }));
        setTransactionsState((current) => ({
          ...current,
          isLoading: false,
          error: error.message || "Unable to load wallet transactions.",
        }));
      }
    }

    load();
    return () => { cancelled = true; };
  }, []);

  const walletBalanceLabel = walletState.isLoading ? "Loading..." : formatTokenAmount(walletState.balance);
  const completedTransactions = useMemo(
    () => transactionsState.transactions.filter((transaction) => transaction.status === "completed"),
    [transactionsState.transactions]
  );
  const totalRewards = completedTransactions.reduce((sum, transaction) => {
    if (!["bet_win", "race_prize"].includes(transaction.transaction_type)) return sum;
    return sum + Number(transaction.amount || 0);
  }, 0);
  const stats = [
    { label: "Wallet balance", value: walletBalanceLabel, note: walletState.error || "Available for predictions", icon: Wallet },
    { label: "Rewards earned", value: formatTokenAmount(totalRewards), note: "Settled wallet credits", icon: Trophy },
    { label: "Prediction rate", value: spectator.winRate, note: "Last 30 race predictions", icon: TrendingUp },
    { label: "Wallet logs", value: transactionsState.isLoading ? "--" : transactionsState.transactions.length, note: "Recent backend transactions", icon: CreditCard },
  ];

  return (
    <section className="spectator-page profile-page">
      <div className="profile-hero">
        <div className="profile-identity">
          <div className="profile-avatar" aria-hidden="true">
            <UserRound size={42} />
          </div>
          <div>
            <p className="spectator-eyebrow">Spectator profile</p>
            <h1 className="spectator-title">{displayUser.name}</h1>
            <p className="spectator-copy profile-copy">
              Track spectator details, reward balance, active predictions, race history, and wallet movement from one focused profile.
            </p>
            <div className="profile-tags">
              <span className="spectator-badge spectator-badge--amber"><Award size={14} /> {spectator.tier}</span>
              <span className="spectator-badge"><Calendar size={14} /> {displayUser.joined}</span>
              <span className="spectator-badge spectator-badge--green"><BadgeCheck size={14} /> Verified</span>
            </div>
            <div className="profile-identity-actions">
              <Link className="spectator-button spectator-button--primary" to="/choose-role">
                <RefreshCw size={16} aria-hidden="true" />
                Switch role
              </Link>
              <Link className="spectator-button profile-role-access-button" to="/spectator/role-applications">
                <BadgeCheck size={16} aria-hidden="true" />
                Role Access
              </Link>
            </div>
          </div>
        </div>

        <aside className="profile-wallet-card">
          <span>Current balance</span>
          <strong>{walletBalanceLabel}</strong>
          <small>{walletState.error || `Rewards earned: ${formatTokenAmount(totalRewards)}`}</small>
          <div className="profile-wallet-card__meta">
            <span><Target size={14} /> Score {spectator.trustScore}</span>
            <span><Radio size={14} /> {spectator.nextRace}</span>
          </div>
          <div className="profile-wallet-actions">
            <Link className="spectator-button spectator-button--primary" to="/spectator/deposit">
              Deposit
            </Link>
            <Link className="spectator-button" to="/spectator/predictions">
              Prediction
            </Link>
            <Link className="spectator-button" to="/spectator/rewards">
              Rewards
            </Link>
          </div>
        </aside>
      </div>

      <div className="profile-stat-grid">
        {stats.map((item) => {
          const Icon = item.icon;
          return (
            <article className="profile-stat-card" key={item.label}>
              <div className="profile-stat-card__icon"><Icon size={20} /></div>
              <span>{item.label}</span>
              <strong>{item.value}</strong>
              <small>{item.note}</small>
            </article>
          );
        })}
      </div>

      <div className="profile-account-ledger-layout">
        <div className="profile-column-stack">
          <article className="spectator-card">
            <div className="spectator-card__header">
              <h2>Spectator details</h2>
              <span className="spectator-badge">Account</span>
            </div>
            <div className="profile-detail-grid">
              <div><span>Username</span><strong>{displayUser.username}</strong></div>
              <div><span>Email</span><strong>{displayUser.email}</strong></div>
              <div><span><MapPin size={13} /> Location</span><strong>{spectator.location}</strong></div>
              <div><span>Tier</span><strong>{spectator.tier}</strong></div>
            </div>
          </article>

          <article className="spectator-card">
            <div className="spectator-card__header">
              <h2>Active predictions</h2>
              <span className="spectator-badge">{activePredictions.length} Tracking</span>
            </div>
            <ul className="spectator-list">
              {activePredictions.map((prediction) => (
                <li className="spectator-list__item profile-prediction-item" key={`${prediction.race}-${prediction.pick}`}>
                  <span className="spectator-rank">{prediction.stake.replace(" pts", "")}</span>
                  <div>
                    <h3>{prediction.race}</h3>
                    <span className="spectator-meta">Pick: {prediction.pick} - Potential {prediction.potential}</span>
                  </div>
                  <span className={`spectator-badge ${prediction.status === "Open" ? "spectator-badge--green" : "spectator-badge--amber"}`}>{prediction.status}</span>
                </li>
              ))}
            </ul>
          </article>
        </div>

        <article className="spectator-card profile-transactions-card">
          <div className="spectator-card__header">
            <h2>Wallet transactions</h2>
            <button className="spectator-badge profile-refresh-button" disabled={transactionsState.isLoading} type="button" onClick={loadWalletData}>
              <RefreshCw size={13} /> Refresh
            </button>
          </div>
          <div className="profile-history">
            {transactionsState.isLoading && <div><span>Loading</span><strong>Wallet history</strong><small>Fetching latest transactions</small><b>--</b></div>}
            {!transactionsState.isLoading && transactionsState.error && <div><span>Error</span><strong>Unable to load transactions</strong><small>{transactionsState.error}</small><b>--</b></div>}
            {!transactionsState.isLoading && !transactionsState.error && !transactionsState.transactions.length && <div><span>Empty</span><strong>No wallet transactions yet</strong><small>Deposits, predictions, payouts, and redemptions will appear here.</small><b>0 TOKEN</b></div>}
            {!transactionsState.isLoading && !transactionsState.error && transactionsState.transactions.map((transaction) => (
              <div key={transaction._id || transaction.reference_id || `${transaction.transaction_type}-${transaction.created_at}`}>
                <span>{formatTransactionDate(transaction.created_at)}</span>
                <strong>{transactionLabel(transaction.transaction_type)}</strong>
                <small>{transaction.note || transaction.reference_id || transaction.status}</small>
                <b className={transaction.direction === "credit" ? "profile-history__won" : ""}>{formatTransactionAmount(transaction)}</b>
              </div>
            ))}
          </div>
        </article>
      </div>
    </section>
  );
};

export default Profile;
