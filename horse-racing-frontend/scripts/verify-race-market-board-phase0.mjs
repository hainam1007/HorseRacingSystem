import { spawn } from "node:child_process";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const OUTPUT = path.join(ROOT, "artifacts", "race-market-board-phase-0");
const PROFILE = path.join(tmpdir(), `horse-racing-market-board-${process.pid}`);
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

function assert(value, message) { if (!value) throw new Error(message); }

async function evaluate(client, expression) {
  const response = await client.send("Runtime.evaluate", { expression: `JSON.stringify(${expression})`, returnByValue: true });
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
  return evaluate(client, `(() => { const node = [...document.querySelectorAll(${JSON.stringify(selector)})].find((item) => item.textContent.includes(${JSON.stringify(text)})); if (!node) return false; node.click(); return true; })()`);
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
  const vite = spawn(process.execPath, [path.join(ROOT, "node_modules", "vite", "bin", "vite.js"), "--host", "127.0.0.1", "--port", "5188"], { cwd: ROOT, stdio: "ignore", windowsHide: true });
  const serverDeadline = Date.now() + 15000;
  while (Date.now() < serverDeadline) { try { if ((await fetch(APP_ORIGIN)).ok) break; } catch {} await wait(150); }
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
    await client.send("Page.addScriptToEvaluateOnNewDocument", { source: `(() => {
      localStorage.setItem("horse_racing_token", "phase-0-token");
      localStorage.setItem("horse_racing_user", JSON.stringify({ id: "phase-0", full_name: "Phase 0 Spectator" }));
      localStorage.setItem("horse_racing_roles", JSON.stringify(["spectator"]));
      localStorage.setItem("horse_racing_profiles", JSON.stringify({ spectator: { id: "phase-0-profile" } }));
      localStorage.setItem("horse_racing_active_role", "spectator");
      const nativeFetch = window.fetch.bind(window);
      window.fetch = (input, init) => {
        const url = typeof input === "string" ? input : input.url;
        if (url.includes("/api/auth/me")) return Promise.resolve(new Response(JSON.stringify({ success: true, data: { user: { id: "phase-0", full_name: "Phase 0 Spectator" }, roles: ["spectator"], profiles: { spectator: { id: "phase-0-profile" } } } }), { status: 200, headers: { "Content-Type": "application/json" } }));
        if (url.includes("/api/races")) return Promise.reject(new Error("Preview fixture mode"));
        return nativeFetch(input, init);
      };
    })();` });

    await setViewport(client, 1440, 1000);
    await client.send("Page.navigate", { url: `${APP_ORIGIN}/spectator/predictions` });
    await waitFor(client, `document.querySelectorAll(".race-market-row").length === 2`, "Upcoming race rows did not render.");
    const upcoming = await evaluate(client, `(() => ({
      rows: document.querySelectorAll(".race-market-row").length,
      firstRace: document.querySelector(".race-market-row h2")?.textContent.trim(),
      firstMarket: document.querySelector(".race-market-row .race-hub-status:last-child")?.textContent.trim(),
      filters: document.querySelectorAll(".race-market-board__filters button").length,
      tournamentCards: document.querySelectorAll(".prediction-list-row, .prediction-overview-card").length,
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth
    }))()`);
    assert(upcoming.rows === 2 && upcoming.firstRace === "Opening Sprint" && upcoming.firstMarket === "Betting open", "Open market is not prioritized in upcoming races.");
    assert(upcoming.filters === 4 && upcoming.tournamentCards === 0 && upcoming.overflow === 0, "Race-first board structure is incorrect.");
    report.audits.upcoming = upcoming;
    report.assertions.push("Predictions navigation renders race rows instead of tournament cards");
    report.assertions.push("Open market is sorted before other upcoming races");
    await wait(700);
    await capture(client, "race-market-board-desktop-1440x1000.png");
    report.screenshots.push("race-market-board-desktop-1440x1000.png");

    await clickText(client, ".race-market-board__filters button", "Available");
    await waitFor(client, `document.querySelectorAll(".race-market-row").length === 1`, "Available filter did not select the open market.");
    const available = await evaluate(client, `(() => ({ href: document.querySelector(".race-market-row__primary").getAttribute("href"), trackLinks: document.querySelectorAll(".race-market-row__track").length }))()`);
    assert(available.href === "/spectator/predictions/races/race-opening-sprint" && available.trackLinks === 1, "Open market CTA does not use raceId or lacks race info separation.");
    report.assertions.push("Open market CTA uses raceId and keeps Race info as a separate action");

    await clickText(client, ".race-market-board__filters button", "Live races");
    await waitFor(client, `document.querySelectorAll(".race-market-row").length === 1 && Boolean(document.querySelector(".race-market-row--running"))`, "Live race filter failed.");
    const live = await evaluate(client, `({ label: document.querySelector(".race-market-row__primary").textContent.trim(), href: document.querySelector(".race-market-row__primary").getAttribute("href") })`);
    assert(live.label.includes("Watch live") && live.href.includes("/tournaments/1/races/race-derby-trial"), "Live race incorrectly exposes betting.");
    report.assertions.push("Live race routes to the viewer and never exposes a betting CTA");

    await setViewport(client, 390, 844);
    await clickText(client, ".race-market-board__filters button", "All upcoming");
    await waitFor(client, `document.querySelectorAll(".race-market-row").length === 2`, "Mobile upcoming filter failed.");
    await wait(250);
    const mobile = await evaluate(client, `(() => ({ overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth, clippedRows: [...document.querySelectorAll(".race-market-row")].filter((row) => row.scrollWidth > row.clientWidth + 1).length, filterWidth: document.querySelector(".race-market-board__filters").getBoundingClientRect().width, widest: [...document.querySelectorAll("body *")].map((node) => ({ className: node.className, right: node.getBoundingClientRect().right, width: node.getBoundingClientRect().width })).filter((item) => typeof item.className === "string" && item.right > document.documentElement.clientWidth + 1).sort((a, b) => b.right - a.right).slice(0, 5) }))()`);
    report.audits.mobile = mobile;
    assert(mobile.overflow === 0 && mobile.clippedRows === 0 && mobile.filterWidth <= 390, "Mobile race market board overflows.");
    report.assertions.push("Mobile market board has no page overflow or clipped rows");
    await capture(client, "race-market-board-mobile-390x844.png");
    report.screenshots.push("race-market-board-mobile-390x844.png");
    report.passed = true;
  } catch (error) {
    report.error = error.stack || error.message;
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
