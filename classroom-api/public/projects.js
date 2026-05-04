"use strict";

/* projects.js renders the unified Projects hub:
   - .readiness-deck    → 4-cell summary (total / live / stale / silent)
   - #rosterList        → quiet rows (num + title + heartbeat tag + readiness pip + Open)
   - bench controls     → run-all / reset / featured / reference toggle
   This script runs on both / and /projects.html (they serve the same page). */

const rosterList = document.getElementById("rosterList");
const readinessDeck = document.getElementById("readinessDeck");
const featuredScenarioButtons = document.getElementById("featuredScenarioButtons");
const benchStatus = document.getElementById("benchStatus");
const runAllFeaturedBtn = document.getElementById("runAllFeaturedBtn");
const resetProjectPacketsBtn = document.getElementById("resetProjectPacketsBtn");
const resetClassObjectsBtn = document.getElementById("resetClassObjectsBtn");
const showLibraryToggle = document.getElementById("showLibraryToggle");

let projectsCache = [];
let readinessCache = { projects: [], summary: {} };
let showLibrary = false;

Room.connect();
load().catch(showError);

Room.onState((state) => {
  if (!state?.projectPackets) return;
  projectsCache = state.projectPackets;
  render();
});

Room.onEvent(() => loadReadiness().catch(console.error));

if (runAllFeaturedBtn) runAllFeaturedBtn.addEventListener("click", () => runAllFeatured().catch(showError));
if (resetProjectPacketsBtn) resetProjectPacketsBtn.addEventListener("click", () => resetProjectPackets().catch(showError));
if (resetClassObjectsBtn) resetClassObjectsBtn.addEventListener("click", () => resetClassObjects().catch(showError));
if (showLibraryToggle) showLibraryToggle.addEventListener("change", () => {
  showLibrary = showLibraryToggle.checked;
  render();
});

async function load() {
  const projectsRes = await fetch("/api/projects", { cache: "no-store" });
  const data = await projectsRes.json();
  projectsCache = data.projects || [];
  await loadReadiness();
  render();
}

async function loadReadiness() {
  const res = await fetch("/api/projects/readiness", { cache: "no-store" });
  if (!res.ok) return;
  readinessCache = await res.json();
  renderSummary();
  render();
}

function readinessFor(projectId) {
  return (readinessCache.projects || []).find((p) => (p.projectId || p.id) === projectId) || {};
}

function render() {
  if (!rosterList) return;
  rosterList.innerHTML = "";
  const visible = projectsCache.filter((p) => showLibrary || p.submittedProject !== false);

  renderFeaturedButtons();

  if (!visible.length) {
    rosterList.innerHTML = `<div class="roster-empty">No projects loaded</div>`;
    return;
  }

  const sorted = [...visible].sort((a, b) => {
    const ar = readinessFor(a.id);
    const br = readinessFor(b.id);
    const liveDiff = Number(Boolean(br.live)) - Number(Boolean(ar.live));
    if (liveDiff) return liveDiff;
    return Number(br.score || 0) - Number(ar.score || 0)
      || String(a.title).localeCompare(String(b.title));
  });

  sorted.forEach((project) => {
    const readiness = readinessFor(project.id);
    const score = Math.max(0, Math.min(5, Number(readiness.score || 0)));
    const live = Boolean(readiness.live);
    const liveLabel = live ? "live" : readiness.hasHeartbeat ? "stale" : "silent";
    const liveClass = live ? "live" : readiness.hasHeartbeat ? "stale" : "";

    const row = document.createElement("article");
    row.className = "roster-row no-num";
    row.innerHTML = `
      <div class="title">
        <div class="name-line">
          <h3>${escapeHtml(project.title)}${project.submittedProject === false ? "<em> — reference</em>" : ""}</h3>
          <span class="live-tag ${liveClass}"><span class="dot ${live ? "ok" : readiness.hasHeartbeat ? "warn" : ""}"></span>${liveLabel}</span>
        </div>
        <div class="by">${escapeHtml(project.owner || project.kind || "")}</div>
      </div>
      <div class="readiness">
        <span class="pips">${pips(score)}</span>
        <span class="score">${score} / 5</span>
      </div>
      <div class="actions">
        <a href="/project.html?id=${encodeURIComponent(project.id)}"><button class="primary">Open</button></a>
      </div>
    `;
    rosterList.appendChild(row);
  });
}

function renderSummary() {
  if (!readinessDeck) return;
  const summary = readinessCache.summary || {};
  const cells = [
    ["Total",  summary.total ?? 0,           ""],
    ["Live",   summary.live ?? 0,            "live"],
    ["Stale",  summary.stale ?? 0,           "warn"],
    ["Silent", summary.needsHeartbeat ?? 0,  "bad"],
  ];
  readinessDeck.innerHTML = cells.map(([key, val, cls]) => `
    <div class="cell ${cls}">
      <span class="key">${escapeHtml(key)}</span>
      <span class="val">${escapeHtml(val)}</span>
    </div>
  `).join("");
}

function renderFeaturedButtons() {
  if (!featuredScenarioButtons) return;
  featuredScenarioButtons.innerHTML = "";
  projectsCache
    .filter((p) => p.submittedProject !== false && p.scenario?.featured)
    .forEach((project) => {
      const button = document.createElement("button");
      button.textContent = project.scenario?.label || project.title;
      button.addEventListener("click", () => runProjectScenario(project).catch(showError));
      featuredScenarioButtons.appendChild(button);
    });
}

async function runAllFeatured() {
  const featured = projectsCache.filter((p) => p.submittedProject !== false && p.scenario?.featured);
  for (const project of featured) {
    await runProjectScenario(project, { quiet: true });
  }
  setStatus(`Ran ${featured.length} featured scenarios at ${new Date().toLocaleTimeString()}.`);
}

async function runProjectScenario(project, options = {}) {
  const events = project.scenario?.events || [];
  if (!events.length) {
    setStatus(`${project.title} has no featured scenario.`);
    return;
  }
  await Room.action("project.set", { id: project.id, state: project.state || {} });
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
          ...(project.state || {}),
          ...(item.payload?.state || {}),
        },
        modes: project.modes,
      },
    });
    await delay(140);
  }
  if (!options.quiet) {
    setStatus(`Ran ${project.title} scenario at ${new Date().toLocaleTimeString()}.`);
  }
}

async function resetProjectPackets() {
  await Room.action("project.reset", {});
  setStatus("Reset all project packet states.");
}

async function resetClassObjects() {
  await Room.action("class-object.reset", {});
  setStatus("Reset all class-object states.");
}

function setStatus(text) {
  if (benchStatus) benchStatus.textContent = text;
}

function pips(score) {
  const on = "●".repeat(score);
  const off = `<span class="off">${"·".repeat(5 - score)}</span>`;
  return on + off;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function showError(error) {
  setStatus(error.message || String(error));
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
