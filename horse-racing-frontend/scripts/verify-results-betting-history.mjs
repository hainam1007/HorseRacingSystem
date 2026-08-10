import { spawn } from "node:child_process";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const OUTPUT = path.join(ROOT, "artifacts", "results-betting-history");
const PROFILE = path.join(tmpdir(), `horse-racing-results-history-${process.pid}`);
const APP_ORIGIN = "http://127.0.0.1:5190";
const DEBUG_PORT = 9340;
const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

class Cdp {
  constructor(url) {
    this.id = 1;
    this.pending = new Map();
    this.socket = new WebSocket(url);
    this.ready = new Promise((resolve, reject) => {
      this.socket.addEventListener("open", resolve, { once: true });
      this.socket.addEventListener("error", reject, { once: true });
    });
    this.socket.addEventListener("message", (event) => {
      const message = JSON.parse(event.data);
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

  close() { this.socket.close(); }
}

function assert(value, message) {
  if (!value) throw new Error(message);
}

async function evaluate(client, expression) {
  const response = await client.send("Runtime.evaluate", { expression: `JSON.stringify(${expression})`, returnByValue: true });
  if (response.exceptionDetails) throw new Error(response.exceptionDetails.exception?.description || response.exceptionDetails.text);
  return JSON.parse(response.result.value);
}

async function waitFor(client, expression, message, timeout = 15000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await evaluate(client, expression)) return;
    await wait(120);
  }
  throw new Error(message);
}

async function setViewport(client, width, height) {
  await client.send("Emulation.setScrollbarsHidden", { hidden: true });
  await client.send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: false });
}

async function capture(client, name) {
  const result = await client.send("Page.captureScreenshot", { format: "png", fromSurface: true });
  await writeFile(path.join(OUTPUT, name), Buffer.from(result.data, "base64"));
}

function mockBootstrap() {
  return `(() => {
    localStorage.setItem("horse_racing_token", "results-history-token");
    localStorage.setItem("horse_racing_user", JSON.stringify({ id: "spectator-results", full_name: "Results Spectator" }));
    localStorage.setItem("horse_racing_roles", JSON.stringify(["spectator"]));
    localStorage.setItem("horse_racing_profiles", JSON.stringify({ spectator: { id: "spectator-profile" } }));
    localStorage.setItem("horse_racing_active_role", "spectator");

    const ok = (data) => Promise.resolve(new Response(JSON.stringify({ success: true, data }), { status: 200, headers: { "Content-Type": "application/json" } }));
    const notFound = () => Promise.resolve(new Response(JSON.stringify({ success: false, message: "Verifier route not mocked" }), { status: 404, headers: { "Content-Type": "application/json" } }));
    const now = "2026-07-03T10:00:00.000Z";

    window.fetch = async (input, init = {}) => {
      const url = typeof input === "string" ? input : input.url;
      const method = (init.method || "GET").toUpperCase();
      const path = new URL(url, location.origin).pathname;

      if (path.endsWith("/auth/me")) return ok({ user: { id: "spectator-results", full_name: "Results Spectator" }, roles: ["spectator"], profiles: { spectator: { id: "spectator-profile" } } });
      if (method === "GET" && path === "/api/race-results") return ok({
        results: [
          { _id: "result-1", race_id: { _id: "race-1", name: "Settlement Sprint" }, horse_id: { _id: "horse-1", name: "Red Comet" }, jockey_name: "Mai Tran", final_position: 1, final_finish_time: 71.24, final_score: 98, status: "published", published_at: now },
          { _id: "result-2", race_id: { _id: "race-1", name: "Settlement Sprint" }, horse_id: { _id: "horse-2", name: "Blue Harbor" }, jockey_name: "An Le", final_position: 2, final_finish_time: 72.01, final_score: 91, status: "published", published_at: now }
        ]
      });
      if (method === "GET" && path === "/api/bets/me") return ok({
        bets: [
          { _id: "bet-won", race_id: { _id: "race-1", name: "Settlement Sprint" }, predicted_horse_id: { _id: "horse-1", name: "Red Comet" }, stake_amount: 100, odds_snapshot: { horse_name: "Red Comet", game_odds: 2.5 }, potential_payout: 250, payout_amount: 250, status: "won", submitted_at: now, settled_at: now },
          { _id: "bet-lost", race_id: { _id: "race-2", name: "Evening Mile" }, predicted_horse_id: { _id: "horse-3", name: "Gold Signal" }, stake_amount: 75, odds_snapshot: { horse_name: "Gold Signal", game_odds: 3.1 }, potential_payout: 232.5, payout_amount: 0, status: "lost", submitted_at: now, settled_at: now },
          { _id: "bet-pending", race_id: { _id: "race-3", name: "Night Trial" }, predicted_horse_id: { _id: "horse-4", name: "Night Rail" }, stake_amount: 50, odds_snapshot: { horse_name: "Night Rail", game_odds: 1.8 }, potential_payout: 90, payout_amount: 0, status: "pending", submitted_at: now }
        ],
        total: 3
      });
      return notFound();
    };
  })();`;
}

async function run() {
  await mkdir(OUTPUT, { recursive: true });
  await rm(PROFILE, { recursive: true, force: true });
  const vite = spawn(process.execPath, [path.join(ROOT, "node_modules", "vite", "bin", "vite.js"), "--host", "127.0.0.1", "--port", "5190"], { cwd: ROOT, stdio: "ignore", windowsHide: true });
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    try { if ((await fetch(APP_ORIGIN)).ok) break; } catch {}
    await wait(150);
  }

  const chrome = spawn(CHROME, ["--headless=new", "--disable-gpu", "--hide-scrollbars", "--no-first-run", `--remote-debugging-port=${DEBUG_PORT}`, `--user-data-dir=${PROFILE}`, `${APP_ORIGIN}/`], { stdio: "ignore" });
  const report = { passed: false, assertions: [], screenshots: [], audits: {} };
  let client;

  try {
    let targets;
    const targetDeadline = Date.now() + 12000;
    while (Date.now() < targetDeadline) {
      try { targets = await (await fetch(`http://127.0.0.1:${DEBUG_PORT}/json`)).json(); if (targets.length) break; } catch {}
      await wait(150);
    }
    const target = targets.find((item) => item.type === "page" && item.url.startsWith(APP_ORIGIN));
    assert(target, "Browser target was not created.");
    client = new Cdp(target.webSocketDebuggerUrl);
    await client.send("Page.enable");
    await client.send("Runtime.enable");
    await client.send("Page.addScriptToEvaluateOnNewDocument", { source: mockBootstrap() });

    await setViewport(client, 1440, 1000);
    await client.send("Page.navigate", { url: `${APP_ORIGIN}/spectator/results` });
    await waitFor(client, `document.querySelectorAll(".results-board .data-table tbody tr").length >= 2`, "Race results did not render.");
    await evaluate(client, `([...document.querySelectorAll(".results-tab")].find((button) => button.textContent.includes("Betting history")).click(), true)`);
    await waitFor(client, `document.querySelector(".results-history-summary") && document.body.textContent.includes("Red Comet")`, "Betting history did not render.");

    const history = await evaluate(client, `(() => ({
      heading: document.querySelector(".results-board__header h2")?.textContent.trim(),
      summary: document.querySelector(".results-history-summary")?.textContent || "",
      statuses: [...document.querySelectorAll(".results-status")].map((node) => node.textContent.trim()),
      returns: [...document.querySelectorAll(".results-bet-return strong")].map((node) => node.textContent.trim()),
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth
    }))()`);
    assert(history.heading === "Settled prediction history", "History tab heading did not switch.");
    assert(history.summary.includes("3 total bets") && history.summary.includes("2 settled") && history.summary.includes("250 TOKEN paid"), "Betting history summary is incorrect.");
    assert(history.statuses.includes("Won") && history.statuses.includes("Lost") && history.statuses.includes("Pending"), "Betting history statuses did not render.");
    assert(history.returns.includes("250 TOKEN") && history.returns.includes("90 TOKEN"), "Betting history payouts did not render.");
    assert(history.overflow === 0, "Desktop results history has horizontal overflow.");
    report.audits.history = history;
    report.assertions.push("Results betting history renders won, lost, and pending bets with backend payouts");

    await capture(client, "results-betting-history-desktop-1440x1000.png");
    report.screenshots.push("results-betting-history-desktop-1440x1000.png");

    await setViewport(client, 390, 844);
    await wait(300);
    const mobile = await evaluate(client, `(() => ({
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      innerWidth,
      clientWidth: document.documentElement.clientWidth,
      resultsPage: Math.round(document.querySelector(".results-page").getBoundingClientRect().width),
      dashboard: Math.round(document.querySelector(".dashboard-container").getBoundingClientRect().width),
      content: Math.round(document.querySelector(".content-area").getBoundingClientRect().width),
      heroGrid: getComputedStyle(document.querySelector(".results-hero")).gridTemplateColumns,
      boardWidth: Math.round(document.querySelector(".results-board").getBoundingClientRect().width),
      clippedTabs: [...document.querySelectorAll(".results-tab")].filter((button) => button.scrollWidth > button.clientWidth + 1).length,
      offenders: [...document.querySelectorAll("body *")]
        .map((item) => ({ item, rect: item.getBoundingClientRect() }))
        .filter(({ rect }) => rect.width > 0 && (rect.right > document.documentElement.clientWidth + 1 || rect.left < -1))
        .slice(0, 8)
        .map(({ item, rect }) => ({ tag: item.tagName, className: item.className?.toString().slice(0, 90) || "", left: Math.round(rect.left), right: Math.round(rect.right), width: Math.round(rect.width) }))
    }))()`);
    report.audits.mobile = mobile;
    assert(mobile.overflow === 0 && mobile.boardWidth <= 390 && mobile.clippedTabs === 0, "Mobile results history overflows or clips tabs.");
    report.assertions.push("Mobile results betting history has no horizontal overflow or clipped tabs");
    await capture(client, "results-betting-history-mobile-390x844.png");
    report.screenshots.push("results-betting-history-mobile-390x844.png");

    report.passed = true;
  } catch (error) {
    report.error = error.stack || error.message;
    if (client) {
      try {
        report.debug = await evaluate(client, `({ url: location.href, bodyText: document.body.textContent.slice(0, 1200) })`);
      } catch {}
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

run().then((report) => console.log(JSON.stringify(report, null, 2))).catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
