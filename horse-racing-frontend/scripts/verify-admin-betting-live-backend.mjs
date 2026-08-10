import { spawn } from "node:child_process";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const OUTPUT = path.join(ROOT, "artifacts", "admin-betting-live-backend");
const PROFILE = path.join(tmpdir(), `horse-racing-admin-betting-live-${process.pid}`);
const APP_ORIGIN = "http://127.0.0.1:5189";
const DEBUG_PORT = 9339;
const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";

const API_BASE_URL = process.env.VITE_API_BASE_URL || process.env.BETTING_VERIFY_API_BASE_URL || "http://127.0.0.1:3000/api";
const ADMIN_TOKEN = process.env.BETTING_VERIFY_ADMIN_TOKEN || process.env.ADMIN_TOKEN || "";
const TARGET_RACE_ID = process.env.BETTING_VERIFY_RACE_ID || "";
const ALLOW_MUTATION = process.env.BETTING_VERIFY_MUTATE === "1";
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

async function waitFor(client, expression, message, timeout = 20000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await evaluate(client, expression)) return;
    await wait(150);
  }
  throw new Error(message);
}

async function capture(client, name) {
  const result = await client.send("Page.captureScreenshot", { format: "png", fromSurface: true });
  await writeFile(path.join(OUTPUT, name), Buffer.from(result.data, "base64"));
}

async function getLifecycleActions(client) {
  return evaluate(client, `[...document.querySelectorAll(".admin-competition__betting-actions button")].map((button) => ({ text: button.textContent.trim(), disabled: button.disabled }))`);
}

async function clickLifecycleAction(client, label) {
  return evaluate(client, `(() => {
    const button = [...document.querySelectorAll(".admin-competition__betting-actions button")]
      .find((item) => item.textContent.trim() === ${JSON.stringify(label)} && !item.disabled);
    if (!button) return false;
    button.click();
    return true;
  })()`);
}

async function waitForActionResult(client, label) {
  await waitFor(
    client,
    `document.querySelector(".admin-competition__success, .admin-live-state--warning")?.textContent.length > 0`,
    `${label} did not return a visible result.`,
  );
  await waitFor(
    client,
    `![...document.querySelectorAll(".admin-competition__betting-actions button")].some((button) => /\\.\\.\\.$/.test(button.textContent.trim()))`,
    `${label} did not finish.`,
  );
}

async function runLifecycleActionIfEnabled(client, label, report) {
  const actions = await getLifecycleActions(client);
  const isEnabled = actions.some((item) => item.text === label && !item.disabled);
  if (!isEnabled) {
    report.assertions.push(`Live backend ${label} action was unavailable for the selected fixture`);
    return false;
  }

  assert(await clickLifecycleAction(client, label), `${label} action was enabled but could not be clicked.`);
  await waitForActionResult(client, label);
  report.assertions.push(`Live backend ${label} action returned a visible UI result`);
  return true;
}

async function setViewport(client, width, height) {
  await client.send("Emulation.setScrollbarsHidden", { hidden: true });
  await client.send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: false });
}

function authBootstrap() {
  return `(() => {
    localStorage.setItem("horse_racing_token", ${JSON.stringify(ADMIN_TOKEN)});
    localStorage.setItem("horse_racing_user", JSON.stringify({ id: "live-admin", full_name: "Live Admin" }));
    localStorage.setItem("horse_racing_roles", JSON.stringify(["admin"]));
    localStorage.setItem("horse_racing_profiles", JSON.stringify({}));
    localStorage.setItem("horse_racing_active_role", "admin");
  })();`;
}

async function writeReport(report) {
  await mkdir(OUTPUT, { recursive: true });
  await writeFile(path.join(OUTPUT, "verification-report.json"), JSON.stringify(report, null, 2));
}

async function run() {
  const report = {
    passed: false,
    skipped: false,
    apiBaseUrl: API_BASE_URL,
    targetRaceId: TARGET_RACE_ID || null,
    mutationMode: ALLOW_MUTATION,
    assertions: [],
    screenshots: [],
    audits: {},
  };

  await mkdir(OUTPUT, { recursive: true });

  if (!ADMIN_TOKEN) {
    report.skipped = true;
    report.passed = true;
    report.skipReason = "Set BETTING_VERIFY_ADMIN_TOKEN or ADMIN_TOKEN to run live backend admin betting verification.";
    await writeReport(report);
    return report;
  }

  await rm(PROFILE, { recursive: true, force: true });
  const vite = spawn(
    process.execPath,
    [path.join(ROOT, "node_modules", "vite", "bin", "vite.js"), "--host", "127.0.0.1", "--port", "5189"],
    { cwd: ROOT, env: { ...process.env, VITE_API_BASE_URL: API_BASE_URL }, stdio: "ignore", windowsHide: true },
  );

  const serverDeadline = Date.now() + 15000;
  while (Date.now() < serverDeadline) {
    try { if ((await fetch(APP_ORIGIN)).ok) break; } catch {}
    await wait(150);
  }

  const chrome = spawn(
    CHROME,
    ["--headless=new", "--disable-gpu", "--hide-scrollbars", "--no-first-run", `--remote-debugging-port=${DEBUG_PORT}`, `--user-data-dir=${PROFILE}`, `${APP_ORIGIN}/`],
    { stdio: "ignore", windowsHide: true },
  );
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
    const target = targets?.find((item) => item.type === "page" && item.url.startsWith(APP_ORIGIN));
    assert(target, "Browser target was not created.");
    client = new Cdp(target.webSocketDebuggerUrl);
    await client.send("Page.enable");
    await client.send("Runtime.enable");
    await client.send("Page.addScriptToEvaluateOnNewDocument", { source: authBootstrap() });

    await setViewport(client, 1440, 1000);
    await client.send("Page.navigate", { url: `${APP_ORIGIN}/admin/schedule` });
    await waitFor(client, `Boolean(document.querySelector(".admin-competition__betting-panel, .admin-live-state--warning"))`, "Admin schedule did not finish loading.");

    const loadState = await evaluate(client, `(() => ({
      error: document.querySelector(".admin-live-state--warning")?.textContent.trim() || "",
      raceOptions: [...document.querySelectorAll(".admin-competition__betting-controls > .admin-field select option")].map((option) => ({ value: option.value, text: option.textContent.trim() }))
    }))()`);
    assert(!loadState.error, `Admin schedule returned an error: ${loadState.error}`);
    assert(loadState.raceOptions.length > 0 && loadState.raceOptions[0].value, "Live backend has no races available for admin betting verification.");

    if (TARGET_RACE_ID) {
      assert(loadState.raceOptions.some((option) => option.value === TARGET_RACE_ID), `Race ${TARGET_RACE_ID} was not present in the admin schedule response.`);
      await evaluate(client, `(() => {
        const select = document.querySelector(".admin-competition__betting-controls > .admin-field select");
        Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value").set.call(select, ${JSON.stringify(TARGET_RACE_ID)});
        select.dispatchEvent(new Event("change", { bubbles: true }));
        return true;
      })()`);
      await waitFor(client, `document.querySelector(".admin-competition__betting-controls > .admin-field select")?.value === ${JSON.stringify(TARGET_RACE_ID)}`, "Target race was not selected.");
    }

    await waitFor(client, `document.querySelectorAll(".admin-competition__betting-actions button").length === 4`, "Admin betting lifecycle actions did not render.");
    await waitFor(client, `Boolean(document.querySelector(".admin-competition__odds-snapshot, .admin-competition__odds-empty"))`, "Admin odds snapshot state did not render.");

    const initial = await evaluate(client, `(() => ({
      selectedRace: document.querySelector(".admin-competition__betting-controls > .admin-field select")?.value || "",
      selectedLabel: document.querySelector(".admin-competition__betting-controls > .admin-field select option:checked")?.textContent.trim() || "",
      badge: document.querySelector(".admin-competition__betting-status .admin-status-badge")?.textContent.trim() || "",
      config: [...document.querySelectorAll(".admin-competition__betting-settings input, .admin-competition__betting-settings select")].map((node) => node.value),
      oddsText: document.querySelector(".admin-competition__odds-snapshot, .admin-competition__odds-empty")?.textContent.trim() || "",
      actionTexts: [...document.querySelectorAll(".admin-competition__betting-actions button")].map((button) => ({ text: button.textContent.trim(), disabled: button.disabled })),
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth
    }))()`);
    assert(initial.selectedRace, "No race selected in the live admin betting panel.");
    assert(initial.badge, "Selected live race did not render a betting status badge.");
    assert(initial.config.length === 4 && initial.config[0] && initial.config[1] && initial.config[2], "Open betting config did not hydrate in live mode.");
    assert(initial.actionTexts.map((item) => item.text).join("|") === "Generate odds|Open betting|Close betting|Retry settle", "Lifecycle action buttons changed unexpectedly.");
    assert(initial.overflow === 0, "Live admin betting controls overflow on desktop.");
    report.audits.initial = initial;
    report.assertions.push("Live backend admin betting panel hydrates selected race status, config, odds state, and action gates");

    if (ALLOW_MUTATION && !TARGET_RACE_ID) {
      report.mutationSkipped = "BETTING_VERIFY_MUTATE=1 requires BETTING_VERIFY_RACE_ID so the verifier cannot mutate an arbitrary live race.";
      report.assertions.push("Live backend mutation mode was skipped because no explicit disposable race fixture was selected");
    } else if (ALLOW_MUTATION) {
      const mutationActions = ["Generate odds", "Open betting", "Close betting", "Retry settle"];
      for (const label of mutationActions) {
        await runLifecycleActionIfEnabled(client, label, report);
      }
      report.audits.afterMutation = {
        actionTexts: await getLifecycleActions(client),
        notice: await evaluate(client, `document.querySelector(".admin-competition__success, .admin-live-state--warning")?.textContent.trim() || ""`),
      };
    }

    await capture(client, "admin-betting-live-desktop-1440x1000.png");
    report.screenshots.push("admin-betting-live-desktop-1440x1000.png");

    await setViewport(client, 390, 844);
    await wait(300);
    const mobile = await evaluate(client, `(() => ({
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      panelWidth: Math.round(document.querySelector(".admin-competition__betting-panel").getBoundingClientRect().width),
      clippedActions: [...document.querySelectorAll(".admin-competition__betting-actions button")].filter((button) => button.scrollWidth > button.clientWidth + 1).length
    }))()`);
    assert(mobile.overflow === 0 && mobile.panelWidth <= 390 && mobile.clippedActions === 0, "Live mobile admin betting controls overflow or clip action text.");
    report.audits.mobile = mobile;
    report.assertions.push("Live backend mobile admin betting panel has no horizontal overflow or clipped action buttons");
    await capture(client, "admin-betting-live-mobile-390x844.png");
    report.screenshots.push("admin-betting-live-mobile-390x844.png");

    report.passed = true;
  } catch (error) {
    report.error = error.stack || error.message;
    if (client) {
      try {
        report.debug = await evaluate(client, `(() => ({
          url: location.href,
          bodyText: document.body.textContent.slice(0, 1600),
          alerts: [...document.querySelectorAll("[role='alert'], .admin-live-state--warning")].map((node) => node.textContent.trim())
        }))()`);
      } catch (debugError) {
        report.debugError = debugError.stack || debugError.message;
      }
    }
    throw error;
  } finally {
    await writeReport(report);
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
