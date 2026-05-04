"use strict";

const SOURCE = "class-object-simulator";

const objectList = document.getElementById("objectList");
const objectTitle = document.getElementById("objectTitle");
const objectDescription = document.getElementById("objectDescription");
const projectContext = document.getElementById("projectContext");
const simMap = document.getElementById("simMap");
const sim3d = document.getElementById("sim3d");
const spaceView = document.getElementById("spaceView");
const view2dBtn = document.getElementById("view2dBtn");
const view3dBtn = document.getElementById("view3dBtn");
const spaceLabel = document.getElementById("spaceLabel");
const controlForm = document.getElementById("controlForm");
const eventPreview = document.getElementById("eventPreview");
const lastResult = document.getElementById("lastResult");
const scenarioButtons = document.getElementById("scenarioButtons");
const emitBtn = document.getElementById("emitBtn");
const projectBtn = document.getElementById("projectBtn");
const detectBtn = document.getElementById("detectBtn");
const cycleBtn = document.getElementById("cycleBtn");
const resetBtn = document.getElementById("resetBtn");

let config = null;
let active = null;
let state = {};
let dragging = false;
let viewMode = "2d";
let projects = [];
let invalidRequestedProject = false;
const requestedProjectId = new URLSearchParams(window.location.search).get("project");
let activeProject = null;

Room.connect();
Room.onState((roomState) => {
  if (!config || !Array.isArray(roomState.classObjects)) return;
  const currentId = active?.id;
  config.objects = roomState.classObjects.map((object) => ({ ...object, state: { ...object.state } }));
  if (currentId) active = config.objects.find((object) => object.id === currentId) || config.objects[0];
  if (active) state = active.state;
  renderObjectList();
  if (active) {
    renderControls();
    renderMap();
    render3d();
    renderPreview();
  }
});
loadConfig().catch(showError);

emitBtn.addEventListener("click", () => emitEvent().catch(showError));
projectBtn.addEventListener("click", () => emitProjection().catch(showError));
detectBtn.addEventListener("click", () => emitDetection().catch(showError));
cycleBtn.addEventListener("click", cycleState);
resetBtn.addEventListener("click", async () => {
  await Room.action("class-object.reset", { id: active.id });
});
view2dBtn.addEventListener("click", () => setViewMode("2d"));
view3dBtn.addEventListener("click", () => setViewMode("3d"));
simMap.addEventListener("pointerdown", (event) => {
  dragging = true;
  simMap.setPointerCapture?.(event.pointerId);
  updatePointFromEvent(event);
});
simMap.addEventListener("pointermove", (event) => {
  if (!dragging) return;
  updatePointFromEvent(event);
});
simMap.addEventListener("pointerup", () => {
  if (dragging) syncClassObjectState().catch(showError);
  dragging = false;
});
simMap.addEventListener("pointercancel", () => {
  if (dragging) syncClassObjectState().catch(showError);
  dragging = false;
});

async function loadConfig() {
  const [classRes, projectRes] = await Promise.all([
    fetch("/api/class-objects", { cache: "no-store" }),
    fetch("/api/projects", { cache: "no-store" }),
  ]);
  if (!classRes.ok) throw new Error(`Could not load /api/class-objects: HTTP ${classRes.status}`);
  if (!projectRes.ok) throw new Error(`Could not load /api/projects: HTTP ${projectRes.status}`);
  config = await classRes.json();
  projects = (await projectRes.json()).projects || [];
  activeProject = projects.find((project) => project.id === requestedProjectId) || null;
  invalidRequestedProject = Boolean(requestedProjectId && !activeProject);
  renderObjectList();
  renderScenarioButtons();
  setActive(activeProject?.fallbackObjectId || config.objects[0].id);
  renderProjectContext();
}

function renderScenarioButtons() {
  scenarioButtons.innerHTML = "";
  projects
    .filter((project) => project.scenario?.featured)
    .forEach((project) => {
      const button = document.createElement("button");
      button.textContent = project.scenario?.label || project.title;
      if (activeProject?.id === project.id) button.classList.add("primary");
      button.addEventListener("click", () => runScenario(project.id).catch(showError));
      scenarioButtons.appendChild(button);
    });
}

function renderProjectContext() {
  if (invalidRequestedProject) {
    projectContext.hidden = false;
    projectContext.innerHTML = `
      <strong>Project fallback not found.</strong>
      <div>No project matched <span class="mono">${escapeHtml(requestedProjectId)}</span>.</div>
      <div>Showing the generic simulator instead.</div>
      <div class="row" style="margin-top:8px">
        <button id="openProjectsIndexBtn" type="button">Open Projects</button>
      </div>
    `;
    document.getElementById("openProjectsIndexBtn")?.addEventListener("click", () => {
      window.location.href = "/projects.html";
    });
    return;
  }
  if (!activeProject) {
    projectContext.hidden = true;
    return;
  }
  projectContext.hidden = false;
  projectContext.innerHTML = `
    <strong>${escapeHtml(activeProject.title)}</strong>
    <div>${escapeHtml(activeProject.description || "")}</div>
    <div class="mono">fallback object: ${escapeHtml(activeProject.fallbackObjectId || "none")}</div>
    <div>expected: ${escapeHtml(joinList(activeProject.acceptance?.expectEvents))}</div>
    <div class="row" style="margin-top:8px">
      <button id="openProjectPacketBtn" type="button">Open Packet</button>
      <button id="runProjectFallback" class="primary">Run Project Scenario</button>
    </div>
  `;
  document.getElementById("openProjectPacketBtn")?.addEventListener("click", () => {
    window.location.href = `/project.html?id=${encodeURIComponent(activeProject.id)}`;
  });
  document.getElementById("runProjectFallback")?.addEventListener("click", () => runScenario(activeProject.id).catch(showError));
}

function renderObjectList() {
  objectList.innerHTML = "";
  config.objects.forEach((object, index) => {
    const button = document.createElement("button");
    button.className = "object-button";
    button.dataset.id = object.id;
    button.innerHTML = `<strong>${index + 1}. ${escapeHtml(object.label)}</strong><div class="small">${escapeHtml(object.eventType)}</div>`;
    button.addEventListener("click", () => setActive(object.id));
    objectList.appendChild(button);
  });
}

function setActive(id) {
  active = config.objects.find((object) => object.id === id) || config.objects[0];
  state = active.state;
  objectTitle.textContent = active.label;
  objectDescription.textContent = active.description;
  document.querySelectorAll(".object-button").forEach((button) => {
    button.classList.toggle("active", button.dataset.id === active.id);
  });
  renderControls();
  renderMap();
  render3d();
  renderPreview();
}

function setViewMode(mode) {
  viewMode = mode;
  spaceView.classList.toggle("is-3d", mode === "3d");
  view2dBtn.classList.toggle("active", mode === "2d");
  view3dBtn.classList.toggle("active", mode === "3d");
  spaceLabel.textContent = mode === "3d" ? `${active.surface} surface projection` : "room coordinates";
  if (mode === "3d") render3d();
}

function renderControls() {
  controlForm.innerHTML = "";
  (active.controls || []).forEach((control) => {
    const row = document.createElement("div");
    row.className = "form-row";
    const label = document.createElement("label");
    label.textContent = control.label;
    const input = createInput(control);
    input.addEventListener("input", () => {
      state[control.id] = readValue(input, control);
      syncClassObjectState().catch(showError);
      renderPreview();
    });
    row.append(label, input);
    controlForm.appendChild(row);
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
    select.value = String(state[control.id] ?? control.options?.[0] ?? "");
    return select;
  }
  if (control.type === "toggle") {
    const input = document.createElement("input");
    input.type = "checkbox";
    input.checked = Boolean(state[control.id]);
    return input;
  }
  if (control.type === "range") {
    const input = document.createElement("input");
    input.type = "range";
    input.min = control.min;
    input.max = control.max;
    input.step = control.step || 1;
    input.value = state[control.id] ?? control.min ?? 0;
    return input;
  }
  const input = document.createElement("input");
  input.type = "text";
  input.value = state[control.id] ?? "";
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

function renderMap() {
  simMap.innerHTML = "";
  (config.zones || []).forEach((zone) => {
    const el = document.createElement("div");
    el.className = "sim-zone";
    el.style.left = `${zone.x * 100}%`;
    el.style.top = `${zone.y * 100}%`;
    el.style.width = `${zone.w * 100}%`;
    el.style.height = `${zone.h * 100}%`;
    el.textContent = zone.label;
    simMap.appendChild(el);
  });
  render2dDevices();
  config.objects.forEach((object) => {
    const objectState = object.state;
    const marker = document.createElement("div");
    marker.className = `sim-object ${object.id === active.id ? "active" : ""}`;
    marker.style.left = `${Number(objectState.x || 0.5) * 100}%`;
    marker.style.top = `${Number(objectState.y || 0.5) * 100}%`;
    marker.style.borderColor = colorForKind(object.kind);
    marker.textContent = object.kind.slice(0, 1).toUpperCase();
    marker.title = object.label;
    marker.addEventListener("pointerdown", (event) => {
      setActive(object.id);
    });
    simMap.appendChild(marker);
  });
}

function render2dDevices() {
  const devices = [
    { label: "board projector", kind: "projector", x: 0.18, y: 0.16, w: 0.68, h: 0.58 },
    { label: "board camera", kind: "camera", x: 0.12, y: 0.12, w: 0.78, h: 0.68 },
  ];
  devices.forEach((device) => {
    const el = document.createElement("div");
    el.className = `sim-device ${device.kind === "camera" ? "camera" : ""}`;
    el.style.left = `${device.x * 100}%`;
    el.style.top = `${device.y * 100}%`;
    el.style.width = `${device.w * 100}%`;
    el.style.height = `${device.h * 100}%`;
    el.textContent = device.label;
    simMap.appendChild(el);
  });
}

function render3d() {
  if (!sim3d) return;
  const rect = sim3d.getBoundingClientRect();
  const width = Math.max(1, Math.floor(rect.width || sim3d.clientWidth || 800));
  const height = Math.max(1, Math.floor(rect.height || width * 0.8));
  if (sim3d.width !== width || sim3d.height !== height) {
    sim3d.width = width;
    sim3d.height = height;
  }
  const ctx = sim3d.getContext("2d");
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#0d1117";
  ctx.fillRect(0, 0, width, height);

  drawPoly(ctx, [
    project3d(0.16, 0.24, width, height),
    project3d(0.84, 0.24, width, height),
    project3d(0.9, 0.72, width, height),
    project3d(0.22, 0.78, width, height),
  ], "#202833", "#3b4658");

  drawPoly(ctx, [
    project3d(0.2, 0.1, width, height, 0.5),
    project3d(0.8, 0.1, width, height, 0.5),
    project3d(0.8, 0.1, width, height, 0.08),
    project3d(0.2, 0.1, width, height, 0.08),
  ], "#dfe5ea", "#4c5664");

  (config.zones || []).forEach((zone) => {
    drawPoly(ctx, [
      project3d(zone.x, zone.y, width, height),
      project3d(zone.x + zone.w, zone.y, width, height),
      project3d(zone.x + zone.w, zone.y + zone.h, width, height),
      project3d(zone.x, zone.y + zone.h, width, height),
    ], "rgba(99,179,255,.08)", "rgba(99,179,255,.34)");
  });

  render3dDevices(ctx, width, height);

  config.objects.forEach((object) => {
    const objectState = object.state;
    const p = project3d(Number(objectState.x || 0.5), Number(objectState.y || 0.5), width, height, heightForSurface(object.surface));
    const activeObject = object.id === active.id;
    ctx.beginPath();
    ctx.arc(p.x, p.y, activeObject ? 13 : 9, 0, Math.PI * 2);
    ctx.fillStyle = colorForKind(object.kind);
    ctx.fill();
    ctx.lineWidth = activeObject ? 3 : 1;
    ctx.strokeStyle = activeObject ? "#eef2f6" : "rgba(238,242,246,.55)";
    ctx.stroke();
    if (activeObject || object.kind === "agent" || object.kind === "rule") {
      ctx.fillStyle = "#eef2f6";
      ctx.font = "12px ui-monospace, Consolas, monospace";
      ctx.fillText(object.label, p.x + 15, p.y + 4);
    }
  });
}

function render3dDevices(ctx, width, height) {
  drawPoly(ctx, [
    project3d(0.18, 0.26, width, height, 0.09),
    project3d(0.82, 0.26, width, height, 0.09),
    project3d(0.82, 0.76, width, height, 0.09),
    project3d(0.18, 0.76, width, height, 0.09),
  ], "rgba(245,200,76,.1)", "rgba(245,200,76,.65)");

  drawPoly(ctx, [
    project3d(0.3, 0.1, width, height, 0.5),
    project3d(0.7, 0.1, width, height, 0.5),
    project3d(0.7, 0.1, width, height, 0.22),
    project3d(0.3, 0.1, width, height, 0.22),
  ], "rgba(245,200,76,.08)", "rgba(245,200,76,.6)");

  drawFrustum(ctx, project3d(0.5, 0.02, width, height, 0.82), [
    project3d(0.12, 0.18, width, height, 0.1),
    project3d(0.88, 0.18, width, height, 0.1),
    project3d(0.88, 0.86, width, height, 0.1),
    project3d(0.12, 0.86, width, height, 0.1),
  ], "rgba(68,209,125,.5)");

  drawFrustum(ctx, project3d(0.96, 0.08, width, height, 0.48), [
    project3d(0.25, 0.02, width, height, 0.42),
    project3d(0.75, 0.02, width, height, 0.42),
    project3d(0.75, 0.28, width, height, 0.26),
    project3d(0.25, 0.28, width, height, 0.26),
  ], "rgba(68,209,125,.38)");
}

function drawFrustum(ctx, origin, points, stroke) {
  ctx.strokeStyle = stroke;
  ctx.lineWidth = 1;
  points.forEach((point) => {
    ctx.beginPath();
    ctx.moveTo(origin.x, origin.y);
    ctx.lineTo(point.x, point.y);
    ctx.stroke();
  });
  drawPoly(ctx, points, "rgba(68,209,125,.04)", stroke);
}

function project3d(x, y, width, height, z = 0) {
  const px = (x - 0.5) * 520;
  const py = (y - 0.5) * 380;
  return {
    x: width / 2 + px - py * 0.58,
    y: height * 0.62 + py * 0.52 + px * 0.12 - z * 170,
  };
}

function heightForSurface(surface) {
  if (surface === "board") return 0.42;
  if (surface === "camera") return 0.35;
  return 0.08;
}

function drawPoly(ctx, points, fill, stroke) {
  ctx.beginPath();
  points.forEach((point, index) => {
    if (index === 0) ctx.moveTo(point.x, point.y);
    else ctx.lineTo(point.x, point.y);
  });
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.strokeStyle = stroke;
  ctx.lineWidth = 1;
  ctx.stroke();
}

function colorForKind(kind) {
  if (kind === "sensor") return "#63b3ff";
  if (kind === "zone") return "#f5c84c";
  if (kind === "rule") return "#a78bfa";
  if (kind === "agent") return "#44d17d";
  return "#ff80bf";
}

function updatePointFromEvent(event) {
  const pt = Room.normalizedPoint(event, simMap);
  state.x = Number(pt.x.toFixed(3));
  state.y = Number(pt.y.toFixed(3));
  renderMap();
  render3d();
  renderPreview();
}

function buildEvent() {
  const payload = {
    objectId: active.id,
    label: active.label,
    kind: active.kind,
    surface: active.surface,
    sourceProject: "smartobjects-labs-week2",
    state: { ...state },
  };
  return {
    event_type: active.eventType,
    payload,
  };
}

function renderPreview() {
  eventPreview.textContent = JSON.stringify(buildEvent(), null, 2);
}

async function emitEvent() {
  const event = buildEvent();
  const result = await Room.action("event.manual", event);
  lastResult.textContent = `emitted ${event.event_type} at ${new Date().toLocaleTimeString()}`;
  return result;
}

async function emitProjection() {
  const projection = buildProjectionEvent();
  await Room.action("event.manual", projection);
  lastResult.textContent = `emitted ${projection.event_type} at ${new Date().toLocaleTimeString()}`;
}

async function emitDetection() {
  const detection = buildDetectionEvent();
  await Room.action("event.manual", detection);
  lastResult.textContent = `emitted ${detection.event_type} at ${new Date().toLocaleTimeString()}`;
}

function buildProjectionEvent() {
  return {
    event_type: "projection.frame.simulated",
    payload: {
      activeObjectId: active.id,
      objectCount: config.objects.length,
      projectors: [
        { id: "board-projector", surface: "board", footprint: { x: 0.18, y: 0.16, w: 0.68, h: 0.58 } },
      ],
      projectedObjects: projectedObjects(),
    },
  };
}

function buildDetectionEvent() {
  return {
    event_type: "detection.frame.simulated",
    payload: {
      activeObjectId: active.id,
      cameras: [
        { id: "board-camera", surface: "board", coverage: { x: 0.12, y: 0.12, w: 0.78, h: 0.68 } },
      ],
      detections: detectedObjects(),
    },
  };
}

function projectedObjects() {
  return config.objects
    .filter((object) => inRect(object.state, { x: 0.18, y: 0.16, w: 0.68, h: 0.58 }) || object.surface === "board")
    .map((object) => ({ id: object.id, label: object.label, surface: object.surface, state: object.state }));
}

function detectedObjects() {
  return config.objects
    .filter((object) => inRect(object.state, { x: 0.12, y: 0.12, w: 0.78, h: 0.68 }))
    .map((object) => ({
      id: object.id,
      label: object.label,
      kind: object.kind,
      confidence: object.id === active.id ? 0.94 : 0.74,
      x: object.state.x,
      y: object.state.y,
    }));
}

function inRect(point, rect) {
  const x = Number(point.x || 0);
  const y = Number(point.y || 0);
  return x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h;
}

async function runScenario(projectId) {
  const project = projects.find((item) => item.id === projectId);
  const events = project?.scenario?.events || [];
  if (!events.length) return;
  activeProject = project;
  renderScenarioButtons();
  renderProjectContext();
  if (project?.fallbackObjectId) {
    setActive(project.fallbackObjectId);
  }
  for (const item of events) {
    await Room.action("event.manual", {
      event_type: item.event_type,
      payload: {
        ...(item.payload || {}),
        projectId,
        sourceProject: projectId,
        title: project.title,
        owner: project.owner,
      },
    });
    await delay(140);
  }
  lastResult.textContent = `ran ${project.title} scenario (${events.length} events)`;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function cycleState() {
  const firstSelect = (active.controls || []).find((control) => control.type === "select");
  const firstToggle = (active.controls || []).find((control) => control.type === "toggle");
  const firstRange = (active.controls || []).find((control) => control.type === "range");
  if (firstSelect) {
    const options = firstSelect.options || [];
    const current = options.map(String).indexOf(String(state[firstSelect.id]));
    state[firstSelect.id] = options[(current + 1) % options.length];
  } else if (firstToggle) {
    state[firstToggle.id] = !state[firstToggle.id];
  } else if (firstRange) {
    const min = Number(firstRange.min || 0);
    const max = Number(firstRange.max || 100);
    const next = Number(state[firstRange.id] || min) + (max - min) / 4;
    state[firstRange.id] = next > max ? min : next;
  }
  syncClassObjectState().catch(showError);
  renderControls();
  renderMap();
  render3d();
  renderPreview();
}

async function syncClassObjectState() {
  await Room.action("class-object.set", { id: active.id, state });
}

function showError(error) {
  lastResult.textContent = error.message || String(error);
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
