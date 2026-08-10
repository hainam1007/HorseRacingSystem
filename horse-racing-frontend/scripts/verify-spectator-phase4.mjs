import { spawn } from "node:child_process";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const ARTIFACT_DIR = path.join(ROOT, "artifacts", "phase-4");
const PROFILE_DIR = path.join(tmpdir(), `horse-racing-phase4-chrome-${process.pid}`);
const CHROME_PATH = process.env.CHROME_PATH || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const APP_URL = process.env.APP_URL || "http://127.0.0.1:5184/spectator/predictions/1";
const DEBUG_PORT = Number(process.env.CHROME_DEBUG_PORT || 9334);

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function waitForJson(url, timeout = 12000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return response.json();
    } catch {
      // Chrome is still starting.
    }
    await delay(150);
  }
  throw new Error(`Timed out waiting for ${url}`);
}

async function ensureAppServer() {
  try {
    const response = await fetch(`${new URL(APP_URL).origin}/`);
    if (response.ok) return null;
  } catch {
    // Start a server owned by this verification process.
  }

  const appUrl = new URL(APP_URL);
  const vite = spawn(process.execPath, [path.join(ROOT, "node_modules", "vite", "bin", "vite.js"), "--host", appUrl.hostname, "--port", appUrl.port], {
    cwd: ROOT,
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  vite.output = [];
  vite.stdout.on("data", (chunk) => vite.output.push(chunk.toString()));
  vite.stderr.on("data", (chunk) => vite.output.push(chunk.toString()));
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${appUrl.origin}/`);
      if (response.ok) return vite;
    } catch {
      // Vite is still starting.
    }
    await delay(150);
  }
  vite.kill();
  throw new Error(`Vite did not start at ${appUrl.origin}`);
}

class CdpClient {
  constructor(url) {
    this.nextId = 1;
    this.pending = new Map();
    this.socket = new WebSocket(url);
    this.ready = new Promise((resolve, reject) => {
      this.socket.addEventListener("open", resolve, { once: true });
      this.socket.addEventListener("error", reject, { once: true });
    });
    this.socket.addEventListener("message", (event) => {
      const message = JSON.parse(event.data);
      if (!message.id) return;
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      if (message.error) pending.reject(new Error(`${pending.method}: ${message.error.message}`));
      else pending.resolve(message.result);
    });
  }

  async send(method, params = {}) {
    await this.ready;
    const id = this.nextId++;
    const result = new Promise((resolve, reject) => this.pending.set(id, { resolve, reject, method }));
    this.socket.send(JSON.stringify({ id, method, params }));
    return result;
  }

  close() {
    this.socket.close();
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function evaluate(client, expression, awaitPromise = false) {
  const serializableExpression = awaitPromise
    ? `(async () => JSON.stringify(await (${expression})))()`
    : `JSON.stringify(${expression})`;
  const response = await client.send("Runtime.evaluate", {
    expression: serializableExpression,
    awaitPromise,
    returnByValue: true,
  });
  if (response.exceptionDetails) {
    throw new Error(response.exceptionDetails.exception?.description || response.exceptionDetails.text);
  }
  return response.result.value === undefined ? undefined : JSON.parse(response.result.value);
}

async function waitFor(client, expression, message, timeout = 12000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await evaluate(client, expression)) return;
    await delay(120);
  }
  throw new Error(message);
}

async function clickButton(client, label) {
  const clicked = await evaluate(client, `(() => {
    const button = [...document.querySelectorAll("button")].find((item) => item.textContent.trim().toLowerCase() === ${JSON.stringify(label.toLowerCase())});
    if (!button) return false;
    button.click();
    return true;
  })()`);
  assert(clicked, `Could not find button: ${label}`);
}

async function setViewport(client, width, height, mobile = false) {
  await client.send("Emulation.setScrollbarsHidden", { hidden: true });
  await client.send("Emulation.setDeviceMetricsOverride", {
    width,
    height,
    deviceScaleFactor: 1,
    mobile,
    screenWidth: width,
    screenHeight: height,
  });
}

async function screenshot(client, filename) {
  const result = await client.send("Page.captureScreenshot", {
    format: "png",
    captureBeyondViewport: false,
    fromSurface: true,
  });
  await writeFile(path.join(ARTIFACT_DIR, filename), Buffer.from(result.data, "base64"));
}

async function run() {
  await mkdir(ARTIFACT_DIR, { recursive: true });
  await rm(PROFILE_DIR, { recursive: true, force: true });

  const vite = await ensureAppServer();

  const chrome = spawn(CHROME_PATH, [
    "--headless=new",
    "--disable-gpu",
    "--hide-scrollbars",
    "--no-first-run",
    "--no-default-browser-check",
    `--remote-debugging-port=${DEBUG_PORT}`,
    `--user-data-dir=${PROFILE_DIR}`,
    `${new URL(APP_URL).origin}/`,
  ], { stdio: "ignore" });

  const report = { assertions: [], screenshots: [], viewportAudits: {} };
  let client;

  try {
    const targets = await waitForJson(`http://127.0.0.1:${DEBUG_PORT}/json`);
    const target = targets.find((item) => item.type === "page" && item.url.startsWith(new URL(APP_URL).origin));
    assert(target, "Chrome did not expose a page target.");
    client = new CdpClient(target.webSocketDebuggerUrl);
    await client.send("Page.enable");
    await client.send("Runtime.enable");
    await delay(800);
    report.stage = "initial-target";
    report.initialTarget = await evaluate(client, `({ href: location.href, origin: location.origin, readyState: document.readyState, body: document.body?.innerText?.slice(0, 200) || "" })`);

    const bootstrap = `(() => {
      localStorage.setItem("horse_racing_token", "phase-4-browser-token");
      localStorage.setItem("horse_racing_user", JSON.stringify({ id: "phase-4-spectator", full_name: "Phase 4 Spectator", email: "phase4@example.com" }));
      localStorage.setItem("horse_racing_roles", JSON.stringify(["spectator"]));
      localStorage.setItem("horse_racing_profiles", JSON.stringify({ spectator: { id: "phase-4-profile" } }));
      localStorage.setItem("horse_racing_active_role", "spectator");
      const nativeFetch = window.fetch.bind(window);
      window.fetch = (input, init) => {
        const url = typeof input === "string" ? input : input.url;
        if (url.includes("/api/auth/me")) {
          return Promise.resolve(new Response(JSON.stringify({ success: true, data: {
            user: { id: "phase-4-spectator", full_name: "Phase 4 Spectator", email: "phase4@example.com" },
            roles: ["spectator"], profiles: { spectator: { id: "phase-4-profile" } }
          }}), { status: 200, headers: { "Content-Type": "application/json" } }));
        }
        return nativeFetch(input, init);
      };
    })();`;
    report.stage = "origin-ready";
    await waitFor(client, `location.origin === ${JSON.stringify(new URL(APP_URL).origin)} && document.readyState === "complete"`, "Application origin did not load.");
    report.stage = "install-bootstrap";
    await client.send("Page.addScriptToEvaluateOnNewDocument", { source: bootstrap });
    await setViewport(client, 1440, 900);
    report.stage = "navigate-race-room";
    await client.send("Page.navigate", { url: APP_URL });
    try {
      report.stage = "wait-race-room";
      await waitFor(client, `document.querySelectorAll(".live-race-oval-runner").length === 5`, "Race room did not render five runners.", 15000);
    } catch (error) {
      await screenshot(client, "bootstrap-failure.png");
      report.bootstrapSnapshot = await evaluate(client, `(() => {
        let storage = { unavailable: true };
        try {
          storage = { token: localStorage.getItem("horse_racing_token"), roles: localStorage.getItem("horse_racing_roles"), activeRole: localStorage.getItem("horse_racing_active_role") };
        } catch {}
        return { url: location.href, title: document.title, body: document.body?.innerText?.slice(0, 1200) || "", localStorage: storage };
      })()`);
      report.vite = vite ? { exitCode: vite.exitCode, signalCode: vite.signalCode, output: vite.output?.join("").slice(-2000) } : { reusedExistingServer: true };
      throw error;
    }
    report.assertions.push("Race room rendered five pixel-horse runners");

    report.stage = "open-betting";
    await clickButton(client, "open");
    report.stage = "wait-open-betting";
    await waitFor(client, `document.querySelector(".live-race-confirm") && !document.querySelector("#prediction-room-stake").disabled`, "Betting form did not open.");
    report.stage = "read-initial-balance";
    const initialBalance = await evaluate(client, `document.querySelector(".live-race-betting__wallet strong").textContent`);
    await evaluate(client, `(() => {
      document.querySelector(".live-race-horse-picks button").click();
      const input = document.querySelector("#prediction-room-stake");
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
      setter.call(input, "200");
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
    })()`);
    await waitFor(client, `!document.querySelector(".live-race-confirm").disabled`, "Valid bet did not enable confirmation.");
    await clickButton(client, "confirm bet");
    await waitFor(client, `Boolean(document.querySelector(".prediction-confirm-modal"))`, "Bet confirmation modal did not open.");
    await clickButton(client, "confirm prediction");
    await waitFor(client, `Boolean(document.querySelector(".live-race-bet-message--success"))`, "Bet was not accepted.", 4000);
    const updatedBalance = await evaluate(client, `document.querySelector(".live-race-betting__wallet strong").textContent`);
    assert(initialBalance !== updatedBalance, "Wallet balance did not update after accepted bet.");
    report.assertions.push(`Accepted bet updated wallet from ${initialBalance} to ${updatedBalance}`);

    const duplicateResult = await evaluate(client, `(async () => {
      const { MockRaceTransport } = await import("/src/realtime/MockRaceTransport.js");
      const transport = new MockRaceTransport();
      transport.connected = true;
      transport.raceId = "duplicate-check";
      transport.marketState = "open";
      const payload = { client_request_id: "same-request", race_id: "duplicate-check", horse_ids: ["horse-1"], bet_type: "win", odds: 2, stake: 100 };
      const first = await transport.submitBet(payload);
      const balanceAfterFirst = transport.balance;
      const second = await transport.submitBet(payload);
      return { balanceAfterFirst, balanceAfterSecond: transport.balance, sameBet: first.bet.id === second.bet.id };
    })()`, true);
    assert(duplicateResult.sameBet && duplicateResult.balanceAfterFirst === duplicateResult.balanceAfterSecond, "Duplicate request protection failed.");
    report.assertions.push("Duplicate client_request_id returned the original bet without a second wallet deduction");

    await clickButton(client, "open");
    await evaluate(client, `document.querySelector(".live-race-horse-picks button").click()`);
    await clickButton(client, "locked");
    const lockAudit = await evaluate(client, `(() => {
      const controls = [...document.querySelectorAll(".live-race-betting button, .live-race-betting input")];
      return { total: controls.length, disabled: controls.filter((item) => item.disabled).length, modalOpen: Boolean(document.querySelector(".prediction-confirm-modal")) };
    })()`);
    assert(lockAudit.total > 0 && lockAudit.disabled === lockAudit.total && !lockAudit.modalOpen, "stop_betting did not immediately lock every betting control.");
    report.assertions.push(`stop_betting disabled all ${lockAudit.total} betting controls immediately`);

    await clickButton(client, "racing");
    await delay(1400);
    const firstPositions = await evaluate(client, `[...document.querySelectorAll(".live-race-oval-runner")].map((item) => ({ progress: Number(item.dataset.progress), transform: item.style.transform }))`);
    await delay(900);
    const secondPositions = await evaluate(client, `[...document.querySelectorAll(".live-race-oval-runner")].map((item) => ({ progress: Number(item.dataset.progress), transform: item.style.transform }))`);
    assert(firstPositions.length === 5 && secondPositions.length === 5, "Race viewer lost one or more runners.");
    assert(secondPositions.some((item, index) => item.progress > firstPositions[index].progress && item.transform !== firstPositions[index].transform), "Runner positions did not advance on the oval track.");
    report.assertions.push("Five runners advanced between sampled animation frames");

    const desktopAudit = await evaluate(client, `(() => {
      const track = document.querySelector(".live-race-track").getBoundingClientRect();
      const runners = [...document.querySelectorAll(".live-race-oval-runner")].map((item) => item.getBoundingClientRect());
      return {
        viewport: { width: innerWidth, height: innerHeight },
        documentOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        track: { width: track.width, height: track.height },
        visibleRunners: runners.filter((rect) => rect.width > 0 && rect.height > 0).length,
        runnersInsideTrack: runners.filter((rect) => rect.left >= track.left - 40 && rect.right <= track.right + 40 && rect.top >= track.top - 40 && rect.bottom <= track.bottom + 40).length
      };
    })()`);
    assert(desktopAudit.track.width > 500 && desktopAudit.track.height > 200 && desktopAudit.visibleRunners === 5, "Desktop track is blank or incorrectly sized.");
    assert(desktopAudit.documentOverflow <= 1 && desktopAudit.runnersInsideTrack === 5, "Desktop layout has horizontal overflow or clipped runners.");
    report.viewportAudits.desktop = desktopAudit;
    await evaluate(client, `document.querySelector(".live-race-track").scrollIntoView({ block: "center" })`);
    await delay(250);
    await screenshot(client, "spectator-race-desktop-1440x900.png");
    report.screenshots.push("spectator-race-desktop-1440x900.png");

    await clickButton(client, "finished");
    await waitFor(client, `document.querySelectorAll(".live-race-podium__place").length === 3`, "Top 3 overlay did not render.");
    const finishAudit = await evaluate(client, `({ podiumPlaces: document.querySelectorAll(".live-race-podium__place").length, rankingRows: document.querySelectorAll(".live-race-ranking__row").length })`);
    assert(finishAudit.podiumPlaces === 3 && finishAudit.rankingRows === 5, "Finished state has incorrect podium or ranking count.");
    report.assertions.push("Finished state rendered five ranking rows and the official Top 3 overlay");

    await setViewport(client, 390, 844, false);
    await delay(350);
    await evaluate(client, `document.querySelector(".live-race-track").scrollIntoView({ block: "start" })`);
    await delay(250);
    const mobileAudit = await evaluate(client, `(() => {
      const track = document.querySelector(".live-race-track").getBoundingClientRect();
      const podium = document.querySelector(".live-race-podium").getBoundingClientRect();
      const clientWidth = document.documentElement.clientWidth;
      const overflowingText = [...document.querySelectorAll(".live-race-room button, .live-race-room strong, .live-race-room small")]
        .filter((item) => item.scrollWidth > item.clientWidth + 2).length;
      const offenders = [...document.querySelectorAll("body *")]
        .map((item) => ({ item, rect: item.getBoundingClientRect() }))
        .filter(({ rect }) => rect.width > 0 && (rect.right > clientWidth + 1 || rect.left < -1))
        .slice(0, 12)
        .map(({ item, rect }) => ({ tag: item.tagName, className: item.className?.toString().slice(0, 100) || "", left: rect.left, right: rect.right, width: rect.width }));
      return {
        viewport: { width: innerWidth, height: innerHeight },
        clientWidth,
        documentOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        track: { width: track.width, height: track.height },
        podium: { width: podium.width, left: podium.left, right: podium.right },
        overflowingText,
        offenders
      };
    })()`);
    report.viewportAudits.mobile = mobileAudit;
    await screenshot(client, "spectator-race-mobile-390x844.png");
    report.screenshots.push("spectator-race-mobile-390x844.png");
    assert(mobileAudit.track.width >= 300 && mobileAudit.track.height > 170, "Mobile track is blank or collapsed.");
    assert(mobileAudit.documentOverflow <= 1 && mobileAudit.podium.left >= 0 && mobileAudit.podium.right <= 390, "Mobile layout overflows or clips the podium.");

    report.stage = "complete";
    report.passed = true;
  } catch (error) {
    report.passed = false;
    report.error = error.stack || error.message;
    throw error;
  } finally {
    await writeFile(path.join(ARTIFACT_DIR, "verification-report.json"), JSON.stringify(report, null, 2));
    client?.close();
    chrome.kill();
    vite?.kill();
    await delay(500);
    try {
      await rm(PROFILE_DIR, { recursive: true, force: true, maxRetries: 3, retryDelay: 250 });
    } catch {
      // Chrome can briefly retain its Crashpad file on Windows; artifacts remain harmless.
    }
  }

  return report;
}

run()
  .then((report) => {
    console.log(JSON.stringify(report, null, 2));
  })
  .catch((error) => {
    console.error(error.stack || error.message);
    process.exitCode = 1;
  });
