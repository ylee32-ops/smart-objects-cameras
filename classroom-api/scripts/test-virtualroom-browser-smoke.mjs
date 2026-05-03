#!/usr/bin/env node

import { spawn } from "node:child_process";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

const ROOM_URL = process.env.SMART_ROOM_URL || "http://127.0.0.1:4177";
const DEBUG_PORT = Number(process.env.SMART_ROOM_DEBUG_PORT || 9337);
const SMOKE_URL = `${ROOM_URL}/ideas/virtualroom/?smoke=1`;
const ROOT = resolve(import.meta.dirname, "..");
const EXPECTED_MARKER_PAD_ROLES = ["sticky", "zone", "action", "figurate", "focus", "write", "tool", "slide", "video", "object3d", "vertex", "timer"];
const EXPECTED_MARKER_TAG_ROLES = EXPECTED_MARKER_PAD_ROLES.filter((role) => role !== "sticky");

if (typeof WebSocket !== "function") {
  throw new Error("Node WebSocket support is required. Use the repo's Node 24 runtime.");
}

async function main() {
  await assertServer();
  const browserPath = findBrowser();
  if (!browserPath) {
    throw new Error("No Chrome or Edge executable found. Set BROWSER_PATH to run browser smoke.");
  }

  const profileDir = join(ROOT, ".codex_tmp", `browser-smoke-${Date.now()}`);
  mkdirSync(profileDir, { recursive: true });
  const browser = spawn(browserPath, [
    "--headless=new",
    "--disable-gpu",
    "--disable-extensions",
    "--disable-background-networking",
    "--no-first-run",
    "--no-default-browser-check",
    `--remote-debugging-port=${DEBUG_PORT}`,
    `--user-data-dir=${profileDir}`,
    "about:blank",
  ], { stdio: "ignore" });

  try {
    const version = await waitForDebugEndpoint();
    const cdp = await CdpClient.connect(version.webSocketDebuggerUrl);
    const errors = [];
    cdp.onEvent((message) => {
      const text = eventErrorText(message);
      if (text && !ignoredBrowserError(text)) errors.push(text);
    });

    const target = await cdp.send("Target.createTarget", { url: "about:blank" });
    const attached = await cdp.send("Target.attachToTarget", { targetId: target.targetId, flatten: true });
    const sessionId = attached.sessionId;

    await cdp.send("Page.enable", {}, sessionId);
    await cdp.send("Runtime.enable", {}, sessionId);
    await cdp.send("Log.enable", {}, sessionId);
    await cdp.send("Page.navigate", { url: SMOKE_URL }, sessionId);
    await cdp.waitForEvent((message) => message.sessionId === sessionId && message.method === "Page.loadEventFired", 20000);
    try {
      await waitForExpression(cdp, sessionId, "Boolean(window.__virtualRoomSmoke) && document.querySelectorAll('#markerPad button').length >= 8", 20000);
    } catch (error) {
      if (errors.length) {
        error.message = `${error.message}\nBrowser console/runtime errors:\n${errors.join("\n")}`;
      }
      throw error;
    }

    const result = await evaluate(cdp, sessionId, `
      (async () => {
        const smoke = window.__virtualRoomSmoke;
        const before = smoke.status();
        const beforeState = await fetch('/api/state').then((res) => res.json());
        const buttons = [...document.querySelectorAll('#markerPad button')];
        const buttonRoles = buttons.map((button) => button.dataset.role || button.textContent.trim());
        buttons.forEach((button) => button.click());
        let afterState = beforeState;
        for (let i = 0; i < 20; i += 1) {
          await new Promise((resolve) => setTimeout(resolve, 150));
          afterState = await fetch('/api/state').then((res) => res.json());
          const roles = new Set((afterState.markers?.items || []).map((marker) => marker.role || marker.kind));
          if (
            (afterState.board?.objects?.length || 0) > (beforeState.board?.objects?.length || 0) &&
            ['zone', 'focus', 'slide', 'video', 'figurate'].every((role) => roles.has(role))
          ) break;
        }
        const afterServerRoles = [...new Set((afterState.markers?.items || []).map((marker) => marker.role || marker.kind))];
        const afterButtons = smoke.status();
        const moved = smoke.moveFirstMarker(0.03, 0.02);
        document.getElementById('view2dBtn').click();
        document.querySelector('[data-mode="warp"]').click();
        const polygon = smoke.warpFirstCorner(0.01, 0.01);
        document.getElementById('view3dBtn').click();
        await new Promise((resolve) => setTimeout(resolve, 250));
        const afterAll = smoke.status();
        return {
          buttonCount: buttons.length,
          buttonRoles,
          before,
          beforeObjects: beforeState.board?.objects?.length || 0,
          afterButtons,
          afterObjects: afterState.board?.objects?.length || 0,
          afterServerRoles,
          moved,
          polygon,
          afterAll,
        };
      })()
    `);

    assertRoles(result.buttonRoles, EXPECTED_MARKER_PAD_ROLES, "marker pad");
    assertRoles(Object.keys(result.afterButtons.markerRoleCounts || {}), EXPECTED_MARKER_TAG_ROLES, "created marker roles");
    assertRoles(result.afterServerRoles, ["zone", "focus", "slide", "video", "figurate"], "server semantic marker roles");
    assert(result.afterObjects >= result.beforeObjects + 1, "sticky button did not create a board sticky object");
    assert(result.buttonCount >= EXPECTED_MARKER_PAD_ROLES.length, `expected marker buttons, got ${result.buttonCount}`);
    assert(
      result.afterButtons.markerCount >= result.before.markerCount + EXPECTED_MARKER_TAG_ROLES.length,
      `marker buttons did not add tags: before ${result.before.markerCount}, after ${result.afterButtons.markerCount}`,
    );
    assert(result.moved && Number.isFinite(result.moved.x), "marker move did not return a valid board point");
    assert(result.afterAll.viewMode === "3d", `expected to return to 3d, got ${result.afterAll.viewMode}`);
    assert(result.afterAll.projectorPoints?.length >= 4, "projector polygon should have at least four points");

    await cdp.send("Page.navigate", { url: `${ROOM_URL}/projector.html?map=1&status=1` }, sessionId);
    await cdp.waitForEvent((message) => message.sessionId === sessionId && message.method === "Page.loadEventFired", 20000);
    await waitForExpression(cdp, sessionId, "Boolean(window.__projectorSmoke)", 20000);
    const calibrationSet = await evaluate(cdp, sessionId, `
      fetch('/api/action', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          type: 'calibration.set',
          source: 'browser-smoke',
          payload: {
            surface: 'board',
            status: 'calibrated',
            projectorToSurfaceHomography: [
              1.25, 0, -0.125,
              0, 1.4285714285714286, -0.21428571428571427,
              0, 0, 1
            ]
          }
        })
      }).then((res) => res.json())
    `);
    assert(calibrationSet.ok === true, "browser smoke should be able to set projector calibration");
    await waitForExpression(cdp, sessionId, `(() => {
      const status = window.__projectorSmoke?.status?.();
      return Boolean(status?.hasProjectorMapping) &&
        status.warpMapping === 'mapped' &&
        status.warpClipPath.includes('polygon') &&
        Math.abs(status.topLeft.x - status.width * 0.1) < 2 &&
        Math.abs(status.topLeft.y - status.height * 0.15) < 2;
    })()`, 20000);
    const recoveryState = await evaluate(cdp, sessionId, `
      Promise.all([
        fetch('/api/action', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            type: 'fiducial.detections.ingest',
            source: 'browser-smoke',
            payload: {
              surface: 'board',
              sourceSpace: 'surface',
              detections: [
                { tagId: 39, role: 'action', label: 'Action / Send', center: { x: 0.42, y: 0.48 }, confidence: 0.42 }
              ]
            }
          })
        }).then((res) => res.json()),
        fetch('/api/action', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            type: 'board.drag.set',
            source: 'browser-smoke',
            payload: {
              active: true,
              id: 'action-send',
              tagId: 39,
              role: 'action',
              surface: 'board',
              x: 0.95,
              y: 0.95
            }
          })
        }).then((res) => res.json())
      ])
    `);
    assert(recoveryState.every((item) => item.ok === true), "browser smoke should seed recovery affordance state");
    await cdp.send("Page.reload", {}, sessionId);
    await cdp.waitForEvent((message) => message.sessionId === sessionId && message.method === "Page.loadEventFired", 20000);
    await waitForExpression(cdp, sessionId, "Boolean(window.__projectorSmoke)", 20000);
    await waitForExpression(cdp, sessionId, `(() => {
      const status = window.__projectorSmoke?.status?.();
      return Boolean(status?.hasProjectorMapping) &&
        Math.abs(status.topLeft.x - status.width * 0.1) < 2 &&
        Math.abs(status.topLeft.y - status.height * 0.15) < 2;
    })()`, 20000);
    await waitForExpression(cdp, sessionId, "Boolean(document.querySelector('.projector-action-miss'))", 20000);
    const projector = await evaluate(cdp, sessionId, `({
      map: document.body.dataset.mapOverlay,
      status: document.body.dataset.statusOverlay,
      bg: getComputedStyle(document.getElementById('projectorBoard')).backgroundColor,
      controls: Boolean(document.getElementById('projectorFullscreen')),
      smoke: window.__projectorSmoke.status(),
      mapPolygon: document.querySelector('.projector-map-polygon')?.getAttribute('points') || '',
      mapCornerLeft: parseFloat(document.querySelector('.projector-map-corner.tl')?.style.left || '0'),
      mapCornerTop: parseFloat(document.querySelector('.projector-map-corner.tl')?.style.top || '0'),
      semanticCards: document.querySelectorAll('.projector-semantic-card').length,
      slideCards: document.querySelectorAll('.projector-slide-summary').length,
      videoFrames: document.querySelectorAll('.projector-video-frame').length,
      modelProjections: document.querySelectorAll('.projector-model').length,
      figurateCards: document.querySelectorAll('.projector-semantic-card.figurate').length,
      videoActionText: document.querySelector('.projector-video-action')?.textContent || '',
      affordanceHints: document.querySelectorAll('.projector-affordance-hint').length,
      affordanceHintText: [...document.querySelectorAll('.projector-affordance-hint')]
        .map((item) => item.textContent || '')
        .join(' | '),
      recoveryCards: document.querySelectorAll('.projector-recovery-card').length,
      actionMissText: document.querySelector('.projector-action-miss')?.textContent || '',
      tagHealthText: [...document.querySelectorAll('.projector-tag-health')].map((item) => item.textContent || '').join(' | '),
      implicitSuggestionText: [...document.querySelectorAll('.projector-implicit-suggestion')].map((item) => item.textContent || '').join(' | '),
      zones: document.querySelectorAll('.projector-zone-polygon').length,
      tagFocuses: document.querySelectorAll('.projector-focus-marker').length,
    })`);
    assert(projector.map === "on", "projector map overlay should be enabled from query string");
    assert(projector.status === "on", "projector status overlay should be enabled from query string");
    assert(projector.controls, "projector fullscreen controls should exist");
    assert(projector.bg === "rgb(0, 0, 0)", `projector board should be black, got ${projector.bg}`);
    assert(projector.smoke.mapping === "mapped", `projector should render with server mapping, got ${projector.smoke.mapping}`);
    assert(projector.smoke.warpMapping === "mapped", `projector warp layer should use server mapping, got ${projector.smoke.warpMapping}`);
    assert(projector.smoke.warpClipPath.includes("polygon"), `projector warp layer should expose polygon clip-path, got ${projector.smoke.warpClipPath}`);
    assert(!projector.mapPolygon.startsWith("0,0"), `projector map overlay should show mapped board quad, got ${projector.mapPolygon}`);
    assert(Math.abs(projector.mapCornerLeft - projector.smoke.width * 0.1) < 2, `projector map corner should follow mapped board x, got ${projector.mapCornerLeft}`);
    assert(Math.abs(projector.mapCornerTop - projector.smoke.height * 0.15) < 2, `projector map corner should follow mapped board y, got ${projector.mapCornerTop}`);
    assert(Math.abs(projector.smoke.topLeft.x - projector.smoke.width * 0.1) < 2, "projector top-left should follow server surface-to-projector mapping");
    assert(Math.abs(projector.smoke.topLeft.y - projector.smoke.height * 0.15) < 2, "projector top-left should follow server surface-to-projector mapping");
    assert(projector.semanticCards >= 3, `projector should render semantic cards from server markers, got ${projector.semanticCards}`);
    assert(projector.slideCards >= 1, "projector should render the slide control projection");
    assert(projector.videoFrames >= 1, "projector should render the video player projection");
    assert(projector.modelProjections >= 1, "projector should render the 3D model projection");
    assert(projector.figurateCards >= 1, "projector should render the Figurate projection");
    assert(projector.videoActionText.includes("ACTION TAG AREA"), `video projection should expose the action area, got ${projector.videoActionText}`);
    assert(projector.affordanceHints >= 3, `projector should render affordance hints, got ${projector.affordanceHints}`);
    assert(projector.affordanceHintText.includes("drag into green zone"), `projector should expose Action affordance, got ${projector.affordanceHintText}`);
    assert(projector.actionMissText.includes("NO TARGET"), `projector should render Action miss feedback, got ${projector.actionMissText}`);
    assert(projector.tagHealthText.includes("LOW CONF"), `projector should render low-confidence tag feedback, got ${projector.tagHealthText}`);
    assert(projector.implicitSuggestionText.includes("SUGGESTED STICKY"), `projector should render implicit sticky confirmation, got ${projector.implicitSuggestionText}`);
    assert(projector.zones >= 1, `projector should render zone projections from server markers, got ${projector.zones}`);
    assert(projector.tagFocuses >= 1, `projector should render focus projections from server markers, got ${projector.tagFocuses}`);

    await evaluate(cdp, sessionId, `
      fetch('/api/action', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ type: 'board.drag.set', source: 'browser-smoke-cleanup', payload: { active: false } })
      }).then((res) => res.json())
    `);

    await cdp.send("Page.navigate", { url: `${ROOM_URL}/board.html` }, sessionId);
    await cdp.waitForEvent((message) => message.sessionId === sessionId && message.method === "Page.loadEventFired", 20000);
    await waitForExpression(cdp, sessionId, "document.querySelectorAll('#boardTagPad button').length >= 10 && document.querySelectorAll('.board-tag-row').length >= 3", 20000);
    const board = await evaluate(cdp, sessionId, `(() => {
      const rect = document.getElementById('boardSurface').getBoundingClientRect();
      return {
        ratio: rect.width / rect.height,
        corners: document.querySelectorAll('.board-real-corner').length,
        tagButtons: document.querySelectorAll('#boardTagPad button').length,
        tagRows: document.querySelectorAll('.board-tag-row').length,
        tagHandles: document.querySelectorAll('.board-tag-handle').length,
        recoveryCards: document.querySelectorAll('.board-recovery-card').length,
      };
    })()`);
    assert(Math.abs(board.ratio - (46 / 24)) < 0.05, `board surface ratio should match physical board, got ${board.ratio}`);
    assert(board.corners === 4, `expected four board calibration corner hints, got ${board.corners}`);
    assert(board.tagButtons >= 10, `board should expose board tag controls, got ${board.tagButtons}`);
    assert(board.tagRows >= 3, `board should list server board tags, got ${board.tagRows}`);
    assert(board.tagHandles >= 3, `board should render server board tags on the surface, got ${board.tagHandles}`);
    assert(board.recoveryCards >= 1, "board should render recovery affordance cards");
    await evaluate(cdp, sessionId, `
      fetch('/api/action', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          type: 'calibration.set',
          source: 'browser-smoke-cleanup',
          payload: {
            surface: 'board',
            status: 'calibrated',
            projectorToSurfaceHomography: [
              0.92, 0, 0.04,
              0, 0.88, 0.06,
              0, 0, 1
            ]
          }
        })
      }).then((res) => res.json())
    `);
    await cleanupRoomState();
    assert(errors.length === 0, `browser console/runtime errors:\n${errors.join("\n")}`);

    console.log("virtual room browser smoke ok");
  } finally {
    await cleanupRoomState().catch(() => {});
    browser.kill();
    await delay(250);
    if (profileDir.startsWith(join(ROOT, ".codex_tmp"))) {
      rmSync(profileDir, { recursive: true, force: true });
    }
  }
}

async function cleanupRoomState() {
  const actions = [
    ["board.tags.clear", { keepCalibration: true }],
    ["board.objects.clear", {}],
    ["board.clear", {}],
    ["focus.clear", {}],
    ["board.drag.set", { active: false }],
  ];
  for (const [type, payload] of actions) {
    await fetchWithTimeout(`${ROOM_URL}/api/action`, 2500, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ type, source: "browser-smoke-cleanup", payload }),
    }).catch(() => null);
  }
}

async function assertServer() {
  const health = await fetchWithTimeout(`${ROOM_URL}/api/health`, 2500).catch((error) => {
    throw new Error(`Room server is not reachable at ${ROOM_URL}: ${error.message}`);
  });
  if (!health.ok) throw new Error(`Room server health failed: HTTP ${health.status}`);
}

async function waitForDebugEndpoint() {
  const url = `http://127.0.0.1:${DEBUG_PORT}/json/version`;
  for (let i = 0; i < 80; i += 1) {
    try {
      const res = await fetchWithTimeout(url, 500);
      if (res.ok) return await res.json();
    } catch {
      // Browser is still starting.
    }
    await delay(125);
  }
  throw new Error("Timed out waiting for browser debug endpoint");
}

async function waitForExpression(cdp, sessionId, expression, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = await evaluate(cdp, sessionId, expression);
    if (value) return true;
    await delay(150);
  }
  throw new Error(`Timed out waiting for expression: ${expression}`);
}

async function evaluate(cdp, sessionId, expression) {
  const result = await cdp.send("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
  }, sessionId);
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.text || "Runtime.evaluate failed");
  }
  return result.result?.value;
}

function fetchWithTimeout(url, timeoutMs, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { ...options, signal: controller.signal }).finally(() => clearTimeout(timer));
}

class CdpClient {
  constructor(ws) {
    this.ws = ws;
    this.id = 1;
    this.pending = new Map();
    this.listeners = new Set();
    ws.addEventListener("message", (event) => this.handleMessage(event));
  }

  static connect(url) {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(url);
      ws.addEventListener("open", () => resolve(new CdpClient(ws)), { once: true });
      ws.addEventListener("error", () => reject(new Error("Could not connect to browser websocket")), { once: true });
    });
  }

  send(method, params = {}, sessionId = null) {
    const id = this.id;
    this.id += 1;
    const payload = { id, method, params };
    if (sessionId) payload.sessionId = sessionId;
    this.ws.send(JSON.stringify(payload));
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      setTimeout(() => {
        if (!this.pending.has(id)) return;
        this.pending.delete(id);
        reject(new Error(`CDP timeout: ${method}`));
      }, 20000);
    });
  }

  waitForEvent(predicate, timeoutMs) {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.listeners.delete(listener);
        reject(new Error("Timed out waiting for browser event"));
      }, timeoutMs);
      const listener = (message) => {
        if (!predicate(message)) return;
        clearTimeout(timeout);
        this.listeners.delete(listener);
        resolve(message);
      };
      this.listeners.add(listener);
    });
  }

  onEvent(listener) {
    this.listeners.add(listener);
  }

  handleMessage(event) {
    const message = JSON.parse(event.data);
    if (message.id && this.pending.has(message.id)) {
      const pending = this.pending.get(message.id);
      this.pending.delete(message.id);
      if (message.error) pending.reject(new Error(message.error.message));
      else pending.resolve(message.result || {});
      return;
    }
    this.listeners.forEach((listener) => listener(message));
  }
}

function eventErrorText(message) {
  if (message.method === "Runtime.exceptionThrown") {
    return message.params?.exceptionDetails?.exception?.description || message.params?.exceptionDetails?.text || "runtime exception";
  }
  if (message.method === "Runtime.consoleAPICalled" && ["error", "assert"].includes(message.params?.type)) {
    return (message.params.args || []).map((arg) => arg.value || arg.description || "").join(" ");
  }
  if (message.method === "Log.entryAdded" && message.params?.entry?.level === "error") {
    return `${message.params.entry.url || ""} ${message.params.entry.text}`.trim();
  }
  return "";
}

function ignoredBrowserError(text) {
  return /favicon\.ico/i.test(text) || /WebGL: INVALID_ENUM/i.test(text);
}

function findBrowser() {
  const candidates = [
    process.env.BROWSER_PATH,
    join(process.env.ProgramFiles || "C:\\Program Files", "Google", "Chrome", "Application", "chrome.exe"),
    join(process.env["ProgramFiles(x86)"] || "C:\\Program Files (x86)", "Google", "Chrome", "Application", "chrome.exe"),
    join(process.env.ProgramFiles || "C:\\Program Files", "Microsoft", "Edge", "Application", "msedge.exe"),
    join(process.env["ProgramFiles(x86)"] || "C:\\Program Files (x86)", "Microsoft", "Edge", "Application", "msedge.exe"),
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "/usr/bin/microsoft-edge",
  ].filter(Boolean);
  return candidates.find((candidate) => existsSync(candidate)) || "";
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertRoles(actual, expected, label) {
  const actualSet = new Set(actual);
  const missing = expected.filter((role) => !actualSet.has(role));
  assert(missing.length === 0, `${label} missing roles: ${missing.join(", ")}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
