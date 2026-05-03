"use strict";

const summaryGrid = document.getElementById("summaryGrid");
const sourceStrip = document.getElementById("sourceStrip");
const readinessRows = document.getElementById("readinessRows");
const reportBuilt = document.getElementById("reportBuilt");

Room.connect();
loadReadiness().catch(showError);
Room.onEvent(() => loadReadiness().catch(showError));

async function loadReadiness() {
  const res = await fetch("/api/projects/readiness", { cache: "no-store" });
  if (!res.ok) throw new Error(`Could not load readiness: HTTP ${res.status}`);
  render(await res.json());
  reportBuilt.textContent = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function render(snapshot) {
  const summary = snapshot.summary || {};
  const cells = [
    ["Total",       summary.total ?? 0,           ""],
    ["Live",        summary.live ?? 0,            "live"],
    ["Stale",       summary.stale ?? 0,           "warn"],
    ["Need beat",   summary.needsHeartbeat ?? 0,  "bad"],
    ["With evt",    summary.withEvents ?? 0,      ""],
    ["Full credit", summary.fullCredit ?? 0,      "live"],
  ];
  summaryGrid.innerHTML = cells.map(([key, val, cls]) => `
    <div class="cell ${cls}">
      <span class="key">${escapeHtml(key)}</span>
      <span class="val">${escapeHtml(val)}</span>
    </div>
  `).join("");

  const source = snapshot.sourceOfTruth || {};
  sourceStrip.innerHTML = [
    ["Roster", source.projects || "public/project-packets.json"],
    ["Tags", source.tags || "data/project-tags.json"],
    ["Reference rows hidden", summary.reference ?? 0],
  ].map(([label, value]) => `
    <div class="src">
      <span class="key">${escapeHtml(label)}</span>
      <span class="val">${escapeHtml(value)}</span>
    </div>
  `).join("");

  const sorted = (snapshot.projects || []).slice().sort((a, b) => {
    const liveDiff = Number(Boolean(b.live)) - Number(Boolean(a.live));
    if (liveDiff) return liveDiff;
    return Number(b.score || 0) - Number(a.score || 0)
      || String(a.title).localeCompare(String(b.title));
  });

  readinessRows.innerHTML = sorted.map((project) => `
    <tr>
      <td>
        <div class="proj-name">${escapeHtml(project.title)}</div>
        <div class="proj-by">${escapeHtml(project.owner || "")}</div>
        <div class="proj-meta">${escapeHtml(project.projectId)} · ${escapeHtml(project.surface || "room")} · ${escapeHtml(project.kind || "project")}</div>
        <div class="proj-meta">Modes: ${escapeHtml(joinList(project.modes))}</div>
      </td>
      <td>
        <div class="contract-lines">
          <div><strong>Listens</strong>${escapeHtml(joinList(project.consumes))}</div>
          <div><strong>Emits</strong>${escapeHtml(joinList(project.emits))}</div>
          <div><strong>Reads</strong>${escapeHtml(joinList(project.reads))}</div>
          <div><strong>Writes</strong>${escapeHtml(joinList(project.writes))}</div>
        </div>
      </td>
      <td>
        <div class="score">${escapeHtml(project.score)}<span style="font-family:var(--mono);font-size:12px;letter-spacing:0.18em;color:var(--ink-faint);"> / 5</span></div>
        <div class="proj-meta"><span class="pill ${liveClass(project)}">${escapeHtml(project.status)}</span></div>
        <div class="proj-meta">${escapeHtml(project.eventCount)} event${Number(project.eventCount) === 1 ? "" : "s"} · ${escapeHtml(project.lastEvent || "none")}</div>
        <div class="proj-meta">Heartbeat: ${escapeHtml(project.lastSeen ? new Date(project.lastSeen).toLocaleTimeString() : "none")}</div>
      </td>
      <td>
        <div class="proj-name" style="font-size: 16px;">${escapeHtml(project.acceptance?.passed ?? 0)}<span style="color:var(--ink-faint); font-style: italic;"> / ${escapeHtml(project.acceptance?.total ?? 0)}</span></div>
        <div class="proj-meta">${escapeHtml((project.acceptance?.missing || []).join(", ") || "all expected events seen or none declared")}</div>
      </td>
      <td>
        <div class="actions">
          <a href="/project.html?id=${encodeURIComponent(project.projectId)}"><button>Packet</button></a>
          <a href="/api/projects/${encodeURIComponent(project.projectId)}/contract.md" target="_blank"><button class="ghost">Prompt</button></a>
          <a href="/heartbeat?project=${encodeURIComponent(project.projectId)}"><button class="ghost">Heartbeat</button></a>
        </div>
      </td>
    </tr>
  `).join("");
}

function liveClass(project) {
  if (project.live) return "gn";
  if (project.hasHeartbeat) return "am";
  return "dim";
}

function showError(error) {
  readinessRows.innerHTML = `<tr><td colspan="5">${escapeHtml(error.message || String(error))}</td></tr>`;
}

function joinList(values) {
  return Array.isArray(values) && values.length ? values.join(", ") : "none";
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
