"use strict";

/* timeline.js — full-bleed lane view.
   - Ruler sits sticky at top of the scroll area
   - Lanes: Phases (one big row) and Cues (one row, with stagger so labels
     don't crash)
   - Playhead = vertical amber line, draggable via the scrubber in the
     fixed transport bar
   - Day chip at top center summarises today/past/future + active cue;
     clicking it snaps the playhead to the active cue.
*/

const tlState = {
  data: null,
  cues: [],
  fired: new Set(),
  playing: false,
  minute: 0,
  timer: null,
  pxPerMinute: 16,
  totalMinutes: 120,
  laneHeight: 100,
  cueLaneHeight: 110,
};

const scrubber       = document.getElementById("scrubber");
const playBtn        = document.getElementById("playBtn");
const resetBtn       = document.getElementById("resetBtn");
const emitToggle     = document.getElementById("emitToggle");
const lanesShellEl   = document.getElementById("lanesShell");
const notClassEl     = document.getElementById("notClass");
const legacyBannerEl = document.getElementById("legacyBanner");
const legacyEventsEl = document.getElementById("legacyEvents");
const chipDateEl     = document.getElementById("chipDate");
const chipPhaseEl    = document.getElementById("chipPhase");
const chipCueEl      = document.getElementById("chipCue");
const chipCueCountEl = document.getElementById("chipCueCount");
const daychipEl      = document.getElementById("daychip");
const clockReadout   = document.getElementById("clockReadout");
const clockTotal     = document.getElementById("clockTotal");

Room.connect();

if (playBtn)  playBtn.addEventListener("click", () => (tlState.playing ? pauseTimeline() : playTimeline()));
if (resetBtn) resetBtn.addEventListener("click", () => {
  pauseTimeline();
  tlState.fired.clear();
  setMinute(0, { emitCrossed: false });
});
if (scrubber) scrubber.addEventListener("input", () => {
  pauseTimeline();
  setMinute(Number(scrubber.value), { emitCrossed: false });
});
if (daychipEl) daychipEl.addEventListener("click", () => {
  // snap to nearest cue (or 0 if none)
  const cue = nearestCue(tlState.minute) || tlState.cues[0];
  if (cue) setMinute(cue.atMinute, { emitCrossed: false });
});

window.addEventListener("room:day-changed", () => applyDayContext());
window.addEventListener("resize", () => debouncedRender());

loadTimeline().then(() => applyDayContext()).catch((error) => {
  console.error(error);
  if (lanesShellEl) lanesShellEl.innerHTML = `<div class="not-class">Timeline failed to load.</div>`;
});

async function loadTimeline() {
  const data = await fetch("/session-timeline.json", { cache: "no-store" }).then((res) => res.json());
  tlState.data = data;
  tlState.cues = flattenCues(data);
  tlState.totalMinutes = totalMinutes(data);
  if (scrubber) scrubber.max = String(tlState.totalMinutes);
  if (chipCueCountEl) chipCueCountEl.textContent = String(tlState.cues.length);
  if (clockTotal) clockTotal.textContent = `/ ${formatClock(tlState.totalMinutes)}`;
  setMinute(0, { emitCrossed: false });
}

let pageDayIsClass = true;

function applyDayContext() {
  const day = (typeof RoomCalendar !== "undefined") ? RoomCalendar.getCurrentDay() : null;
  if (!day) { pageDayIsClass = true; return renderLanes(); }

  if (chipDateEl && day.date) {
    chipDateEl.textContent = day.date.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
  }

  if (!day.isClass) {
    pageDayIsClass = false;
    notClassEl?.removeAttribute("hidden");
    legacyBannerEl?.setAttribute("hidden", "");
    setTransportEnabled(false);
    // Wipe lanes entirely; keep the not-class overlay as the only child
    if (lanesShellEl) {
      lanesShellEl.innerHTML = "";
      if (notClassEl) lanesShellEl.appendChild(notClassEl);
    }
    if (chipPhaseEl) chipPhaseEl.textContent = "—";
    if (chipCueEl) chipCueEl.textContent = "—";
    return;
  }

  pageDayIsClass = true;
  notClassEl?.setAttribute("hidden", "");

  if (day.tense === "past" && day.mock) {
    setTransportEnabled(false);
    legacyBannerEl?.removeAttribute("hidden");
    if (legacyEventsEl) legacyEventsEl.textContent = String(day.mock.stats.events);
  } else {
    setTransportEnabled(true);
    legacyBannerEl?.setAttribute("hidden", "");
  }

  renderLanes();
}

function setTransportEnabled(enabled) {
  [playBtn, resetBtn, scrubber, emitToggle].forEach((el) => {
    if (!el) return;
    el.disabled = !enabled;
    el.style.opacity = enabled ? "1" : "0.45";
    if (!enabled) el.setAttribute("aria-disabled", "true");
    else el.removeAttribute("aria-disabled");
  });
}

/* === Lane rendering ============================================== */

let renderQueued = false;
function debouncedRender() {
  if (renderQueued) return;
  renderQueued = true;
  requestAnimationFrame(() => {
    renderQueued = false;
    if (pageDayIsClass) renderLanes();
  });
}

function computePxPerMinute() {
  if (!lanesShellEl) return 14;
  // Aim for the timeline to fill the visible scroll area; if cue density
  // would crowd labels, expand pxPerMinute so it horizontally scrolls
  // for legibility.
  const available = lanesShellEl.clientWidth - 160 - 24; // gutter + a bit
  const fitPx = available / Math.max(1, tlState.totalMinutes);
  // Minimum density for readable cue stagger: 14px/min
  return Math.max(14, fitPx);
}

/* Lanes: one row per project (plus a "Phases" row at top and a catch-all
   "Room" row at the bottom for cues without a projectId). Cues become
   inline blocks scoped to their lane, so lanes act like categories. */

const PROJECT_LABELS = {
  "smart-stage":      "Smart stage",
  "forest-classroom": "Forest",
  "gus-mode":         "Gus",
  "seren-room":       "Seren · ambience",
  "gesture-timer":    "Gesture timer",
  "focus-beam":       "Focus beam",
  "imprint":          "Imprint",
  "grammar-coach":    "Grammar coach",
  "sleep-detect":     "Fatigue",
};

function buildLanes() {
  // Order: Phases first, then projects (in encounter order), then "Room"
  // for any cue without a projectId.
  const order = ["__phases__"];
  const seen = new Set();
  for (const cue of tlState.cues) {
    const key = cue.projectId || "__room__";
    if (!seen.has(key)) { seen.add(key); order.push(key); }
  }
  return order.map((key) => ({
    key,
    label: key === "__phases__" ? "Phases"
         : key === "__room__"   ? "Room"
         : (PROJECT_LABELS[key] || key.replace(/-/g, " ")),
    height: key === "__phases__" ? 88 : 64,
  }));
}

function renderLanes() {
  if (!lanesShellEl || !tlState.data) return;

  const lanes = buildLanes();
  const px = tlState.pxPerMinute = computePxPerMinute();
  const trackWidth = Math.max(lanesShellEl.clientWidth - 160, tlState.totalMinutes * px);
  const finalPx = trackWidth / tlState.totalMinutes;
  tlState.pxPerMinute = finalPx;

  lanesShellEl.innerHTML = `
    <div class="lanes-shell">
      <div class="lanes-gutter" id="lanesGutter">
        <div class="ruler-spacer"></div>
      </div>
      <div class="lanes-scroll" id="lanesScroll">
        <div class="lanes-ruler" id="lanesRuler"></div>
        <div class="lanes-body" id="lanesBody" style="position: relative;"></div>
      </div>
    </div>
  `;
  if (legacyBannerEl) lanesShellEl.appendChild(legacyBannerEl);
  if (notClassEl) lanesShellEl.appendChild(notClassEl);

  const gutter   = lanesShellEl.querySelector("#lanesGutter");
  const rulerEl  = lanesShellEl.querySelector("#lanesRuler");
  const bodyEl   = lanesShellEl.querySelector("#lanesBody");

  rulerEl.style.width = `${trackWidth}px`;
  bodyEl.style.width  = `${trackWidth}px`;

  // ruler ticks
  for (let m = 0; m <= tlState.totalMinutes; m += 15) {
    const tick = document.createElement("div");
    tick.className = "tick" + (m % 60 === 0 ? " major" : "");
    tick.style.left = `${m * finalPx}px`;
    rulerEl.appendChild(tick);
    if (m % 60 === 0) {
      const lbl = document.createElement("div");
      lbl.className = "tick-label";
      lbl.textContent = formatClock(m);
      lbl.style.left = `${m * finalPx}px`;
      rulerEl.appendChild(lbl);
    }
  }

  let totalHeight = 0;
  for (const lane of lanes) {
    // gutter label
    const lab = document.createElement("div");
    lab.className = "lane-label";
    lab.style.height = `${lane.height}px`;
    if (lane.key === "__phases__")  lab.classList.add("is-phases");
    else if (lane.key === "__room__") lab.classList.add("is-room");
    else lab.classList.add("is-project");
    lab.textContent = lane.label;
    gutter.appendChild(lab);

    // track
    const track = document.createElement("div");
    track.className = "lane-track";
    track.style.height = `${lane.height}px`;
    track.dataset.laneKey = lane.key;

    if (lane.key === "__phases__") {
      for (const phase of tlState.data.phases || []) {
        const block = document.createElement("button");
        block.type = "button";
        block.className = "lane-phase";
        block.dataset.phaseId = phase.id;
        block.style.left  = `${phase.startMinute * finalPx}px`;
        block.style.width = `${phase.durationMinutes * finalPx - 2}px`;
        block.innerHTML = `
          <span class="name">${escapeHtml(phase.label)}</span>
          <span class="when">${formatClock(phase.startMinute)}–${formatClock(phase.startMinute + phase.durationMinutes)}</span>
        `;
        block.addEventListener("click", () => {
          pauseTimeline();
          setMinute(phase.startMinute, { emitCrossed: false });
        });
        track.appendChild(block);
      }
    } else {
      // cues belonging to this project (or unassigned)
      const laneCues = tlState.cues.filter((cue) => (cue.projectId || "__room__") === lane.key);
      // simple non-overlap stagger across 2 stagger rows so labels don't crash
      const STAGGER = 2;
      const occupied = Array(STAGGER).fill(0);
      for (const cue of laneCues) {
        const x = cue.atMinute * finalPx;
        const labelW = Math.min(220, Math.max(70, (cue.label || "").length * 6.2 + 18));
        let row = 0;
        for (let r = 0; r < STAGGER; r++) {
          if (x >= occupied[r]) { row = r; break; }
          if (r === STAGGER - 1) row = STAGGER - 1;
        }
        occupied[row] = x + labelW + 8;

        const mark = document.createElement("button");
        mark.type = "button";
        mark.className = "lane-cue inline";
        mark.dataset.cueId = cue.id;
        mark.dataset.row = String(row);
        mark.style.left = `${x}px`;
        mark.innerHTML = `<span class="flag">${escapeHtml(cue.label)}</span>`;
        mark.title = `${formatClock(cue.atMinute)} · ${cue.label}\nShift+click to fire`;
        mark.addEventListener("click", (e) => {
          if (e.shiftKey) emitCue(cue).catch(alertError);
          else { pauseTimeline(); setMinute(cue.atMinute, { emitCrossed: false }); }
        });
        track.appendChild(mark);
      }
    }
    bodyEl.appendChild(track);
    totalHeight += lane.height;
  }

  // playhead overlays the whole body
  const playhead = document.createElement("div");
  playhead.className = "lanes-playhead";
  playhead.id = "lanesPlayhead";
  playhead.style.left = `${tlState.minute * finalPx}px`;
  playhead.style.height = `${totalHeight}px`;
  bodyEl.appendChild(playhead);

  renderActiveState();
}

/* === Transport ===================================================== */

function playTimeline() {
  tlState.playing = true;
  if (playBtn) {
    playBtn.textContent = "Pause";
    playBtn.classList.add("live-on");
  }
  tlState.timer = setInterval(() => {
    const next = Math.min(tlState.totalMinutes, tlState.minute + 0.25);
    setMinute(next, { emitCrossed: emitToggle?.checked });
    if (next >= tlState.totalMinutes) pauseTimeline();
  }, 250);
}

function pauseTimeline() {
  tlState.playing = false;
  if (playBtn) {
    playBtn.textContent = "Play";
    playBtn.classList.remove("live-on");
  }
  if (tlState.timer) clearInterval(tlState.timer);
  tlState.timer = null;
}

function setMinute(minute, options = {}) {
  const previous = tlState.minute;
  tlState.minute = clamp(minute, 0, tlState.totalMinutes);
  if (scrubber) scrubber.value = String(tlState.minute);
  if (clockReadout) clockReadout.textContent = formatClock(tlState.minute);
  if (options.emitCrossed) emitCrossedCues(previous, tlState.minute);

  // auto-scroll the lanes so the playhead stays roughly visible
  const playhead = document.getElementById("lanesPlayhead");
  const scroll   = document.getElementById("lanesScroll");
  if (playhead && scroll) {
    const px = tlState.pxPerMinute;
    playhead.style.left = `${tlState.minute * px}px`;
    const left = tlState.minute * px;
    if (left < scroll.scrollLeft + 80) scroll.scrollLeft = Math.max(0, left - 80);
    else if (left > scroll.scrollLeft + scroll.clientWidth - 80) scroll.scrollLeft = left - scroll.clientWidth + 80;
  }

  renderActiveState();
}

function renderActiveState() {
  const phase = activePhase(tlState.minute);
  const cue = nearestCue(tlState.minute);
  document.querySelectorAll(".lane-phase").forEach((el) => {
    el.classList.toggle("active", el.dataset.phaseId === phase?.id);
  });
  document.querySelectorAll(".lane-cue").forEach((el) => {
    const cueId = el.dataset.cueId;
    el.classList.toggle("active", cueId === cue?.id);
    el.classList.toggle("fired", tlState.fired.has(cueId));
  });

  if (chipPhaseEl) chipPhaseEl.textContent = phase ? phase.label : "—";
  if (chipCueEl) chipCueEl.textContent = cue ? `${formatClock(cue.atMinute)} ${cue.label}` : "—";
}

async function emitCrossedCues(fromMinute, toMinute) {
  const crossed = tlState.cues.filter((cue) => cue.atMinute > fromMinute && cue.atMinute <= toMinute);
  for (const cue of crossed) {
    if (!tlState.fired.has(cue.id)) await emitCue(cue);
  }
}

async function emitCue(cue) {
  for (const action of cue.actions || []) {
    await Room.action(action.type, action.payload || {});
  }
  for (const event of cue.events || []) {
    if (event.projectId) {
      await fetch(`/api/projects/${encodeURIComponent(event.projectId)}/events`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          event_type: event.event_type,
          payload: { ...(event.payload || {}), timelineCueId: cue.id, timelineCueLabel: cue.label },
        }),
      }).then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data.ok) throw new Error(data.error || `project event failed: ${res.status}`);
        return data;
      });
    } else {
      await Room.action("event.manual", {
        event_type: event.event_type,
        payload: { ...(event.payload || {}), timelineCueId: cue.id, timelineCueLabel: cue.label },
      });
    }
  }
  tlState.fired.add(cue.id);
  renderActiveState();
}

/* === helpers =========================================== */

function flattenCues(data) {
  return (data.phases || [])
    .flatMap((phase) => (phase.cues || []).map((cue) => ({ ...cue, phaseId: phase.id })))
    .sort((a, b) => a.atMinute - b.atMinute);
}
function activePhase(minute) {
  return (tlState.data?.phases || []).find((phase) => minute >= phase.startMinute && minute < phase.startMinute + phase.durationMinutes) || null;
}
function nearestCue(minute) {
  let nearest = null;
  let distance = Number.POSITIVE_INFINITY;
  for (const cue of tlState.cues) {
    const current = Math.abs(cue.atMinute - minute);
    if (current <= distance) { nearest = cue; distance = current; }
  }
  return distance <= 3 ? nearest : null;
}
function totalMinutes(data) {
  return Math.max(...(data.phases || []).map((phase) => phase.startMinute + phase.durationMinutes), 1);
}
function formatClock(minute) {
  const start = parseClock(tlState.data?.startClock || "00:00");
  const total = start + Math.round(minute);
  const hours = Math.floor(total / 60) % 24;
  const minutes = total % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}
function parseClock(value) {
  const [hours, minutes] = String(value || "00:00").split(":").map(Number);
  return (Number.isFinite(hours) ? hours : 0) * 60 + (Number.isFinite(minutes) ? minutes : 0);
}
function clamp(value, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, n));
}
function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (c) => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]));
}
function alertError(error) { alert(error.message || String(error)); }
