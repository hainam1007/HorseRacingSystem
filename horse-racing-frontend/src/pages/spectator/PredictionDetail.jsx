import { useEffect, useMemo, useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  Check,
  CheckCircle2,
  CircleDollarSign,
  Flag,
  Info,
  LockKeyhole,
  ReceiptText,
  ShieldCheck,
  Trash2,
  UsersRound,
  WalletCards,
  X,
} from "lucide-react";
import { CONNECTION_STATES } from "../../realtime/socketEvents.js";
import { useAuth } from "../../auth/AuthContext.jsx";
import { betApi } from "../../api/betApi.js";
import { spectatorApi } from "../../api/spectatorApi.js";
import { walletApi } from "../../api/walletApi.js";
import { BETTING_STATUS, RACE_STATUS, normalizeBettingMarketStatus } from "./race/raceStatus.js";
import { useSpectatorRaceMarkets } from "./race/useSpectatorRaceMarkets.js";
import { tournamentRaces, tournaments } from "./tournamentData.js";
import { mockContenders } from "./live-race/mockRaceFixtures.js";
import { useMockRaceSession } from "./live-race/useMockRaceSession.js";
import { getBetType, isSelectionComplete, updateSelection } from "./betting/fixedOddsRules.js";
import { createMockFixedOddsMarket, getMarketOdds } from "./betting/mockFixedOddsMarket.js";
import { FIXED_ODDS_CONTRACT_VERSION, FIXED_ODDS_MARKET_STATES, ODDS_CHANGE_POLICY, PAYOUT_ROUNDING, validateAcceptedBetReceipt, validateBackendBetReceipt, validateFixedOddsMarket } from "./betting/fixedOddsContract.js";
import { getHorseJockeyImage } from "./spectatorAdapters.js";
import "./spectator.css";

const stakeOptions = [50, 100, 200, 500];
const formatPoints = (value, currency = "PTS") => {
  const label = currency === "PTS" ? "pts" : currency;
  return `${Number(value || 0).toLocaleString()} ${label}`;
};
const roundTokenAmount = (value) => Math.round(Number(value || 0) * 100) / 100;
const formatCountdown = (milliseconds) => {
  if (milliseconds == null) return "--";
  const seconds = Math.max(0, Math.ceil(milliseconds / 1000));
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
};

const connectionLabels = {
  [CONNECTION_STATES.CONNECTING]: "Connecting",
  [CONNECTION_STATES.CONNECTED]: "Connected",
  [CONNECTION_STATES.RECONNECTING]: "Reconnecting",
  [CONNECTION_STATES.DISCONNECTED]: "Disconnected",
  [CONNECTION_STATES.ERROR]: "Connection error",
};

function getEntityId(value) {
  if (!value) return "";
  if (typeof value === "string") return value;
  return value._id || value.id || "";
}

function getEntityName(value, fallback = "") {
  if (!value || typeof value === "string") return fallback;
  return value.name || value.full_name || fallback;
}

function normalizeProbability(value) {
  const probability = Number(value || 0);
  if (!Number.isFinite(probability)) return 0;
  return probability <= 1 ? Math.round(probability * 100) : Math.round(probability);
}

function getMarketCurrency(apiMarket, race) {
  return String(apiMarket?.currency || race?.bettingMarket?.currency || "PTS").toUpperCase();
}

function getTimestamp(value) {
  if (!value) return null;
  const timestamp = new Date(value).getTime();
  return Number.isNaN(timestamp) ? null : timestamp;
}

function toRunnerFromOdds(entry, index) {
  const horseId = getEntityId(entry.horse_id);
  const horseName = entry.horse_name || getEntityName(entry.horse_id, `Runner ${index + 1}`);
  return {
    id: horseId,
    horse: horseName,
    jockey: entry.jockey_name || getEntityName(entry.jockey_id, "Jockey pending"),
    owner: "",
    lane: entry.horse_no || index + 1,
    weight: "",
    form: entry.probability_rank ? `#${entry.probability_rank}` : "-",
    probability: normalizeProbability(entry.win_probability),
    image: getHorseJockeyImage(horseId || horseName),
    color: "#f0a15c",
  };
}

function toFixedOddsMarket(apiMarket, race) {
  const receivedAt = Date.now();
  const odds = Array.isArray(apiMarket?.odds) ? apiMarket.odds : [];
  const activeOdds = odds
    .map((entry) => ({ horseId: getEntityId(entry.horse_id), gameOdds: Number(entry.game_odds) }))
    .filter((item) => item.horseId && Number.isFinite(item.gameOdds));
  const selections = Object.fromEntries(activeOdds.map((item) => [item.horseId, item.gameOdds]));
  const runnerStatuses = Object.fromEntries(activeOdds.map((item) => [item.horseId, "active"]));
  const minStake = Number(apiMarket?.min_stake ?? apiMarket?.minStake ?? race?.bettingMarket?.minStake ?? 1);
  const maxStake = Number(apiMarket?.max_stake ?? apiMarket?.maxStake ?? race?.bettingMarket?.maxStake ?? 1000);

  return {
    contractVersion: FIXED_ODDS_CONTRACT_VERSION,
    id: getEntityId(apiMarket) || `market-${race?.id}-fixed`,
    raceId: getEntityId(apiMarket?.race_id) || race?.id,
    status: normalizeBettingMarketStatus(apiMarket?.status),
    currency: getMarketCurrency(apiMarket, race),
    minStake: Number.isFinite(minStake) && minStake > 0 ? minStake : 1,
    maxStake: Number.isFinite(maxStake) && maxStake > 0 ? maxStake : 1000,
    closesAt: apiMarket?.closes_at || race?.bettingMarket?.closesAt || race?.bettingClosesAt || null,
    serverTime: apiMarket?.server_time || apiMarket?.serverTime || null,
    receivedAt,
    oddsChangePolicy: ODDS_CHANGE_POLICY,
    payoutRounding: PAYOUT_ROUNDING,
    runnerStatuses,
    supportedBetTypes: ["win"],
    selections: { win: selections },
    runners: odds.map(toRunnerFromOdds).filter((runner) => runner.id),
    source: "api",
  };
}

function toReceiptFromBet(bet, fallback = {}) {
  const id = getEntityId(bet) || fallback.id || `${Date.now()}`;
  const odds = Number(bet?.odds_snapshot?.game_odds ?? fallback.odds ?? 0);
  const stake = Number(bet?.stake_amount ?? fallback.stake ?? 0);
  const payout = Number(bet?.payout_amount ?? bet?.potential_payout ?? fallback.payout ?? 0);
  const horseName =
    bet?.odds_snapshot?.horse_name ||
    getEntityName(bet?.predicted_horse_id, fallback.selection || "Selected runner");
  const currency =
    bet?.odds_snapshot?.currency ||
    bet?.race_id?.betting_market?.currency ||
    fallback.currency ||
    "TOKEN";

  return {
    id,
    race: getEntityName(bet?.race_id, fallback.race || "Race"),
    betType: "Win",
    selection: horseName,
    stake,
    odds,
    payout,
    payoutAmount: bet?.payout_amount,
    currency,
    status: bet?.status ? bet.status[0].toUpperCase() + bet.status.slice(1) : fallback.status || "Pending",
  };
}

function ConfirmModal({ isSubmitting, payload, onClose, onConfirm }) {
  if (!payload) return null;
  return (
    <div className="prediction-confirm-backdrop" role="presentation" onMouseDown={onClose}>
      <section className="prediction-confirm-modal" role="dialog" aria-modal="true" aria-labelledby="prediction-confirm-title" onMouseDown={(event) => event.stopPropagation()}>
        <button className="prediction-confirm-modal__close" disabled={isSubmitting} type="button" aria-label="Close confirmation" onClick={onClose}><X size={18} /></button>
        <div className="prediction-confirm-modal__intro">
          <span className="prediction-confirm-modal__badge"><ReceiptText size={14} /> Review prediction</span>
          <h2 id="prediction-confirm-title">Confirm fixed odds</h2>
          <p>The accepted receipt keeps these odds even if the market changes later.</p>
        </div>
        <div className="prediction-confirm-hero">
          <div><span>Potential return</span><strong>{formatPoints(payload.payout, payload.currency)}</strong></div>
          <div><span>Fixed odds</span><strong>{payload.odds.toFixed(2)}x</strong></div>
        </div>
        <div className="prediction-confirm-summary">
          <div><span>Race</span><strong>{payload.race}</strong></div>
          <div><span>Prediction type</span><strong>{payload.betType}</strong></div>
          <div><span>Selection</span><strong>{payload.selection}</strong></div>
          <div><span>Stake</span><strong>{formatPoints(payload.stake, payload.currency)}</strong></div>
        </div>
        <div className="prediction-confirm-actions">
          <button className="spectator-button" disabled={isSubmitting} type="button" onClick={onClose}>Cancel</button>
          <button className="spectator-button spectator-button--primary" disabled={isSubmitting} type="button" onClick={onConfirm}>{isSubmitting ? "Processing..." : "Place fixed-odds prediction"}</button>
        </div>
      </section>
    </div>
  );
}

function SelectionSlots({ contendersById, disabled, onClear, selection, type }) {
  return (
    <div className="fixed-odds-slots fixed-odds-slots--win-only" aria-label={`${type.label} selection`}>
      {type.slots.map((slot, index) => {
        const horse = contendersById.get(selection[index]);
        return (
          <div className={`fixed-odds-slot ${horse ? "is-filled" : ""}`} key={slot}>
            <span>{slot}</span>
            {horse ? <><img src={horse.image} alt="" /><strong>{horse.horse}</strong></> : <strong>Select a runner</strong>}
            {horse && <button className="fixed-odds-slot__remove" disabled={disabled} type="button" aria-label={`Remove ${horse.horse}`} onClick={() => onClear(horse.id)}><X size={14} /></button>}
          </div>
        );
      })}
    </div>
  );
}

export default function PredictionDetail() {
  const { raceId } = useParams();
  const auth = useAuth();
  const { isLoading: racesLoading, races } = useSpectatorRaceMarkets();
  const race = races.find((item) => String(item.id) === String(raceId))
    || tournamentRaces.find((item) => String(item.id) === String(raceId));
  const previewTournament = tournaments.find(
    (item) => String(item.id) === String(race?.tournamentId)
  ) || tournaments[0];
  const tournament = {
    id: race?.tournamentId || previewTournament?.id || "",
    name: race?.tournamentName || previewTournament?.name || "Tournament",
  };
  const tournamentPath = tournament.id
    ? `/spectator/tournaments/${encodeURIComponent(tournament.id)}`
    : "/spectator/predictions";
  const raceInfoPath = tournament.id
    ? `${tournamentPath}/races/${encodeURIComponent(race?.id || raceId)}`
    : "/spectator/predictions";
  const realtime = useMockRaceSession(race?.id || "missing-race");
  const [selection, setSelection] = useState([]);
  const [stake, setStake] = useState(200);
  const [confirmPayload, setConfirmPayload] = useState(null);
  const [message, setMessage] = useState(null);
  const [receipts, setReceipts] = useState([]);
  const [marketState, setMarketState] = useState({ market: null, isLoading: true, error: "", isPreview: false });
  const [walletState, setWalletState] = useState({ balance: null, isLoading: true, error: "" });
  const [myBetsState, setMyBetsState] = useState({ bets: [], isLoading: true, error: "" });
  const [isSubmittingBet, setIsSubmittingBet] = useState(false);
  const [now, setNow] = useState(Date.now());
  const type = getBetType("win");
  const mockFixedOddsMarket = useMemo(() => createMockFixedOddsMarket(race?.id || "missing-race"), [race?.id]);
  const currentMarket = marketState.market || (marketState.isPreview ? mockFixedOddsMarket : null);
  const marketValidation = useMemo(() => validateFixedOddsMarket(currentMarket, race?.id), [currentMarket, race?.id]);
  const contenders = useMemo(() => {
    if (marketState.isPreview) return currentMarket?.runners?.length ? currentMarket.runners : mockContenders;
    return currentMarket?.runners || [];
  }, [currentMarket, marketState.isPreview]);
  const contendersById = useMemo(() => new Map(contenders.map((horse) => [horse.id, horse])), [contenders]);
  const selectedHorses = selection.map((id) => contendersById.get(id)).filter(Boolean);
  const displayedReceipts = useMemo(() => {
    const byId = new Map();
    [...receipts, ...myBetsState.bets].forEach((receipt) => {
      if (receipt?.id) byId.set(String(receipt.id), receipt);
    });
    return Array.from(byId.values());
  }, [myBetsState.bets, receipts]);
  const selectionComplete = isSelectionComplete(selection, type);
  const fixedOdds = selectionComplete && currentMarket ? getMarketOdds(currentMarket, type, selection) : 0;
  const stakeValue = Number(stake);
  const walletBalance = Number(walletState.balance ?? (import.meta.env.DEV ? realtime.balance : 0));
  const minStake = Number(currentMarket?.minStake || realtime.minStake);
  const maxStake = Number(currentMarket?.maxStake || realtime.maxStake);
  const stakeValid = String(stake).trim() !== "" && Number.isFinite(stakeValue) && stakeValue >= minStake && stakeValue <= maxStake && stakeValue <= walletBalance;
  const potentialReturn = fixedOdds ? roundTokenAmount(stakeValue * fixedOdds) : 0;
  const marketCurrency = currentMarket?.currency || "PTS";
  const isSpectator = auth.roles.includes("spectator");
  const liveTransportOpen = marketState.isPreview ? realtime.isMarketOpen : true;
  const liveTransportConnected = marketState.isPreview ? realtime.connectionState === CONNECTION_STATES.CONNECTED : true;
  const serverTimeMs = !marketState.isPreview ? getTimestamp(currentMarket?.serverTime) : null;
  const serverOffsetMs = serverTimeMs == null ? 0 : serverTimeMs - (currentMarket.receivedAt || now);
  const closesAtMs = !marketState.isPreview ? getTimestamp(currentMarket?.closesAt) : null;
  const marketRemainingMs = closesAtMs == null ? null : Math.max(0, closesAtMs - (now + serverOffsetMs));
  const localMarketOpen = marketState.isPreview || closesAtMs == null || marketRemainingMs > 0;
  const marketCountdown = marketState.isPreview ? realtime.countdown : formatCountdown(marketRemainingMs);
  const marketOpen = marketValidation.isValid
    && currentMarket?.status === FIXED_ODDS_MARKET_STATES.OPEN
    && race?.raceStatus === RACE_STATUS.SCHEDULED
    && race?.bettingStatus === BETTING_STATUS.OPEN
    && liveTransportOpen
    && localMarketOpen
    && isSpectator;
  const submitting = realtime.isSubmittingBet || isSubmittingBet;
  const formDisabled = !marketOpen || submitting;
  const canSubmit = marketOpen && selectionComplete && stakeValid && fixedOdds > 0 && !submitting;

  useEffect(() => {
    if (!marketOpen) setConfirmPayload(null);
  }, [marketOpen]);

  useEffect(() => {
    if (marketState.isPreview || !currentMarket?.closesAt) return undefined;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [currentMarket?.closesAt, marketState.isPreview]);

  useEffect(() => {
    if (!currentMarket) return;
    setSelection((current) => current.filter((horseId) => currentMarket.runnerStatuses[horseId] === "active"));
  }, [currentMarket, realtime.marketState]);

  useEffect(() => {
    let cancelled = false;

    async function loadMarket() {
      if (!race?.id) return;
      setMarketState((current) => ({ ...current, isLoading: true, error: "" }));
      try {
        const payload = await spectatorApi.getRaceOdds(race.id);
        if (cancelled) return;
        const market = toFixedOddsMarket(payload.market || payload, race);
        setMarketState({ market, isLoading: false, error: "", isPreview: false });
      } catch (error) {
        if (cancelled) return;
        if (import.meta.env.DEV) {
          setMarketState({
            market: mockFixedOddsMarket,
            isLoading: false,
            error: "Odds API is not available. Showing development preview odds.",
            isPreview: true,
          });
        } else {
          setMarketState({ market: null, isLoading: false, error: error.message || "Unable to load race odds.", isPreview: false });
        }
      }
    }

    loadMarket();
    return () => { cancelled = true; };
  }, [mockFixedOddsMarket, race]);

  useEffect(() => {
    let cancelled = false;

    async function loadWallet() {
      if (marketState.isLoading) return;
      if (marketState.isPreview) {
        setWalletState({ balance: realtime.balance, isLoading: false, error: "" });
        return;
      }

      setWalletState((current) => ({ ...current, isLoading: true, error: "" }));
      try {
        const payload = await walletApi.getMyWallet();
        if (!cancelled) {
          const balance = Number(payload.wallet?.token_balance ?? payload.token_balance ?? payload.balance ?? 0);
          setWalletState({ balance, isLoading: false, error: "" });
        }
      } catch (error) {
        if (!cancelled) {
          setWalletState({
            balance: import.meta.env.DEV ? realtime.balance : null,
            isLoading: false,
            error: error.message || "Unable to load wallet balance.",
          });
        }
      }
    }

    loadWallet();
    return () => { cancelled = true; };
  }, [marketState.isLoading, marketState.isPreview, realtime.balance]);

  useEffect(() => {
    let cancelled = false;

    async function loadMyBets() {
      if (!race?.id || marketState.isLoading || marketState.isPreview) {
        setMyBetsState({ bets: [], isLoading: false, error: "" });
        return;
      }

      setMyBetsState((current) => ({ ...current, isLoading: true, error: "" }));
      try {
        const payload = await betApi.getMyBets({ race_id: race.id });
        if (!cancelled) {
          const rows = Array.isArray(payload) ? payload : Array.isArray(payload.bets) ? payload.bets : [];
          const bets = rows.map((bet) => toReceiptFromBet(bet, { currency: marketCurrency, race: race.name }));
          setMyBetsState({ bets, isLoading: false, error: "" });
        }
      } catch (error) {
        if (!cancelled) {
          setMyBetsState({ bets: [], isLoading: false, error: error.message || "Unable to load your predictions." });
        }
      }
    }

    loadMyBets();
    return () => { cancelled = true; };
  }, [marketState.isLoading, marketState.isPreview, marketCurrency, race?.id, race?.name]);

  if (racesLoading) return null;
  if (!race) return <Navigate to="/spectator/predictions" replace />;

  const handleSelect = (horseId) => {
    if (formDisabled) return;
    setSelection((current) => updateSelection(current, horseId, type));
    setMessage(null);
  };

  const handleReview = () => {
    if (!canSubmit) return;
    setConfirmPayload({
      race: race.name,
      betType: type.label,
      selection: selectedHorses.map((horse) => horse.horse).join(""),
      horseIds: selection,
      stake: stakeValue,
      currency: marketCurrency,
      odds: fixedOdds,
      payout: potentialReturn,
    });
  };

  const handleConfirm = async () => {
    if (!confirmPayload || !marketOpen) return;
    setIsSubmittingBet(true);
    try {
      let acceptedReceipt;
      let nextBalance = walletBalance;

      if (marketState.isPreview) {
        const request = {
          market_id: currentMarket.id,
          bet_type: type.id,
          client_request_id: globalThis.crypto?.randomUUID?.() || `mock-${Date.now()}`,
          displayed_odds: confirmPayload.odds,
          horse_ids: confirmPayload.horseIds,
          race_id: race.id,
          stake: confirmPayload.stake,
        };
        const response = await realtime.submitBet(request);
        const receiptValidation = validateAcceptedBetReceipt(response, request);
        if (!receiptValidation.isValid) throw new Error(`Invalid accepted receipt: ${receiptValidation.errors.join(" ")}`);
        acceptedReceipt = {
          id: response.bet.id,
          ...confirmPayload,
          odds: response.bet.accepted_odds,
          payout: response.bet.potential_return,
          status: "Accepted",
        };
        nextBalance = response.wallet.balance;
      } else {
        const request = {
          race_id: race.id,
          horse_id: confirmPayload.horseIds[0],
          stake_amount: confirmPayload.stake,
        };
        const response = await betApi.placeBet(request);
        const receiptValidation = validateBackendBetReceipt(response, request);
        if (!receiptValidation.isValid) throw new Error(`Invalid backend prediction receipt: ${receiptValidation.errors.join(" ")}`);
        acceptedReceipt = toReceiptFromBet(response.bet, confirmPayload);
        nextBalance = Number(response.wallet?.token_balance ?? walletBalance);
        setMyBetsState((current) => ({
          ...current,
          bets: [acceptedReceipt, ...current.bets.filter((bet) => String(bet.id) !== String(acceptedReceipt.id))],
        }));
      }

      setWalletState((current) => ({ ...current, balance: nextBalance, isLoading: false }));
      setReceipts((current) => [acceptedReceipt, ...current.filter((receipt) => String(receipt.id) !== String(acceptedReceipt.id))]);
      setConfirmPayload(null);
      setSelection([]);
      setMessage({ type: "success", text: `Prediction accepted at ${acceptedReceipt.odds.toFixed(2)}x. Balance: ${formatPoints(nextBalance, marketCurrency)}.` });
    } catch (error) {
      setConfirmPayload(null);
      setMessage({ type: "error", text: error.message || "The prediction was rejected." });
    } finally {
      setIsSubmittingBet(false);
    }
  };

  const hint = !marketOpen
    ? marketState.isLoading ? "Loading the latest odds market."
      : marketState.error ? marketState.error
        : !isSpectator ? "A spectator role is required to place a prediction."
          : !liveTransportConnected ? "A live connection is required before predicting." : "This market is locked. Selections and stake controls are disabled."
    : !selectionComplete ? "Select one runner to win."
      : !stakeValid ? `Stake must be ${formatPoints(minStake, marketCurrency)} to ${formatPoints(Math.min(maxStake, walletBalance), marketCurrency)}.`
        : "Review the slip before confirming. Odds are finalized by the server.";

  return (
    <section className="spectator-page fixed-odds-page">
      <div className="fixed-odds-topline">
        <Link className="tournament-detail-back" to={tournamentPath}><ArrowLeft size={16} /> Back to tournament</Link>
        <div className={`fixed-odds-connection fixed-odds-connection--${realtime.connectionState}`}><span className="live-race-dot" /> {connectionLabels[realtime.connectionState]}</div>
      </div>

      <header className="fixed-odds-header">
        <div>
          <p className="spectator-eyebrow">Fixed-odds market / {tournament.name}</p>
          <h1>{race.name}</h1>
          <div className="fixed-odds-header__meta">
            <span><CalendarDays size={14} /> {race.time}</span><span><Flag size={14} /> {race.distance}</span><span><UsersRound size={14} /> {contenders.length} runners</span>
          </div>
        </div>
        <div className="fixed-odds-clock"><span>Market locks in</span><strong>{marketCountdown}</strong><small>{marketOpen ? "Prediction open" : "Market locked"}</small></div>
      </header>

      {(realtime.error || realtime.connectionState === CONNECTION_STATES.DISCONNECTED) && <div className="live-race-state-message live-race-state-message--error" role="alert">{realtime.error || "Connection lost. Prediction remains locked until a fresh server state is received."}</div>}
      {marketState.error && <div className={`live-race-state-message ${marketState.isPreview ? "" : "live-race-state-message--error"}`} role={marketState.isPreview ? "status" : "alert"}>{marketState.error}</div>}
      {walletState.error && !import.meta.env.DEV && <div className="live-race-state-message live-race-state-message--error" role="alert">{walletState.error}</div>}
      {!marketState.isLoading && !marketValidation.isValid && <div className="live-race-state-message live-race-state-message--error" role="alert">Market contract mismatch. Prediction is disabled until a valid snapshot is received.</div>}

      <div className="fixed-odds-workspace">
        <main className="fixed-odds-board">
          <div className="fixed-odds-board__heading">
            <div><span className="live-race-kicker"><CircleDollarSign size={14} /> Odds board</span><h2>Win market</h2></div>
            <Link to={raceInfoPath}>View race track <ArrowRight size={15} /></Link>
          </div>

          <div className="fixed-odds-market-note"><Info size={15} /><span><strong>Win only:</strong> Pick the horse you expect to finish first. Other prediction types are disabled until backend odds and settlement rules exist.</span></div>

          <SelectionSlots contendersById={contendersById} disabled={formDisabled} onClear={handleSelect} selection={selection} type={type} />

          <section className="fixed-odds-runners" aria-label="Runner odds">
            <div className="fixed-odds-runners__labels"><span>Runner</span><span>Form</span><span>Win odds</span></div>
            {!marketState.isLoading && contenders.length === 0 && (
              <div className="live-race-state-message" role="status">
                This odds snapshot has no runners. Ask an administrator to regenerate the market after entries are finalized.
              </div>
            )}
            {contenders.map((horse) => {
              const isUnavailable = currentMarket?.runnerStatuses?.[horse.id] !== "active";
              const selected = selection.includes(horse.id);
              const singlePrice = currentMarket?.selections?.[type.id]?.[horse.id];
              return <article className={`fixed-odds-runner ${selected ? "is-selected" : ""} ${isUnavailable ? "is-unavailable" : ""}`} key={horse.id}>
                <span className="fixed-odds-runner__lane">{horse.lane}</span><img src={horse.image} alt="" />
                <div className="fixed-odds-runner__identity"><strong>{horse.horse}</strong><small>{[horse.jockey, horse.weight].filter(Boolean).join(" / ") || "Runner profile"}</small></div>
                <div className="fixed-odds-runner__form"><strong>{horse.form}</strong><small>{horse.probability}% model</small></div>
                <button disabled={formDisabled || isUnavailable} type="button" onClick={() => handleSelect(horse.id)}>{isUnavailable ? "Scratched" : selected ? <><Check size={15} /> Selected</> : singlePrice ? `${singlePrice.toFixed(2)}x` : "Add"}</button>
              </article>;
            })}
          </section>
        </main>

        <aside className={`fixed-odds-slip ${formDisabled ? "is-locked" : ""}`}>
          <div className="fixed-odds-slip__wallet"><span><WalletCards size={15} /> Available balance</span><strong>{walletState.isLoading ? "--" : formatPoints(walletBalance, marketCurrency)}</strong><small>{marketState.isPreview ? "Preview wallet" : "Updated by wallet API"}</small></div>
          <div className="fixed-odds-slip__heading"><span className="live-race-kicker"><ReceiptText size={14} /> Prediction slip</span><h2>Win prediction</h2><p>{selectedHorses.length ? "Runner selected" : "Choose one winner"}</p></div>

          <div className="fixed-odds-slip__selections">
            {type.slots.map((slot, index) => {
              const horse = selectedHorses[index];
              return <div key={slot}><span>{slot}</span><strong>{horse?.horse || "Not selected"}</strong>{horse && <button disabled={formDisabled} type="button" aria-label={`Remove ${horse.horse}`} onClick={() => handleSelect(horse.id)}><Trash2 size={14} /></button>}</div>;
            })}
          </div>

          <label className="fixed-odds-stake" htmlFor="fixed-odds-stake"><span>Stake</span><div><input aria-invalid={String(stake).trim() !== "" && !stakeValid} disabled={formDisabled} id="fixed-odds-stake" min={minStake} max={Math.min(maxStake, walletBalance)} type="number" value={stake} onChange={(event) => { setStake(event.target.value); setMessage(null); }} /><small>{marketCurrency}</small></div></label>
          <div className="fixed-odds-quick-stakes">{stakeOptions.map((value) => <button disabled={formDisabled || value > walletBalance} key={value} type="button" onClick={() => setStake(value)}>{value}</button>)}</div>

          <div className="fixed-odds-slip__totals">
            <div><span>Fixed odds</span><strong>{fixedOdds ? `${fixedOdds.toFixed(2)}x` : "--"}</strong></div>
            <div><span>Potential return</span><strong>{fixedOdds && stakeValid ? formatPoints(potentialReturn, marketCurrency) : "--"}</strong></div>
          </div>
          <p className="fixed-odds-slip__hint"><Info size={14} /> {hint}</p>
          {message && <p className={`fixed-odds-message fixed-odds-message--${message.type}`} role={message.type === "error" ? "alert" : "status"}>{message.text}</p>}
          <button className="fixed-odds-review" disabled={!canSubmit} type="button" onClick={handleReview}><LockKeyhole size={16} /> Review prediction</button>
          <p className="fixed-odds-security"><ShieldCheck size={14} /><span>Every control locks immediately when the market closes.</span></p>
        </aside>
      </div>

      {(displayedReceipts.length > 0 || myBetsState.isLoading || myBetsState.error) && <section className="fixed-odds-receipts"><div className="live-race-section-heading"><div><span className="live-race-kicker"><CheckCircle2 size={14} /> My predictions</span><h2>Fixed-odds receipts</h2></div><small>{myBetsState.isLoading ? "Loading" : `${displayedReceipts.length} recorded`}</small></div>{myBetsState.error && <p className="fixed-odds-message fixed-odds-message--error" role="alert">{myBetsState.error}</p>}{displayedReceipts.map((receipt) => <article key={receipt.id}><span>{receipt.status}</span><div><strong>{receipt.selection}</strong><small>{receipt.betType} / {receipt.odds.toFixed(2)}x</small></div><b>{formatPoints(receipt.stake, receipt.currency || marketCurrency)}</b></article>)}</section>}

      <ConfirmModal isSubmitting={submitting} payload={confirmPayload} onClose={() => { if (!submitting) setConfirmPayload(null); }} onConfirm={handleConfirm} />
    </section>
  );
}
