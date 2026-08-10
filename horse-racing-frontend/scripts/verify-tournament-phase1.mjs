import { spawn } from "node:child_process";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const OUTPUT = path.join(ROOT, "artifacts", "tournament-phase-1");
const PROFILE = path.join(tmpdir(), `horse-racing-tournament-${process.pid}`);
const APP_ORIGIN = "http://127.0.0.1:5185";
const DEBUG_PORT = 9335;
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

  close() {
    this.socket.close();
  }
}

function assert(value, message) {
  if (!value) throw new Error(message);
}

async function evaluate(client, expression) {
  const response = await client.send("Runtime.evaluate", {
    expression: `JSON.stringify(${expression})`,
    returnByValue: true,
  });
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

async function run() {
  await mkdir(OUTPUT, { recursive: true });
  await rm(PROFILE, { recursive: true, force: true });

  const vite = spawn(process.execPath, [path.join(ROOT, "node_modules", "vite", "bin", "vite.js"), "--host", "127.0.0.1", "--port", "5185"], {
    cwd: ROOT,
    stdio: "ignore",
    windowsHide: true,
  });

  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    try {
      if ((await fetch(APP_ORIGIN)).ok) break;
    } catch {}
    await wait(150);
  }

  const chrome = spawn(CHROME, [
    "--headless=new",
    "--disable-gpu",
    "--hide-scrollbars",
    "--no-first-run",
    `--remote-debugging-port=${DEBUG_PORT}`,
    `--user-data-dir=${PROFILE}`,
    `${APP_ORIGIN}/`,
  ], { stdio: "ignore" });

  const report = { passed: false, assertions: [], screenshots: [], audits: {} };
  let client;

  try {
    let targets;
    const targetDeadline = Date.now() + 12000;
    while (Date.now() < targetDeadline) {
      try {
        targets = await (await fetch(`http://127.0.0.1:${DEBUG_PORT}/json`)).json();
        if (targets.length) break;
      } catch {}
      await wait(150);
    }
    const target = targets.find((item) => item.type === "page" && item.url.startsWith(APP_ORIGIN));
    assert(target, "Browser target was not created.");
    client = new Cdp(target.webSocketDebuggerUrl);
    await client.send("Page.enable");
    await client.send("Runtime.enable");

    const bootstrap = `(() => {
      localStorage.setItem("horse_racing_token", "phase-1-token");
      localStorage.setItem("horse_racing_user", JSON.stringify({ id: "phase-1", full_name: "Phase 1 Spectator" }));
      localStorage.setItem("horse_racing_roles", JSON.stringify(["spectator"]));
      localStorage.setItem("horse_racing_profiles", JSON.stringify({ spectator: { id: "phase-1-profile" } }));
      localStorage.setItem("horse_racing_active_role", "spectator");
      const nativeFetch = window.fetch.bind(window);
      window.fetch = (input, init) => {
        const url = typeof input === "string" ? input : input.url;
        if (url.includes("/api/auth/me")) return Promise.resolve(new Response(JSON.stringify({ success: true, data: { user: { id: "phase-1", full_name: "Phase 1 Spectator" }, roles: ["spectator"], profiles: { spectator: { id: "phase-1-profile" } } } }), { status: 200, headers: { "Content-Type": "application/json" } }));
        return nativeFetch(input, init);
      };
    })();`;
    await client.send("Page.addScriptToEvaluateOnNewDocument", { source: bootstrap });
    await setViewport(client, 1440, 1000);
    await client.send("Page.navigate", { url: `${APP_ORIGIN}/spectator/tournaments/1` });
    await waitFor(client, `document.querySelectorAll(".race-hub-row").length === 4`, "Tournament race rows did not render.");

    const desktop = await evaluate(client, `(() => ({
      rows: document.querySelectorAll(".race-hub-row").length,
      betButtons: [...document.querySelectorAll(".race-hub-action--primary")].filter((item) => item.textContent.includes("Bet now")).length,
      liveRows: document.querySelectorAll(".race-hub-row--running").length,
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      filters: document.querySelectorAll(".race-hub-filters button").length
    }))()`);
    assert(desktop.rows === 4, "All tournament races are not visible.");
    assert(desktop.betButtons === 1, "Bet now must appear only for the explicit open market.");
    assert(desktop.liveRows === 1 && desktop.filters === 4, "Live state or filters are incomplete.");
    assert(desktop.overflow === 0, "Desktop tournament page has horizontal overflow.");
    report.assertions.push("Rendered all four races with one explicit open-market Bet now CTA");
    report.assertions.push("Rendered canonical race filters and live state without desktop overflow");
    report.audits.desktop = desktop;
    await capture(client, "tournament-detail-desktop-1440x1000.png");
    report.screenshots.push("tournament-detail-desktop-1440x1000.png");

    await evaluate(client, `(() => { [...document.querySelectorAll(".race-hub-filters button")].find((item) => item.textContent.includes("Completed")).click(); return true; })()`);
    await waitFor(client, `document.querySelectorAll(".race-hub-row").length === 1 && Boolean(document.querySelector(".race-hub-row--completed"))`, "Completed filter failed.");
    report.assertions.push("Completed filter reduced the list to the completed race");

    await evaluate(client, `(() => { [...document.querySelectorAll(".race-hub-filters button")].find((item) => item.textContent.includes("All races")).click(); return true; })()`);
    await waitFor(client, `document.querySelectorAll(".race-hub-row").length === 4`, "All races filter failed.");
    const detailHref = await evaluate(client, `document.querySelector(".race-hub-action--secondary").href`);
    await client.send("Page.navigate", { url: detailHref });
    await waitFor(client, `Boolean(document.querySelector(".race-overview-track__oval"))`, "Race detail track preview did not render.");
    const detail = await evaluate(client, `({
      trackWidth: document.querySelector(".race-overview-track__oval").getBoundingClientRect().width,
      bettingInputs: document.querySelectorAll(".race-overview-page input, .race-overview-page .live-race-betting, .race-overview-page .live-race-stake").length,
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth
    })`);
    report.audits.raceDetail = detail;
    await capture(client, "race-detail-desktop-1440x1000.png");
    report.screenshots.push("race-detail-desktop-1440x1000.png");
    assert(detail.trackWidth > 600 && detail.bettingInputs === 0 && detail.overflow === 0, "Race detail is blank, overflowing, or contains betting controls.");
    report.assertions.push("View Race opened a nonblank track preview with no betting controls");

    await client.send("Page.navigate", { url: `${APP_ORIGIN}/spectator/tournaments/1` });
    await waitFor(client, `document.querySelectorAll(".race-hub-row").length === 4`, "Tournament page did not reload for mobile audit.");
    await setViewport(client, 390, 844);
    await wait(300);
    const mobile = await evaluate(client, `({
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      rowWidth: document.querySelector(".race-hub-row").getBoundingClientRect().width,
      viewportWidth: document.documentElement.clientWidth,
      wrappedButtons: [...document.querySelectorAll(".race-hub-action")].filter((item) => item.scrollHeight > item.clientHeight + 2).length
    })`);
    assert(mobile.overflow === 0 && mobile.rowWidth <= mobile.viewportWidth && mobile.wrappedButtons === 0, "Mobile race hub has overflow or wrapped CTA labels.");
    report.assertions.push("Mobile race hub has no horizontal overflow or wrapped CTA labels");
    report.audits.mobile = mobile;
    await capture(client, "tournament-detail-mobile-390x844.png");
    report.screenshots.push("tournament-detail-mobile-390x844.png");
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

run().then((report) => console.log(JSON.stringify(report, null, 2))).catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
