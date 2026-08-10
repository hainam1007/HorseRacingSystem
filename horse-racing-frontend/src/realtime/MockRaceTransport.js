import { CONNECTION_STATES, MARKET_STATES, REALTIME_EVENTS } from "./socketEvents";
import { createMockRaceResult, createMockRaceScript, mockWallet } from "../pages/spectator/live-race/mockRaceFixtures";

const mockMarketLockDelay = Number(import.meta.env.VITE_MOCK_MARKET_LOCK_DELAY_MS || 30000);

export class MockRaceTransport {
  constructor() {
    this.listeners = new Map();
    this.timers = new Set();
    this.raceId = null;
    this.connected = false;
    this.marketState = MARKET_STATES.SCHEDULED;
    this.balance = mockWallet.balance;
    this.processedRequests = new Map();
  }

  connect() {
    this.clearTimers();
    this.emitLocal(REALTIME_EVENTS.CONNECTION_STATE, CONNECTION_STATES.CONNECTING);
    this.schedule(() => {
      this.connected = true;
      this.emitLocal(REALTIME_EVENTS.CONNECTION_STATE, CONNECTION_STATES.CONNECTED);
    }, 180);
  }

  disconnect() {
    this.clearTimers();
    this.connected = false;
    this.emitLocal(REALTIME_EVENTS.CONNECTION_STATE, CONNECTION_STATES.DISCONNECTED);
  }

  joinRace(raceId) {
    this.raceId = raceId;
  }

  leaveRace(raceId) {
    if (!raceId || raceId === this.raceId) this.raceId = null;
    this.clearTimers();
  }

  on(eventName, handler) {
    const handlers = this.listeners.get(eventName) || new Set();
    handlers.add(handler);
    this.listeners.set(eventName, handlers);
    return () => this.off(eventName, handler);
  }

  off(eventName, handler) {
    const handlers = this.listeners.get(eventName);
    if (!handlers) return;
    handlers.delete(handler);
    if (!handlers.size) this.listeners.delete(eventName);
  }

  emit(eventName, payload) {
    if (eventName === "restart_mock_scenario") this.startScenario(payload?.race_id || this.raceId);
  }

  startScenario(raceId = this.raceId) {
    if (!raceId) return;
    this.clearTimers();
    this.raceId = raceId;
    this.balance = mockWallet.balance;
    this.processedRequests.clear();
    if (!this.connected) this.connect();
    this.emitLocal(REALTIME_EVENTS.WALLET_UPDATED, {
      balance: this.balance,
      currency: mockWallet.currency,
      reason: "scenario_snapshot",
      transaction_id: `scenario-${raceId}-${Date.now()}`,
      sequence: 100,
    });

    this.schedule(() => this.setScenarioState("open", true), 500);
    this.schedule(() => {
      this.balance += 100;
      this.emitLocal(REALTIME_EVENTS.WALLET_UPDATED, {
      balance: this.balance,
      currency: mockWallet.currency,
      reason: "demo_credit",
      transaction_id: `demo-credit-${raceId}`,
      sequence: 105,
      });
    }, 8000);
    this.schedule(() => this.setScenarioState("locked", true), mockMarketLockDelay);
    this.schedule(() => this.setScenarioState("racing", true), mockMarketLockDelay + 3000);
    this.schedule(() => this.setScenarioState("finished", true), mockMarketLockDelay + 66000);
  }

  setScenarioState(state, preserveTimeline = false) {
    const raceId = this.raceId;
    if (!raceId) return;
    if (!preserveTimeline) this.clearTimers();

    if (state === "disconnected") {
      this.disconnect();
      return;
    }

    if (state === "error") {
      this.connected = false;
      this.emitLocal(REALTIME_EVENTS.CONNECTION_STATE, CONNECTION_STATES.ERROR);
      this.emitLocal(REALTIME_EVENTS.ERROR, { message: "Mock transport connection failed." });
      return;
    }

    if (!this.connected) {
      this.connected = true;
      this.emitLocal(REALTIME_EVENTS.CONNECTION_STATE, CONNECTION_STATES.CONNECTED);
    }

    const now = Date.now();
    if (state === "waiting") {
      this.marketState = MARKET_STATES.SCHEDULED;
      this.emitLocal(REALTIME_EVENTS.BETTING_STATE, this.createBettingState(MARKET_STATES.SCHEDULED, now + 30000, 40));
      return;
    }

    if (state === "open") {
      this.marketState = MARKET_STATES.OPEN;
      this.emitLocal(REALTIME_EVENTS.BETTING_STATE, this.createBettingState(MARKET_STATES.OPEN, now + 30000, 42));
      return;
    }

    this.marketState = MARKET_STATES.LOCKED;
    this.emitLocal(REALTIME_EVENTS.STOP_BETTING, {
      race_id: raceId,
      locked_at: new Date(now).toISOString(),
      reason: "race_starting",
      sequence: 44,
    });

    if (state === "locked") return;

    const startsAt = state === "finished" ? now - 90000 : now + 3000;
    this.emitLocal(REALTIME_EVENTS.RACE_SCRIPT, createMockRaceScript(raceId, startsAt));

    if (state === "finished") {
      this.marketState = MARKET_STATES.SETTLED;
      this.emitLocal(REALTIME_EVENTS.RACE_FINISHED, createMockRaceResult(raceId));
      this.emitLocal(REALTIME_EVENTS.BETTING_STATE, this.createBettingState(MARKET_STATES.SETTLED, now, 45));
    }
  }

  submitBet(payload) {
    if (this.processedRequests.has(payload.client_request_id)) {
      return Promise.resolve(this.processedRequests.get(payload.client_request_id));
    }

    return new Promise((resolve, reject) => {
      window.setTimeout(() => {
        let reason = "";
        if (!this.connected) reason = "Connection lost before the bet was accepted.";
        else if (this.marketState !== MARKET_STATES.OPEN) reason = "Betting is closed for this race.";
        else if (!Number.isFinite(payload.stake) || payload.stake < 10 || payload.stake > 1000) reason = "Stake must be between 10 and 1,000 points.";
        else if (payload.stake > this.balance) reason = "Stake exceeds the available wallet balance.";
        else if (payload.stake > 500) reason = "Mock risk control rejected stakes above 500 points.";

        if (reason) {
          const rejection = { client_request_id: payload.client_request_id, reason };
          this.emitLocal(REALTIME_EVENTS.BET_REJECTED, rejection);
          reject(new Error(reason));
          return;
        }

        this.balance -= payload.stake;
        const transactionId = `mock-tx-${payload.client_request_id}`;
        const accepted = {
          bet: {
            id: `mock-bet-${payload.client_request_id}`,
            ...payload,
            accepted_odds: payload.displayed_odds ?? payload.odds,
            potential_return: Math.round(payload.stake * (payload.displayed_odds ?? payload.odds)),
            status: "accepted",
            accepted_at: new Date().toISOString(),
          },
          wallet: { balance: this.balance, currency: mockWallet.currency },
          transaction_id: transactionId,
        };
        this.processedRequests.set(payload.client_request_id, accepted);
        this.emitLocal(REALTIME_EVENTS.BET_ACCEPTED, accepted);
        this.emitLocal(REALTIME_EVENTS.WALLET_UPDATED, {
          balance: this.balance,
          currency: mockWallet.currency,
          reason: "bet_accepted",
          transaction_id: transactionId,
          sequence: Date.now(),
        });
        resolve(accepted);
      }, 650);
    });
  }

  createBettingState(status, closesAt, sequence) {
    return {
      race_id: this.raceId,
      status,
      server_time: new Date().toISOString(),
      closes_at: new Date(closesAt).toISOString(),
      min_stake: 10,
      max_stake: 1000,
      currency: mockWallet.currency,
      sequence,
    };
  }

  emitLocal(eventName, payload) {
    (this.listeners.get(eventName) || []).forEach((handler) => handler(payload));
  }

  schedule(callback, delay) {
    const timer = window.setTimeout(() => {
      this.timers.delete(timer);
      callback();
    }, delay);
    this.timers.add(timer);
  }

  clearTimers() {
    this.timers.forEach((timer) => window.clearTimeout(timer));
    this.timers.clear();
  }
}
