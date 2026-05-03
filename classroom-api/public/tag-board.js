"use strict";

const STORAGE_KEY = "smart-room-mobile-tag-board/v4";
const board = document.getElementById("virtualBoard");
const effectLayer = document.getElementById("tagEffectLayer");
const layer = document.getElementById("virtualTagLayer");
const picker = document.getElementById("tagBoardPicker");
const statusEl = document.getElementById("tagBoardStatus");
const countEl = document.getElementById("tagBoardCount");
const sizeRange = document.getElementById("tagSizeRange");
const rotationRange = document.getElementById("tagRotationRange");

let availableTags = [];
let tags = [];
let selectedInstanceId = "";
let nextInstanceNumber = 1;
let activeTagId = "";
let activePointers = new Map();
let gestureStart = null;
let rotationDrag = null;
let latestRoomState = null;

document.getElementById("addVirtualTag").addEventListener("click", addPickedTag);
document.getElementById("openTagBoardControls").addEventListener("click", showControls);
document.getElementById("hideTagBoardControls").addEventListener("click", hideControls);
document.getElementById("freshTagBoard").addEventListener("click", freshReset);
document.getElementById("freshTagBoardFull").addEventListener("click", freshReset);
document.getElementById("cleanTagBoard").addEventListener("click", enterCleanMode);
document.getElementById("miniCleanTagBoard").addEventListener("click", enterCleanMode);
document.getElementById("showTagControls").addEventListener("click", exitCleanMode);
document.getElementById("fullscreenTagBoard").addEventListener("click", requestFullscreen);
document.getElementById("miniFullscreenTagBoard").addEventListener("click", requestFullscreen);
document.getElementById("presetCorners").addEventListener("click", () => setPreset("board"));
document.getElementById("presetTools").addEventListener("click", () => setPreset("tools"));
document.getElementById("duplicateVirtualTag").addEventListener("click", duplicateSelected);
document.getElementById("deleteVirtualTag").addEventListener("click", deleteSelected);
document.getElementById("resetVirtualTags").addEventListener("click", () => setPreset("board"));
sizeRange.addEventListener("input", updateSelectedFromControls);
rotationRange.addEventListener("input", updateSelectedFromControls);
board.addEventListener("pointerdown", (event) => {
  if (event.target === board || event.target === layer) selectTag("");
});
board.addEventListener("contextmenu", (event) => event.preventDefault());
board.addEventListener("auxclick", (event) => event.preventDefault());
window.addEventListener("resize", renderTags);

init().catch((error) => {
  statusEl.textContent = error.message || String(error);
});

async function init() {
  const tagMap = await fetch("/api/tag-map").then((res) => {
    if (!res.ok) throw new Error(`tag map HTTP ${res.status}`);
    return res.json();
  });
  availableTags = buildAvailableTags(tagMap);
  renderPicker();

  if (!loadSavedLayout()) {
    setPreset("board", { save: false });
  }
  Room.connect();
  Room.onState((state) => {
    latestRoomState = state;
    renderEffects();
  });
  renderTags();
  updateStatus("Ready. Drag to move; middle/right-drag rotates. Use Clean before showing the screen to the camera.");
}

function buildAvailableTags(tagMap) {
  const rows = [];
  Object.entries(tagMap.calibrationTags || {})
    .filter(([, tag]) => tag.surface === "board")
    .forEach(([tagId, tag]) => {
      rows.push({
        tagId: Number(tagId),
        label: `Board ${String(tag.corner || "corner").replaceAll("-", " ")}`,
        role: "calibration",
        surface: tag.surface || "board",
        color: "#e5e7eb",
      });
    });

  Object.entries(tagMap.objectTags || {})
    .filter(([, tag]) => tag.surface === "board")
    .forEach(([tagId, tag]) => {
      rows.push({
        tagId: Number(tagId),
        label: tag.label || `Tag ${tagId}`,
        role: tag.role || "tag",
        surface: tag.surface || "board",
        color: tag.color || "#e5e7eb",
      });
    });

  return rows.sort((a, b) => a.tagId - b.tagId);
}

function renderPicker() {
  picker.innerHTML = availableTags.map((tag) => (
    `<option value="${tag.tagId}">#${tag.tagId} ${escapeHtml(tag.label)} / ${escapeHtml(tag.role)}</option>`
  )).join("");
  if (availableTags.some((tag) => tag.tagId === 40)) picker.value = "40";
  if (availableTags.some((tag) => tag.tagId === 23)) picker.value = "23";
}

function setPreset(name, options = {}) {
  if (name === "tools") {
    tags = [
      createTag(21, 20, 28, 126),
      createTag(35, 42, 28, 126),
      createTag(39, 64, 28, 126),
      createTag(40, 50, 62, 154),
      createTag(36, 28, 72, 126),
      createTag(37, 72, 72, 126),
    ].filter(Boolean);
    selectTag(tags[3]?.instanceId || "");
    updateStatus("Tools layout loaded.");
  } else if (name === "active") {
    // Board mode — focus tag only, no calibration corners.
    const sizes = calibrationPresetSizes();
    tags = [createTag(23, 50, 50, sizes.focus)].filter(Boolean);
    selectTag(tags[0]?.instanceId || "");
    updateStatus("Board mode — focus tag at center, no corners.");
  } else {
    const sizes = calibrationPresetSizes();
    tags = [
      createTag(4, 12, 12, sizes.corner),
      createTag(5, 88, 12, sizes.corner),
      createTag(6, 88, 88, sizes.corner),
      createTag(7, 12, 88, sizes.corner),
      createTag(23, 50, 50, sizes.focus),
    ].filter(Boolean);
    selectTag(tags[4]?.instanceId || "");
    updateStatus("Calibration corners loaded with Focus centered.");
  }
  renderTags();
  if (options.save !== false) saveLayout();
}

// ── Calibration / Board mode toggle ─────────────────────────────────
const tagBoardModeToggle = document.getElementById("tagBoardModeToggle");
const TAG_BOARD_MODE_KEY = "tagBoardMode";

function tagBoardModeName() {
  return localStorage.getItem(TAG_BOARD_MODE_KEY) === "board" ? "board" : "calibration";
}

function updateTagBoardModeButton() {
  if (!tagBoardModeToggle) return;
  const name = tagBoardModeName();
  tagBoardModeToggle.textContent = name === "board" ? "Mode: Board" : "Mode: Calibration";
  tagBoardModeToggle.classList.toggle("primary", name === "board");
}

function applyTagBoardMode(name) {
  const next = name === "board" ? "board" : "calibration";
  localStorage.setItem(TAG_BOARD_MODE_KEY, next);
  if (next === "board") setPreset("active");
  else setPreset("board");
  updateTagBoardModeButton();
}

if (tagBoardModeToggle) {
  tagBoardModeToggle.addEventListener("click", () => {
    applyTagBoardMode(tagBoardModeName() === "board" ? "calibration" : "board");
  });
  updateTagBoardModeButton();
}

function calibrationPresetSizes() {
  return {
    corner: Math.round(clamp(Math.min(window.innerWidth * 0.12, window.innerHeight * 0.17), 72, 320)),
    focus: Math.round(clamp(Math.min(window.innerWidth * 0.16, window.innerHeight * 0.22), 96, 360)),
  };
}

function createTag(tagId, x = 50, y = 50, size = 132, rotation = 0) {
  const meta = availableTags.find((tag) => Number(tag.tagId) === Number(tagId));
  if (!meta) return null;
  const tag = {
    ...meta,
    instanceId: `tag-${meta.tagId}-${nextInstanceNumber}`,
    x,
    y,
    size,
    rotation,
  };
  nextInstanceNumber += 1;
  return tag;
}

function addPickedTag() {
  const tagId = Number(picker.value);
  const offset = tags.length % 5;
  const tag = createTag(tagId, 42 + offset * 4, 42 + offset * 4, tagId === 40 ? 152 : 132);
  if (!tag) return;
  tags.push(tag);
  selectTag(tag.instanceId);
  renderTags();
  saveLayout();
  updateStatus(`Added #${tag.tagId} ${tag.label}.`);
}

function renderTags() {
  layer.innerHTML = "";
  tags.forEach((tag) => {
    const el = document.createElement("div");
    el.className = `virtual-tag${tag.instanceId === selectedInstanceId ? " selected" : ""}`;
    el.dataset.instanceId = tag.instanceId;
    el.style.left = `${clamp(tag.x, 0, 100)}%`;
    el.style.top = `${clamp(tag.y, 0, 100)}%`;
    el.style.setProperty("--tag-size", `${clamp(tag.size, 48, 360)}px`);
    el.style.setProperty("--tag-rotation", `${tag.rotation || 0}deg`);
    el.style.setProperty("--tag-color", tag.color || "#e5e7eb");
    el.innerHTML = `
      <div class="tag-face">
        <img src="/generated-tags/tag-${tag.tagId}.png" alt="AprilTag ${tag.tagId}" draggable="false">
      </div>
      <div class="tag-label">#${tag.tagId} ${escapeHtml(tag.label)}</div>
    `;
    el.addEventListener("pointerdown", (event) => beginTagGesture(event, tag.instanceId, el));
    el.addEventListener("auxclick", (event) => event.preventDefault());
    layer.appendChild(el);
  });
  countEl.textContent = `${tags.length} tag${tags.length === 1 ? "" : "s"}`;
  syncControls();
  renderEffects();
}

function beginTagGesture(event, instanceId, el) {
  event.preventDefault();
  event.stopPropagation();
  if (event.button === 1 || event.button === 2) {
    beginRotationGesture(event, instanceId, el);
    return;
  }
  if (event.pointerType === "mouse" && event.button !== 0) return;
  selectTag(instanceId);
  activeTagId = instanceId;
  activePointers.set(event.pointerId, pointerState(event));
  el.classList.add("dragging");
  el.setPointerCapture(event.pointerId);
  resetGestureStart();

  el.addEventListener("pointermove", moveTagGesture);
  el.addEventListener("pointerup", endTagGesture);
  el.addEventListener("pointercancel", endTagGesture);
}

function moveTagGesture(event) {
  if (!activeTagId || !activePointers.has(event.pointerId)) return;
  event.preventDefault();
  activePointers.set(event.pointerId, pointerState(event));
  const tag = selectedTag();
  if (!tag || !gestureStart) return;

  const points = Array.from(activePointers.values());
  if (points.length >= 2 && gestureStart.distance > 0) {
    const current = gestureMetrics(points[0], points[1]);
    tag.x = clamp(gestureStart.tag.x + (current.center.x - gestureStart.center.x), 2, 98);
    tag.y = clamp(gestureStart.tag.y + (current.center.y - gestureStart.center.y), 2, 98);
    tag.size = clamp(gestureStart.tag.size * (current.distance / gestureStart.distance), 48, 360);
    tag.rotation = normalizeDegrees(gestureStart.tag.rotation + current.angle - gestureStart.angle);
  } else {
    const current = points[0];
    tag.x = clamp(gestureStart.tag.x + (current.x - gestureStart.primary.x), 2, 98);
    tag.y = clamp(gestureStart.tag.y + (current.y - gestureStart.primary.y), 2, 98);
  }

  paintTag(tag);
  syncControls();
  renderEffects();
}

function endTagGesture(event) {
  activePointers.delete(event.pointerId);
  event.currentTarget.classList.remove("dragging");
  if (activePointers.size === 0) {
    activeTagId = "";
    gestureStart = null;
    saveLayout();
    return;
  }
  resetGestureStart();
}

function beginRotationGesture(event, instanceId, el) {
  selectTag(instanceId);
  const tag = selectedTag();
  if (!tag) return;
  rotationDrag = {
    instanceId,
    startRotation: Number(tag.rotation || 0),
    startAngle: pointerAngleForTag(event, tag),
  };
  el.classList.add("dragging");
  el.setPointerCapture(event.pointerId);
  el.addEventListener("pointermove", moveRotationGesture);
  el.addEventListener("pointerup", endRotationGesture);
  el.addEventListener("pointercancel", endRotationGesture);
}

function moveRotationGesture(event) {
  if (!rotationDrag) return;
  event.preventDefault();
  const tag = tags.find((item) => item.instanceId === rotationDrag.instanceId);
  if (!tag) return;
  tag.rotation = normalizeDegrees(rotationDrag.startRotation + pointerAngleForTag(event, tag) - rotationDrag.startAngle);
  paintTag(tag);
  syncControls();
  renderEffects();
}

function endRotationGesture(event) {
  event.currentTarget.classList.remove("dragging");
  event.currentTarget.removeEventListener("pointermove", moveRotationGesture);
  event.currentTarget.removeEventListener("pointerup", endRotationGesture);
  event.currentTarget.removeEventListener("pointercancel", endRotationGesture);
  rotationDrag = null;
  saveLayout();
}

function resetGestureStart() {
  const tag = selectedTag();
  const points = Array.from(activePointers.values());
  if (!tag || !points.length) {
    gestureStart = null;
    return;
  }
  const metrics = points.length >= 2 ? gestureMetrics(points[0], points[1]) : null;
  gestureStart = {
    tag: { ...tag },
    primary: points[0],
    center: metrics?.center || points[0],
    distance: metrics?.distance || 0,
    angle: metrics?.angle || 0,
  };
}

function pointerState(event) {
  const rect = board.getBoundingClientRect();
  return {
    x: ((event.clientX - rect.left) / rect.width) * 100,
    y: ((event.clientY - rect.top) / rect.height) * 100,
    clientX: event.clientX,
    clientY: event.clientY,
  };
}

function gestureMetrics(a, b) {
  return {
    center: {
      x: (a.x + b.x) / 2,
      y: (a.y + b.y) / 2,
    },
    distance: Math.hypot(b.clientX - a.clientX, b.clientY - a.clientY),
    angle: Math.atan2(b.clientY - a.clientY, b.clientX - a.clientX) * 180 / Math.PI,
  };
}

function paintTag(tag) {
  const el = layer.querySelector(`[data-instance-id="${cssEscape(tag.instanceId)}"]`);
  if (!el) {
    renderTags();
    return;
  }
  el.style.left = `${clamp(tag.x, 0, 100)}%`;
  el.style.top = `${clamp(tag.y, 0, 100)}%`;
  el.style.setProperty("--tag-size", `${clamp(tag.size, 48, 360)}px`);
  el.style.setProperty("--tag-rotation", `${tag.rotation || 0}deg`);
  renderEffects();
}

function selectTag(instanceId) {
  selectedInstanceId = instanceId || "";
  layer.querySelectorAll(".virtual-tag").forEach((el) => {
    el.classList.toggle("selected", el.dataset.instanceId === selectedInstanceId);
  });
  syncControls();
}

function selectedTag() {
  return tags.find((tag) => tag.instanceId === selectedInstanceId) || null;
}

function syncControls() {
  const tag = selectedTag();
  const disabled = !tag;
  sizeRange.disabled = disabled;
  rotationRange.disabled = disabled;
  document.getElementById("duplicateVirtualTag").disabled = disabled;
  document.getElementById("deleteVirtualTag").disabled = disabled;
  if (!tag) return;
  sizeRange.value = String(Math.round(tag.size));
  rotationRange.value = String(Math.round(normalizeDegrees(tag.rotation)));
}

function updateSelectedFromControls() {
  const tag = selectedTag();
  if (!tag) return;
  tag.size = Number(sizeRange.value);
  tag.rotation = Number(rotationRange.value);
  paintTag(tag);
  saveLayout();
}

function duplicateSelected() {
  const tag = selectedTag();
  if (!tag) return;
  const clone = {
    ...tag,
    instanceId: `tag-${tag.tagId}-${nextInstanceNumber}`,
    x: clamp(tag.x + 7, 2, 98),
    y: clamp(tag.y + 7, 2, 98),
  };
  nextInstanceNumber += 1;
  tags.push(clone);
  selectTag(clone.instanceId);
  renderTags();
  saveLayout();
}

function deleteSelected() {
  if (!selectedInstanceId) return;
  tags = tags.filter((tag) => tag.instanceId !== selectedInstanceId);
  selectedInstanceId = tags[0]?.instanceId || "";
  renderTags();
  saveLayout();
}

async function freshReset() {
  setPreset("board");
  hideControls();
  updateStatus("Resetting local board and clearing server state...");
  const actions = [
    ["board.tags.clear", { keepCalibration: false }],
    ["board.clear", {}],
    ["board.objects.clear", {}],
    ["focus.clear", {}],
    ["calibration.clear", { surface: "board" }],
  ];
  for (const [type, payload] of actions) {
    try {
      await Room.action(type, payload);
    } catch (error) {
      console.warn(`fresh reset ${type} failed`, error);
    }
  }
  updateStatus("Fresh test ready: corner tags 4-7 plus Focus. Calibrate the C920 again.");
}

function enterCleanMode() {
  document.body.classList.add("tag-clean");
  hideControls();
  updateStatus("Clean view.");
}

function exitCleanMode() {
  document.body.classList.remove("tag-clean");
  hideControls();
}

function showControls() {
  document.body.classList.remove("tag-controls-collapsed");
}

function hideControls() {
  document.body.classList.add("tag-controls-collapsed");
}

async function requestFullscreen() {
  try {
    if (!document.fullscreenElement && document.documentElement.requestFullscreen) {
      await document.documentElement.requestFullscreen();
    }
    enterCleanMode();
  } catch (error) {
    updateStatus(error.message || String(error));
  }
}

function loadSavedLayout() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
    if (!saved || !Array.isArray(saved.tags)) return false;
    nextInstanceNumber = Number(saved.nextInstanceNumber || 1);
    tags = saved.tags
      .map((savedTag) => {
        const meta = availableTags.find((tag) => Number(tag.tagId) === Number(savedTag.tagId));
        if (!meta) return null;
        return {
          ...meta,
          instanceId: String(savedTag.instanceId || `tag-${meta.tagId}-${nextInstanceNumber++}`),
          x: Number(savedTag.x),
          y: Number(savedTag.y),
          size: Number(savedTag.size || 132),
          rotation: Number(savedTag.rotation || 0),
        };
      })
      .filter(Boolean);
    selectedInstanceId = saved.selectedInstanceId || tags[0]?.instanceId || "";
    return tags.length > 0;
  } catch {
    return false;
  }
}

function saveLayout() {
  const payload = {
    nextInstanceNumber,
    selectedInstanceId,
    tags: tags.map((tag) => ({
      instanceId: tag.instanceId,
      tagId: tag.tagId,
      x: tag.x,
      y: tag.y,
      size: tag.size,
      rotation: tag.rotation,
    })),
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
}

function renderEffects() {
  const rect = board.getBoundingClientRect();
  const width = Math.max(1, Math.round(rect.width));
  const height = Math.max(1, Math.round(rect.height));
  effectLayer.setAttribute("viewBox", `0 0 ${width} ${height}`);
  const localEffects = tags
    .filter((tag) => tag.role === "focus" || Number(tag.tagId) === 23)
    .map((tag) => focusEffectSvg(tag, width, height, { className: "local-focus" }));
  const serverEffects = liveFocusMarkers(latestRoomState)
    .map((marker) => focusEffectSvg(markerToEffectTag(marker), width, height, {
      className: "server-focus",
      label: liveFocusLabel(marker),
      radius: liveFocusRadius(marker, width, height),
    }));
  effectLayer.innerHTML = [...serverEffects, ...localEffects].join("");
}

function focusEffectSvg(tag, width, height, options = {}) {
  const x = (clamp(tag.x, 0, 100) / 100) * width;
  const y = (clamp(tag.y, 0, 100) / 100) * height;
  const radius = options.radius ?? clamp(Number(tag.size || 150) * 0.82, 74, Math.min(width, height) * 0.42);
  const angle = ((Number(tag.rotation || 0) - 90) * Math.PI) / 180;
  const tip = {
    x: x + Math.cos(angle) * radius * 1.38,
    y: y + Math.sin(angle) * radius * 1.38,
  };
  const left = {
    x: x + Math.cos(angle - 0.32) * radius * 0.58,
    y: y + Math.sin(angle - 0.32) * radius * 0.58,
  };
  const right = {
    x: x + Math.cos(angle + 0.32) * radius * 0.58,
    y: y + Math.sin(angle + 0.32) * radius * 0.58,
  };
  const className = options.className || "local-focus";
  const label = options.label
    ? `<text class="${className}-label" x="${x.toFixed(1)}" y="${(y + radius + 18).toFixed(1)}" text-anchor="middle">${escapeHtml(options.label)}</text>`
    : "";
  return `
    <circle class="focus-effect ${className}-effect" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${radius.toFixed(1)}"></circle>
    <polygon class="focus-beam ${className}-beam" points="${left.x.toFixed(1)},${left.y.toFixed(1)} ${tip.x.toFixed(1)},${tip.y.toFixed(1)} ${right.x.toFixed(1)},${right.y.toFixed(1)}"></polygon>
    <line class="focus-axis ${className}-axis" x1="${x.toFixed(1)}" y1="${y.toFixed(1)}" x2="${tip.x.toFixed(1)}" y2="${tip.y.toFixed(1)}"></line>
    ${label}
  `;
}

function liveFocusMarkers(state) {
  const markers = state?.markers?.items || state?.fiducials?.markers || state?.table?.tokens || [];
  return markers
    .filter((marker) => (marker.surface || "board") === "board")
    .filter((marker) => Number(marker.numericTagId ?? marker.tagId) === 23)
    .filter((marker) => Number.isFinite(Number(marker.x)) && Number.isFinite(Number(marker.y)));
}

function markerToEffectTag(marker) {
  return {
    x: clamp(Number(marker.x) * 100, 0, 100),
    y: clamp(Number(marker.y) * 100, 0, 100),
    rotation: tagBoardRotationFromDetectionAngle(marker.angle),
    size: 150,
  };
}

function tagBoardRotationFromDetectionAngle(angle) {
  return normalizeDegrees(((Number(angle || 0) * 180) / Math.PI) + 180);
}

function liveFocusRadius(marker, width, height) {
  const radius = 56 + angleUnit(Number(marker.angle || 0)) * 140;
  return clamp(radius, 64, Math.min(width, height) * 0.42);
}

function liveFocusLabel(marker) {
  const updatedAt = Date.parse(marker.updatedAt || "");
  const age = Number.isFinite(updatedAt) ? Math.max(0, Date.now() - updatedAt) : null;
  const ageText = age === null ? "live" : `${(age / 1000).toFixed(1)}s`;
  return `camera ${marker.label || "Focus"} ${ageText}`;
}

function markerRole(marker) {
  return String(marker?.role || marker?.kind || "").toLowerCase();
}

function angleUnit(angle) {
  const full = Math.PI * 2;
  return (((Number(angle) || 0) % full) + full) % full / full;
}

function pointerAngleForTag(event, tag) {
  const rect = board.getBoundingClientRect();
  const centerX = rect.left + (clamp(tag.x, 0, 100) / 100) * rect.width;
  const centerY = rect.top + (clamp(tag.y, 0, 100) / 100) * rect.height;
  return Math.atan2(event.clientY - centerY, event.clientX - centerX) * 180 / Math.PI;
}

function updateStatus(text) {
  statusEl.textContent = text;
}

function normalizeDegrees(value) {
  let degrees = Number(value) || 0;
  while (degrees > 180) degrees -= 360;
  while (degrees < -180) degrees += 360;
  return degrees;
}

function clamp(value, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return min;
  return Math.max(min, Math.min(max, number));
}

function cssEscape(value) {
  if (window.CSS?.escape) return CSS.escape(value);
  return String(value).replaceAll("\"", "\\\"");
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
