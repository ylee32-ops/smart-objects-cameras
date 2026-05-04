"use strict";

const typeFilter = document.getElementById("typeFilter");
const sourceFilter = document.getElementById("sourceFilter");
const searchFilter = document.getElementById("searchFilter");
const loadReplayBtn = document.getElementById("loadReplayBtn");
const clearLiveBtn = document.getElementById("clearLiveBtn");
const timeline = document.getElementById("timeline");
const timelineLabel = document.getElementById("timelineLabel");
const summaryLine = document.getElementById("summaryLine");
const eventList = document.getElementById("eventList");
const reactionSummary = document.getElementById("reactionSummary");
const copyEventBtn = document.getElementById("copyEventBtn");
const openReplayBtn = document.getElementById("openReplayBtn");
const eventJson = document.getElementById("eventJson");
const classStateTable = document.getElementById("classStateTable");

let liveEvents = [];
let replayEvents = [];
let selectedEvent = null;
let mode = "live";

Room.connect();
Room.onState((state) => {
  liveEvents = mergeEvents(liveEvents, state.events || []).slice(0, 240);
  render();
});
Room.onEvent((event) => {
  liveEvents = mergeEvents([event], liveEvents).slice(0, 240);
  selectedEvent = event;
  mode = "live";
  render();
});

typeFilter.addEventListener("change", render);
sourceFilter.addEventListener("change", render);
searchFilter.addEventListener("input", render);
loadReplayBtn.addEventListener("click", loadReplay);
clearLiveBtn.addEventListener("click", () => {
  liveEvents = [];
  selectedEvent = null;
  render();
});
timeline.addEventListener("input", () => {
  const events = activeEvents();
  selectedEvent = events[Number(timeline.value)] || null;
  renderSelection();
});
copyEventBtn.addEventListener("click", copySelected);
openReplayBtn.addEventListener("click", () => window.open("/api/replay?limit=200", "_blank"));

render();

async function loadReplay() {
  const res = await fetch("/api/replay?limit=200", { cache: "no-store" });
  const data = await res.json();
  replayEvents = [...(data.events || [])].reverse();
  mode = "replay";
  selectedEvent = replayEvents[0] || null;
  render();
}

function mergeEvents(...groups) {
  const seen = new Set();
  const merged = [];
  groups.flat().forEach((event) => {
    if (!event || seen.has(event.id)) return;
    seen.add(event.id);
    merged.push(event);
  });
  return merged.sort((a, b) => Date.parse(b.created_at || 0) - Date.parse(a.created_at || 0));
}

function activeEvents() {
  return mode === "replay" ? replayEvents : liveEvents;
}

function filteredEvents() {
  const type = typeFilter.value || "all";
  const source = sourceFilter.value || "all";
  const search = searchFilter.value.trim().toLowerCase();
  return activeEvents().filter((event) => {
    if (type !== "all" && event.event_type !== type) return false;
    if (source !== "all" && event.source !== source) return false;
    if (!search) return true;
    return JSON.stringify(event).toLowerCase().includes(search);
  });
}

function render() {
  const events = activeEvents();
  populateSelect(typeFilter, ["all", ...unique(events.map((event) => event.event_type))], typeFilter.value || "all");
  populateSelect(sourceFilter, ["all", ...unique(events.map((event) => event.source))], sourceFilter.value || "all");

  const filtered = filteredEvents();
  if (!selectedEvent || !filtered.some((event) => event.id === selectedEvent.id)) selectedEvent = filtered[0] || null;

  summaryLine.textContent = `${mode}: ${filtered.length}/${events.length} events`;
  timeline.max = String(Math.max(0, events.length - 1));
  timeline.value = selectedEvent ? String(events.findIndex((event) => event.id === selectedEvent.id)) : "0";
  timelineLabel.textContent = selectedEvent ? `${mode} index ${timeline.value}` : mode;

  eventList.innerHTML = "";
  filtered.slice(0, 120).forEach((event) => {
    const row = document.createElement("div");
    row.className = `event-row ${selectedEvent?.id === event.id ? "active" : ""}`;
    row.innerHTML = `
      <div class="event-type">${escapeHtml(event.event_type)}</div>
      <div class="event-meta">
        <span class="pill">${escapeHtml(event.source || "unknown")}</span>
        <span class="pill">${classifyEvent(event)}</span>
        <span class="small">${Room.fmtTime(event.created_at)}</span>
      </div>
      <div class="small">${escapeHtml(eventSummary(event))}</div>
    `;
    row.addEventListener("click", () => {
      selectedEvent = event;
      render();
    });
    eventList.appendChild(row);
  });

  renderSelection();
  renderClassState();
}

function renderSelection() {
  eventJson.textContent = selectedEvent ? JSON.stringify(selectedEvent, null, 2) : "Select an event.";
  if (!selectedEvent) {
    reactionSummary.textContent = "No reaction selected.";
    return;
  }
  const effect = ClassEventEffects.current();
  const selectedEffect = reduceClassEvent(selectedEvent) || (effect?.type === selectedEvent.event_type ? effect : null);
  reactionSummary.innerHTML = selectedEffect
    ? `
      <strong>${escapeHtml(selectedEffect.tone)}</strong>
      <div>${escapeHtml(selectedEffect.message)}</div>
      <div>projector: ${selectedEffect.projection ? "yes" : "no"} / detection: ${selectedEffect.detection ? "yes" : "no"} / board note: ${selectedEffect.boardNote ? "yes" : "no"}</div>
    `
    : `<div>${escapeHtml(eventSummary(selectedEvent))}</div>`;
}

function renderClassState() {
  const classEvents = activeEvents().filter((event) => isClassEvent(event));
  const byObject = new Map();
  [...classEvents].reverse().forEach((event) => {
    const payload = event.payload || {};
    const id = payload.projectId || payload.objectId || payload.activeObjectId || payload.label || event.event_type;
    byObject.set(id, event);
  });
  classStateTable.innerHTML = "";
  for (const [id, event] of byObject.entries()) {
    const row = document.createElement("div");
    row.className = "state-row";
    row.innerHTML = `
      <div><strong>${escapeHtml(id)}</strong><span class="small">${escapeHtml(event.event_type)}</span></div>
      <span class="pill">${classifyEvent(event)}</span>
      <span class="small">${Room.fmtTime(event.created_at)}</span>
    `;
    row.addEventListener("click", () => {
      selectedEvent = event;
      render();
    });
    classStateTable.appendChild(row);
  }
  if (!classStateTable.children.length) {
    classStateTable.innerHTML = `<div class="small">No class-object events yet.</div>`;
  }
}

function reduceClassEvent(event) {
  if (!isClassEvent(event)) return null;
  const payload = event.payload || {};
  const objectState = payload.state || {};
  const effect = {
    type: event.event_type,
    tone: "neutral",
    message: eventSummary(event),
    projection: null,
    detection: null,
    boardNote: null,
  };
  if (event.event_type === "sensor.light.changed") {
    effect.tone = Number(objectState.level || 50) < 35 ? "dim" : "bright";
    effect.message = `Ambient light ${objectState.level}`;
  }
  if (event.event_type === "text.detected") {
    effect.tone = "board";
    effect.boardNote = objectState.text || "";
    effect.message = `Read: ${effect.boardNote}`;
  }
  if (event.event_type === "board.scene.requested") {
    effect.tone = "projection";
    effect.message = `Scene: ${objectState.scene || payload.scene || payload.title || "board"}`;
  }
  if (event.event_type === "board.focus.changed" || event.event_type === "beam.pointed") {
    effect.tone = "focus";
    effect.message = `Focus ${objectState.target || payload.target || payload.title || ""}`.trim();
  }
  if (event.event_type === "grammar.suggestion" || event.event_type === "board.text.feedback.created") {
    effect.tone = "board";
    effect.boardNote = payload.text || objectState.text || "";
    effect.message = effect.boardNote || effect.message;
  }
  if (event.event_type === "handwriting.captured" || event.event_type === "note.saved" || event.event_type === "board.note.saved" || event.event_type === "board.annotation.created") {
    effect.tone = "board";
    effect.boardNote = objectState.text || payload.text || payload.title || "";
    effect.message = effect.boardNote || effect.message;
  }
  if (event.event_type === "projection.scene.changed" || event.event_type === "forest.mood.changed" || event.event_type === "gus.present" || event.event_type === "character.state.changed" || event.event_type === "room.adapted" || event.event_type === "session.mode.recommended") {
    effect.tone = "projection";
  }
  if (event.event_type === "class.comprehension.sampled") {
    effect.tone = "focus";
    effect.message = `${payload.title || "Class"} ${objectState.classState || "sampled"}`;
  }
  if (event.event_type === "character.prompt.requested" || event.event_type === "character.alerted") {
    effect.tone = "character";
    effect.message = payload.prompt || payload.emotion || payload.title || effect.message;
  }
  if (event.event_type === "session.timer.started" || event.event_type === "session.timer.offered") {
    effect.tone = "focus";
    effect.message = `Timer ${objectState.duration || payload.duration || ""}`.trim();
  }
  if (event.event_type === "projection.frame.simulated") {
    effect.tone = "projection";
    effect.projection = payload;
  }
  if (event.event_type === "detection.frame.simulated") {
    effect.tone = "detection";
    effect.detection = payload;
  }
  if (event.event_type === "safety.boundary.warning") {
    effect.tone = objectState.severity || "warn";
  }
  return effect;
}

function isClassEvent(event) {
  return Boolean(
    event?.payload?.sourceProject === "smartobjects-labs-week2" ||
    Boolean(event?.payload?.projectId) ||
    event?.event_type === "projection.frame.simulated" ||
    event?.event_type === "detection.frame.simulated" ||
    event?.source === "class-object-simulator" ||
    event?.source === "project-packet",
  );
}

function classifyEvent(event) {
  const type = event.event_type || "";
  if (type.startsWith("projection.") || type.startsWith("board.scene.") || type.startsWith("board.media.")) return "projection";
  if (type.includes("detection") || type.includes("fiducial")) return "detection";
  if (type.startsWith("class.") || type.includes("sensor") || type.includes("presence") || type.includes("attention") || type.includes("gesture")) return "sensor";
  if (type.startsWith("session.") || type.includes("rule") || type.includes("safety")) return "rule";
  if (type.startsWith("character.") || type.includes("character")) return "character";
  if (type.startsWith("board.")) return "room";
  return "room";
}

function eventSummary(event) {
  const payload = event.payload || {};
  if (payload.label) return payload.label;
  if (payload.projectId) return payload.projectId;
  if (payload.scene) return payload.scene;
  if (payload.prompt) return payload.prompt;
  if (payload.objectId) return payload.objectId;
  if (payload.activeObjectId) return payload.activeObjectId;
  if (payload.text) return payload.text;
  if (payload.state) return Object.entries(payload.state).slice(0, 3).map(([k, v]) => `${k}:${v}`).join(" ");
  return event.source || "";
}

function populateSelect(select, values, current) {
  const next = values.includes(current) ? current : "all";
  select.innerHTML = "";
  values.forEach((value) => {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = value;
    select.appendChild(option);
  });
  select.value = next;
}

function unique(values) {
  return [...new Set(values.filter(Boolean))].sort();
}

async function copySelected() {
  if (!selectedEvent) return;
  await navigator.clipboard?.writeText(JSON.stringify(selectedEvent, null, 2));
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
