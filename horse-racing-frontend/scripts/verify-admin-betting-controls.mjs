import { spawn } from "node:child_process";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const OUTPUT = path.join(ROOT, "artifacts", "admin-betting-controls");
const PROFILE = path.join(tmpdir(), `horse-racing-admin-betting-${process.pid}`);
const APP_ORIGIN = "http://127.0.0.1:5188";
const DEBUG_PORT = 9338;
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
  if (response.exceptionDetails) throw new Error(response.exceptionDetails.text);
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

async function capture(client, name) {
  const result = await client.send("Page.captureScreenshot", { format: "png", fromSurface: true });
  await writeFile(path.join(OUTPUT, name), Buffer.from(result.data, "base64"));
}

async function setViewport(client, width, height) {
  await client.send("Emulation.setScrollbarsHidden", { hidden: true });
  await client.send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: false });
}

function mockBootstrap() {
  return `(() => {
    localStorage.setItem("horse_racing_token", "admin-betting-token");
    localStorage.setItem("horse_racing_user", JSON.stringify({ id: "admin-betting", full_name: "Admin Betting" }));
    localStorage.setItem("horse_racing_roles", JSON.stringify(["admin"]));
    localStorage.setItem("horse_racing_profiles", JSON.stringify({}));
    localStorage.setItem("horse_racing_active_role", "admin");

    const ok = (data, status = 200) => Promise.resolve(new Response(JSON.stringify({ success: true, data }), { status, headers: { "Content-Type": "application/json" } }));
    const notFound = () => Promise.resolve(new Response(JSON.stringify({ success: false, message: "Verifier route not mocked" }), { status: 404, headers: { "Content-Type": "application/json" } }));
    const now = "2026-07-03T09:00:00.000Z";

    window.__adminBettingCalls = [];
    window.__adminBettingState = {
      tournaments: [{ _id: "tour-1", name: "Summer Cup", status: "active", start_date: now, end_date: now }],
      rounds: [{ _id: "round-1", tournament_id: { _id: "tour-1", name: "Summer Cup" }, name: "Main card", round_order: 1, status: "active" }],
      races: [
        { _id: "race-generated", tournament_id: { _id: "tour-1", name: "Summer Cup" }, round_id: { _id: "round-1", name: "Main card" }, name: "Generated Sprint", race_date: now, location: "Track A", status: "scheduled", betting_status: "generated", betting_market: { status: "generated", min_stake: 2, max_stake: 200, currency: "TOKEN", closes_at: "2026-07-03T10:00:00.000Z" } },
        { _id: "race-running", tournament_id: { _id: "tour-1", name: "Summer Cup" }, round_id: { _id: "round-1", name: "Main card" }, name: "Running Mile", race_date: now, location: "Track B", status: "running", betting_status: "open", betting_market: { status: "open", min_stake: 1, max_stake: 100, currency: "TOKEN" } },
        { _id: "race-completed", tournament_id: { _id: "tour-1", name: "Summer Cup" }, round_id: { _id: "round-1", name: "Main card" }, name: "Completed Classic", race_date: now, location: "Track C", status: "completed", betting_status: "closed", betting_market: { status: "closed", min_stake: 5, max_stake: 500, currency: "TOKEN" } }
      ],
      markets: {
        "race-generated": {
          _id: "market-generated",
          race_id: "race-generated",
          status: "generated",
          model_name: "probability_engine_history_v1",
          model_version: "history_v1.0.0",
          generated_at: "2026-07-03T09:05:00.000Z",
          odds: [
            { horse_id: "horse-1", horse_no: 1, horse_name: "Red Comet", jockey_name: "Mai Tran", win_probability: 0.42, fair_odds: 2.38, game_odds: 2.02, probability_rank: 1 },
            { horse_id: "horse-2", horse_no: 2, horse_name: "Blue Harbor", jockey_name: "An Le", win_probability: 0.31, fair_odds: 3.23, game_odds: 2.75, probability_rank: 2 },
            { horse_id: "horse-3", horse_no: 3, horse_name: "Gold Signal", jockey_name: "Bao Pham", win_probability: 0.27, fair_odds: 3.7, game_odds: 3.15, probability_rank: 3 }
          ]
        },
        "race-running": {
          _id: "market-running",
          race_id: "race-running",
          status: "open",
          model_name: "probability_engine_history_v1",
          model_version: "history_v1.0.0",
          generated_at: "2026-07-03T09:10:00.000Z",
          odds: [{ horse_id: "horse-4", horse_no: 4, horse_name: "Night Rail", jockey_name: "Linh Vo", win_probability: 0.51, fair_odds: 1.96, game_odds: 1.67, probability_rank: 1 }]
        }
      }
    };

    window.fetch = async (input, init = {}) => {
      const url = typeof input === "string" ? input : input.url;
      const method = (init.method || "GET").toUpperCase();
      const path = new URL(url, location.origin).pathname;
      const body = init.body ? JSON.parse(init.body) : null;

      if (path.endsWith("/auth/me")) return ok({ user: { id: "admin-betting", full_name: "Admin Betting" }, roles: ["admin"], profiles: {} });
      if (method === "GET" && path === "/api/tournaments") return ok({ tournaments: window.__adminBettingState.tournaments });
      if (method === "GET" && path === "/api/rounds") return ok({ rounds: window.__adminBettingState.rounds });
      if (method === "GET" && path === "/api/races") return ok({ races: window.__adminBettingState.races });

      const oddsReadMatch = path.match(/^\\/api\\/races\\/([^/]+)\\/odds$/);
      if (oddsReadMatch && method === "GET") {
        const market = window.__adminBettingState.markets[oddsReadMatch[1]];
        return market ? ok({ market }) : notFound();
      }

      const raceMatch = path.match(/^\\/api\\/races\\/([^/]+)\\/(odds\\/generate|betting\\/open|betting\\/close)$/);
      if (raceMatch && method === "POST") {
        const [, raceId, action] = raceMatch;
        const race = window.__adminBettingState.races.find((item) => item._id === raceId);
        if (!race) return notFound();
        window.__adminBettingCalls.push({ method, path, body });
        if (action === "odds/generate") {
          race.betting_status = "generated";
          race.betting_market = { status: "generated", min_stake: 1, max_stake: 1000, currency: "TOKEN" };
          window.__adminBettingState.markets[raceId] = window.__adminBettingState.markets[raceId] || {
            _id: "market-" + raceId,
            race_id: raceId,
            status: "generated",
            model_name: "probability_engine_history_v1",
            model_version: "history_v1.0.0",
            generated_at: now,
            odds: [{ horse_id: "horse-new", horse_no: 9, horse_name: "Fresh Odds", jockey_name: "New Rider", win_probability: 1, fair_odds: 1, game_odds: 1, probability_rank: 1 }]
          };
        }
        if (action === "betting/open") {
          race.betting_status = "open";
          race.betting_closes_at = body?.closes_at;
          race.betting_market = { status: "open", min_stake: body?.min_stake, max_stake: body?.max_stake, currency: body?.currency || "TOKEN", closes_at: body?.closes_at };
        }
        if (action === "betting/close") {
          race.betting_status = "closed";
          race.betting_market = { ...race.betting_market, status: "closed" };
        }
        return ok({ race, market: race.betting_market }, action === "odds/generate" ? 201 : 200);
      }

      const settleMatch = path.match(/^\\/api\\/bets\\/races\\/([^/]+)\\/settle$/);
      if (settleMatch && method === "POST") {
        window.__adminBettingCalls.push({ method, path, body });
        const race = window.__adminBettingState.races.find((item) => item._id === settleMatch[1]);
        if (race) {
          race.betting_status = "settled";
          race.betting_market = { ...race.betting_market, status: "settled" };
        }
        return ok({ settled_count: 1 });
      }

      return notFound();
    };
  })();`;
}

async function run() {
  await mkdir(OUTPUT, { recursive: true });
  await rm(PROFILE, { recursive: true, force: true });
  const vite = spawn(process.execPath, [path.join(ROOT, "node_modules", "vite", "bin", "vite.js"), "--host", "127.0.0.1", "--port", "5188"], { cwd: ROOT, stdio: "ignore", windowsHide: true });
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
    await client.send("Page.navigate", { url: `${APP_ORIGIN}/admin/schedule` });
    await waitFor(client, `document.querySelector(".admin-competition__betting-panel") && document.querySelectorAll(".admin-competition__betting-actions button").length === 4`, "Admin betting controls did not render.");
    await waitFor(client, `Boolean(document.querySelector(".admin-competition__odds-table tbody tr"))`, "Admin odds snapshot did not render.");

    const initial = await evaluate(client, `(() => {
      const buttons = [...document.querySelectorAll(".admin-competition__betting-actions button")];
      const fieldValues = [...document.querySelectorAll(".admin-competition__betting-settings input, .admin-competition__betting-settings select")].map((node) => node.value);
      const oddsRows = [...document.querySelectorAll(".admin-competition__odds-table tbody tr")].map((row) => [...row.cells].map((cell) => cell.textContent.trim()));
      return {
        title: document.querySelector(".admin-competition__betting-panel h2")?.textContent.trim(),
        selectedRace: document.querySelector(".admin-competition__betting-controls > .admin-field select")?.value,
        badge: document.querySelector(".admin-competition__betting-status .admin-status-badge")?.textContent.trim(),
        fieldValues,
        oddsRows,
        oddsMeta: document.querySelector(".admin-competition__odds-meta")?.textContent || "",
        actions: buttons.map((button) => ({ text: button.textContent.trim(), disabled: button.disabled })),
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth
      };
    })()`);
    assert(initial.title === "Win market lifecycle" && initial.selectedRace === "race-generated", "Betting lifecycle panel did not initialize on the first filtered race.");
    assert(initial.badge === "Generated" && initial.fieldValues[0] === "2" && initial.fieldValues[1] === "200" && initial.fieldValues[2] === "TOKEN", "Betting config fields did not hydrate from the selected market.");
    assert(initial.oddsRows.length === 3 && initial.oddsRows[0][1].includes("Red Comet") && initial.oddsRows[0][4] === "2.02", "Admin odds snapshot did not hydrate runner odds.");
    assert(initial.oddsMeta.includes("history_v1.0.0"), "Admin odds snapshot did not render model metadata.");
    assert(initial.actions.find((item) => item.text === "Open betting" && !item.disabled), "Open betting should be enabled for a generated scheduled market.");
    assert(initial.actions.find((item) => item.text === "Retry settle" && item.disabled), "Retry settle should be disabled before the race is completed or closed.");
    assert(initial.overflow === 0, "Admin betting controls overflow on desktop.");
    report.audits.initial = initial;
    report.assertions.push("Admin betting panel hydrates selected race status, stake limits, odds snapshot, and action gates");

    await evaluate(client, `(() => {
      const setValue = (node, value) => {
        const prototype = node.tagName === "SELECT" ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
        Object.getOwnPropertyDescriptor(prototype, "value").set.call(node, value);
        node.dispatchEvent(new Event(node.tagName === "SELECT" ? "change" : "input", { bubbles: true }));
      };
      const inputs = [...document.querySelectorAll(".admin-competition__betting-settings input, .admin-competition__betting-settings select")];
      setValue(inputs[0], "7");
      setValue(inputs[1], "700");
      setValue(inputs[2], "PTS");
      setValue(inputs[3], "2026-07-03T18:30");
      [...document.querySelectorAll(".admin-competition__betting-actions button")].find((button) => button.textContent.trim() === "Open betting").click();
      return true;
    })()`);
    await waitFor(client, `window.__adminBettingCalls.some((call) => call.path === "/api/races/race-generated/betting/open")`, "Open betting API was not called.");
    await waitFor(client, `document.querySelector(".admin-competition__success")?.textContent.includes("Betting opened")`, "Open betting success notice did not render.");
    const openCall = await evaluate(client, `(() => window.__adminBettingCalls.find((call) => call.path === "/api/races/race-generated/betting/open"))()`);
    assert(openCall.body.min_stake === 7 && openCall.body.max_stake === 700 && openCall.body.currency === "PTS" && openCall.body.closes_at.endsWith(".000Z"), "Open betting payload did not match configured admin fields.");
    report.audits.openCall = openCall;
    report.assertions.push("Open betting sends configured min/max stake, currency, and ISO close time");

    await evaluate(client, `(() => {
      const setSelectValue = (node, value) => {
        Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value").set.call(node, value);
        node.dispatchEvent(new Event("change", { bubbles: true }));
      };
      const raceSelect = document.querySelector(".admin-competition__betting-controls > .admin-field select");
      setSelectValue(raceSelect, "race-completed");
      return true;
    })()`);
    await waitFor(client, `document.querySelector(".admin-competition__betting-controls > .admin-field select")?.value === "race-completed"`, "Completed race was not selected.");
    const completedActions = await evaluate(client, `[...document.querySelectorAll(".admin-competition__betting-actions button")].map((button) => ({ text: button.textContent.trim(), disabled: button.disabled }))`);
    assert(completedActions.find((item) => item.text === "Generate odds" && item.disabled), "Generate odds should be disabled for completed races.");
    assert(completedActions.find((item) => item.text === "Retry settle" && !item.disabled), "Retry settle should be enabled for a completed or closed race.");
    await evaluate(client, `(() => {
      [...document.querySelectorAll(".admin-competition__betting-actions button")].find((button) => button.textContent.trim() === "Retry settle").click();
      return true;
    })()`);
    await waitFor(client, `window.__adminBettingCalls.some((call) => call.path === "/api/bets/races/race-completed/settle")`, "Retry settle API was not called.");
    report.audits.completedActions = completedActions;
    report.assertions.push("Completed or closed races disable generation and allow retry settlement");

    await evaluate(client, `(() => {
      const setSelectValue = (node, value) => {
        Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value").set.call(node, value);
        node.dispatchEvent(new Event("change", { bubbles: true }));
      };
      const setValue = (node, value) => {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(node, value);
        node.dispatchEvent(new Event("input", { bubbles: true }));
      };
      const raceSelect = document.querySelector(".admin-competition__betting-controls > .admin-field select");
      setSelectValue(raceSelect, "race-generated");
      const inputs = [...document.querySelectorAll(".admin-competition__betting-settings input")];
      setValue(inputs[0], "900");
      setValue(inputs[1], "100");
      [...document.querySelectorAll(".admin-competition__betting-actions button")].find((button) => button.textContent.trim() === "Open betting").click();
      return true;
    })()`);
    await waitFor(client, `document.querySelector(".admin-live-state--warning")?.textContent.includes("Max stake must be greater than or equal to min stake")`, "Invalid stake limits did not show a frontend error.");
    const callsAfterInvalid = await evaluate(client, `window.__adminBettingCalls.filter((call) => call.path === "/api/races/race-generated/betting/open").length`);
    assert(callsAfterInvalid === 1, "Invalid stake limits should not send another open-betting request.");
    report.assertions.push("Invalid stake limits are blocked before calling the backend");

    await evaluate(client, `(() => {
      const setSelectValue = (node, value) => {
        Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value").set.call(node, value);
        node.dispatchEvent(new Event("change", { bubbles: true }));
      };
      const statusSelect = [...document.querySelectorAll(".admin-toolbar select")].find((select) => [...select.options].some((option) => option.value === "running"));
      setSelectValue(statusSelect, "running");
      return true;
    })()`);
    await waitFor(client, `document.querySelector(".admin-competition__betting-controls > .admin-field select")?.value === "race-running"`, "Filtering to running did not retarget betting controls.");
    const filtered = await evaluate(client, `(() => ({
      selectedRace: document.querySelector(".admin-competition__betting-controls > .admin-field select")?.value,
      optionCount: document.querySelector(".admin-competition__betting-controls > .admin-field select")?.options.length,
      badge: document.querySelector(".admin-competition__betting-status .admin-status-badge")?.textContent.trim(),
      actions: [...document.querySelectorAll(".admin-competition__betting-actions button")].map((button) => ({ text: button.textContent.trim(), disabled: button.disabled }))
    }))()`);
    assert(filtered.selectedRace === "race-running" && filtered.optionCount === 1 && filtered.badge === "Open", "Filtered betting control selection did not stay inside the visible race list.");
    assert(filtered.actions.find((item) => item.text === "Open betting" && item.disabled), "Running races must not allow open betting.");
    report.audits.filtered = filtered;
    report.assertions.push("Schedule filters retarget betting controls to the visible race list");

    await setViewport(client, 390, 844);
    await wait(300);
    const mobile = await evaluate(client, `(() => ({
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      panelWidth: Math.round(document.querySelector(".admin-competition__betting-panel").getBoundingClientRect().width),
      clippedActions: [...document.querySelectorAll(".admin-competition__betting-actions button")].filter((button) => button.scrollWidth > button.clientWidth + 1).length
    }))()`);
    assert(mobile.overflow === 0 && mobile.panelWidth <= 390 && mobile.clippedActions === 0, "Mobile admin betting controls overflow or clip action text.");
    report.audits.mobile = mobile;
    report.assertions.push("Mobile admin betting panel has no horizontal overflow or clipped action buttons");
    await capture(client, "admin-betting-controls-mobile-390x844.png");
    report.screenshots.push("admin-betting-controls-mobile-390x844.png");

    await setViewport(client, 1440, 1000);
    await wait(250);
    await capture(client, "admin-betting-controls-desktop-1440x1000.png");
    report.screenshots.push("admin-betting-controls-desktop-1440x1000.png");
    report.passed = true;
  } catch (error) {
    report.error = error.stack || error.message;
    if (client) {
      try {
        report.debug = await evaluate(client, `(() => ({
          url: location.href,
          bodyText: document.body.textContent.slice(0, 1200),
          calls: window.__adminBettingCalls || [],
          errors: [...document.querySelectorAll("[role='alert'], .admin-live-state--warning")].map((node) => node.textContent.trim())
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

run().then((report) => console.log(JSON.stringify(report, null, 2))).catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
