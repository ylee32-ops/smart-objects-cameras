"use strict";

const boardSurface = document.getElementById("projectorBoard");
const warpLayer = document.getElementById("projectorWarpLayer");
const boardLayer = document.getElementById("projectorBoardLayer");
const strokeLayer = document.getElementById("projectorStrokeLayer");
const focusLayer = document.getElementById("projectorFocusLayer");
const boardDebug = document.getElementById("projectorBoardDebug");
const mapSvg = document.getElementById("projectorMapSvg");
const fullscreenButton = document.getElementById("projectorFullscreen");
const mapToggle = document.getElementById("projectorMapToggle");
const statusToggle = document.getElementById("projectorStatusToggle");
let classEffect = null;
let mapOverlayVisible = new URLSearchParams(window.location.search).get("map") === "1";
let statusOverlayVisible = new URLSearchParams(window.location.search).get("status") === "1";
const PROJECTOR_HINT_ROLES = new Set(["sticky", "action", "focus", "write", "tool", "timer", "object3d", "vertex"]);

document.body.dataset.mapOverlay = mapOverlayVisible ? "on" : "off";
document.body.dataset.statusOverlay = statusOverlayVisible ? "on" : "off";

Room.connect();
ClassEventEffects.onEffect((effect) => {
  classEffect = effect;
  if (Room.state) {
    renderBoard(Room.state);
    renderProjectorStatus(Room.state);
  }
});

Room.onState((state) => {
  renderBoard(state);
  renderProjectorStatus(state);
});

window.addEventListener("resize", () => {
  if (Room.state) {
    renderBoard(Room.state);
  }
});

fullscreenButton?.addEventListener("click", () => enterFullscreen());
mapToggle?.addEventListener("click", () => toggleMapOverlay());
statusToggle?.addEventListener("click", () => toggleStatusOverlay());
document.addEventListener("keydown", (event) => {
  if (event.key === "f" || event.key === "F") enterFullscreen();
  if (event.key === "m" || event.key === "M") toggleMapOverlay();
  if (event.key === "s" || event.key === "S") toggleStatusOverlay();
});

function renderBoard(state) {
  boardLayer.innerHTML = "";
  boardSurface.dataset.classTone = classEffect?.tone || "";
  boardSurface.dataset.mapping = hasProjectorMapping(state) ? "mapped" : "identity";
  const rect = boardSurface.getBoundingClientRect();
  applyProjectorWarpFrame(state, rect);
  renderMapOverlay(state, rect);
  state.board.objects.forEach((object) => {
    const center = boardPixelPoint(object, state, rect);
    const size = objectRenderSize(object, state, rect);
    const sticky = (object.kind || "sticky") === "sticky";
    if (isStickyColor(object.color)) appendStickyLight(object, state, rect, size);
    const el = document.createElement("div");
    el.className = [
      "projector-card",
      object.kind || "card",
      isStickyColor(object.color) ? "is-sticky-detected" : "",
    ].filter(Boolean).join(" ");
    el.style.left = `${center.x}px`;
    el.style.top = `${center.y}px`;
    el.style.width = `${size.w}px`;
    el.style.height = `${size.h}px`;
    el.style.background = object.color || "#facc15";
    el.style.setProperty("--sticky-rgb", hexToRgb(object.color));
    el.innerHTML = sticky
      ? ""
      : `
        <div class="label">${escapeHtml(object.label || object.kind || "Object")}</div>
        <div>${escapeHtml(object.text || "")}</div>
      `;
    boardLayer.appendChild(el);
  });
  renderStrokes(state);
  renderSemanticProjections(state, rect);
  renderRecoveryAffordances(state, rect, boardMarkers(state));
  renderFocus(state);
  renderBoardDebug(state);
  renderBoardClassEffect(rect);
}

function applyProjectorWarpFrame(state, rect) {
  if (!warpLayer) return;
  const corners = projectedBoardCorners(state, rect);
  const clip = `polygon(${corners.map((corner) => `${toPercent(corner.x, rect.width)} ${toPercent(corner.y, rect.height)}`).join(", ")})`;
  warpLayer.style.clipPath = clip;
  warpLayer.style.webkitClipPath = clip;
  warpLayer.dataset.mapping = hasProjectorMapping(state) ? "mapped" : "identity";
  warpLayer.dataset.signature = mappingSignature(state);
}

function appendStickyLight(object, state, rect, size = objectRenderSize(object, state, rect)) {
  const center = boardPixelPoint(object, state, rect);
  const light = document.createElement("div");
  light.className = "sticky-light projector-sticky-light";
  light.style.left = `${center.x}px`;
  light.style.top = `${center.y}px`;
  light.style.width = `${Math.max(size.w, 110)}px`;
  light.style.height = `${Math.max(size.h, 110)}px`;
  light.style.setProperty("--sticky-rgb", hexToRgb(object.color));
  boardLayer.appendChild(light);
}

function renderBoardClassEffect(rect) {
  if (classEffect?.boardCard) {
    appendProjectorCard(classEffect.boardCard, {
      x: 0.56,
      y: 0.24,
      width: 0.28,
      height: 0.13,
    }, rect);
  } else if (classEffect?.boardNote) {
    appendProjectorCard({ title: "Board", text: classEffect.boardNote, color: "#d1fae5" }, {
      x: 0.56,
      y: 0.24,
      width: 0.28,
      height: 0.13,
    }, rect);
  }
  if (classEffect?.projectionCard) {
    appendProjectorCard(classEffect.projectionCard, {
      x: 0.76,
      y: 0.18,
      width: 0.18,
      height: 0.11,
    }, rect);
  }
  if (classEffect?.projection) {
    const overlay = document.createElement("div");
    overlay.className = "debug-overlay";
    (classEffect.projection.projectedObjects || []).forEach((object) => {
      const itemState = object.state || {};
      const label = document.createElement("div");
      label.className = "debug-label";
      const point = boardPixelPoint(itemState, Room.state, rect);
      label.style.left = `${point.x}px`;
      label.style.top = `${point.y}px`;
      label.textContent = `proj ${object.id}`;
      overlay.appendChild(label);
    });
    boardDebug.appendChild(overlay);
  }
  if (classEffect?.detection) {
    const overlay = document.createElement("div");
    overlay.className = "debug-overlay";
    (classEffect.detection.detections || []).forEach((item) => {
      const label = document.createElement("div");
      label.className = "debug-label";
      const point = boardPixelPoint(item, Room.state, rect);
      label.style.left = `${point.x}px`;
      label.style.top = `${point.y}px`;
      label.textContent = `cam ${item.id} ${Math.round((item.confidence || 0) * 100)}%`;
      overlay.appendChild(label);
    });
    boardDebug.appendChild(overlay);
  }
}

function renderRecoveryAffordances(state, rect, markers) {
  const items = Room.recoveryItems(state);
  appendRecoveryStack(items);
  appendActionMiss(state, rect);
  appendTagHealthBadges(markers, state, rect);
  appendImplicitSuggestionLabels(state, rect);
}

function appendRecoveryStack(items) {
  const visible = items
    .filter((item) => !["sticky-suggestion", "ocr-suggestion", "action-no-target"].includes(item.id))
    .slice(0, 4);
  if (!visible.length) return;
  const stack = document.createElement("div");
  stack.className = "projector-recovery-stack";
  stack.innerHTML = visible.map((item) => `
    <div class="projector-recovery-card ${escapeHtml(item.severity)}">
      <strong>${escapeHtml(item.title)}</strong>
      <span>${escapeHtml(item.detail)}</span>
      <em>${escapeHtml(item.recovery)}</em>
    </div>
  `).join("");
  boardLayer.appendChild(stack);
}

function appendActionMiss(state, rect) {
  const actionStatus = Room.actionTargetStatus(state);
  if (!actionStatus.active || actionStatus.valid) return;
  const drag = state.board?.activeDrag || {};
  if (!Number.isFinite(Number(drag.x)) || !Number.isFinite(Number(drag.y))) return;
  const point = boardPixelPoint({ x: drag.x, y: drag.y }, state, rect);
  const miss = document.createElement("div");
  miss.className = "projector-action-miss";
  miss.style.left = `${point.x}px`;
  miss.style.top = `${point.y}px`;
  miss.innerHTML = "<strong>NO TARGET</strong><span>move Action into green zone or labeled card</span>";
  boardLayer.appendChild(miss);
}

function appendTagHealthBadges(markers, state, rect) {
  markers.forEach((marker) => {
    const confidence = Number(marker.confidence);
    const age = Date.now() - Date.parse(marker.updatedAt || "");
    const lowConfidence = Number.isFinite(confidence) && confidence < 0.65;
    const stale = Number.isFinite(age) && age > 8000;
    if (!lowConfidence && !stale) return;
    const point = boardPixelPoint(marker, state, rect);
    const badge = document.createElement("div");
    badge.className = `projector-tag-health ${lowConfidence ? "low" : "stale"}`;
    badge.style.left = `${point.x}px`;
    badge.style.top = `${point.y}px`;
    badge.textContent = lowConfidence
      ? `LOW CONF ${Math.round(confidence * 100)}%`
      : "STALE TAG";
    boardLayer.appendChild(badge);
  });
}

function appendImplicitSuggestionLabels(state, rect) {
  (state.board?.objects || []).forEach((object) => {
    if ((object.kind || "sticky") !== "sticky") return;
    if (object.tagId || object.fiducial?.tagId || !isStickyColor(object.color)) return;
    const point = boardPixelPoint({ x: object.x, y: object.y + Number(object.h || 0.1) / 2 + 0.035 }, state, rect);
    const label = document.createElement("div");
    label.className = "projector-implicit-suggestion sticky";
    label.style.left = `${point.x}px`;
    label.style.top = `${point.y}px`;
    label.textContent = "SUGGESTED STICKY - confirm";
    boardLayer.appendChild(label);
  });

  const strokeBounds = boardStrokeBounds(state.board?.strokes || []);
  if (strokeBounds) {
    const point = boardPixelPoint({ x: strokeBounds.x, y: strokeBounds.y }, state, rect);
    const label = document.createElement("div");
    label.className = "projector-implicit-suggestion ocr";
    label.style.left = `${point.x}px`;
    label.style.top = `${point.y}px`;
    label.textContent = "OCR PENDING - Action or phone Look";
    boardLayer.appendChild(label);
  }
}

function boardStrokeBounds(strokes) {
  const points = strokes.flatMap((stroke) => Array.isArray(stroke.points) ? stroke.points : []);
  if (!points.length) return null;
  const xs = points.map((point) => Number(point.x)).filter(Number.isFinite);
  const ys = points.map((point) => Number(point.y)).filter(Number.isFinite);
  if (!xs.length || !ys.length) return null;
  return {
    x: clamp01(Math.min(...xs)),
    y: clamp01(Math.min(...ys) - 0.035),
  };
}

function appendProjectorCard(card, layout, rect) {
  const center = boardPixelPoint(layout, Room.state, rect);
  const size = boardPixelSize(layout, Room.state, rect);
  const el = document.createElement("div");
  el.className = "projector-card";
  el.style.left = `${center.x}px`;
  el.style.top = `${center.y}px`;
  el.style.width = `${size.w}px`;
  el.style.height = `${size.h}px`;
  el.style.background = card.color || "#d1fae5";
  el.innerHTML = `<div class="label">${escapeHtml(card.title || "Card")}</div><div>${escapeHtml(card.text || "")}</div>`;
  boardLayer.appendChild(el);
}

function renderStrokes(state) {
  const rect = boardSurface.getBoundingClientRect();
  strokeLayer.setAttribute("viewBox", `0 0 ${rect.width} ${rect.height}`);
  strokeLayer.innerHTML = "";
  state.board.strokes.forEach((stroke) => {
    if (!stroke.points || stroke.points.length < 2) return;
    const glow = document.createElementNS("http://www.w3.org/2000/svg", "polyline");
    glow.setAttribute("points", stroke.points.map((pt) => {
      const point = boardPixelPoint(pt, state, rect);
      return `${point.x},${point.y}`;
    }).join(" "));
    glow.setAttribute("fill", "none");
    glow.setAttribute("stroke", stroke.color || "#111827");
    glow.setAttribute("stroke-width", Math.max(16, Number(stroke.size || 3) * 4));
    glow.setAttribute("stroke-linecap", "round");
    glow.setAttribute("stroke-linejoin", "round");
    glow.setAttribute("opacity", "0.22");
    strokeLayer.appendChild(glow);
  });
  state.board.strokes.forEach((stroke) => {
    if (!stroke.points || stroke.points.length < 2) return;
    const line = document.createElementNS("http://www.w3.org/2000/svg", "polyline");
    line.setAttribute("points", stroke.points.map((pt) => {
      const point = boardPixelPoint(pt, state, rect);
      return `${point.x},${point.y}`;
    }).join(" "));
    line.setAttribute("fill", "none");
    line.setAttribute("stroke", stroke.color || "#111827");
    line.setAttribute("stroke-width", stroke.size || 3);
    line.setAttribute("stroke-linecap", "round");
    line.setAttribute("stroke-linejoin", "round");
    strokeLayer.appendChild(line);
  });
}

function renderSemanticProjections(state, rect) {
  const markers = boardMarkers(state);
  renderProjectorZones(state, rect, markers);
  renderProjectorVertices(state, rect, markers);
  markers.forEach((marker) => {
    const role = markerRole(marker);
    if (role === "focus") appendFocusMarkerProjection(marker, state, rect);
    if (role === "slide") appendSlideProjection(marker, state, rect);
    if (role === "video") appendVideoProjection(marker, state, rect);
    if (role === "object3d") appendModelProjection(marker, state, rect);
    if (role === "figurate") appendFigurateProjection(marker, state, rect);
    if (role === "timer") appendTimerProjection(marker, state, rect);
    if (role === "action" || role === "write" || role === "tool") appendToolProjection(marker, state, rect, role);
    if (PROJECTOR_HINT_ROLES.has(role)) appendRoleAffordanceHint(marker, state, rect, role);
  });
}

function renderProjectorZones(state, rect, markers) {
  const zones = buildProjectorZones(markers);
  const showActionDropZones = actionDropAffordanceActive(state);
  zones.forEach((zone, index) => {
    const polygon = document.createElementNS("http://www.w3.org/2000/svg", "polygon");
    const points = boardRectCorners(zone).map((point) => boardPixelPoint(point, state, rect));
    polygon.setAttribute("points", points.map((point) => `${point.x},${point.y}`).join(" "));
    polygon.setAttribute("class", `projector-zone-polygon ${showActionDropZones ? "is-drop-candidate" : ""}`.trim());
    polygon.setAttribute("style", `--zone-hue:${zone.hue}`);
    strokeLayer.appendChild(polygon);
    const labelPoint = boardPixelPoint({ x: zone.x, y: zone.y }, state, rect);
    const label = document.createElement("div");
    label.className = `projector-zone-label ${showActionDropZones ? "is-drop-candidate" : ""}`.trim();
    label.style.left = `${labelPoint.x}px`;
    label.style.top = `${labelPoint.y}px`;
    label.style.setProperty("--zone-hue", zone.hue);
    label.innerHTML = showActionDropZones
      ? `<strong>DROP ACTION: ZONE ${index + 1}</strong><span>release to capture</span>`
      : `<strong>ZONE ${index + 1}</strong><span>${escapeHtml(Room.tagGrammar?.("zone")?.projectorHint || "drop Action here")}</span>`;
    boardLayer.appendChild(label);
  });
}

function actionDropAffordanceActive(state) {
  const drag = state?.board?.activeDrag;
  if (!drag || drag.role !== "action" || drag.surface !== "board") return false;
  const age = Date.now() - Date.parse(drag.updatedAt || "");
  return !Number.isFinite(age) || age < 8000;
}

function buildProjectorZones(markers) {
  const zoneMarkers = markers.filter((marker) => markerRole(marker) === "zone");
  const zones = [];
  for (let index = 0; index < zoneMarkers.length; index += 2) {
    const first = zoneMarkers[index];
    const second = zoneMarkers[index + 1];
    const hue = hueFromAngle(Number(second?.angle ?? first?.angle ?? 0));
    if (!second) {
      zones.push({ x: clamp01(first.x), y: clamp01(first.y), w: 0.16, h: 0.18, hue });
      continue;
    }
    zones.push({
      x: clamp01(Math.min(first.x, second.x)),
      y: clamp01(Math.min(first.y, second.y)),
      w: clamp01(Math.abs(second.x - first.x)),
      h: clamp01(Math.abs(second.y - first.y)),
      hue,
    });
  }
  return zones.filter((zone) => zone.w > 0.02 && zone.h > 0.02);
}

function renderProjectorVertices(state, rect, markers) {
  const vertices = markers.filter((marker) => markerRole(marker) === "vertex");
  if (vertices.length < 2) return;
  const closed = vertices.length >= 3;
  const polyline = document.createElementNS("http://www.w3.org/2000/svg", closed ? "polygon" : "polyline");
  polyline.setAttribute("points", vertices.map((marker) => {
    const point = boardPixelPoint(marker, state, rect);
    return `${point.x},${point.y}`;
  }).join(" "));
  polyline.setAttribute("class", `projector-vertex-polygon ${closed ? "is-closed" : ""}`.trim());
  polyline.setAttribute("fill", closed ? "rgba(134, 239, 172, 0.14)" : "none");
  strokeLayer.appendChild(polyline);
}

function appendFocusMarkerProjection(marker, state, rect) {
  const point = boardPixelPoint(marker, state, rect);
  const radius = 56 + angleUnit(marker.angle) * 140;
  const ring = document.createElement("div");
  ring.className = "projector-focus-marker";
  ring.style.left = `${point.x}px`;
  ring.style.top = `${point.y}px`;
  ring.style.width = `${radius * 2}px`;
  ring.style.height = `${radius * 2}px`;
  ring.style.setProperty("--focus-angle", `${focusDirectionAngle(marker.angle)}rad`);
  const axis = document.createElement("i");
  axis.className = "projector-focus-axis";
  ring.appendChild(axis);
  const label = document.createElement("span");
  label.textContent = `${marker.label || "Focus"} / ${Math.round(radius)}px / rotate = radius`;
  ring.appendChild(label);
  boardLayer.appendChild(ring);
}

function focusDirectionAngle(angle) {
  return Number(angle || 0) + Math.PI / 2;
}

function appendSlideProjection(marker, state, rect) {
  const deck = buildProjectorSlideDeck(state);
  const active = deck[activeSlideIndex(state, deck.length)];
  const card = appendSemanticCard(marker, state, rect, {
    className: "slide projector-slide-summary",
    color: "#93c5fd",
    w: 0.25,
    h: 0.2,
  });
  card.innerHTML = `
    <div class="semantic-title">SLIDE CONTROL</div>
    <div class="slide-current">now showing ${active.index + 1}/${deck.length}</div>
    <div class="slide-heading">${escapeHtml(active.title)}</div>
    <div class="slide-lines">
      ${active.lines.slice(0, 4).map((line) => `<div>${escapeHtml(String(line).slice(0, 58))}</div>`).join("")}
    </div>
    <div class="slide-footer">
      <span>ACTION LEFT = PREV</span>
      <span>ACTION RIGHT = NEXT</span>
    </div>
  `;
}

function appendVideoProjection(marker, state, rect) {
  const video = videoProjectionState(marker);
  const card = appendSemanticCard(marker, state, rect, {
    className: "video",
    color: "#fca5a5",
    w: 0.3,
    h: 0.2,
  });
  const bars = Array.from({ length: 6 }, (_, index) => {
    const height = 28 + Math.abs(Math.sin(video.currentTime * 0.8 + index)) * 58;
    return `<span style="height:${height}px"></span>`;
  }).join("");
  card.style.setProperty("--video-progress", `${Math.round(video.progress * 100)}%`);
  card.innerHTML = `
    <div class="semantic-title">${escapeHtml(video.scrubbing ? "SCRUBBING VIDEO" : video.paused ? "VIDEO PAUSED" : "VIDEO PLAYING")}</div>
    <div class="projector-video-frame">
      <div class="projector-video-bars">${bars}</div>
    </div>
    <div class="projector-video-action">${video.paused ? "ACTION TAG AREA: PLAY" : "ACTION TAG AREA: PAUSE"}</div>
    <div class="projector-video-meta">TAG ${escapeHtml(marker.tagId || marker.numericTagId || marker.id)} ${formatProjectorTime(video.currentTime)} / ${formatProjectorTime(video.duration)}</div>
    <div class="projector-video-scrub"><span></span><i></i></div>
  `;
}

function appendModelProjection(marker, state, rect) {
  const angle = Number(marker.angle || 0);
  const unit = angleUnit(angle);
  const shapes = ["cube", "prism", "tall", "wide"];
  const shape = shapes[Math.floor(unit * shapes.length) % shapes.length];
  const point = boardPixelPoint(marker, state, rect);
  const scaleX = 0.74 + Math.abs(Math.cos(angle)) * 0.72;
  const scaleY = 0.84 + Math.abs(Math.sin(angle * 0.7)) * 0.56;
  const modelWidth = (shape === "wide" ? 148 : 108) * scaleX;
  const modelHeight = (shape === "tall" ? 142 : 112) * scaleY;
  const model = document.createElement("div");
  model.className = `projector-model projector-model-${shape}`;
  model.style.left = `${point.x}px`;
  model.style.top = `${point.y}px`;
  model.style.setProperty("--model-depth", `${22 + Math.abs(Math.sin(angle)) * 42}px`);
  model.style.setProperty("--model-width", `${modelWidth}px`);
  model.style.setProperty("--model-height", `${modelHeight}px`);
  model.innerHTML = `
    <div class="model-wire">
      <span class="front"></span>
      <span class="back"></span>
      <i class="edge edge-1"></i>
      <i class="edge edge-2"></i>
      <i class="edge edge-3"></i>
      <i class="edge edge-4"></i>
    </div>
    <div class="model-label">3D MODEL / ${shape.toUpperCase()}</div>
  `;
  boardLayer.appendChild(model);
}

function appendFigurateProjection(marker, state, rect) {
  const listening = state.character?.present ? "LISTENING" : "PLACE TAG TO WAKE";
  const utterance = fitProjectorLines(state.character?.lastUtterance || "I am quiet until asked.", 42, 3);
  const card = appendSemanticCard(marker, state, rect, {
    className: "figurate",
    color: "#c7d2fe",
    w: 0.27,
    h: 0.15,
  });
  card.innerHTML = `
    <div class="figurate-header">
      <div class="semantic-title">FIGURATE</div>
      <span>${escapeHtml(listening)}</span>
    </div>
    <div class="figurate-body">
      <div class="figurate-orb" aria-hidden="true"></div>
      <div>${utterance.map((line) => `<p>${escapeHtml(line)}</p>`).join("")}</div>
    </div>
    <div class="figurate-action">ACTION IN CARD = ASK ROOM</div>
  `;
}

function appendSemanticCard(marker, state, rect, options) {
  const layout = anchoredBoardRect(marker, options.w, options.h);
  const center = {
    x: layout.x + layout.w / 2,
    y: layout.y + layout.h / 2,
  };
  const point = boardPixelPoint(center, state, rect);
  const size = boardPixelSize(layout, state, rect);
  const card = document.createElement("div");
  card.className = `projector-semantic-card ${options.className || ""}`.trim();
  card.style.left = `${point.x}px`;
  card.style.top = `${point.y}px`;
  card.style.width = `${Math.max(160, size.w)}px`;
  card.style.height = `${Math.max(92, size.h)}px`;
  card.style.setProperty("--semantic-color", options.color || marker.color || "#e5e7eb");
  boardLayer.appendChild(card);
  appendLeader(marker, center, state, rect, options.color || marker.color || "#e5e7eb");
  return card;
}

function appendTimerProjection(marker, state, rect) {
  const point = boardPixelPoint(marker, state, rect);
  const timer = document.createElement("div");
  timer.className = "projector-timer";
  timer.style.left = `${point.x}px`;
  timer.style.top = `${point.y}px`;
  timer.innerHTML = `<strong>02:00</strong><span>TIMER</span>`;
  boardLayer.appendChild(timer);
}

function appendToolProjection(marker, state, rect, role) {
  const point = boardPixelPoint(marker, state, rect);
  const tool = document.createElement("div");
  tool.className = `projector-tool projector-tool-${role}`;
  tool.style.left = `${point.x}px`;
  tool.style.top = `${point.y}px`;
  const grammar = Room.tagGrammar?.(role);
  tool.innerHTML = `<strong>${escapeHtml(role === "tool" ? "ERASE" : role.toUpperCase())}</strong><span>${escapeHtml(grammar?.projectorHint || "")}</span>`;
  boardLayer.appendChild(tool);
}

function appendRoleAffordanceHint(marker, state, rect, role) {
  const grammar = Room.tagGrammar?.(role);
  const text = grammar?.projectorHint;
  if (!text) return;
  const point = boardPixelPoint(roleHintAnchor(marker, role), state, rect);
  const hint = document.createElement("div");
  hint.className = `projector-affordance-hint projector-affordance-${role}`;
  hint.style.left = `${point.x}px`;
  hint.style.top = `${point.y}px`;
  hint.textContent = text;
  boardLayer.appendChild(hint);
}

function roleHintAnchor(marker, role) {
  const offsets = {
    sticky: { x: 0.04, y: -0.04 },
    action: { x: 0.045, y: -0.035 },
    focus: { x: -0.055, y: -0.08 },
    write: { x: 0.04, y: 0.04 },
    tool: { x: 0.04, y: 0.04 },
    timer: { x: 0.04, y: -0.05 },
    object3d: { x: 0.05, y: 0.06 },
    vertex: { x: 0.035, y: -0.035 },
  }[role] || { x: 0.04, y: -0.04 };
  return {
    x: clamp01((marker?.x ?? 0.5) + offsets.x),
    y: clamp01((marker?.y ?? 0.5) + offsets.y),
  };
}

function appendLeader(from, to, state, rect, color) {
  const a = boardPixelPoint(from, state, rect);
  const b = boardPixelPoint(to, state, rect);
  const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
  line.setAttribute("x1", a.x);
  line.setAttribute("y1", a.y);
  line.setAttribute("x2", b.x);
  line.setAttribute("y2", b.y);
  line.setAttribute("class", "projector-card-leader");
  line.setAttribute("stroke", color);
  strokeLayer.appendChild(line);
}

function renderFocus(state) {
  focusLayer.innerHTML = "";
  const rect = boardSurface.getBoundingClientRect();
  const focuses = activeBoardFocuses(state);
  focuses.forEach((focus, index) => {
    const point = boardPixelPoint(focus, state, rect);
    const size = boardPixelSize({ ...focus, width: 0.13, height: 0.1 }, state, rect);
    const ring = document.createElement("div");
    ring.className = `focus-ring ${focuses.length > 1 ? "is-multiple" : ""}`;
    ring.style.left = `${point.x}px`;
    ring.style.top = `${point.y}px`;
    ring.style.width = `${Math.max(90, size.w)}px`;
    ring.style.height = `${Math.max(70, size.h)}px`;
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

function renderBoardDebug(state) {
  boardDebug.innerHTML = "";
  const rect = boardSurface.getBoundingClientRect();
  if (!state.room.debug) return;
  const overlay = document.createElement("div");
  overlay.className = "debug-overlay";
  state.board.objects.forEach((object) => {
    const label = document.createElement("div");
    label.className = "debug-label";
    const point = boardPixelPoint(object, state, rect);
    label.style.left = `${point.x}px`;
    label.style.top = `${point.y}px`;
    label.textContent = object.id;
    overlay.appendChild(label);
  });
  boardDebug.appendChild(overlay);
}

function renderProjectorStatus(state) {
  const boardMode = state.room.boardMode || "stage";
  const mapStatus = hasProjectorMapping(state) ? "mapped" : "identity";
  document.getElementById("projectorState").textContent = classEffect
    ? `${boardMode} / ${mapStatus} / ${classEffect.statusLine || classEffect.message}`
    :
    state.room.debug
      ? `${boardMode} / ${mapStatus} / Reveal: ${state.room.phase} / ${state.light.activeMode} / target ${state.light.targetHit ? "hit" : "miss"} / cal ${state.calibration.board?.status || "unknown"}`
      : `${boardMode} / ${mapStatus} / Board projection ready`;
  document.getElementById("projectorCharacter").textContent =
    classEffect?.characterLine || (state.room.debug ? state.character.lastUtterance : "");
}

function enterFullscreen() {
  const target = document.documentElement;
  if (document.fullscreenElement) {
    document.exitFullscreen?.();
    return;
  }
  target.requestFullscreen?.().catch((error) => console.warn("fullscreen request failed", error));
}

function toggleMapOverlay() {
  mapOverlayVisible = !mapOverlayVisible;
  document.body.dataset.mapOverlay = mapOverlayVisible ? "on" : "off";
}

function toggleStatusOverlay() {
  statusOverlayVisible = !statusOverlayVisible;
  document.body.dataset.statusOverlay = statusOverlayVisible ? "on" : "off";
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function isStickyColor(color) {
  return ["#facc15", "#fde68a", "#bfdbfe", "#f9a8d4", "#a7f3d0", "#ffb360"].includes(String(color || "").toLowerCase());
}

function objectRenderSize(object, state, rect) {
  if ((object.kind || "sticky") === "sticky") {
    const size = Math.max(boardPixelSize(object, state, rect).h, 42);
    return { w: size, h: size };
  }
  return boardPixelSize(object, state, rect);
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

function boardRectCorners(rect) {
  const x = clamp01(rect.x);
  const y = clamp01(rect.y);
  const w = Math.max(0, Math.min(Number(rect.w || 0), 1 - x));
  const h = Math.max(0, Math.min(Number(rect.h || 0), 1 - y));
  return [
    { x, y },
    { x: x + w, y },
    { x: x + w, y: y + h },
    { x, y: y + h },
  ];
}

function anchoredBoardRect(point, w = 0.24, h = 0.15) {
  const gutter = 0.045;
  const px = clamp01(point?.x ?? 0.5);
  const py = clamp01(point?.y ?? 0.5);
  const x = px + gutter + w <= 1
    ? px + gutter
    : px - gutter - w >= 0
      ? px - gutter - w
      : clamp01(px - w / 2);
  const y = py + gutter + h <= 1
    ? py + gutter
    : py - gutter - h >= 0
      ? py - gutter - h
      : clamp01(py - h / 2);
  return {
    x: Math.min(x, 1 - w),
    y: Math.min(y, 1 - h),
    w,
    h,
  };
}

function buildProjectorSlideDeck(state) {
  const objects = state.board?.objects || [];
  const strokes = state.board?.strokes || [];
  const recentEvents = (state.events || []).slice(0, 5).map((event) => event.event_type || event.type || "event");
  const classroom = state.projection?.classroom;
  const deck = [
    {
      title: classroom?.title || "Board Summary",
      lines: classroom?.lines?.length
        ? classroom.lines
        : [
            `${objects.length} board objects`,
            `${strokes.length} writing strokes`,
            `mode: ${state.room?.boardMode || "stage"}`,
            ...objects.slice(0, 4).map((object) => object.label || object.kind || "Object"),
          ],
    },
    {
      title: "Captured Notes",
      lines: objects.length
        ? objects.slice(0, 6).map((object) => `${object.label || object.kind}: ${object.text || object.color || "on board"}`)
        : ["No board notes captured yet."],
    },
    {
      title: "Room Signals",
      lines: recentEvents.length ? recentEvents : [classroom?.status || "Waiting for board actions."],
    },
  ];
  return deck.map((slide, index) => ({ ...slide, index }));
}

function activeSlideIndex(state, slideCount) {
  const value = Number(state.projection?.classroom?.slideIndex);
  if (!Number.isFinite(value) || !slideCount) return 0;
  return ((Math.trunc(value) % slideCount) + slideCount) % slideCount;
}

function videoProjectionState(marker) {
  const duration = 90;
  const progressFromAngle = angleUnit(marker.angle);
  const updatedAt = Date.parse(marker.updatedAt || "");
  const ageMs = Number.isFinite(updatedAt) ? Date.now() - updatedAt : Number.POSITIVE_INFINITY;
  const scrubbing = ageMs >= 0 && ageMs < 650;
  const startTime = progressFromAngle * duration;
  const currentTime = scrubbing
    ? startTime
    : (startTime + Math.max(0, Number.isFinite(ageMs) ? ageMs : 0) / 1000) % duration;
  return {
    duration,
    currentTime,
    scrubbing,
    paused: false,
    progress: currentTime / duration,
  };
}

function formatProjectorTime(value) {
  const total = Math.max(0, Math.floor(Number(value || 0)));
  const minutes = Math.floor(total / 60);
  const seconds = String(total % 60).padStart(2, "0");
  return `${minutes}:${seconds}`;
}

function fitProjectorLines(text, maxChars, maxLines) {
  const words = String(text || "").split(/\s+/).filter(Boolean);
  const lines = [];
  let current = "";
  words.forEach((word) => {
    const next = current ? `${current} ${word}` : word;
    if (next.length <= maxChars) {
      current = next;
      return;
    }
    if (current) lines.push(current);
    current = word;
  });
  if (current) lines.push(current);
  if (lines.length > maxLines) {
    lines.length = maxLines;
    lines[maxLines - 1] = `${lines[maxLines - 1].slice(0, Math.max(0, maxChars - 3))}...`;
  }
  return lines.length ? lines : ["Ask me about the board."];
}

function hueFromAngle(angle) {
  return Math.round(angleUnit(angle) * 360);
}

function angleUnit(angle) {
  const full = Math.PI * 2;
  return (((Number(angle) || 0) % full) + full) % full / full;
}

function boardPixelPoint(point, state, rect) {
  const projected = projectBoardPoint(point, state);
  return {
    x: projected.x * rect.width,
    y: projected.y * rect.height,
  };
}

function boardPixelSize(item, state, rect) {
  const center = {
    x: clamp01(item?.x ?? 0.5),
    y: clamp01(item?.y ?? 0.5),
  };
  const w = Math.max(0.001, Number(item?.w ?? item?.width ?? 0.2));
  const h = Math.max(0.001, Number(item?.h ?? item?.height ?? 0.14));
  const corners = [
    { x: center.x - w / 2, y: center.y - h / 2 },
    { x: center.x + w / 2, y: center.y - h / 2 },
    { x: center.x + w / 2, y: center.y + h / 2 },
    { x: center.x - w / 2, y: center.y + h / 2 },
  ].map((corner) => boardPixelPoint(corner, state, rect));
  const xs = corners.map((point) => point.x);
  const ys = corners.map((point) => point.y);
  return {
    w: Math.max(1, Math.max(...xs) - Math.min(...xs)),
    h: Math.max(1, Math.max(...ys) - Math.min(...ys)),
  };
}

function projectBoardPoint(point, state) {
  const surfacePoint = {
    x: clamp01(point?.x ?? 0.5),
    y: clamp01(point?.y ?? 0.5),
  };
  const matrix = state?.calibration?.board?.surfaceToProjectorHomography;
  if (!isHomography(matrix)) return surfacePoint;
  try {
    return applyHomography(matrix, surfacePoint);
  } catch {
    return surfacePoint;
  }
}

function hasProjectorMapping(state) {
  return isHomography(state?.calibration?.board?.surfaceToProjectorHomography);
}

function applyHomography(matrix, point) {
  const x = Number(point?.x);
  const y = Number(point?.y);
  const w = matrix[6] * x + matrix[7] * y + matrix[8];
  if (!Number.isFinite(w) || Math.abs(w) < 1e-10) throw new Error("homography maps point to infinity");
  return {
    x: (matrix[0] * x + matrix[1] * y + matrix[2]) / w,
    y: (matrix[3] * x + matrix[4] * y + matrix[5]) / w,
  };
}

function isHomography(matrix) {
  return Array.isArray(matrix) && matrix.length === 9 && matrix.every((value) => Number.isFinite(Number(value)));
}

function renderMapOverlay(state, rect) {
  if (!mapSvg) return;
  const outputCorners = [
    { label: "tl", x: 0, y: 0 },
    { label: "tr", x: rect.width, y: 0 },
    { label: "br", x: rect.width, y: rect.height },
    { label: "bl", x: 0, y: rect.height },
  ];
  const boardCorners = projectedBoardCorners(state, rect);
  mapSvg.setAttribute("viewBox", `0 0 ${rect.width} ${rect.height}`);
  mapSvg.innerHTML = "";
  const outputFrame = document.createElementNS("http://www.w3.org/2000/svg", "polygon");
  outputFrame.setAttribute("points", outputCorners.map((corner) => `${corner.x},${corner.y}`).join(" "));
  outputFrame.setAttribute("class", "projector-output-frame-polygon");
  mapSvg.appendChild(outputFrame);
  const polygon = document.createElementNS("http://www.w3.org/2000/svg", "polygon");
  polygon.setAttribute("points", boardCorners.map((corner) => `${corner.x},${corner.y}`).join(" "));
  polygon.setAttribute("class", "projector-map-polygon");
  mapSvg.appendChild(polygon);
  for (let index = 1; index < 4; index += 1) {
    const top = lerpPoint(boardCorners[0], boardCorners[1], index / 4);
    const bottom = lerpPoint(boardCorners[3], boardCorners[2], index / 4);
    const vertical = document.createElementNS("http://www.w3.org/2000/svg", "line");
    vertical.setAttribute("x1", top.x);
    vertical.setAttribute("y1", top.y);
    vertical.setAttribute("x2", bottom.x);
    vertical.setAttribute("y2", bottom.y);
    vertical.setAttribute("class", "projector-map-grid-line");
    mapSvg.appendChild(vertical);
    const left = lerpPoint(boardCorners[0], boardCorners[3], index / 4);
    const right = lerpPoint(boardCorners[1], boardCorners[2], index / 4);
    const horizontal = document.createElementNS("http://www.w3.org/2000/svg", "line");
    horizontal.setAttribute("x1", left.x);
    horizontal.setAttribute("y1", left.y);
    horizontal.setAttribute("x2", right.x);
    horizontal.setAttribute("y2", right.y);
    horizontal.setAttribute("class", "projector-map-grid-line");
    mapSvg.appendChild(horizontal);
  }
  const labelCorners = boardCorners.map((corner, index) => ({
    ...corner,
    label: ["tl", "tr", "br", "bl"][index],
  }));
  labelCorners.forEach((corner) => {
    const el = document.querySelector(`.projector-map-corner.${corner.label}`);
    if (!el) return;
    el.style.left = `${corner.x}px`;
    el.style.top = `${corner.y}px`;
    el.style.right = "auto";
    el.style.bottom = "auto";
  });
  const centerLabel = document.querySelector(".projector-map-center");
  if (centerLabel) {
    const center = centroid(boardCorners);
    centerLabel.style.left = `${center.x}px`;
    centerLabel.style.top = `${center.y}px`;
    centerLabel.textContent = hasProjectorMapping(state) ? "MAPPED BOARD QUAD" : "IDENTITY BOARD QUAD";
  }
}

function projectedBoardCorners(state, rect) {
  return [
    { x: 0, y: 0 },
    { x: 1, y: 0 },
    { x: 1, y: 1 },
    { x: 0, y: 1 },
  ].map((corner) => boardPixelPoint(corner, state, rect));
}

function lerpPoint(a, b, t) {
  return {
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
  };
}

function centroid(points) {
  const total = points.reduce((sum, point) => ({
    x: sum.x + point.x,
    y: sum.y + point.y,
  }), { x: 0, y: 0 });
  return {
    x: total.x / Math.max(1, points.length),
    y: total.y / Math.max(1, points.length),
  };
}

function toPercent(value, total) {
  const percent = total ? (value / total) * 100 : 0;
  return `${clamp(percent, -200, 300).toFixed(3)}%`;
}

function mappingSignature(state) {
  const matrix = state?.calibration?.board?.surfaceToProjectorHomography;
  if (!isHomography(matrix)) return "identity";
  return matrix.map((value) => Number(value).toFixed(4)).join(",");
}

function hexToRgb(color) {
  const normalized = String(color || "#facc15").replace("#", "");
  const value = Number.parseInt(normalized, 16);
  if (!Number.isFinite(value)) return "250, 204, 21";
  return `${(value >> 16) & 255}, ${(value >> 8) & 255}, ${value & 255}`;
}

function clamp01(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.max(0, Math.min(1, number));
}

function clamp(value, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return min;
  return Math.max(min, Math.min(max, number));
}

window.__projectorSmoke = {
  status: () => {
    const rect = boardSurface.getBoundingClientRect();
    const boardCorners = Room.state ? projectedBoardCorners(Room.state, rect) : [];
    return {
      mapping: boardSurface.dataset.mapping || "unknown",
      warpMapping: warpLayer?.dataset.mapping || "unknown",
      warpClipPath: warpLayer?.style.clipPath || "",
      mappingSignature: warpLayer?.dataset.signature || "",
      hasProjectorMapping: hasProjectorMapping(Room.state),
      width: rect.width,
      height: rect.height,
      boardCorners,
      center: Room.state ? boardPixelPoint({ x: 0.5, y: 0.5 }, Room.state, rect) : null,
      topLeft: Room.state ? boardPixelPoint({ x: 0, y: 0 }, Room.state, rect) : null,
    };
  },
  project: (point) => {
    const rect = boardSurface.getBoundingClientRect();
    return Room.state ? boardPixelPoint(point, Room.state, rect) : null;
  },
};
