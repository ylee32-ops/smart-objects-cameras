"use strict";

// One single source of nav truth. Four buckets, no duplicates:
//
//   Projects (/)          — the home. Combined live snapshot + roster +
//                            readiness + bench. There is no separate
//                            "Today" page; this is it.
//   Calendar (/timeline.html) — class day picker + run-of-show.
//   Log      (/events.html)   — full event log + filters + replay.
//                            Most of the time the floating Log panel
//                            (auto-injected on every page) is enough.
//   Console  (/console.html)  — runtime tools index: cameras, projector,
//                            heartbeat, testing surfaces.
//
// Page-specific buttons live inside the page body, never as a duplicate
// jump row.
const ROOM_NAV = [
  { key: "projects",    href: "/",                                label: "Projects",    group: "run" },
  { key: "calendar",    href: "/timeline.html",                   label: "Calendar",    group: "run" },
  { key: "assignments", href: "/assignments.html",                label: "Assignments", group: "read" },
  { key: "log",         href: "/events.html",                     label: "Log",         group: "read" },
  // "Labs" is the workshop drawer — runtime tools that don't drive class.
  // Lives in its own group on the right side of the topbar.
  { key: "labs",        href: "/labs.html",                       label: "Labs",        group: "labs" },
];

// Brand links to the simplified room dashboard.
const ROOM_HOME_HREF = "/";

const ROOM_PAGE_META = {
  start: { nav: "", title: "Start" },
  interaction: { nav: "", title: "Grammar" },
  control: { nav: "projects", title: "" },
  timeline: { nav: "calendar", title: "Calendar" },
  "class-object-simulator": { nav: "", title: "Class Objects" },
  projects: { nav: "projects", title: "Projects" },
  "project-packet": { nav: "projects", title: "Project" },
  report: { nav: "projects", title: "Readiness" },
  labs: { nav: "labs", title: "Labs" },
  board: { nav: "labs", title: "Board" },
  projector: { nav: "labs", title: "Projector" },
  cameras: { nav: "labs", title: "Cameras" },
  events: { nav: "log", title: "Log" },
  assignments: { nav: "assignments", title: "Assignments" },
  heartbeat: { nav: "labs", title: "Heartbeat" },
  camera: { nav: "labs", title: "Camera" },
  phone: { nav: "labs", title: "Phone" },
  setup: { nav: "labs", title: "Setup" },
  "tag-reference": { nav: "labs", title: "Tag Reference" },
  "tag-debugger": { nav: "labs", title: "Tag Debugger" },
  "tag-board": { nav: "labs", title: "Tag Board" },
  "calibration-board": { nav: "labs", title: "Calibration Board" },
  cards: { nav: "labs", title: "Cards" },
  "rgb-demo": { nav: "labs", title: "RGB Demo" },
  table: { nav: "", title: "" },
};

const ROOM_TAG_GRAMMAR = {
  calibration: {
    label: "Calibration",
    primaryAction: "Place at fixed board calibration points.",
    contextAction: "Keep in place during reset and tag clearing.",
    signifier: "Corner label and white AprilTag border.",
    feedback: "Projector map aligns to the board frame.",
    failure: "Show mapping pending; move points inward if camera cannot see all corners.",
    reason: "Gives camera and projector a shared coordinate system.",
    projectorHint: "fixed calibration point",
  },
  sticky: {
    label: "Sticky Note",
    primaryAction: "Place or drag a note-like idea on the board.",
    contextAction: "Color sampling can detect real sticky notes without a tag.",
    signifier: "Square note color and soft light highlight.",
    feedback: "Projected glow follows the sticky note.",
    failure: "If color confidence is low, ask for a sample or phone confirmation.",
    reason: "Connects normal classroom materials to the digital board.",
    projectorHint: "sticky note detected",
  },
  zone: {
    label: "Zone",
    primaryAction: "Place one tag to create an area.",
    contextAction: "Add a second diagonal Zone tag to resize or rotate hue.",
    signifier: "Projected rectangle and zone label.",
    feedback: "Green border appears when Action can be dropped.",
    failure: "If zone is too small, keep it visible but do not capture.",
    reason: "Creates a named place for writing, media, or capture.",
    projectorHint: "drop Action here",
  },
  action: {
    label: "Action",
    primaryAction: "Drag into a valid projected target.",
    contextAction: "Controls whatever it touches: zone, slide, video, Figurate, erase.",
    signifier: "Green acceptable drop zones and action-area labels.",
    feedback: "Target pulses and commits to projector/classroom state.",
    failure: "If no target is nearby, show no green zone and do nothing.",
    reason: "One general commit handle keeps the tag set small.",
    projectorHint: "drag into green zone",
  },
  focus: {
    label: "Focus",
    primaryAction: "Place near what should be highlighted.",
    contextAction: "Rotate to change highlighter radius.",
    signifier: "White projected ring with label outside the focused content.",
    feedback: "Ring grows or shrinks immediately.",
    failure: "If tracking is unstable, keep the last stable focus and show pending.",
    reason: "Makes attention visible without editing the board content.",
    projectorHint: "rotate = radius",
  },
  write: {
    label: "Write",
    primaryAction: "Enable annotation/writing mode.",
    contextAction: "Action near writing can commit or erase depending on context.",
    signifier: "Projected write badge and highlighter-on-strokes behavior.",
    feedback: "Marker strokes get thick projected highlight, not a full-zone wash.",
    failure: "If OCR is uncertain, capture image context and ask for confirmation.",
    reason: "Keeps real marker writing central to the prototype.",
    projectorHint: "draw in zone",
  },
  tool: {
    label: "Erase / Tool",
    primaryAction: "Move near writing or an overlay to erase/clear.",
    contextAction: "Can act as contextual Action for cleanup.",
    signifier: "Eraser badge near the tag.",
    feedback: "Nearby strokes or overlays disappear and the tag pulses.",
    failure: "If nothing is nearby, show a miss pulse only.",
    reason: "Gives students a recoverable way to clean the board.",
    projectorHint: "erase near writing",
  },
  slide: {
    label: "Slide",
    primaryAction: "Place to project a slide summary card.",
    contextAction: "Action left/right or phone command moves slides.",
    signifier: "Slide card appears beside the tag, not over the content.",
    feedback: "Classroom projector updates slide index and summary.",
    failure: "If no content is captured, show an empty-board slide.",
    reason: "Turns board work into presentation material.",
    projectorHint: "Action left/right = slides",
  },
  video: {
    label: "Video",
    primaryAction: "Place to project a video player.",
    contextAction: "Rotate to scrub; Action toggles play/pause.",
    signifier: "Video frame with action area and scrub bar.",
    feedback: "Scrub bar moves while rotating, then playback resumes.",
    failure: "If media is missing, show placeholder frame and controls.",
    reason: "Demonstrates media control from physical tags.",
    projectorHint: "rotate scrub; Action play",
  },
  object3d: {
    label: "3D Object",
    primaryAction: "Place a projected 3D model on the board.",
    contextAction: "Rotate to change shape or scale mode.",
    signifier: "Wireframe model beside the tag.",
    feedback: "Model shape changes while rotating.",
    failure: "If pose/hand resize is uncertain, keep the tag-controlled size.",
    reason: "Shows spatial objects without requiring headset hardware.",
    projectorHint: "rotate = shape",
  },
  vertex: {
    label: "Vertex",
    primaryAction: "Place vertices to draw a polygon.",
    contextAction: "Three or more vertices close and fill the shape.",
    signifier: "Lines connect tags in order.",
    feedback: "Closed polygon gets a projected fill.",
    failure: "With fewer than three vertices, show only the line.",
    reason: "Creates drawn boundaries from simple physical handles.",
    projectorHint: "3+ tags close shape",
  },
  timer: {
    label: "Timer",
    primaryAction: "Start or offer a room timer.",
    contextAction: "Pose can pause/start with raised hand or open palm later.",
    signifier: "Projected timer card near the tag.",
    feedback: "Timer appears and can pulse on action.",
    failure: "If pose is uncertain, require Action or phone confirmation.",
    reason: "Useful classroom utility and good pose/gesture demo.",
    projectorHint: "Action or raised hand = timer",
  },
  figurate: {
    label: "Figurate",
    primaryAction: "Summon the room character.",
    contextAction: "Phone Look/Ask/Live sends visual context to the character.",
    signifier: "Character card and listening state.",
    feedback: "Response appears on board/classroom projector.",
    failure: "If no vision context exists, answer from room state only.",
    reason: "Makes the room explain itself and respond conversationally.",
    projectorHint: "phone Ask/Live routes here",
  },
  scene: {
    label: "Scene",
    primaryAction: "Load a named board or project scene.",
    contextAction: "Action can commit the scene to the projector.",
    signifier: "Scene label and board mode state.",
    feedback: "Board/projector mode changes visibly.",
    failure: "If scene is unknown, stay in current mode.",
    reason: "Compatibility role for project packets; prefer Slide or Action for demos.",
    projectorHint: "scene mode",
  },
  capture: {
    label: "Capture",
    primaryAction: "Capture nearby writing or a zone.",
    contextAction: "Action now covers most capture behavior.",
    signifier: "Capture frame around target content.",
    feedback: "Captured content appears on classroom projector.",
    failure: "If target is empty, ask for Action confirmation.",
    reason: "Compatibility role; folds into Action + Zone.",
    projectorHint: "capture nearby content",
  },
  feedback: {
    label: "Feedback",
    primaryAction: "Request a rewrite, hint, or review.",
    contextAction: "Phone/Figurate can provide the same behavior.",
    signifier: "Feedback card or character response.",
    feedback: "Suggestion appears beside selected writing.",
    failure: "If OCR is weak, ask for a phone image.",
    reason: "Compatibility role for student projects.",
    projectorHint: "request feedback",
  },
  check: {
    label: "Check",
    primaryAction: "Start a quick comprehension check.",
    contextAction: "Pose/nod detection may become an implicit input.",
    signifier: "Check window and timer.",
    feedback: "Summary appears on classroom projector.",
    failure: "If pose is uncertain, show confidence and require confirmation.",
    reason: "Useful classroom assessment pattern.",
    projectorHint: "start check",
  },
  character: {
    label: "Character",
    primaryAction: "Summon or switch a character.",
    contextAction: "Figurate is the consolidated room-character path.",
    signifier: "Character card and state.",
    feedback: "Character response updates.",
    failure: "If character is unavailable, fall back to Figurate.",
    reason: "Compatibility role; prefer Figurate for current demos.",
    projectorHint: "character mode",
  },
  ambience: {
    label: "Ambience",
    primaryAction: "Suggest or apply a room mood.",
    contextAction: "V-JEPA/classification can inform this later.",
    signifier: "Ambient color or classroom projector state.",
    feedback: "Room mode summary changes.",
    failure: "If confidence is low, offer suggestion instead of changing mode.",
    reason: "Good implicit-context demo, not critical path.",
    projectorHint: "room mood",
  },
  media: {
    label: "Media",
    primaryAction: "Open a media layer.",
    contextAction: "Slide and Video are the clearer current media roles.",
    signifier: "Media frame or card.",
    feedback: "Media appears on projector.",
    failure: "If source is missing, show placeholder.",
    reason: "Compatibility role; prefer Slide or Video.",
    projectorHint: "media layer",
  },
};

const ROOM_TAG_GRAMMAR_ORDER = [
  "calibration",
  "zone",
  "action",
  "focus",
  "write",
  "tool",
  "sticky",
  "slide",
  "video",
  "vertex",
  "object3d",
  "timer",
  "figurate",
];

function pageMeta(page) {
  return ROOM_PAGE_META[page] || { nav: "" };
}

function initTopbar() {
  const topbar = document.querySelector(".topbar");
  if (!topbar) return;

  const meta = pageMeta(document.body?.dataset?.page || "");
  let brand = topbar.querySelector(".brand");
  const nav = topbar.querySelector(".nav");
  const identity = topbar.querySelector(".identity");

  // Brand linking to the room dashboard.
  if (brand) {
    if (brand.tagName !== "A") {
      const a = document.createElement("a");
      for (const attr of brand.attributes) a.setAttribute(attr.name, attr.value);
      a.href = ROOM_HOME_HREF;
      a.textContent = "Smart Classroom";
      brand.replaceWith(a);
      brand = a;
    } else {
      brand.href = ROOM_HOME_HREF;
      brand.textContent = "Smart Classroom";
    }
  }

  // Identity input + Join button were noisy on every page; remove from topbar.
  if (identity) identity.remove();

  // Strip any legacy noise from old HTML so the topbar always renders the
  // same set of slots: brand · nav-primary · nav-secondary · log-toggle.
  topbar.querySelector(".status-dot")?.remove();
  topbar.querySelector(".spacer")?.remove();
  topbar.querySelector(".identity")?.remove();

  // Make sure nav-primary, nav-secondary, and log-toggle exist in the DOM
  // even if the page's HTML didn't pre-allocate them. We REUSE the
  // existing `.nav` if present (so any inline placeholder is honoured)
  // rather than appending new nodes, to avoid the layout-shift on load
  // that made the Log toggle hop between pages.
  let primary = topbar.querySelector(".nav-primary, nav.nav, .nav");
  if (!primary) {
    primary = document.createElement("nav");
    primary.className = "nav nav-primary";
    topbar.appendChild(primary);
  } else {
    primary.classList.add("nav", "nav-primary");
  }

  let secondary = topbar.querySelector(".nav-secondary");
  if (!secondary) {
    secondary = document.createElement("nav");
    secondary.className = "nav nav-secondary";
    primary.insertAdjacentElement("afterend", secondary);
  }

  let toggle = topbar.querySelector("[data-log-toggle], .log-toggle");
  if (!toggle && document.body?.dataset?.page !== "projector") {
    toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "log-toggle";
    toggle.dataset.logToggle = "";
    toggle.innerHTML = `<span class="live-dot"></span><span>Log</span><span class="count" data-log-count>0</span>`;
    topbar.appendChild(toggle);
  }
  toggle?.addEventListener("click", () => LogPanel.toggle());

  // Render primary (run + read) nav with separators / group-rule
  primary.innerHTML = "";
  const primaryItems = ROOM_NAV.filter((i) => i.group !== "labs");
  primaryItems.forEach((item, i) => {
    if (i > 0) {
      const prev = primaryItems[i - 1];
      const node = document.createElement("span");
      if (prev.group && item.group && prev.group !== item.group) {
        node.className = "nav-group-rule";
      } else {
        node.className = "nav-sep";
        node.textContent = "·";
      }
      primary.appendChild(node);
    }
    primary.appendChild(navLink(item, meta));
  });

  // Render secondary (labs) nav
  secondary.innerHTML = "";
  ROOM_NAV.filter((i) => i.group === "labs").forEach((item) => {
    secondary.appendChild(navLink(item, meta));
  });

  function navLink(item, meta) {
    const link = document.createElement("a");
    link.href = item.href;
    link.textContent = item.label;
    if (item.target) {
      link.target = item.target;
      if (item.target === "_blank") link.rel = "noopener";
    }
    if (item.key === meta.nav) link.classList.add("active");
    return link;
  }

  // Crumb (if a page declared a meta title) sits between secondary and
  // log toggle. Reused if present in HTML; otherwise removed.
  topbar.querySelector(".crumb")?.remove();
}

/* === Floating Log panel ===========================================
   A right-side drawer that slides in from any page. It listens to
   Room.onEvent for live events, supports filtering and inline payload
   expansion, and offers quick-fire buttons for common mock events. The
   panel is auto-injected into <body> on first call. */
const LogPanel = (() => {
  const STORAGE_KEY = "smart-classroom.logPanelOpen";
  let panel = null;
  let backdrop = null;
  let streamEl = null;
  let countEl = null;
  let filterEl = null;
  let countTopbarEl = null;
  let events = [];
  let filterText = "";
  let isOpen = false;
  let bound = false;

  const QUICK_FIRES = [
    { label: "Heartbeat ping", action: () => Room.action("event.manual", { event_type: "room.ping", payload: { source: "log-panel" } }) },
    { label: "Mock detection", action: () => Room.action("event.manual", { event_type: "perception.detection.mock", payload: { source: "log-panel", label: "person", confidence: 0.92 } }) },
    { label: "Reset projects", action: () => Room.action("project.reset", {}) },
    { label: "Reset class objects", action: () => Room.action("class-object.reset", {}) },
  ];

  function ensureMounted() {
    if (panel) return;
    backdrop = document.createElement("div");
    backdrop.className = "log-backdrop";
    backdrop.addEventListener("click", () => close());
    document.body.appendChild(backdrop);

    panel = document.createElement("aside");
    panel.className = "log-panel";
    panel.setAttribute("role", "complementary");
    panel.setAttribute("aria-label", "Live log");
    panel.innerHTML = `
      <header>
        <span class="title">Live <em>log</em></span>
        <span class="meta" data-log-meta>—</span>
        <button class="close" type="button" aria-label="Close log"></button>
      </header>
      <div class="quickfire">
        <span class="label">Quick fire</span>
        ${QUICK_FIRES.map((qf, i) => `<button type="button" data-qf="${i}">${escapeHtml(qf.label)}</button>`).join("")}
      </div>
      <div class="filterbar">
        <input type="search" placeholder="filter event type or payload…" data-log-filter>
        <span class="ev-count" data-log-shown>0</span>
      </div>
      <ul class="stream" data-log-stream></ul>
      <div class="footer-link">
        <a href="/events.html">Open full log →</a>
        <span data-log-shortcut>L</span>
      </div>
    `;
    document.body.appendChild(panel);

    streamEl = panel.querySelector("[data-log-stream]");
    filterEl = panel.querySelector("[data-log-filter]");
    countEl = panel.querySelector("[data-log-shown]");

    panel.querySelector(".close").addEventListener("click", () => close());
    panel.querySelectorAll("[data-qf]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const idx = Number(btn.dataset.qf);
        Promise.resolve(QUICK_FIRES[idx]?.action?.())
          .catch((err) => console.warn("quickfire failed", err));
      });
    });
    filterEl.addEventListener("input", () => {
      filterText = filterEl.value.trim().toLowerCase();
      renderStream();
    });

    streamEl.addEventListener("click", (e) => {
      const li = e.target.closest("li[data-idx]");
      if (!li) return;
      li.classList.toggle("expanded");
    });

    countTopbarEl = document.querySelector("[data-log-count]");
  }

  function bind() {
    if (bound) return;
    bound = true;
    Room.onState((state) => {
      events = (state.events || []).slice(0, 200);
      updateTopbarCount();
      renderStream();
    });
    Room.onEvent((event) => {
      events = [event, ...events].slice(0, 200);
      updateTopbarCount(true);
      renderStream();
    });

    // The Log is tied to the calendar's selected day: when the user
    // picks a different day, we re-render so the stream filters to it.
    window.addEventListener("room:day-changed", () => renderStream());

    // Keyboard: L (or backslash) toggles the panel; Esc closes it.
    document.addEventListener("keydown", (e) => {
      if (e.target?.tagName === "INPUT" || e.target?.tagName === "TEXTAREA" || e.target?.isContentEditable) return;
      if ((e.key === "l" || e.key === "L" || e.key === "\\") && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        toggle();
      } else if (e.key === "Escape" && isOpen) {
        close();
      }
    });

    // Restore last open state.
    try {
      if (localStorage.getItem(STORAGE_KEY) === "1") setTimeout(() => open(), 200);
    } catch {}
  }

  function updateTopbarCount(pulse) {
    const tEl = document.querySelector("[data-log-count]");
    if (!tEl) return;
    tEl.textContent = String(events.length);
    if (pulse) {
      tEl.classList.add("just-fired");
      setTimeout(() => tEl.classList.remove("just-fired"), 600);
    }
  }

  function renderStream() {
    if (!streamEl) return;

    // The Log is "tied to the calendar day": pull the selected day from
    // RoomCalendar (if loaded). For today (or no calendar): show live
    // events. For a past mock day: show that day's mock events. For a
    // future day: show empty.
    let source = events;
    let dayBadge = "live";
    if (typeof RoomCalendar !== "undefined") {
      const day = RoomCalendar.getCurrentDay();
      if (day && day.tense === "past" && day.isClass && day.mock?.events) {
        source = day.mock.events;
        dayBadge = `past · ${day.iso}`;
      } else if (day && day.tense === "future" && day.isClass) {
        source = [];
        dayBadge = `future · ${day.iso}`;
      } else if (day && day.tense === "today") {
        dayBadge = `today · ${day.iso}`;
      }
    }

    const filtered = filterText
      ? source.filter((ev) => {
          const t = String(ev.event_type || "").toLowerCase();
          const p = JSON.stringify(ev.payload || {}).toLowerCase();
          return t.includes(filterText) || p.includes(filterText);
        })
      : source;

    if (countEl) countEl.textContent = `${filtered.length} / ${source.length}`;
    const meta = panel.querySelector("[data-log-meta]");
    if (meta) meta.textContent = dayBadge;

    const tEl = document.querySelector("[data-log-count]");
    if (tEl) tEl.textContent = String(events.length);

    if (!filtered.length) {
      streamEl.innerHTML = `<li class="stream-empty">No events</li>`;
      return;
    }
    streamEl.innerHTML = filtered.slice(0, 80).map((ev, i) => `
      <li data-idx="${i}">
        <span class="time">${escapeHtml(formatTime(ev.created_at))}</span>
        <span class="type">${escapeHtml(ev.event_type || "event.unknown")}</span>
        <pre class="payload">${escapeHtml(JSON.stringify(ev.payload || {}, null, 2))}</pre>
      </li>
    `).join("");
  }

  function open() {
    ensureMounted();
    bind();
    isOpen = true;
    panel.classList.add("is-open");
    backdrop.classList.add("is-open");
    document.body.classList.add("log-open");
    document.querySelector("[data-log-toggle]")?.classList.add("is-open");
    try { localStorage.setItem(STORAGE_KEY, "1"); } catch {}
    renderStream();
  }
  function close() {
    if (!panel) return;
    isOpen = false;
    panel.classList.remove("is-open");
    backdrop.classList.remove("is-open");
    document.body.classList.remove("log-open");
    document.querySelector("[data-log-toggle]")?.classList.remove("is-open");
    try { localStorage.setItem(STORAGE_KEY, "0"); } catch {}
  }
  function toggle() { isOpen ? close() : open(); }

  function formatTime(value) {
    if (!value) return "—";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "—";
    return date.toTimeString().slice(0, 8);
  }
  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, (char) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      "\"": "&quot;",
      "'": "&#39;",
    }[char]));
  }

  return { open, close, toggle, bind };
})();

const Room = (() => {
  const stateListeners = new Set();
  const eventListeners = new Set();
  let state = null;
  let source = null;

  function pageId() {
    return document.body?.dataset?.page || "browser";
  }

  function getUserName() {
    return localStorage.getItem("smart-room-user") || "";
  }

  function setUserName(name) {
    localStorage.setItem("smart-room-user", name || "local guest");
  }

  function initIdentity(page) {
    const input = document.querySelector("[data-user-input]");
    const button = document.querySelector("[data-join-button]");
    if (!input || !button) return;
    input.value = getUserName();
    button.addEventListener("click", () => {
      const name = input.value.trim() || "local guest";
      setUserName(name);
      action("participant.join", { name, page: page || pageId() });
    });
    if (input.value) {
      action("participant.join", { name: input.value, page: page || pageId() });
    }
  }

  async function fetchState() {
    const res = await fetch("/api/state", { cache: "no-store" });
    state = await res.json();
    emitState();
    return state;
  }

  function connect() {
    fetchState().catch(console.error);
    if (source) source.close();
    source = new EventSource("/api/events");
    source.addEventListener("state", (event) => {
      state = JSON.parse(event.data);
      emitState();
    });
    source.addEventListener("room-event", (event) => {
      const parsed = JSON.parse(event.data);
      eventListeners.forEach((listener) => listener(parsed));
    });
    source.onerror = () => {
      document.querySelectorAll("[data-connection-dot]").forEach((dot) => {
        dot.classList.remove("connected");
      });
    };
    source.onopen = () => {
      document.querySelectorAll("[data-connection-dot]").forEach((dot) => {
        dot.classList.add("connected");
      });
    };
  }

  function emitState() {
    stateListeners.forEach((listener) => listener(state));
  }

  function onState(listener) {
    stateListeners.add(listener);
    if (state) listener(state);
    return () => stateListeners.delete(listener);
  }

  function onEvent(listener) {
    eventListeners.add(listener);
    return () => eventListeners.delete(listener);
  }

  async function action(type, payload = {}) {
    let res;
    try {
      res = await fetch("/api/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type,
          payload,
          source: pageId(),
          user: { name: getUserName() || "local guest" },
        }),
      });
    } catch (error) {
      throw new Error(`Room server is not reachable at ${window.location.origin}. Start it with .\\scripts\\start-room.ps1 -Port 4177, then retry. ${error.message || error}`);
    }
    const data = await res.json().catch(() => ({
      ok: false,
      error: `Room server returned HTTP ${res.status}`,
    }));
    if (!res.ok || !data.ok) throw new Error(data.error || `action failed with HTTP ${res.status}`);
    return data;
  }

  function fmtTime(value) {
    if (!value) return "";
    return new Date(value).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  }

  function targetOptions(stateValue = state) {
    if (!stateValue) return [];
    const surfaces = stateValue.surfaces
      .filter((surface) => surface.id !== "table")
      .map((surface) => ({
        id: surface.id,
        kind: "surface",
        label: surface.label,
        surface: surface.id,
      }));
    const tokens = (stateValue.markers?.items || stateValue.fiducials?.markers || stateValue.table?.tokens || []).map((token) => ({
      id: token.id,
      kind: "object",
      label: token.label,
      surface: token.surface || "board",
    }));
    const boardObjects = stateValue.board.objects.map((object) => ({
      id: object.id,
      kind: "object",
      label: object.label || object.text,
      surface: "board",
    }));
    return [...surfaces, ...tokens, ...boardObjects];
  }

  function parseTarget(raw, stateValue = state) {
    const text = String(raw || "").trim();
    if (!text) return null;
    const structured = parseStructuredTarget(text);
    if (structured) return structured;
    const lower = text.toLowerCase();
    const options = targetOptions(stateValue);

    for (const option of options) {
      if (
        lower === option.id.toLowerCase() ||
        lower.includes(`/${option.id.toLowerCase()}`) ||
        lower.includes(`:${option.id.toLowerCase()}`) ||
        lower.includes(option.label.toLowerCase())
      ) {
        return option;
      }
    }

    if (lower.includes("table")) return options.find((o) => o.id === "table");
    if (lower.includes("board") || lower.includes("whiteboard")) return options.find((o) => o.id === "board");
    if (lower.includes("phone")) return options.find((o) => o.id === "phone");
    return { id: text, kind: "unknown", label: text, surface: "board" };
  }

  function parseStructuredTarget(text) {
    try {
      const parsed = JSON.parse(text);
      const target = parsed.target && typeof parsed.target === "object" ? parsed.target : parsed;
      if (target.id || target.target || target.objectId) {
        return {
          id: String(target.id || target.target || target.objectId),
          kind: String(target.kind || target.type || "object"),
          label: String(target.label || target.name || target.id || target.target || target.objectId),
          surface: String(target.surface || "board"),
          x: Number.isFinite(Number(target.x)) ? Number(target.x) : undefined,
          y: Number.isFinite(Number(target.y)) ? Number(target.y) : undefined,
        };
      }
    } catch {
      // Not JSON; try URL/room URI next.
    }
    try {
      const url = new URL(text, window.location.origin);
      const id = url.searchParams.get("target") || url.searchParams.get("id") || url.searchParams.get("object") || url.hash.replace("#", "");
      if (!id) return null;
      return {
        id,
        kind: url.searchParams.get("kind") || url.searchParams.get("type") || "object",
        label: url.searchParams.get("label") || id,
        surface: url.searchParams.get("surface") || "board",
        x: Number.isFinite(Number(url.searchParams.get("x"))) ? Number(url.searchParams.get("x")) : undefined,
        y: Number.isFinite(Number(url.searchParams.get("y"))) ? Number(url.searchParams.get("y")) : undefined,
      };
    } catch {
      return null;
    }
  }

  function normalizedPoint(event, element) {
    const rect = element.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)),
      y: Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height)),
    };
  }

  function recoveryItems(stateValue = state) {
    if (!stateValue) return [];
    const items = [];
    const boardCalibration = stateValue.calibration?.board || {};
    const markers = boardMarkers(stateValue);
    const cameraStates = Object.values(stateValue.perception?.cameraStates || {});

    if (!hasHomography(boardCalibration.surfaceToProjectorHomography)) {
      items.push({
        id: "mapping-pending",
        severity: "warning",
        title: "Mapping pending",
        detail: "Using identity projection. Drag the projector quad in Viewer Map or run projector calibration.",
        recovery: "Re-map projector",
      });
    }

    if (!hasHomography(boardCalibration.cameraToSurfaceHomography)) {
      items.push({
        id: "camera-calibration-pending",
        severity: "warning",
        title: "Camera calibration pending",
        detail: "The camera cannot yet convert detections into board coordinates.",
        recovery: "Place tags 4-7 where the camera can see them",
      });
    }

    const updatedMarkers = markers.filter((marker) => marker.updatedAt);
    const freshMarkers = updatedMarkers.filter((marker) => markerAgeMs(marker) <= 8000);
    if (!freshMarkers.length) {
      items.push({
        id: "tag-stream-idle",
        severity: "notice",
        title: "Tag stream idle",
        detail: "No fresh board tag detections are reaching the room.",
        recovery: "Start detector, simulator, or move a tag into view",
      });
    }

    const lowConfidence = markers.filter((marker) => Number.isFinite(Number(marker.confidence)) && Number(marker.confidence) < 0.65);
    if (lowConfidence.length) {
      items.push({
        id: "tag-low-confidence",
        severity: "warning",
        title: "Low tag confidence",
        detail: lowConfidence.slice(0, 3).map((marker) => `${markerLabel(marker)} ${Math.round(Number(marker.confidence) * 100)}%`).join(", "),
        recovery: "Flatten tag, increase border, reduce glare",
      });
    }

    const staleMarkers = updatedMarkers.filter((marker) => markerAgeMs(marker) > 8000);
    if (staleMarkers.length) {
      items.push({
        id: "tag-stale",
        severity: "notice",
        title: "Stale tag pose",
        detail: staleMarkers.slice(0, 3).map(markerLabel).join(", "),
        recovery: "Move tag slowly back into camera view",
      });
    }

    const actionStatus = actionTargetStatus(stateValue);
    if (actionStatus.active && !actionStatus.valid) {
      items.push({
        id: "action-no-target",
        severity: "miss",
        title: "Action has no target",
        detail: "Action is not touching a valid zone, slide, video, Figurate card, or tool target.",
        recovery: "Move Action into a green zone or labeled card",
      });
    }

    const stickySuggestions = (stateValue.board?.objects || []).filter((object) => (
      (object.kind || "sticky") === "sticky" &&
      !object.tagId &&
      !object.fiducial?.tagId &&
      isStickyLikeColor(object.color)
    ));
    if (stickySuggestions.length) {
      items.push({
        id: "sticky-suggestion",
        severity: "suggestion",
        title: "Sticky suggestion pending",
        detail: `${stickySuggestions.length} color-detected note${stickySuggestions.length === 1 ? "" : "s"} highlighted.`,
        recovery: "Confirm with Action or phone Look before capture",
      });
    }

    if ((stateValue.board?.strokes || []).length) {
      items.push({
        id: "ocr-suggestion",
        severity: "suggestion",
        title: "OCR suggestion pending",
        detail: "Writing is visible, but capture/summary should be confirmed.",
        recovery: "Place Action in a zone or use phone Look",
      });
    }

    const lowPose = cameraStates.filter((camera) => (
      (camera.pose || camera.poses || camera.skeletons || camera.keypoints) &&
      Number(camera.pose_confidence ?? camera.confidence ?? 0) < 0.7
    ));
    if (lowPose.length) {
      items.push({
        id: "pose-low-confidence",
        severity: "suggestion",
        title: "Pose needs confirmation",
        detail: `${lowPose.length} camera${lowPose.length === 1 ? "" : "s"} see a possible gesture.`,
        recovery: "Show projected affordance, then confirm with Action or phone",
      });
    }

    const lowClass = cameraStates.filter((camera) => (
      camera.predicted_class &&
      Number(camera.prediction_confidence ?? camera.confidence ?? 0) > 0 &&
      Number(camera.prediction_confidence ?? camera.confidence ?? 0) < 0.6
    ));
    if (lowClass.length) {
      items.push({
        id: "classification-low-confidence",
        severity: "suggestion",
        title: "Room mode suggestion",
        detail: lowClass.slice(0, 2).map((camera) => `${camera.predicted_class} ${Math.round(Number(camera.prediction_confidence ?? camera.confidence ?? 0) * 100)}%`).join(", "),
        recovery: "Suggest mode only; do not switch automatically",
      });
    }

    return items;
  }

  function actionTargetStatus(stateValue = state) {
    const activeDrag = stateValue?.board?.activeDrag;
    if (!activeDrag || activeDrag.role !== "action" || activeDrag.surface !== "board") {
      return { active: false, valid: false, label: "" };
    }
    const point = {
      x: Number.isFinite(Number(activeDrag.x)) ? Number(activeDrag.x) : null,
      y: Number.isFinite(Number(activeDrag.y)) ? Number(activeDrag.y) : null,
    };
    if (point.x === null || point.y === null) return { active: true, valid: false, label: "unknown" };

    const zones = boardZones(stateValue);
    const zoneIndex = zones.findIndex((zone) => point.x >= zone.x && point.x <= zone.x + zone.w && point.y >= zone.y && point.y <= zone.y + zone.h);
    if (zoneIndex >= 0) return { active: true, valid: true, label: `Zone ${zoneIndex + 1}`, role: "zone" };

    const markers = boardMarkers(stateValue);
    const targetRoles = new Set(["slide", "video", "figurate", "tool", "write", "focus", "timer"]);
    const target = markers.find((marker) => targetRoles.has(markerRole(marker)) && markerDistance(point, marker) <= 0.105);
    if (target) return { active: true, valid: true, label: markerLabel(target), role: markerRole(target) };

    return { active: true, valid: false, label: "no target" };
  }

  function boardZones(stateValue) {
    const zoneMarkers = boardMarkers(stateValue).filter((marker) => markerRole(marker) === "zone");
    const zones = [];
    for (let index = 0; index < zoneMarkers.length; index += 2) {
      const first = zoneMarkers[index];
      const second = zoneMarkers[index + 1];
      if (!second) {
        zones.push({ x: clamp01(first.x), y: clamp01(first.y), w: 0.16, h: 0.18 });
        continue;
      }
      zones.push({
        x: clamp01(Math.min(first.x, second.x)),
        y: clamp01(Math.min(first.y, second.y)),
        w: clamp01(Math.abs(second.x - first.x)),
        h: clamp01(Math.abs(second.y - first.y)),
      });
    }
    return zones.filter((zone) => zone.w > 0.02 && zone.h > 0.02);
  }

  function boardMarkers(stateValue) {
    const markers = stateValue?.markers?.items || stateValue?.fiducials?.markers || stateValue?.table?.tokens || [];
    return markers.filter((marker) => (marker.surface || "board") === "board");
  }

  function markerRole(marker) {
    return String(marker?.role || marker?.kind || "").toLowerCase();
  }

  function markerLabel(marker) {
    return String(marker?.label || marker?.id || marker?.tagId || marker?.numericTagId || "tag");
  }

  function markerAgeMs(marker) {
    const time = Date.parse(marker?.updatedAt || "");
    return Number.isFinite(time) ? Date.now() - time : Number.POSITIVE_INFINITY;
  }

  function markerDistance(point, marker) {
    const dx = Number(point.x) - Number(marker.x ?? 0.5);
    const dy = Number(point.y) - Number(marker.y ?? 0.5);
    return Math.sqrt(dx * dx + dy * dy);
  }

  function hasHomography(matrix) {
    return Array.isArray(matrix) && matrix.length === 9 && matrix.every((value) => Number.isFinite(Number(value)));
  }

  function isStickyLikeColor(color) {
    return ["#facc15", "#fde68a", "#bfdbfe", "#f9a8d4", "#a7f3d0", "#ffb360"].includes(String(color || "").toLowerCase());
  }

  function clamp01(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) return 0;
    return Math.max(0, Math.min(1, number));
  }

  function tagGrammar(role) {
    const key = String(role || "").toLowerCase();
    return ROOM_TAG_GRAMMAR[key] || null;
  }

  function tagGrammarRows(options = {}) {
    const includeCompatibility = options.includeCompatibility === true;
    const keys = includeCompatibility
      ? [...ROOM_TAG_GRAMMAR_ORDER, ...Object.keys(ROOM_TAG_GRAMMAR).filter((key) => !ROOM_TAG_GRAMMAR_ORDER.includes(key))]
      : ROOM_TAG_GRAMMAR_ORDER;
    return keys.map((role) => ({ role, ...ROOM_TAG_GRAMMAR[role] })).filter((row) => row.label);
  }

  return {
    action,
    connect,
    fmtTime,
    get state() {
      return state;
    },
    getUserName,
    initIdentity,
    normalizedPoint,
    onEvent,
    onState,
    pageId,
    parseTarget,
    recoveryItems,
    setUserName,
    actionTargetStatus,
    tagGrammar,
    tagGrammarRows,
    targetOptions,
  };
})();

initTopbar();
// Bind the live-log Room subscription early so the topbar counter and
// open-on-restore both work even before the user clicks Log.
LogPanel.bind();
