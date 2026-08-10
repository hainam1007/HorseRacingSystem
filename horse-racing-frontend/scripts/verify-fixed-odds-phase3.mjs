import { spawn } from "node:child_process";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const OUTPUT = path.join(ROOT, "artifacts", "fixed-odds-phase-3");
const PROFILE = path.join(tmpdir(), `horse-racing-fixed-odds-${process.pid}`);
const APP_ORIGIN = "http://127.0.0.1:5187";
const DEBUG_PORT = 9337;
const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

class Cdp {
  constructor(url) {
    this.id = 1;
    this.apiMode = "preview";
    this.backendClosesAt = null;
    this.backendBetCalls = [];
    this.pending = new Map();
    this.socket = new WebSocket(url);
    this.ready = new Promise((resolve, reject) => {
      this.socket.addEventListener("open", resolve, { once: true });
      this.socket.addEventListener("error", reject, { once: true });
    });
    this.socket.addEventListener("message", (event) => {
      const message = JSON.parse(event.data);
      if (message.method === "Fetch.requestPaused") {
        const url = message.params.request.url;
        if (url.includes("/api/auth/me") || url.includes("/auth/me")) {
          const body = Buffer.from(JSON.stringify({ success: true, data: { user: { id: "phase-3", full_name: "Phase 3 Spectator" }, roles: ["spectator"], profiles: { spectator: { id: "phase-3-profile" } } } })).toString("base64");
          this.send("Fetch.fulfillRequest", {
            requestId: message.params.requestId,
            responseCode: 200,
            responseHeaders: [{ name: "Content-Type", value: "application/json" }],
            body,
          }).catch(() => {});
        } else if (this.apiMode === "backend" && url.includes("/api/races/race-backend-countdown/odds")) {
          const body = Buffer.from(JSON.stringify({ success: true, data: { market: createBackendMarket(this.backendClosesAt) } })).toString("base64");
          this.send("Fetch.fulfillRequest", {
            requestId: message.params.requestId,
            responseCode: 200,
            responseHeaders: [{ name: "Content-Type", value: "application/json" }],
            body,
          }).catch(() => {});
        } else if (this.apiMode === "backend" && url.includes("/api/races")) {
          const body = Buffer.from(JSON.stringify({ success: true, data: { races: [createBackendRace(this.backendClosesAt)] } })).toString("base64");
          this.send("Fetch.fulfillRequest", {
            requestId: message.params.requestId,
            responseCode: 200,
            responseHeaders: [{ name: "Content-Type", value: "application/json" }],
            body,
          }).catch(() => {});
        } else if (this.apiMode === "backend" && url.includes("/api/wallet/me")) {
          const body = Buffer.from(JSON.stringify({ success: true, data: { wallet: { token_balance: 1200 } } })).toString("base64");
          this.send("Fetch.fulfillRequest", {
            requestId: message.params.requestId,
            responseCode: 200,
            responseHeaders: [{ name: "Content-Type", value: "application/json" }],
            body,
          }).catch(() => {});
        } else if (this.apiMode === "backend" && url.endsWith("/api/bets") && message.params.request.method === "POST") {
          const requestBody = JSON.parse(message.params.request.postData || "{}");
          this.backendBetCalls.push(requestBody);
          const body = Buffer.from(JSON.stringify({
            success: true,
            data: {
              bet: {
                _id: "backend-bet-1",
                race_id: requestBody.race_id,
                predicted_horse_id: requestBody.horse_id,
                stake_amount: requestBody.stake_amount,
                odds_snapshot: { horse_name: "Backend Runner 1", game_odds: 2.1, currency: "TOKEN" },
                potential_payout: 420,
                payout_amount: 0,
                status: "pending",
                submitted_at: new Date().toISOString(),
              },
              wallet: { token_balance: 1000 },
              transaction: { _id: "backend-transaction-1", amount: -requestBody.stake_amount },
            },
          })).toString("base64");
          this.send("Fetch.fulfillRequest", {
            requestId: message.params.requestId,
            responseCode: 201,
            responseHeaders: [{ name: "Content-Type", value: "application/json" }],
            body,
          }).catch(() => {});
        } else if (this.apiMode === "backend" && url.includes("/api/bets/me")) {
          const body = Buffer.from(JSON.stringify({ success: true, data: { bets: [], total: 0 } })).toString("base64");
          this.send("Fetch.fulfillRequest", {
            requestId: message.params.requestId,
            responseCode: 200,
            responseHeaders: [{ name: "Content-Type", value: "application/json" }],
            body,
          }).catch(() => {});
        } else if (url.includes("/api/races")) {
          const body = Buffer.from(JSON.stringify({ success: false, message: "Preview race API unavailable in verifier." })).toString("base64");
          this.send("Fetch.fulfillRequest", {
            requestId: message.params.requestId,
            responseCode: 503,
            responseHeaders: [{ name: "Content-Type", value: "application/json" }],
            body,
          }).catch(() => {});
        } else {
          this.send("Fetch.continueRequest", { requestId: message.params.requestId }).catch(() => {});
        }
        return;
      }
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      if (message.error) pending.reject(new Error(`${pending.method}: ${message.error.message}`));
      else pending.resolve(message.result);
    });
  }
  async send(method, params = {}) {
    await this.ready;
    const id = this.id++;
    const response = new Promise((resolve, reject) => this.pending.set(id, { method, resolve, reject }));
    this.socket.send(JSON.stringify({ id, method, params }));
    return response;
  }
  useBackendCountdown(ms) {
    this.apiMode = "backend";
    this.backendClosesAt = new Date(Date.now() + ms).toISOString();
  }
  close() { this.socket.close(); }
}

function assert(value, message) { if (!value) throw new Error(message); }

function createBackendRace(closesAt) {
  return {
    _id: "race-backend-countdown",
    name: "Backend Countdown Sprint",
    race_date: new Date(Date.now() + 3600000).toISOString(),
    distance: 1200,
    location: "Verifier Track",
    status: "scheduled",
    betting_status: "open",
    betting_market: {
      status: "open",
      min_stake: 5,
      max_stake: 500,
      currency: "TOKEN",
      closes_at: closesAt,
    },
  };
}

function createBackendMarket(closesAt) {
  return {
    _id: "market-backend-countdown",
    race_id: "race-backend-countdown",
    status: "open",
    closes_at: closesAt,
    server_time: new Date().toISOString(),
    odds: Array.from({ length: 8 }, (_, index) => ({
      horse_id: `backend-horse-${index + 1}`,
      horse_no: index + 1,
      horse_name: `Backend Runner ${index + 1}`,
      jockey_name: `Jockey ${index + 1}`,
      win_probability: 0.125,
      fair_odds: 8,
      game_odds: 2.1 + index * 0.2,
      probability_rank: index + 1,
    })),
  };
}

async function evaluate(client, expression) {
  const response = await client.send("Runtime.evaluate", {
    expression: `JSON.stringify((() => { const value = (${expression}); return value === undefined ? null : value; })())`,
    returnByValue: true,
  });
  if (response.exceptionDetails) throw new Error(response.exceptionDetails.text);
  return JSON.parse(response.result.value);
}

async function waitFor(client, expression, message, timeout = 15000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await evaluate(client, expression)) return;
    await wait(100);
  }
  throw new Error(message);
}

async function clickText(client, selector, text) {
  return evaluate(client, `(() => { const node = [...document.querySelectorAll(${JSON.stringify(selector)})].find((item) => item.textContent.trim().includes(${JSON.stringify(text)})); if (!node) return false; node.click(); return true; })()`);
}

async function capture(client, name) {
  const result = await client.send("Page.captureScreenshot", { format: "png", fromSurface: true });
  await writeFile(path.join(OUTPUT, name), Buffer.from(result.data, "base64"));
}

async function setViewport(client, width, height) {
  await client.send("Emulation.setScrollbarsHidden", { hidden: true });
  await client.send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: false });
}

async function run() {
  await mkdir(OUTPUT, { recursive: true });
  await rm(PROFILE, { recursive: true, force: true });
  const vite = spawn(process.execPath, [path.join(ROOT, "node_modules", "vite", "bin", "vite.js"), "--host", "127.0.0.1", "--port", "5187"], { cwd: ROOT, env: { ...process.env, VITE_MOCK_MARKET_LOCK_DELAY_MS: "12000" }, stdio: "ignore", windowsHide: true });
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) { try { if ((await fetch(APP_ORIGIN)).ok) break; } catch {} await wait(150); }
  const chrome = spawn(CHROME, ["--headless=new", "--disable-gpu", "--hide-scrollbars", "--no-first-run", `--remote-debugging-port=${DEBUG_PORT}`, `--user-data-dir=${PROFILE}`, `${APP_ORIGIN}/`], { stdio: "ignore" });
  const report = { passed: false, assertions: [], screenshots: [], audits: {} };
  let client;

  try {
    let targets;
    const targetDeadline = Date.now() + 12000;
    while (Date.now() < targetDeadline) { try { targets = await (await fetch(`http://127.0.0.1:${DEBUG_PORT}/json`)).json(); if (targets.length) break; } catch {} await wait(150); }
    const target = targets.find((item) => item.type === "page" && item.url.startsWith(APP_ORIGIN));
    assert(target, "Browser target was not created.");
    client = new Cdp(target.webSocketDebuggerUrl);
    await client.send("Page.enable");
    await client.send("Runtime.enable");
    await client.send("Fetch.enable", { patterns: [{ urlPattern: "*", requestStage: "Request" }] });
    await client.send("Page.navigate", { url: APP_ORIGIN });
    await waitFor(client, `location.origin === ${JSON.stringify(APP_ORIGIN)}`, "App origin did not load.");
    const authBootstrap = `(() => {
      localStorage.setItem("horse_racing_token", "phase-3-token");
      localStorage.setItem("horse_racing_user", JSON.stringify({ id: "phase-3", full_name: "Phase 3 Spectator" }));
      localStorage.setItem("horse_racing_roles", JSON.stringify(["spectator"]));
      localStorage.setItem("horse_racing_profiles", JSON.stringify({ spectator: { id: "phase-3-profile" } }));
      localStorage.setItem("horse_racing_active_role", "spectator");
      window.__horseRacingNativeFetch = window.__horseRacingNativeFetch || window.fetch.bind(window);
      window.fetch = (input, init) => {
        const url = typeof input === "string" ? input : input.url;
        if (url.includes("/api/auth/me") || url.includes("/auth/me")) return Promise.resolve(new Response(JSON.stringify({ success: true, data: { user: { id: "phase-3", full_name: "Phase 3 Spectator" }, roles: ["spectator"], profiles: { spectator: { id: "phase-3-profile" } } } }), { status: 200, headers: { "Content-Type": "application/json" } }));
        return window.__horseRacingNativeFetch(input, init);
      };
    })();`;
    const bootstrapResult = await client.send("Runtime.evaluate", { expression: authBootstrap });
    assert(!bootstrapResult.exceptionDetails, `Auth bootstrap failed before navigation: ${JSON.stringify(bootstrapResult.exceptionDetails)}`);
    await client.send("Page.addScriptToEvaluateOnNewDocument", { source: authBootstrap });

    await setViewport(client, 1440, 1100);
    await client.send("Page.navigate", { url: `${APP_ORIGIN}/spectator/predictions/races/race-opening-sprint` });
    await waitFor(client, `document.querySelector(".fixed-odds-runner button") && !document.querySelector(".fixed-odds-runner button").disabled`, "Fixed-odds market did not open.");

    const initial = await evaluate(client, `(() => ({ tabs: document.querySelectorAll(".fixed-odds-tabs button").length, runners: document.querySelectorAll(".fixed-odds-runner").length, heading: document.querySelector(".fixed-odds-board__heading h2")?.textContent.trim(), note: document.querySelector(".fixed-odds-market-note")?.textContent.trim(), overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth, viewer: document.querySelectorAll(".live-race-viewer").length }))()`);
    assert(initial.tabs === 0 && initial.runners === 8 && initial.heading === "Win market" && initial.note.includes("Win only") && initial.viewer === 0 && initial.overflow === 0, "Desktop win-only market structure is incorrect.");
    report.audits.initial = initial;
    report.assertions.push("Race betting route renders a win-only market, eight runners, and no embedded race viewer");

    await evaluate(client, `(() => { document.querySelector(".fixed-odds-runner button").click(); return true; })()`);
    const winOnly = await evaluate(client, `(() => ({ filled: document.querySelectorAll(".fixed-odds-slot.is-filled").length, odds: document.querySelector(".fixed-odds-slip__totals strong").textContent.trim(), slip: document.querySelector(".fixed-odds-slip__heading h2")?.textContent.trim(), reviewDisabled: document.querySelector(".fixed-odds-review").disabled }))()`);
    assert(winOnly.filled === 1 && winOnly.odds !== "--" && winOnly.slip === "Win bet" && !winOnly.reviewDisabled, "Win-only selection did not resolve a single-runner price.");
    report.audits.winOnly = winOnly;
    report.assertions.push("Win-only selection resolves one runner, one odds price, and an enabled review action");
    await capture(client, "fixed-odds-win-desktop-1440x1100.png");
    report.screenshots.push("fixed-odds-win-desktop-1440x1100.png");

    await evaluate(client, `(() => { document.querySelector(".fixed-odds-review").click(); return true; })()`);
    await waitFor(client, `Boolean(document.querySelector(".prediction-confirm-modal"))`, "Confirmation modal did not open.");
    const modal = await evaluate(client, `({ summaryRows: document.querySelectorAll(".prediction-confirm-summary > div").length, odds: document.querySelectorAll(".prediction-confirm-hero strong")[1].textContent.trim() })`);
    assert(modal.summaryRows === 4 && modal.odds !== "0.00x", "Confirmation modal is missing fixed odds details.");
    await clickText(client, ".prediction-confirm-actions button", "Place fixed-odds bet");
    await waitFor(client, `document.querySelectorAll(".fixed-odds-receipts article").length === 1`, "Accepted receipt did not render.");
    const accepted = await evaluate(client, `(() => ({ receipt: document.querySelectorAll(".fixed-odds-receipts article").length, balance: document.querySelector(".fixed-odds-slip__wallet strong").textContent.trim(), message: document.querySelector(".fixed-odds-message--success")?.textContent.trim() }))()`);
    assert(accepted.balance === "1,080 pts" && accepted.message.includes("accepted"), "Wallet or accepted receipt did not update.");
    report.audits.accepted = accepted;
    report.assertions.push("Confirmation creates an accepted receipt and updates wallet balance dynamically");

    await setViewport(client, 390, 844);
    await wait(250);
    const mobile = await evaluate(client, `(() => ({ overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth, boardWidth: document.querySelector(".fixed-odds-board").getBoundingClientRect().width, clippedRunners: [...document.querySelectorAll(".fixed-odds-runner")].filter((row) => row.scrollWidth > row.clientWidth + 1).length }))()`);
    assert(mobile.overflow === 0 && mobile.boardWidth <= 390 && mobile.clippedRunners === 0, "Mobile fixed-odds layout overflows.");
    report.audits.mobile = mobile;
    report.assertions.push("Mobile odds board has no horizontal page overflow or clipped runner rows");
    await capture(client, "fixed-odds-mobile-390x844.png");
    report.screenshots.push("fixed-odds-mobile-390x844.png");

    await waitFor(client, `document.querySelector(".fixed-odds-clock small")?.textContent.trim() === "Market locked"`, "stop_betting did not lock the market.", 30000);
    const locked = await evaluate(client, `(() => ({ runnerControlsLocked: [...document.querySelectorAll(".fixed-odds-runner button")].every((button) => button.disabled), stakeLocked: document.querySelector("#fixed-odds-stake").disabled, reviewLocked: document.querySelector(".fixed-odds-review").disabled, modalClosed: !document.querySelector(".prediction-confirm-modal") }))()`);
    assert(locked.runnerControlsLocked && locked.stakeLocked && locked.reviewLocked && locked.modalClosed, "stop_betting did not disable the complete form.");
    report.audits.locked = locked;
    report.assertions.push("stop_betting locks runner, stake, review, and confirmation controls immediately");

    client.useBackendCountdown(9000);
    await setViewport(client, 1440, 900);
    await client.send("Page.navigate", { url: `${APP_ORIGIN}/spectator/predictions/races/race-backend-countdown` });
    await waitFor(client, `document.querySelector(".fixed-odds-runner button") && !document.querySelector(".fixed-odds-runner button").disabled`, "Backend fixed-odds market did not open.");
    const backendOpen = await evaluate(client, `(() => ({
      countdown: document.querySelector(".fixed-odds-clock strong")?.textContent.trim(),
      status: document.querySelector(".fixed-odds-clock small")?.textContent.trim(),
      wallet: document.querySelector(".fixed-odds-slip__wallet strong")?.textContent.trim(),
      currency: document.querySelector(".fixed-odds-stake small")?.textContent.trim()
    }))()`);
    assert(backendOpen.countdown !== "--" && backendOpen.status === "Betting open" && backendOpen.wallet.includes("TOKEN") && backendOpen.currency === "TOKEN", "Backend countdown or currency did not hydrate from API data.");
    await evaluate(client, `(() => { document.querySelector(".fixed-odds-runner button").click(); return true; })()`);
    await waitFor(client, `!document.querySelector(".fixed-odds-review").disabled`, "Backend API bet did not become reviewable.");
    await evaluate(client, `(() => { document.querySelector(".fixed-odds-review").click(); return true; })()`);
    await waitFor(client, `Boolean(document.querySelector(".prediction-confirm-modal"))`, "Backend API confirmation modal did not open.");
    await clickText(client, ".prediction-confirm-actions button", "Place fixed-odds bet");
    await waitFor(client, `document.querySelector(".fixed-odds-message--success")?.textContent.includes("TOKEN")`, "Backend API bet did not render an accepted message.");
    const backendSubmit = await evaluate(client, `(() => ({
      receiptStatus: document.querySelector(".fixed-odds-receipts article span")?.textContent.trim(),
      receiptStake: document.querySelector(".fixed-odds-receipts article b")?.textContent.trim(),
      balance: document.querySelector(".fixed-odds-slip__wallet strong")?.textContent.trim()
    }))()`);
    const backendBetCalls = client.backendBetCalls;
    assert(backendBetCalls.length === 1 && backendBetCalls[0].race_id === "race-backend-countdown" && backendBetCalls[0].horse_id === "backend-horse-1" && backendBetCalls[0].stake_amount === 200, "Backend POST /api/bets payload is incorrect.");
    assert(backendSubmit.receiptStatus === "Pending" && backendSubmit.receiptStake === "200 TOKEN" && backendSubmit.balance === "1,000 TOKEN", "Backend API receipt or wallet balance did not render correctly.");
    await waitFor(client, `document.querySelector(".fixed-odds-clock small")?.textContent.trim() === "Market locked"`, "Backend closes_at countdown did not lock the market.", 12000);
    const backendLocked = await evaluate(client, `(() => ({
      countdown: document.querySelector(".fixed-odds-clock strong")?.textContent.trim(),
      runnerControlsLocked: [...document.querySelectorAll(".fixed-odds-runner button")].every((button) => button.disabled),
      stakeLocked: document.querySelector("#fixed-odds-stake").disabled,
      reviewLocked: document.querySelector(".fixed-odds-review").disabled
    }))()`);
    assert(backendLocked.countdown === "00:00" && backendLocked.runnerControlsLocked && backendLocked.stakeLocked && backendLocked.reviewLocked, "Backend closes_at did not disable the complete form.");
    report.audits.backendCountdown = { open: backendOpen, submit: backendSubmit, betCalls: backendBetCalls, locked: backendLocked };
    report.assertions.push("Backend API-mode submit sends the win-only bet payload and renders the pending receipt");
    report.assertions.push("Backend closes_at countdown renders in API mode and locks betting controls at zero");
    report.passed = true;
  } catch (error) {
    report.error = error.stack || error.message;
    if (client) {
      try {
        report.debug = await evaluate(client, `(() => ({
          url: location.href,
          token: localStorage.getItem("horse_racing_token"),
          roles: localStorage.getItem("horse_racing_roles"),
          bodyText: document.body.textContent.slice(0, 1000),
          fixedOddsPage: Boolean(document.querySelector(".fixed-odds-page")),
          runners: document.querySelectorAll(".fixed-odds-runner").length,
          firstRunnerDisabled: document.querySelector(".fixed-odds-runner button")?.disabled ?? null,
          firstRunnerText: document.querySelector(".fixed-odds-runner button")?.textContent.trim() ?? null,
          clock: document.querySelector(".fixed-odds-clock small")?.textContent.trim() ?? null,
          connection: document.querySelector(".fixed-odds-connection")?.textContent.trim() ?? null,
          note: document.querySelector(".fixed-odds-market-note")?.textContent.trim() ?? null,
          errors: [...document.querySelectorAll("[role='alert']")].map((node) => node.textContent.trim())
        }))()`);
      } catch (debugError) {
        report.debugError = debugError.stack || debugError.message;
      }
    }
    throw error;
  } finally {
    await writeFile(path.join(OUTPUT, "verification-report.json"), JSON.stringify(report, null, 2));
    client?.close();
    chrome.kill();
    vite.kill();
    await wait(400);
    await rm(PROFILE, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 }).catch(() => {});
  }
  return report;
}

run().then((report) => console.log(JSON.stringify(report, null, 2))).catch((error) => { console.error(error.stack || error.message); process.exitCode = 1; });
