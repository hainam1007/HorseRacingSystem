import { spawn } from "node:child_process";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const OUTPUT = path.join(ROOT, "artifacts", "race-detail-phase-2");
const PROFILE = path.join(tmpdir(), `horse-racing-race-detail-${process.pid}`);
const APP_ORIGIN = "http://127.0.0.1:5186";
const DEBUG_PORT = 9336;
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

async function navigate(client, raceId) {
  await client.send("Page.navigate", { url: `${APP_ORIGIN}/spectator/tournaments/1/races/${raceId}` });
  await waitFor(client, `document.querySelectorAll(".live-race-oval-runner").length === 5`, `${raceId} did not render five runners.`);
}

async function run() {
  await mkdir(OUTPUT, { recursive: true });
  await rm(PROFILE, { recursive: true, force: true });
  const vite = spawn(process.execPath, [path.join(ROOT, "node_modules", "vite", "bin", "vite.js"), "--host", "127.0.0.1", "--port", "5186"], { cwd: ROOT, stdio: "ignore", windowsHide: true });

  const serverDeadline = Date.now() + 15000;
  while (Date.now() < serverDeadline) {
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
    await client.send("Page.addScriptToEvaluateOnNewDocument", { source: `(() => {
      localStorage.setItem("horse_racing_token", "phase-2-token");
      localStorage.setItem("horse_racing_user", JSON.stringify({ id: "phase-2", full_name: "Phase 2 Spectator" }));
      localStorage.setItem("horse_racing_roles", JSON.stringify(["spectator"]));
      localStorage.setItem("horse_racing_profiles", JSON.stringify({ spectator: { id: "phase-2-profile" } }));
      localStorage.setItem("horse_racing_active_role", "spectator");
      const nativeFetch = window.fetch.bind(window);
      window.fetch = (input, init) => {
        const url = typeof input === "string" ? input : input.url;
        if (url.includes("/api/auth/me")) return Promise.resolve(new Response(JSON.stringify({ success: true, data: { user: { id: "phase-2", full_name: "Phase 2 Spectator" }, roles: ["spectator"], profiles: { spectator: { id: "phase-2-profile" } } } }), { status: 200, headers: { "Content-Type": "application/json" } }));
        if (url.includes("/api/tournaments") || url.includes("/api/races")) return Promise.reject(new Error("Phase 2 fixture mode"));
        return nativeFetch(input, init);
      };
    })();` });

    await setViewport(client, 1440, 1100);
    await navigate(client, "race-opening-sprint");
    const scheduled = await evaluate(client, `(() => ({
      runners: document.querySelectorAll(".live-race-oval-runner").length,
      participants: document.querySelectorAll(".race-detail-field__row").length,
      betCta: [...document.querySelectorAll("a")].filter((node) => node.textContent.includes("Bet on this race")).length,
      bettingControls: document.querySelectorAll(".race-overview-page input, .race-overview-page select, .race-overview-page .live-race-betting").length,
      status: document.querySelector(".live-race-viewer__status")?.textContent.trim(),
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth
    }))()`);
    assert(scheduled.runners === 5 && scheduled.participants === 5, "Scheduled field is incomplete.");
    assert(scheduled.betCta === 1 && scheduled.bettingControls === 0, "Race detail CTA boundary is incorrect.");
    assert(scheduled.status === "Starting field confirmed" && scheduled.overflow === 0, "Scheduled state or desktop layout is incorrect.");
    report.audits.scheduled = scheduled;
    report.assertions.push("Scheduled race renders five approved runners, one navigation CTA, and no betting controls");

    await navigate(client, "race-derby-trial");
    const startingGate = await evaluate(client, `(() => ({
      status: document.querySelector(".live-race-viewer__status")?.textContent.trim(),
      label: document.querySelector(".live-race-oval__finish span")?.textContent.trim(),
      progress: [...document.querySelectorAll(".live-race-oval-runner")].map((node) => node.dataset.progress)
    }))()`);
    assert(startingGate.status === "Runners at the gate" && startingGate.label === "Start", "Live race did not begin at the starting line.");
    assert(startingGate.progress.every((value) => value === "0"), "Runners were not aligned at zero race progress.");
    const before = await evaluate(client, `getComputedStyle(document.querySelector(".live-race-oval-runner")).transform`);
    await wait(3900);
    const running = await evaluate(client, `(() => ({
      after: getComputedStyle(document.querySelector(".live-race-oval-runner")).transform,
      status: document.querySelector(".live-race-viewer__status")?.textContent.trim(),
      rows: document.querySelectorAll(".live-race-ranking__row").length,
      broadcast: document.querySelector(".live-race-broadcast")?.textContent.trim(),
      leader: document.querySelector(".live-race-leader-callout strong")?.textContent.trim(),
      gapLabels: [...document.querySelectorAll(".live-race-ranking__row > b")].map((node) => node.textContent.trim()),
      viewerToTablesGap: Math.round(document.querySelector(".live-race-lower-grid").getBoundingClientRect().top - document.querySelector(".live-race-viewer").getBoundingClientRect().bottom),
      tableGap: Math.round(document.querySelector(".race-detail-field").getBoundingClientRect().left - document.querySelector(".live-race-ranking").getBoundingClientRect().right),
      betCta: [...document.querySelectorAll("a")].filter((node) => node.textContent.includes("Bet on this race")).length,
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth
    }))()`);
    assert(before !== running.after, "Live runner did not move between animation frames.");
    assert(running.status === "Race in progress" && running.rows === 5 && running.betCta === 0 && running.overflow === 0, "Live state is incomplete.");
    assert(running.broadcast?.includes("Live") && running.leader?.startsWith("#"), "Live broadcast telemetry is missing.");
    assert(running.gapLabels[0] === "Leader" && running.gapLabels.slice(1).some((label) => label.startsWith("+")), "Live gap labels are incomplete.");
    assert(running.viewerToTablesGap >= 18 && running.tableGap >= 18, "Race detail panels are still visually touching.");
    report.audits.running = { ...running, before, startingGate };
    report.assertions.push("Running race animates runner coordinates and updates a five-row live ranking");
    await capture(client, "race-detail-running-desktop-1440x1100.png");
    report.screenshots.push("race-detail-running-desktop-1440x1100.png");

    await navigate(client, "race-morning-classic");
    await waitFor(client, `document.querySelector(".live-race-viewer__status")?.textContent.trim() === "Official finish"`, "Completed race did not reach its official state.");
    const completed = await evaluate(client, `(() => ({
      podium: document.querySelectorAll(".live-race-podium__place").length,
      rows: document.querySelectorAll(".live-race-ranking__row").length,
      firstPlace: document.querySelector(".live-race-ranking__row strong")?.textContent.trim(),
      runnerTransforms: [...document.querySelectorAll(".live-race-oval-runner")].map((node) => getComputedStyle(node).transform),
      runnerCoordinates: [...document.querySelectorAll(".live-race-oval-runner")].map((node) => {
        const rect = node.getBoundingClientRect();
        return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
      }),
      status: document.querySelector(".live-race-viewer__status")?.textContent.trim(),
      official: document.querySelector(".live-race-section-heading small")?.textContent.trim(),
      bettingControls: document.querySelectorAll(".race-overview-page input, .race-overview-page select, .race-overview-page .live-race-betting").length
    }))()`);
    assert(completed.podium === 3 && completed.rows === 5 && completed.status === "Official finish", "Completed result state is incomplete.");
    assert(completed.bettingControls === 0, "Completed race contains betting controls.");
    assert(completed.firstPlace === "Golden Gallop", "Finish order does not match the race result.");
    assert(new Set(completed.runnerTransforms).size === 5, "Finished runners collapsed onto the same track position.");
    const finishSeparations = completed.runnerCoordinates.slice(1).map((point, index) => Math.hypot(point.x - completed.runnerCoordinates[index].x, point.y - completed.runnerCoordinates[index].y));
    assert(finishSeparations.every((distance) => distance >= 18), "Finished runners are not spaced clearly enough.");
    completed.finishSeparations = finishSeparations.map((distance) => Math.round(distance));
    report.audits.completed = completed;
    report.assertions.push("Completed race renders official Top 3 and all five final positions");
    await wait(700);
    await capture(client, "race-detail-completed-desktop-1440x1100.png");
    report.screenshots.push("race-detail-completed-desktop-1440x1100.png");

    await setViewport(client, 390, 844);
    await navigate(client, "race-opening-sprint");
    await wait(250);
    const mobile = await evaluate(client, `(() => ({
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      trackWidth: document.querySelector(".live-race-track--oval").getBoundingClientRect().width,
      viewportWidth: document.documentElement.clientWidth,
      clippedRows: [...document.querySelectorAll(".race-detail-field__row")].filter((row) => row.scrollWidth > row.clientWidth + 1).length
    }))()`);
    assert(mobile.overflow === 0 && mobile.trackWidth <= mobile.viewportWidth && mobile.clippedRows === 0, "Mobile race detail overflows or clips participant rows.");
    report.audits.mobile = mobile;
    report.assertions.push("Mobile race detail has no horizontal overflow or clipped participant rows");
    await capture(client, "race-detail-scheduled-mobile-390x844.png");
    report.screenshots.push("race-detail-scheduled-mobile-390x844.png");
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
