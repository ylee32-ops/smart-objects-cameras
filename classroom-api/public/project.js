"use strict";

const requestedProjectId = new URLSearchParams(window.location.search).get("id");

const packetTitle = document.getElementById("packetTitle");
const packetSummary = document.getElementById("packetSummary");
const contractMeta = document.getElementById("contractMeta");
const contractSource = document.getElementById("contractSource");
const modesEl = document.getElementById("modes");
const boardRolesEl = document.getElementById("boardRoles");
const readsEl = document.getElementById("reads");
const writesEl = document.getElementById("writes");
const canonicalSubscribesEl = document.getElementById("canonicalSubscribes");
const canonicalEmitsEl = document.getElementById("canonicalEmits");
const subscribesEl = document.getElementById("subscribes");
const emitsEl = document.getElementById("emits");
const successCondition = document.getElementById("successCondition");
const liveStatusEl = document.getElementById("liveStatus");
const lastSeenEl = document.getElementById("lastSeen");
const explicitEl = document.getElementById("explicitInteractions");
const implicitEl = document.getElementById("implicitInteractions");
const combosEl = document.getElementById("combos");
const bridgeNotesEl = document.getElementById("bridgeNotes");
const acceptanceSetupEl = document.getElementById("acceptanceSetup");
const acceptanceTriggerEl = document.getElementById("acceptanceTrigger");
const acceptanceEventsEl = document.getElementById("acceptanceEvents");
const acceptanceVisibleEl = document.getElementById("acceptanceVisible");
const acceptanceInputEl = document.getElementById("acceptanceInput");
const acceptanceOutputEl = document.getElementById("acceptanceOutput");
const controls = document.getElementById("controls");
const checklist = document.getElementById("checklist");
const currentState = document.getElementById("currentState");
const recentEvents = document.getElementById("recentEvents");
const liveMockBtn = document.getElementById("liveMockBtn");
const liveMockStatus = document.getElementById("liveMockStatus");
const openContractBtn = document.getElementById("openContractBtn");

const projectTagIdEl = document.getElementById("projectTagId");
const projectTagHintEl = document.getElementById("projectTagHint");
const readinessPipsEl = document.getElementById("readinessPips");
const readinessScoreEl = document.getElementById("readinessScore");
const liveDotEl = document.getElementById("liveDot");
const projectQrImg = document.getElementById("projectQrImg");
const projectQrUrl = document.getElementById("projectQrUrl");

let project = null;
let projectTagsCache = null;
let readinessTimer = null;

Room.connect();
load().catch(showError);

Room.onState((state) => {
  if (!project) return;
  project = (state.projectPackets || []).find((item) => item.id === project.id) || project;
  render();
});

if (liveMockBtn) {
  liveMockBtn.addEventListener("click", () => toggleLiveMock());
  window.addEventListener("beforeunload", () => stopLiveMock(true));
}

async function load() {
  const [packetsRes, tagsRes] = await Promise.all([
    fetch("/api/projects", { cache: "no-store" }),
    fetch("/api/project-tags", { cache: "no-store" }).catch(() => null),
  ]);
  const data = await packetsRes.json();
  const projects = data.projects || [];
  projectTagsCache = tagsRes && tagsRes.ok ? await tagsRes.json().catch(() => null) : null;
  if (requestedProjectId) {
    project = projects.find((item) => item.id === requestedProjectId) || null;
    if (!project) {
      renderNotFound();
      return;
    }
  } else {
    project = projects[0] || null;
  }
  render();
  refreshReadiness();
  if (!readinessTimer) readinessTimer = setInterval(refreshReadiness, 3000);
  renderQrCode().catch(() => {});
}

function render() {
  if (!project) return;
  packetTitle.textContent = project.title;
  packetSummary.textContent = project.submittedProject === false
    ? `Library layer · ${project.description || project.success}`
    : (project.description || project.success);
  contractMeta.textContent = `${project.owner} · ${project.kind} · ${project.surface}`;
  contractSource.textContent = project.source || "";
  modesEl.textContent = joinList(project.modes);
  boardRolesEl.textContent = joinList(project.boardRoles || project.boardRole);
  readsEl.textContent = joinList(project.reads);
  writesEl.textContent = joinList(project.writes);
  renderListUl(canonicalSubscribesEl, project.canonicalSubscribes);
  renderListUl(canonicalEmitsEl, project.canonicalEmits);
  subscribesEl.textContent = joinList(project.subscribes);
  emitsEl.textContent = joinList(project.emits);
  successCondition.textContent = project.success || "";
  if (openContractBtn) openContractBtn.href = `/api/projects/${encodeURIComponent(project.id)}/contract.md`;
  renderTag();
  explicitEl.textContent = joinList(project.explicitInteractions);
  implicitEl.textContent = joinList(project.implicitInteractions);
  combosEl.textContent = joinList(project.combos);
  bridgeNotesEl.textContent = project.bridgeNotes || "none";
  acceptanceSetupEl.textContent = project.acceptance?.setup || "none";
  acceptanceTriggerEl.textContent = project.acceptance?.trigger || "none";
  acceptanceEventsEl.textContent = joinList(project.acceptance?.expectEvents);
  acceptanceVisibleEl.textContent = project.acceptance?.visibleResult || "none";
  acceptanceInputEl.textContent = project.acceptance?.realInput || "none";
  acceptanceOutputEl.textContent = project.acceptance?.realOutput || "none";
  currentState.textContent = JSON.stringify(project.state || {}, null, 2);
  renderControls();
  renderChecklist();
  renderRecentEvents();
}

function renderControls() {
  controls.innerHTML = "";
  (project.controls || []).forEach((control) => {
    const row = document.createElement("div");
    row.className = "form-row";
    const label = document.createElement("label");
    label.textContent = control.label;
    const input = createInput(control);
    input.addEventListener("input", () => {
      project.state[control.id] = readValue(input, control);
      currentState.textContent = JSON.stringify(project.state, null, 2);
    });
    row.append(label, input);
    controls.appendChild(row);
  });
}

function createInput(control) {
  if (control.type === "select") {
    const select = document.createElement("select");
    (control.options || []).forEach((option) => {
      const item = document.createElement("option");
      item.value = String(option);
      item.textContent = String(option);
      select.appendChild(item);
    });
    select.value = String(project.state?.[control.id] ?? control.options?.[0] ?? "");
    return select;
  }
  if (control.type === "toggle") {
    const input = document.createElement("input");
    input.type = "checkbox";
    input.checked = Boolean(project.state?.[control.id]);
    return input;
  }
  if (control.type === "range") {
    const input = document.createElement("input");
    input.type = "range";
    input.min = control.min;
    input.max = control.max;
    input.step = control.step || 1;
    input.value = project.state?.[control.id] ?? control.min ?? 0;
    return input;
  }
  const input = document.createElement("input");
  input.type = "text";
  input.value = project.state?.[control.id] ?? "";
  return input;
}

function readValue(input, control) {
  if (control.type === "toggle") return input.checked;
  if (control.type === "range") return Number(input.value);
  if (Array.isArray(control.options)) {
    const raw = input.value;
    const numeric = Number(raw);
    return Number.isFinite(numeric) && control.options.some((item) => typeof item === "number") ? numeric : raw;
  }
  return input.value;
}

async function saveState() {
  await Room.action("project.set", { id: project.id, state: project.state });
}

async function resetState() {
  await Room.action("project.reset", { id: project.id });
}

// ── Live Mock toggle ─────────────────────────────────────────────────
// Sends heartbeat + scenario events on a 3 s loop, using the same
// /api/projects/{id}/heartbeat and /api/projects/{id}/events endpoints
// the readiness scorer reads. Click again (or close the tab) to stop.
let liveMockTimer = null;
let liveMockBeats = 0;
let liveMockEvents = 0;

async function postProjectApi(suffix, body) {
  if (!project) return false;
  try {
    const res = await fetch(`/api/projects/${encodeURIComponent(project.id)}/${suffix}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return res.ok;
  } catch (err) {
    console.warn(`live-mock ${suffix}`, err);
    return false;
  }
}

async function liveMockTick() {
  if (!project) return;
  await postProjectApi("heartbeat", {
    status: "online",
    consumes: project.canonicalSubscribes || project.subscribes || [],
    emits: project.canonicalEmits || project.emits || [],
    message: "live mock from project page",
  });
  liveMockBeats += 1;
  const events = project.scenario?.events || [];
  for (const ev of events) {
    await postProjectApi("events", {
      event_type: ev.event_type,
      payload: ev.payload || {},
    });
  }
  liveMockEvents += events.length;
  if (liveMockStatus) {
    liveMockStatus.innerHTML = `<span style="color:var(--coral)">● LIVE MOCK ON</span> · ${liveMockBeats} heartbeats · ${liveMockEvents} events sent`;
  }
}

function startLiveMock() {
  if (liveMockTimer) return;
  liveMockBeats = 0;
  liveMockEvents = 0;
  liveMockBtn.textContent = "■ Turn Off Live Mock";
  liveMockBtn.classList.add("live-on");
  liveMockBtn.classList.remove("primary");
  if (liveMockStatus) {
    liveMockStatus.innerHTML = `<span style="color:var(--coral)">● LIVE MOCK ON</span> · starting…`;
  }
  liveMockTick();
  liveMockTimer = setInterval(liveMockTick, 3000);
}

function stopLiveMock(silent = false) {
  if (liveMockTimer) {
    clearInterval(liveMockTimer);
    liveMockTimer = null;
  }
  if (liveMockBtn) {
    liveMockBtn.textContent = "Start Live Mock";
    liveMockBtn.classList.remove("live-on");
  }
  if (liveMockStatus && !silent) {
    liveMockStatus.textContent = liveMockBeats
      ? `off · sent ${liveMockBeats} heartbeats / ${liveMockEvents} events`
      : "";
  }
}

function toggleLiveMock() {
  if (liveMockTimer) stopLiveMock(); else startLiveMock();
}

async function runMockEmit() {
  await saveState();
  const events = project.scenario?.events || [];
  if (!events.length) {
    await Room.action("event.manual", {
      event_type: project.eventType || project.emits?.[0] || "project.mock",
      payload: {
        projectId: project.id,
        title: project.title,
        owner: project.owner,
        kind: project.kind,
        surface: project.surface,
        sourceProject: project.id,
        state: project.state,
        modes: project.modes,
      },
    });
    return;
  }
  for (const item of events) {
    await Room.action("event.manual", {
      event_type: item.event_type,
      payload: {
        ...(item.payload || {}),
        projectId: project.id,
        title: project.title,
        owner: project.owner,
        kind: project.kind,
        surface: project.surface,
        sourceProject: project.id,
        state: {
          ...project.state,
          ...(item.payload?.state || {}),
        },
        modes: project.modes,
      },
    });
    await delay(140);
  }
}

function renderChecklist() {
  const events = relevantEvents();
  const stats = acceptanceStats(project, events);
  checklist.innerHTML = "";
  const rows = [
    ["Contract declared", true],
    ["Shared project state present", Boolean(project?.state)],
    ["Mode mapping present", Array.isArray(project?.modes) && project.modes.length > 0],
    ["Canonical room mapping present", Array.isArray(project?.canonicalEmits) && project.canonicalEmits.length > 0],
    ["Acceptance recipe present", Boolean(project?.acceptance?.trigger)],
    ["Mock emit observed", events.some((event) => event.payload?.projectId === project.id)],
    ["Recent activity", events.length > 0],
  ];
  expectedEvents(project).forEach((eventType) => {
    rows.push([`Expected ${eventType}`, stats.matched.has(eventType)]);
  });
  rows.forEach(([label, ok]) => {
    const row = document.createElement("div");
    row.className = "check-row";
    row.innerHTML = `<span>${label}</span><span class="pill">${ok ? "pass" : "todo"}</span>`;
    checklist.appendChild(row);
  });
}

function renderRecentEvents() {
  recentEvents.innerHTML = "";
  relevantEvents().slice(0, 12).forEach((event) => {
    const row = document.createElement("div");
    row.className = "event-item";
    row.innerHTML = `
      <div class="event-type">${escapeHtml(event.event_type)}</div>
      <div class="small">${Room.fmtTime(event.created_at)} / ${escapeHtml(event.source || "unknown")}</div>
      <div class="small">${escapeHtml(summary(event))}</div>
    `;
    recentEvents.appendChild(row);
  });
}

function relevantEvents() {
  return (Room.state?.events || []).filter((event) => {
    const payload = event.payload || {};
    return payload.projectId === project.id || payload.sourceProject === project.id;
  });
}

function expectedEvents(projectValue) {
  return Array.isArray(projectValue?.acceptance?.expectEvents) ? projectValue.acceptance.expectEvents : [];
}

function acceptanceStats(projectValue, events) {
  const expected = expectedEvents(projectValue);
  const matched = new Set(
    events
      .map((event) => event.event_type)
      .filter((type) => expected.includes(type)),
  );
  return {
    expected,
    matched,
    passed: matched.size,
    total: expected.length,
  };
}

function acceptanceStatusLine(projectValue, events) {
  const stats = acceptanceStats(projectValue, events);
  if (!stats.total) return "no acceptance events declared";
  return `${stats.passed}/${stats.total} expected events seen`;
}

function lastSeenLine(events) {
  if (!events.length) return "none";
  return `${events[0].event_type} at ${Room.fmtTime(events[0].created_at)}`;
}

function summary(event) {
  const payload = event.payload || {};
  if (payload.state) return Object.entries(payload.state).slice(0, 3).map(([k, v]) => `${k}:${v}`).join(" ");
  return payload.title || payload.label || "";
}

function joinList(values) {
  if (Array.isArray(values) && values.length) return values.join(", ");
  if (typeof values === "string" && values.trim()) return values;
  return "none";
}

function renderListUl(el, values) {
  if (!el) return;
  el.innerHTML = "";
  const list = Array.isArray(values) ? values : (typeof values === "string" ? values.split(",").map(s => s.trim()).filter(Boolean) : []);
  if (!list.length) {
    const li = document.createElement("li");
    li.className = "empty";
    li.textContent = "none";
    el.appendChild(li);
    return;
  }
  list.forEach((v) => {
    const li = document.createElement("li");
    li.textContent = String(v);
    el.appendChild(li);
  });
}

function renderTag() {
  if (!project || !projectTagIdEl || !projectTagHintEl) return;
  const tagId = findTagFor(project.id);
  if (tagId != null) {
    projectTagIdEl.textContent = `#${tagId}`;
    projectTagIdEl.classList.remove("unset");
    projectTagHintEl.textContent = project.submittedProject === false
      ? "Reference layer — tag reserved but no class demo expected."
      : "Place this tag on the board to fire your project's demo in class.";
  } else {
    projectTagIdEl.textContent = "—";
    projectTagIdEl.classList.add("unset");
    projectTagHintEl.textContent = "Tag not yet assigned.";
  }
}

function findTagFor(projectId) {
  const assignments = projectTagsCache && projectTagsCache.assignments;
  if (!assignments) return null;
  for (const [tag, id] of Object.entries(assignments)) {
    if (id === projectId) return Number(tag);
  }
  return null;
}

function ageText(iso) {
  if (!iso) return "—";
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "—";
  const sec = Math.max(0, Math.round((Date.now() - t) / 1000));
  if (sec < 60) return `${sec}s ago`;
  if (sec < 3600) return `${Math.round(sec / 60)}m ago`;
  return `${Math.round(sec / 3600)}h ago`;
}

async function fetchLanHost() {
  const local = ["localhost", "127.0.0.1", "::1"];
  if (location.hostname && !local.includes(location.hostname)) {
    return location.host;
  }
  try {
    const data = await fetch("/api/lan-host", { cache: "no-store" }).then((r) => (r.ok ? r.json() : null));
    if (data?.hosts?.length) return data.hosts[0];
  } catch { /* fall through */ }
  return location.host;
}

// QR generation uses api.qrserver.com (free, no key, returns PNG).
// Swap to a self-hosted generator (e.g. vendor a tiny qrcode-js lib)
// before this leaves the prototype phase — every render leaks the LAN
// URL to the third-party service.
async function renderQrCode() {
  if (!projectQrImg || !project) return;
  const host = await fetchLanHost();
  const url = `${location.protocol}//${host}${location.pathname}${location.search}`;
  const qrSrc = `https://api.qrserver.com/v1/create-qr-code/?data=${encodeURIComponent(url)}&size=240x240&margin=10`;
  projectQrImg.src = qrSrc;
  if (projectQrUrl) projectQrUrl.textContent = url;
}

async function refreshReadiness() {
  if (!project) return;
  try {
    const res = await fetch("/api/projects/readiness", { cache: "no-store" });
    if (!res.ok) return;
    const data = await res.json();
    const r = (data.projects || []).find((p) => p.projectId === project.id);
    if (!r) return;
    const score = Number(r.score || 0);
    if (readinessPipsEl) {
      const on = "●".repeat(score);
      const off = `<span class="off">${"●".repeat(5 - score)}</span>`;
      readinessPipsEl.innerHTML = on + off;
    }
    if (readinessScoreEl) readinessScoreEl.textContent = `${score}/5`;
    if (liveDotEl && liveStatusEl) {
      if (r.live) {
        liveDotEl.className = "pkt-dot ok";
        liveStatusEl.textContent = `live · last beat ${ageText(r.lastSeen)}`;
      } else if (r.lastSeen) {
        liveDotEl.className = "pkt-dot warn";
        liveStatusEl.textContent = `idle · last beat ${ageText(r.lastSeen)}`;
      } else {
        liveDotEl.className = "pkt-dot";
        liveStatusEl.textContent = "no heartbeat";
      }
    }
    if (lastSeenEl) {
      lastSeenEl.textContent = r.lastEvent
        ? `last event: ${ageText(r.lastEvent)}`
        : "last event: none";
    }
  } catch (err) {
    /* ignore */
  }
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function showError(error) {
  packetSummary.textContent = error.message || String(error);
}

function renderNotFound() {
  packetTitle.textContent = "Project not found.";
  packetSummary.innerHTML = `No project matched <span class="mono">${escapeHtml(requestedProjectId || "")}</span>. Open <a href="/projects.html">Projects</a> and choose a valid packet.`;
  contractMeta.textContent = "";
  liveStatusEl.textContent = "not found";
  lastSeenEl.textContent = "—";
  if (liveMockBtn) liveMockBtn.disabled = true;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
