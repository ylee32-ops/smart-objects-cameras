"use strict";

const boardSurface = document.getElementById("boardSurface");
const boardSurfaceLabel = document.getElementById("boardSurfaceLabel");
const objectLayer = document.getElementById("boardObjectLayer");
const tagLayer = document.getElementById("boardTagLayer");
const tagPad = document.getElementById("boardTagPad");
const tagList = document.getElementById("boardTagList");
const strokeLayer = document.getElementById("strokeLayer");
const focusLayer = document.getElementById("boardFocus");
const recoveryLayer = document.getElementById("boardRecovery");
const debugLayer = document.getElementById("boardDebug");

let mode = "move";
let selectedId = null;
let selectedTagId = null;
let dragging = null;
let tagDragging = null;
let pendingDragCommit = null;
let suppressClickUntil = 0;
let drawing = null;
let localObjects = [];
let classEffect = null;
let activeStickyColor = "#facc15";
let activeMarkerColor = "#111827";
let lastActionDragSyncAt = 0;

const STICKY_COLORS = ["#facc15", "#fde68a", "#bfdbfe", "#f9a8d4", "#a7f3d0", "#ffb360"];
const MARKER_COLORS = ["#111827", "#2563eb", "#dc2626", "#16a34a", "#7c3aed", "#ea580c"];
const BOARD_TAG_ROLES = ["zone", "action", "figurate", "focus", "write", "tool", "slide", "video", "object3d", "vertex", "timer"];
const ROLE_START_TAGS = {
  zone: 21,
  focus: 23,
  timer: 28,
  tool: 34,
  write: 35,
  object3d: 33,
  slide: 36,
  video: 37,
  vertex: 38,
  action: 39,
  figurate: 40,
};
const ROLE_LABELS = {
  zone: "Zone",
  action: "Action",
  figurate: "Figurate",
  focus: "Focus",
  write: "Write",
  tool: "Erase",
  slide: "Slide",
  video: "Video",
  object3d: "3D Model",
  vertex: "Vertex",
  timer: "Timer",
};
const ROLE_COLORS = {
  zone: "#7fbcd2",
  action: "#ffb360",
  figurate: "#c7d2fe",
  focus: "#fb7185",
  write: "#d9f99d",
  tool: "#e5e7eb",
  slide: "#93c5fd",
  video: "#fca5a5",
  object3d: "#bfdbfe",
  vertex: "#86efac",
  timer: "#c4b5fd",
};

Room.connect();
Room.initIdentity("board");
ClassEventEffects.onEffect((effect) => {
  classEffect = effect;
  if (Room.state) {
    renderBoardObjects(Room.state);
    renderStrokes(Room.state);
    renderFocus(Room.state);
    renderRecovery(Room.state);
    renderDebug(Room.state);
  }
});

document.getElementById("modeMove").addEventListener("click", () => setMode("move"));
document.getElementById("modeDraw").addEventListener("click", () => setMode("draw"));
document.getElementById("modeFocus").addEventListener("click", () => setMode("focus"));
document.getElementById("addSticky").addEventListener("click", () => createBoardObject("sticky"));
document.getElementById("addNumber").addEventListener("click", () => createBoardObject("number"));
document.getElementById("addShape").addEventListener("click", () => createBoardObject("shape"));
document.querySelectorAll("[data-sticky-color]").forEach((button) => {
  button.style.background = button.dataset.stickyColor;
  button.addEventListener("click", () => setStickyColor(button.dataset.stickyColor));
});
document.querySelectorAll("[data-marker-color]").forEach((button) => {
  button.style.background = button.dataset.markerColor;
  button.addEventListener("click", () => setMarkerColor(button.dataset.markerColor));
});
renderTagPad();
document.getElementById("sampleSelectedColor").addEventListener("click", sampleSelectedColor);
document.getElementById("sendClipboard").addEventListener("click", () => Room.action("clipboard.send", { targetSurface: "board" }).catch(alertError));
document.getElementById("copySelected").addEventListener("click", () => {
  if (!selectedId) return;
  Room.action("clipboard.copy", { objectId: selectedId }).catch(alertError);
});
document.getElementById("bindSelected").addEventListener("click", () => {
  if (!selectedId) return;
  Room.action("bind.create", { objectId: selectedId, target: "slide.current.highlight", relation: "explains" }).catch(alertError);
});
document.getElementById("clearFocus").addEventListener("click", () => Room.action("focus.clear").catch(alertError));
document.getElementById("clearStrokes").addEventListener("click", () => Room.action("board.clear").catch(alertError));
document.getElementById("clearBoardTags").addEventListener("click", () => clearBoardTags().catch(alertError));
document.getElementById("debugToggle").addEventListener("click", () => Room.action("debug.toggle").catch(alertError));

Room.onState((state) => {
  const preview = dragPreviewObjects(state.board.objects);
  localObjects = preview.objects;
  const renderState = preview.changed
    ? { ...state, board: { ...state.board, objects: localObjects } }
    : state;
  boardSurfaceLabel.textContent = `4.6m x 2.4m board / ${state.room.boardMode || "stage"}`;
  renderBoardObjects(renderState);
  renderBoardTags(renderState);
  renderTagList(renderState);
  renderStrokes(renderState);
  renderFocus(renderState);
  renderRecovery(renderState);
  renderDebug(renderState);
  renderSelected(renderState);
});

function setMode(nextMode) {
  mode = nextMode;
  document.getElementById("modeMove").classList.toggle("primary", mode === "move");
  document.getElementById("modeDraw").classList.toggle("primary", mode === "draw");
  document.getElementById("modeFocus").classList.toggle("primary", mode === "focus");
}

function createBoardObject(kind) {
  const text = document.getElementById("noteText").value;
  const stickySize = 0.11;
  const stickyWidth = stickySquareWidth(stickySize);
  const payload = {
    kind: kind === "number" ? "sticky" : kind,
    label: kind === "number" ? "Number Note" : kind === "shape" ? "Shape" : "Sticky Note",
    text: kind === "number" ? "42" : text,
    shape: kind === "shape" ? "rectangle" : "note",
    x: 0.18 + Math.random() * 0.15,
    y: 0.18 + Math.random() * 0.12,
    w: kind === "shape" ? 0.2 : stickyWidth,
    h: kind === "shape" ? 0.14 : stickySize,
    color: kind === "shape" ? "#d1fae5" : activeStickyColor,
  };
  Room.action("board.object.create", payload).catch(alertError);
}

function renderTagPad() {
  tagPad.innerHTML = "";
  BOARD_TAG_ROLES.forEach((role) => {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = ROLE_LABELS[role] || role;
    button.style.setProperty("--tag-color", ROLE_COLORS[role] || "#e5e7eb");
    button.addEventListener("click", () => addBoardTag(role).catch(alertError));
    tagPad.appendChild(button);
  });
}

function renderBoardTags(state) {
  tagLayer.innerHTML = "";
  boardMarkers(state).forEach((marker) => {
    const el = document.createElement("div");
    const role = markerRole(marker);
    el.className = `board-tag-handle ${selectedTagId === marker.id ? "selected" : ""}`;
    el.dataset.tagObjectId = marker.id;
    el.style.left = `${clamp01(marker.x) * 100}%`;
    el.style.top = `${clamp01(marker.y) * 100}%`;
    el.style.background = marker.color || ROLE_COLORS[role] || "#e5e7eb";
    el.style.transform = `translate(-50%, -50%) rotate(${Number(marker.angle || 0)}rad)`;
    el.innerHTML = `
      <span>${escapeHtml(String(marker.tagId || marker.numericTagId || ""))}</span>
      <small>${escapeHtml(ROLE_LABELS[role] || marker.label || role || "tag")}</small>
    `;
    el.addEventListener("pointerdown", (event) => beginTagDrag(event, marker, el));
    tagLayer.appendChild(el);
  });
}

function renderTagList(state) {
  const markers = boardMarkers(state);
  if (!markers.length) {
    tagList.innerHTML = `<div class="small">No board tags yet. Add one above or stream detections from the virtual room/camera.</div>`;
    return;
  }
  tagList.innerHTML = markers.map((marker) => {
    const role = markerRole(marker);
    const label = ROLE_LABELS[role] || marker.label || role || "Tag";
    return `
      <button type="button" class="board-tag-row ${selectedTagId === marker.id ? "selected" : ""}" data-tag-id="${escapeHtml(marker.id)}">
        <span class="tag-swatch" style="--tag-color:${escapeHtml(marker.color || ROLE_COLORS[role] || "#e5e7eb")}"></span>
        <span>
          <strong>${escapeHtml(label)}</strong>
          <small>tag ${escapeHtml(marker.tagId || marker.numericTagId || "")} / ${Math.round(clamp01(marker.x) * 100)}%, ${Math.round(clamp01(marker.y) * 100)}%</small>
        </span>
        <span class="tag-row-actions">
          <i data-action="center" title="center">C</i>
          <i data-action="rotate" title="rotate">R</i>
        </span>
      </button>
    `;
  }).join("");
}

tagList.addEventListener("click", (event) => {
  const row = event.target.closest("[data-tag-id]");
  if (!row) return;
  const marker = boardMarkers(Room.state).find((item) => item.id === row.dataset.tagId);
  if (!marker) return;
  selectedTagId = marker.id;
  selectedId = null;
  const action = event.target.dataset.action;
  if (action === "center") {
    Room.action("token.move", { id: marker.id, x: 0.5, y: 0.5 }).catch(alertError);
  } else if (action === "rotate") {
    Room.action("marker.rotate", { id: marker.id, delta: Math.PI / 12 }).catch(alertError);
  } else {
    renderBoardTags(Room.state);
    renderTagList(Room.state);
    renderSelected(Room.state);
  }
});

function beginTagDrag(event, marker, element) {
  event.preventDefault();
  event.stopPropagation();
  selectedTagId = marker.id;
  selectedId = null;
  const point = Room.normalizedPoint(event, boardSurface);
  tagDragging = {
    id: marker.id,
    tagId: marker.tagId || marker.numericTagId || null,
    role: markerRole(marker),
    element,
    offset: {
      x: point.x - Number(marker.x || 0.5),
      y: point.y - Number(marker.y || 0.5),
    },
    latest: { x: Number(marker.x || 0.5), y: Number(marker.y || 0.5) },
  };
  element.setPointerCapture?.(event.pointerId);
  window.addEventListener("pointermove", moveTagDrag);
  window.addEventListener("pointerup", endTagDrag, { once: true });
  window.addEventListener("pointercancel", cancelTagDrag, { once: true });
  setBoardTagDragState(tagDragging, true);
  renderTagList(Room.state);
  renderSelected(Room.state);
}

function moveTagDrag(event) {
  if (!tagDragging) return;
  const point = Room.normalizedPoint(event, boardSurface);
  const next = {
    x: clamp01(point.x - tagDragging.offset.x),
    y: clamp01(point.y - tagDragging.offset.y),
  };
  tagDragging.latest = next;
  tagDragging.element.style.left = `${next.x * 100}%`;
  tagDragging.element.style.top = `${next.y * 100}%`;
  setBoardTagDragState(tagDragging, true, { throttle: true });
}

function endTagDrag() {
  if (!tagDragging) return;
  window.removeEventListener("pointermove", moveTagDrag);
  const { id, latest } = tagDragging;
  const ended = tagDragging;
  tagDragging = null;
  setBoardTagDragState(ended, false);
  Room.action("token.move", { id, x: latest.x, y: latest.y }).catch(alertError);
}

function cancelTagDrag() {
  if (!tagDragging) return;
  window.removeEventListener("pointermove", moveTagDrag);
  const ended = tagDragging;
  tagDragging = null;
  setBoardTagDragState(ended, false);
}

function setBoardTagDragState(marker, active, options = {}) {
  if (!marker || marker.role !== "action") return;
  const nowMs = performance.now();
  if (options.throttle && nowMs - lastActionDragSyncAt < 180) return;
  lastActionDragSyncAt = nowMs;
  const point = marker.latest || { x: marker.x, y: marker.y };
  Room.action("board.drag.set", {
    active,
    id: marker.id,
    tagId: marker.tagId,
    role: marker.role,
    surface: "board",
    x: point.x,
    y: point.y,
  }).catch(console.error);
}

async function addBoardTag(role) {
  const tagId = nextBoardTagId(role);
  const x = 0.18 + Math.random() * 0.62;
  const y = 0.18 + Math.random() * 0.58;
  await Room.action("fiducial.detections.ingest", {
    surface: "board",
    sourceSpace: "surface",
    detections: [
      {
        tagId,
        role,
        kind: role,
        label: ROLE_LABELS[role] || role,
        color: ROLE_COLORS[role] || "#e5e7eb",
        center: { x, y },
        angle: 0,
        confidence: 1,
      },
    ],
  });
}

async function clearBoardTags() {
  selectedTagId = null;
  await Room.action("board.tags.clear", { keepCalibration: true });
}

function nextBoardTagId(role) {
  const used = new Set(boardMarkers(Room.state).map((marker) => Number(marker.numericTagId ?? marker.tagId)).filter(Number.isFinite));
  const start = ROLE_START_TAGS[role] || 90;
  if (!used.has(start)) return start;
  let next = Math.max(41, start + 1);
  while (used.has(next)) next += 1;
  return next;
}

function boardMarkers(state) {
  const markers = state?.markers?.items || state?.fiducials?.markers || state?.table?.tokens || [];
  return markers
    .filter((marker) => (marker.surface || "board") === "board")
    .filter((marker) => !["emitter", "mirror", "filter", "splitter", "blocker", "target", "function"].includes(markerRole(marker)));
}

function markerRole(marker) {
  return String(marker?.role || marker?.kind || "").toLowerCase();
}

function renderBoardObjects(state) {
  objectLayer.innerHTML = "";
  const rect = boardSurface.getBoundingClientRect();
  if (classEffect?.boardCard) {
    appendEffectObject(classEffect.boardCard, {
      left: "54%",
      top: "24%",
      width: 0.26,
      height: 0.13,
    }, rect);
  } else if (classEffect?.boardNote) {
    appendEffectObject({ title: "Board", text: classEffect.boardNote, color: "#d1fae5" }, {
      left: "54%",
      top: "24%",
      width: 0.26,
      height: 0.13,
    }, rect);
  }
  if (classEffect?.projectionCard) {
    appendEffectObject(classEffect.projectionCard, {
      left: "78%",
      top: "18%",
      width: 0.17,
      height: 0.11,
    }, rect);
  }
  state.board.objects.forEach((object) => {
    const size = objectRenderSize(object, rect);
    const sticky = (object.kind || "sticky") === "sticky";
    if (isStickyColor(object.color)) appendStickyLight(object, rect, size);
    const el = document.createElement("div");
    el.className = [
      "board-object",
      object.kind || "card",
      hasObjectFiducial(object) ? "has-fiducial" : "",
      isStickyColor(object.color) ? "is-sticky-detected" : "",
    ].filter(Boolean).join(" ");
    el.dataset.objectId = object.id;
    el.style.left = `${object.x * 100}%`;
    el.style.top = `${object.y * 100}%`;
    el.style.width = `${size.w}px`;
    el.style.height = `${size.h}px`;
    el.style.background = object.color || "";
    el.style.setProperty("--sticky-rgb", hexToRgb(object.color));
    el.style.outline = selectedId === object.id ? "4px solid rgba(99, 179, 255, 0.75)" : "";
    el.innerHTML = sticky
      ? fiducialMarkup(object)
      : `
        ${fiducialMarkup(object)}
        <div class="label">${object.label || object.kind}</div>
        <div>${escapeHtml(object.text || "")}</div>
        <div class="small mono">${object.id}</div>
      `;
    el.addEventListener("pointerdown", (event) => {
      if (mode !== "move") return;
      event.preventDefault();
      selectedId = object.id;
      const point = Room.normalizedPoint(event, boardSurface);
      dragging = {
        id: object.id,
        pointerId: event.pointerId,
        moved: false,
        offset: {
          x: point.x - Number(object.x || 0.5),
          y: point.y - Number(object.y || 0.5),
        },
      };
      el.setPointerCapture(event.pointerId);
      renderSelected(Room.state);
    });
    el.addEventListener("click", (event) => {
      event.stopPropagation();
      if (Date.now() < suppressClickUntil) return;
      selectedId = object.id;
      renderBoardObjects(Room.state);
      renderSelected(Room.state);
    });
    objectLayer.appendChild(el);
  });
  renderStickySwatches();
  renderMarkerSwatches();
}

function appendEffectObject(card, layout, rect) {
  const el = document.createElement("div");
  el.className = "board-object sticky";
  el.style.left = layout.left;
  el.style.top = layout.top;
  el.style.width = `${layout.width * rect.width}px`;
  el.style.height = `${layout.height * rect.height}px`;
  el.style.background = card.color || "#d1fae5";
  el.innerHTML = `<div class="label">${escapeHtml(card.title || "Card")}</div><div>${escapeHtml(card.text || "")}</div><div class="small mono">simulated</div>`;
  objectLayer.appendChild(el);
}

function fiducialMarkup(object) {
  const tagId = object.fiducial?.tagId || object.tagId;
  if (!tagId) return "";
  return `<div class="fiducial-badge"><span>${String(tagId).padStart(2, "0")}</span></div>`;
}

function hasObjectFiducial(object) {
  return Boolean(object?.fiducial?.tagId || object?.tagId);
}

boardSurface.addEventListener("pointerdown", (event) => {
  if (mode === "draw") {
    event.preventDefault();
    const pt = Room.normalizedPoint(event, boardSurface);
    drawing = { points: [pt], pointerId: event.pointerId };
    boardSurface.setPointerCapture(event.pointerId);
  }
  if (mode === "focus") {
    const pt = Room.normalizedPoint(event, boardSurface);
    Room.action("focus.set", {
      id: `board-focus-${Date.now()}`,
      surface: "board",
      x: pt.x,
      y: pt.y,
      label: "Board focus",
      append: true,
    }).catch(alertError);
  }
});

boardSurface.addEventListener("pointermove", (event) => {
  if (dragging) {
    const pt = Room.normalizedPoint(event, boardSurface);
    const object = localObjects.find((item) => item.id === dragging.id);
    if (!object) return;
    const next = clampObjectPoint({
      x: pt.x - dragging.offset.x,
      y: pt.y - dragging.offset.y,
    }, object);
    dragging.moved = true;
    object.x = next.x;
    object.y = next.y;
    const el = [...objectLayer.children].find((child) => child.dataset.objectId === object.id);
    if (el) {
      el.style.left = `${next.x * 100}%`;
      el.style.top = `${next.y * 100}%`;
    }
    const light = [...objectLayer.children].find((child) => child.dataset.lightId === object.id);
    if (light) {
      light.style.left = `${next.x * 100}%`;
      light.style.top = `${next.y * 100}%`;
    }
  }
  if (drawing) {
    drawing.points.push(Room.normalizedPoint(event, boardSurface));
    renderLiveStroke(drawing.points);
  }
});

boardSurface.addEventListener("pointerup", (event) => {
  if (dragging) {
    const pt = Room.normalizedPoint(event, boardSurface);
    const object = localObjects.find((item) => item.id === dragging.id);
    const next = clampObjectPoint({
      x: pt.x - dragging.offset.x,
      y: pt.y - dragging.offset.y,
    }, object || {});
    pendingDragCommit = {
      id: dragging.id,
      x: next.x,
      y: next.y,
      until: Date.now() + 900,
    };
    if (dragging.moved) suppressClickUntil = Date.now() + 250;
    Room.action("board.object.move", { id: dragging.id, x: next.x, y: next.y }).catch(alertError);
    dragging = null;
  }
  if (drawing) {
    Room.action("board.stroke.add", { points: drawing.points, color: activeMarkerColor, size: 5 }).catch(alertError);
    drawing = null;
  }
});

function renderStrokes(state) {
  const rect = boardSurface.getBoundingClientRect();
  strokeLayer.setAttribute("viewBox", `0 0 ${rect.width} ${rect.height}`);
  strokeLayer.innerHTML = "";
  state.board.strokes.forEach((stroke) => drawPolyline(stroke.points, stroke.color, stroke.size, rect));
}

function renderLiveStroke(points) {
  renderStrokes(Room.state);
  const rect = boardSurface.getBoundingClientRect();
  drawPolyline(points, activeMarkerColor, 5, rect);
}

function drawPolyline(points, color, size, rect) {
  if (!points || points.length < 2) return;
  const line = document.createElementNS("http://www.w3.org/2000/svg", "polyline");
  line.setAttribute("points", points.map((pt) => `${pt.x * rect.width},${pt.y * rect.height}`).join(" "));
  line.setAttribute("fill", "none");
  line.setAttribute("stroke", color || "#111827");
  line.setAttribute("stroke-width", size || 3);
  line.setAttribute("stroke-linecap", "round");
  line.setAttribute("stroke-linejoin", "round");
  strokeLayer.appendChild(line);
}

function renderFocus(state) {
  focusLayer.innerHTML = "";
  const focuses = activeBoardFocuses(state);
  focuses.forEach((focus, index) => {
    const ring = document.createElement("div");
    ring.className = `focus-ring ${focuses.length > 1 ? "is-multiple" : ""}`;
    ring.style.left = `${focus.x * 100}%`;
    ring.style.top = `${focus.y * 100}%`;
    ring.dataset.index = String(index + 1);
    const label = document.createElement("span");
    label.className = "focus-ring-label";
    label.textContent = focus.label || `Focus ${index + 1}`;
    ring.appendChild(label);
    focusLayer.appendChild(ring);
  });
}

function activeBoardFocuses(state) {
  const focuses = [];
  if (classEffect?.focus?.surface === "board") focuses.push({ ...classEffect.focus, id: "class-effect" });
  if (Array.isArray(state.room.focuses)) focuses.push(...state.room.focuses);
  else if (state.room.focus?.surface === "board") focuses.push(state.room.focus);
  return focuses
    .filter((focus) => focus?.surface === "board")
    .filter((focus, index, list) => {
      const id = focus.id || `${focus.x}:${focus.y}:${focus.label || ""}`;
      return list.findIndex((item) => (item.id || `${item.x}:${item.y}:${item.label || ""}`) === id) === index;
    });
}

function renderRecovery(state) {
  if (!recoveryLayer) return;
  const items = Room.recoveryItems(state)
    .filter((item) => ["mapping-pending", "camera-calibration-pending", "tag-stream-idle", "tag-low-confidence", "action-no-target", "sticky-suggestion", "ocr-suggestion"].includes(item.id))
    .slice(0, 4);
  recoveryLayer.innerHTML = items.map((item) => `
    <div class="board-recovery-card ${escapeHtml(item.severity)}">
      <strong>${escapeHtml(item.title)}</strong>
      <span>${escapeHtml(item.detail)}</span>
      <em>${escapeHtml(item.recovery)}</em>
    </div>
  `).join("");
}

function renderDebug(state) {
  debugLayer.innerHTML = "";
  if (!state.room.debug && !classEffect?.detection) return;
  const overlay = document.createElement("div");
  overlay.className = "debug-overlay";
  state.board.objects.forEach((object) => {
    const label = document.createElement("div");
    label.className = "debug-label";
    label.style.left = `${object.x * 100}%`;
    label.style.top = `${object.y * 100}%`;
    label.textContent = `${object.id} conf=.mock`;
    overlay.appendChild(label);
  });
  if (classEffect?.detection) {
    (classEffect.detection.detections || []).forEach((item) => {
      const label = document.createElement("div");
      label.className = "debug-label";
      label.style.left = `${Number(item.x || 0.5) * 100}%`;
      label.style.top = `${Number(item.y || 0.5) * 100}%`;
      label.textContent = `cam ${item.id}`;
      overlay.appendChild(label);
    });
  }
  debugLayer.appendChild(overlay);
}

function renderSelected(state) {
  const object = state?.board.objects.find((item) => item.id === selectedId);
  const tag = selectedTagId ? boardMarkers(state).find((item) => item.id === selectedTagId) : null;
  document.getElementById("selectedInfo").innerHTML = object
    ? `<strong>${object.label}</strong><div>${escapeHtml(object.text || "")}</div><div class="mono">${object.id}</div><div class="mono">color ${escapeHtml(object.color || "none")}</div><div class="small">Drag in Move mode. Use a swatch to retint this square note.</div>`
    : tag
      ? `<strong>${escapeHtml(ROLE_LABELS[markerRole(tag)] || tag.label || "Tag")}</strong><div class="mono">tag ${escapeHtml(tag.tagId || tag.numericTagId || "")}</div><div class="mono">${Math.round(clamp01(tag.x) * 100)}%, ${Math.round(clamp01(tag.y) * 100)}%</div><div class="small">Drag the tag on the board, or use Center/Rotate in the tag list.</div>`
      : (classEffect?.statusLine || "No board object selected.");
}

function appendStickyLight(object, rect, size = objectRenderSize(object, rect)) {
  const light = document.createElement("div");
  light.className = "sticky-light";
  light.dataset.lightId = object.id;
  light.style.left = `${object.x * 100}%`;
  light.style.top = `${object.y * 100}%`;
  light.style.width = `${Math.max(size.w, 92)}px`;
  light.style.height = `${Math.max(size.h, 92)}px`;
  light.style.setProperty("--sticky-rgb", hexToRgb(object.color));
  objectLayer.appendChild(light);
}

function setStickyColor(color) {
  activeStickyColor = normalizeStickyColor(color);
  renderStickySwatches();
  if (!selectedId) return;
  optimisticObjectUpdate(selectedId, { color: activeStickyColor, w: stickySquareWidth(), h: 0.11 });
  Room.action("board.object.update", {
    id: selectedId,
    color: activeStickyColor,
    w: stickySquareWidth(),
    h: 0.11,
  }).catch(alertError);
}

function sampleSelectedColor() {
  const object = Room.state?.board.objects.find((item) => item.id === selectedId);
  if (!object?.color) {
    const next = STICKY_COLORS[(STICKY_COLORS.indexOf(activeStickyColor) + 1) % STICKY_COLORS.length];
    setStickyColor(next);
    return;
  }
  setStickyColor(object.color);
}

function dragPreviewObjects(objects) {
  const next = objects.map((object) => ({ ...object }));
  let changed = false;
  const preview = dragging
    ? localObjects.find((object) => object.id === dragging.id)
    : null;
  if (preview) {
    const index = next.findIndex((object) => object.id === preview.id);
    if (index >= 0) {
      next[index] = { ...next[index], x: preview.x, y: preview.y };
      changed = true;
    }
  } else if (pendingDragCommit && Date.now() < pendingDragCommit.until) {
    const index = next.findIndex((object) => object.id === pendingDragCommit.id);
    const serverObject = next[index];
    if (serverObject && (Math.abs(Number(serverObject.x) - pendingDragCommit.x) > 0.001 || Math.abs(Number(serverObject.y) - pendingDragCommit.y) > 0.001)) {
      next[index] = { ...serverObject, x: pendingDragCommit.x, y: pendingDragCommit.y };
      changed = true;
    } else {
      pendingDragCommit = null;
    }
  } else {
    pendingDragCommit = null;
  }
  return { objects: next, changed };
}

function optimisticObjectUpdate(id, patch) {
  const index = localObjects.findIndex((object) => object.id === id);
  if (index >= 0) localObjects[index] = { ...localObjects[index], ...patch };
  if (Room.state?.board?.objects) {
    const renderObjects = Room.state.board.objects.map((object) => object.id === id ? { ...object, ...patch } : object);
    renderBoardObjects({ ...Room.state, board: { ...Room.state.board, objects: renderObjects } });
    renderSelected({ ...Room.state, board: { ...Room.state.board, objects: renderObjects } });
  }
}

function renderStickySwatches() {
  document.querySelectorAll("[data-sticky-color]").forEach((button) => {
    button.classList.toggle("active", normalizeStickyColor(button.dataset.stickyColor) === activeStickyColor);
  });
}

function setMarkerColor(color) {
  activeMarkerColor = MARKER_COLORS.includes(String(color || "").toLowerCase()) ? String(color).toLowerCase() : "#111827";
  renderMarkerSwatches();
}

function renderMarkerSwatches() {
  document.querySelectorAll("[data-marker-color]").forEach((button) => {
    button.classList.toggle("active", String(button.dataset.markerColor).toLowerCase() === activeMarkerColor);
  });
}

function isStickyColor(color) {
  return STICKY_COLORS.includes(normalizeStickyColor(color));
}

function normalizeStickyColor(color) {
  const lower = String(color || "").toLowerCase();
  return STICKY_COLORS.includes(lower) ? lower : "#facc15";
}

function hexToRgb(color) {
  const normalized = normalizeStickyColor(color).replace("#", "");
  const value = Number.parseInt(normalized, 16);
  return `${(value >> 16) & 255}, ${(value >> 8) & 255}, ${value & 255}`;
}

function objectRenderSize(object, rect) {
  if ((object.kind || "sticky") === "sticky") {
    const size = Math.max(Number(object.h || 0.11) * rect.height, 42);
    return { w: size, h: size };
  }
  return {
    w: (object.w || 0.2) * rect.width,
    h: (object.h || 0.14) * rect.height,
  };
}

function stickySquareWidth(height = 0.11) {
  const rect = boardSurface.getBoundingClientRect();
  if (!rect.width || !rect.height) return height;
  return height * (rect.height / rect.width);
}

function clampObjectPoint(point, object) {
  const halfW = Number(object.w || stickySquareWidth()) / 2;
  const halfH = Number(object.h || 0.11) / 2;
  return {
    x: Math.max(halfW, Math.min(1 - halfW, Number(point.x || 0.5))),
    y: Math.max(halfH, Math.min(1 - halfH, Number(point.y || 0.5))),
  };
}

function clamp01(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.max(0, Math.min(1, number));
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function alertError(error) {
  alert(error.message || String(error));
}
