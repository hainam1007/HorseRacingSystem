import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MockRaceTransport } from "../../../realtime/MockRaceTransport";
import { CONNECTION_STATES, MARKET_STATES, REALTIME_EVENTS } from "../../../realtime/socketEvents";
import { mockWallet } from "./mockRaceFixtures";

const formatCountdown = (milliseconds) => {
  const seconds = Math.max(0, Math.ceil(milliseconds / 1000));
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
};

export function useMockRaceSession(raceId) {
  const transportRef = useRef(null);
  if (!transportRef.current) transportRef.current = new MockRaceTransport();

  const [connectionState, setConnectionState] = useState(CONNECTION_STATES.CONNECTING);
  const [marketState, setMarketState] = useState(MARKET_STATES.SCHEDULED);
  const [closesAt, setClosesAt] = useState(null);
  const [serverOffsetMs, setServerOffsetMs] = useState(0);
  const [balance, setBalance] = useState(mockWallet.balance);
  const [minStake, setMinStake] = useState(10);
  const [maxStake, setMaxStake] = useState(1000);
  const [raceScript, setRaceScript] = useState(null);
  const [raceResult, setRaceResult] = useState(null);
  const [error, setError] = useState("");
  const [betOutcome, setBetOutcome] = useState(null);
  const [isSubmittingBet, setIsSubmittingBet] = useState(false);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const transport = transportRef.current;
    const cleanups = [
      transport.on(REALTIME_EVENTS.CONNECTION_STATE, setConnectionState),
      transport.on(REALTIME_EVENTS.BETTING_STATE, (payload) => {
        if (payload.race_id !== raceId) return;
        setMarketState(payload.status);
        setClosesAt(new Date(payload.closes_at).getTime());
        setServerOffsetMs(new Date(payload.server_time).getTime() - Date.now());
        setMinStake(payload.min_stake ?? 10);
        setMaxStake(payload.max_stake ?? 1000);
        setError("");
      }),
      transport.on(REALTIME_EVENTS.STOP_BETTING, (payload) => {
        if (payload.race_id !== raceId) return;
        setMarketState(MARKET_STATES.LOCKED);
        setClosesAt(Date.now());
      }),
      transport.on(REALTIME_EVENTS.WALLET_UPDATED, (payload) => setBalance(payload.balance)),
      transport.on(REALTIME_EVENTS.BET_ACCEPTED, (payload) => setBetOutcome({ type: "accepted", payload })),
      transport.on(REALTIME_EVENTS.BET_REJECTED, (payload) => setBetOutcome({ type: "rejected", payload })),
      transport.on(REALTIME_EVENTS.RACE_SCRIPT, (payload) => {
        if (payload.race_id === raceId) setRaceScript(payload);
      }),
      transport.on(REALTIME_EVENTS.RACE_FINISHED, (payload) => {
        if (payload.race_id === raceId) setRaceResult(payload);
      }),
      transport.on(REALTIME_EVENTS.ERROR, (payload) => setError(payload.message || "Realtime connection failed.")),
    ];

    transport.connect();
    transport.joinRace(raceId);
    transport.startScenario(raceId);

    return () => {
      cleanups.forEach((cleanup) => cleanup());
      transport.leaveRace(raceId);
      transport.disconnect();
    };
  }, [raceId]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(timer);
  }, []);

  const remainingMs = closesAt ? Math.max(0, closesAt - (now + serverOffsetMs)) : 0;

  useEffect(() => {
    if (marketState === MARKET_STATES.OPEN && remainingMs === 0) {
      setMarketState(MARKET_STATES.LOCKED);
    }
  }, [marketState, remainingMs]);

  const setScenarioState = useCallback((state) => {
    setError("");
    setBetOutcome(null);
    if (!["disconnected", "error"].includes(state)) {
      setRaceScript(null);
      setRaceResult(null);
    }
    transportRef.current.setScenarioState(state);
  }, []);

  const restartScenario = useCallback(() => {
    setError("");
    setBalance(mockWallet.balance);
    setRaceScript(null);
    setRaceResult(null);
    setBetOutcome(null);
    transportRef.current.startScenario(raceId);
  }, [raceId]);

  const submitBet = useCallback(async (payload) => {
    setIsSubmittingBet(true);
    setBetOutcome(null);
    try {
      return await transportRef.current.submitBet(payload);
    } finally {
      setIsSubmittingBet(false);
    }
  }, []);

  return useMemo(() => ({
    balance,
    betOutcome,
    connectionState,
    countdown: formatCountdown(remainingMs),
    error,
    isMarketOpen: marketState === MARKET_STATES.OPEN && connectionState === CONNECTION_STATES.CONNECTED,
    isSubmittingBet,
    marketState,
    maxStake,
    minStake,
    raceResult,
    raceScript,
    restartScenario,
    setScenarioState,
    submitBet,
  }), [balance, betOutcome, connectionState, error, isSubmittingBet, marketState, maxStake, minStake, raceResult, raceScript, remainingMs, restartScenario, setScenarioState, submitBet]);
}
