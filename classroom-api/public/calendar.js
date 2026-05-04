"use strict";

/* calendar.js drives the week-strip subnav on /timeline.html plus the
   shared "selected class day" used by the floating Log panel.
   - Recurring class slot persists in localStorage.
   - Past class days generate deterministic mock events (4 weeks of
     legacy data) so the calendar can be rehearsed.
   - Selected day is dispatched as a window event ("room:day-changed")
     so the Log panel can filter to that day.
*/

const RoomCalendar = (() => {
  const RECUR_KEY = "smart-classroom.classSlot";
  const SEL_KEY   = "smart-classroom.calendarSelectedISO";
  const MOCK_KEY  = "smart-classroom.calendarMock";

  const DOW_NAMES = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
  const DOW_LONG  = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

  // ----- helpers -----
  function loadSlot() {
    try {
      const raw = localStorage.getItem(RECUR_KEY);
      if (raw) return JSON.parse(raw);
    } catch {}
    return { dow: 2, startClock: "16:45", durationHours: 3 };
  }
  function saveSlot(slot) { localStorage.setItem(RECUR_KEY, JSON.stringify(slot)); }
  function getSelectedISO() {
    try { return localStorage.getItem(SEL_KEY) || null; } catch { return null; }
  }
  function setSelectedISO(iso) {
    try { localStorage.setItem(SEL_KEY, iso); } catch {}
    window.dispatchEvent(new CustomEvent("room:day-changed", { detail: { iso, day: dayInfo(iso) } }));
  }

  function startOfWeek(date) {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - d.getDay());
    return d;
  }
  function addDays(date, n) {
    const d = new Date(date);
    d.setDate(d.getDate() + n);
    return d;
  }
  function isoDate(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  function fromISO(iso) {
    const [y, m, d] = iso.split("-").map(Number);
    const date = new Date();
    date.setFullYear(y, m - 1, d);
    date.setHours(0, 0, 0, 0);
    return date;
  }
  function fmtMonthDay(date) {
    const m = date.toLocaleDateString(undefined, { month: "short" }).toUpperCase();
    return `${m} ${date.getDate()}`;
  }
  function fmtRecurring(slot) {
    const [h, m] = slot.startClock.split(":").map(Number);
    const start = new Date(); start.setHours(h, m, 0, 0);
    const end = new Date(start.getTime() + slot.durationHours * 60 * 60 * 1000);
    const fmt = (d) => d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
    return `${DOW_LONG[slot.dow]} · ${fmt(start)}–${fmt(end)}`;
  }
  function fmtRecurringShort(slot) {
    const [h] = slot.startClock.split(":").map(Number);
    const fmt = (hh) => `${((hh + 11) % 12) + 1}${hh < 12 ? "a" : "p"}`;
    return `${DOW_NAMES[slot.dow]} ${fmt(h)}`;
  }

  function nearestClassDayISO(slot, today = new Date()) {
    today = new Date(today); today.setHours(0, 0, 0, 0);
    if (today.getDay() === slot.dow) return isoDate(today);
    for (let i = 1; i <= 7; i++) {
      const d = addDays(today, -i);
      if (d.getDay() === slot.dow) return isoDate(d);
    }
    return isoDate(today);
  }

  // ----- mock past-4-weeks data ---------------------------------------
  // Deterministic by ISO date so reloads stay stable. Generates a class
  // record (event count, fired cues, project metrics, summary) for each
  // past class day in the last 4 weeks.

  function hashSeed(iso) {
    let h = 0;
    for (let i = 0; i < iso.length; i++) h = (h << 5) - h + iso.charCodeAt(i);
    return Math.abs(h) || 1;
  }
  function mulberry32(seed) {
    let t = seed >>> 0;
    return function () {
      t = (t + 0x6d2b79f5) >>> 0;
      let r = Math.imul(t ^ (t >>> 15), 1 | t);
      r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
      return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
    };
  }

  const PROJECT_IDS = ["smart-stage", "forest-classroom", "gus-mode", "seren-room", "gesture-timer", "focus-beam", "imprint", "grammar-coach"];
  const SAMPLE_TYPES = [
    "projection.scene.changed", "projection.ambient.pulsed", "audio.entry.started",
    "ambience.changed", "lecture.started", "activity.started", "fatigue.detected",
    "focus.beam.directed", "timer.started", "timer.elapsed", "imprint.captured",
    "grammar.suggestion", "forest.canopy.shifted", "gus.entered", "ambience.faded",
    "stage.cue.lit", "departure.announced",
  ];

  function buildMockDay(iso) {
    const seed = hashSeed(iso);
    const rand = mulberry32(seed);
    const slot = loadSlot();
    const [h, m] = slot.startClock.split(":").map(Number);
    const startMs = fromISO(iso).getTime() + (h * 60 + m) * 60_000;
    const eventCount = 90 + Math.floor(rand() * 80); // 90–170 events
    const liveProjects = 5 + Math.floor(rand() * 4); // 5–8 live
    const fullCredit = Math.floor(rand() * 5) + 1;   // 1–5 full credit
    const events = [];
    for (let i = 0; i < eventCount; i++) {
      const minute = Math.floor(rand() * (slot.durationHours * 60));
      const projectId = PROJECT_IDS[Math.floor(rand() * PROJECT_IDS.length)];
      events.push({
        created_at: new Date(startMs + minute * 60_000).toISOString(),
        event_type: SAMPLE_TYPES[Math.floor(rand() * SAMPLE_TYPES.length)],
        payload: { projectId, sourceProject: projectId, mock: true, day: iso },
      });
    }
    events.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    return {
      iso,
      generatedAt: new Date().toISOString(),
      stats: { events: eventCount, liveProjects, fullCredit },
      summary: pickSummary(rand, iso),
      events,
    };
  }

  function pickSummary(rand, iso) {
    const SUMMARIES = [
      "Smart stage led the lecture; activity ran long and ate departure.",
      "Forest hit canopy mode in the second hour; engagement held steady.",
      "Gus entered at break; class read it as a reset.",
      "Focus beam cued well in lecture, missed twice in activity.",
      "Imprint captured at three transitions; grammar coach offered four hints.",
      "Fatigue spiked at minute 92; gesture timer saved the activity.",
      "Quiet first hour; lecture ran tight; activity sparked late.",
    ];
    return SUMMARIES[Math.floor(rand() * SUMMARIES.length)];
  }

  function loadMockStore() {
    try { return JSON.parse(localStorage.getItem(MOCK_KEY) || "{}"); } catch { return {}; }
  }
  function saveMockStore(store) {
    try { localStorage.setItem(MOCK_KEY, JSON.stringify(store)); } catch {}
  }

  function getMockDay(iso) {
    const store = loadMockStore();
    if (store[iso]) return store[iso];
    const day = buildMockDay(iso);
    store[iso] = day;
    saveMockStore(store);
    return day;
  }

  /* Ensure 4 past class days are pre-generated so the calendar shows
     "rehearsed" pips for legacy days. */
  function seedPastWeeks(slot, weeks = 4) {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const result = [];
    let walked = 0;
    let d = addDays(today, -1);
    while (result.length < weeks && walked < weeks * 7 + 14) {
      if (d.getDay() === slot.dow) {
        result.push(isoDate(d));
        getMockDay(isoDate(d));
      }
      d = addDays(d, -1);
      walked++;
    }
    return result;
  }

  function dayInfo(iso) {
    if (!iso) return null;
    const slot = loadSlot();
    const date = fromISO(iso);
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const isClass = date.getDay() === slot.dow;
    const todayISO = isoDate(today);
    const tense = iso === todayISO ? "today" : iso < todayISO ? "past" : "future";
    return { iso, isClass, tense, slot, date, mock: tense === "past" && isClass ? getMockDay(iso) : null };
  }

  function getCurrentDay() {
    const iso = getSelectedISO() || nearestClassDayISO(loadSlot());
    return dayInfo(iso);
  }

  // ----- captured-day index (the minimap source) ------------------
  let capturedIndex = null; // { days: [{iso, label, ...}], generatedAt }
  const indexListeners = new Set();

  async function fetchIndex() {
    try {
      const res = await fetch("/api/data/index", { cache: "no-store" });
      if (!res.ok) throw new Error("status " + res.status);
      capturedIndex = await res.json();
      indexListeners.forEach((fn) => { try { fn(capturedIndex); } catch {} });
      return capturedIndex;
    } catch {
      capturedIndex = { days: [], generatedAt: new Date().toISOString() };
      return capturedIndex;
    }
  }
  function getCapturedIndex() { return capturedIndex; }
  function isCaptured(iso) { return !!(capturedIndex?.days || []).find((d) => d.iso === iso); }
  function lastCapturedISO() {
    const today = isoDate(new Date());
    const past = (capturedIndex?.days || []).filter((d) => d.iso <= today);
    return past.length ? past[past.length - 1].iso : ((capturedIndex?.days || []).slice(-1)[0]?.iso || null);
  }
  function onIndexChange(fn) { indexListeners.add(fn); return () => indexListeners.delete(fn); }

  // ----- week strip rendering -----------------------------------------
  let currentWeekOffset = 0;

  function renderStrip(stripEl, weekLabelEl, recurringEditEl) {
    if (!stripEl) return;
    const slot = loadSlot();
    seedPastWeeks(slot, 4);
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const todayISO = isoDate(today);
    const baseStart = startOfWeek(addDays(today, currentWeekOffset * 7));
    const days = Array.from({ length: 7 }, (_, i) => addDays(baseStart, i));
    const selectedISO = getSelectedISO() || nearestClassDayISO(slot);

    if (weekLabelEl) weekLabelEl.textContent = `${fmtMonthDay(days[0])} – ${fmtMonthDay(days[6])}`;
    if (recurringEditEl) recurringEditEl.textContent = fmtRecurring(slot);

    stripEl.innerHTML = "";
    days.forEach((d) => {
      const iso = isoDate(d);
      const isClass = d.getDay() === slot.dow;
      const isToday = iso === todayISO;
      const isPast  = d.getTime() < today.getTime();
      const mockDay = isPast && isClass ? getMockDay(iso) : null;

      const btn = document.createElement("button");
      btn.className = "cal-day";
      btn.dataset.iso = iso;
      if (isClass)        btn.classList.add("is-class");
      else                btn.classList.add("is-other");
      if (isToday)        btn.classList.add("is-today");
      if (isPast)         btn.classList.add("is-past");
      if (mockDay)        btn.classList.add("is-rehearsed");
      if (iso === selectedISO) btn.classList.add("selected");

      const when = isClass
        ? (mockDay ? `${mockDay.stats.events} evts` : (isToday ? fmtRecurringShort(slot).split(" ")[1] : fmtRecurringShort(slot).split(" ")[1]))
        : "—";

      const captured = isCaptured(iso);
      if (captured) btn.classList.add("has-data");

      btn.innerHTML = `
        <span class="dow">${DOW_NAMES[d.getDay()]}</span>
        <span class="dnum">${d.getDate()}</span>
        <span class="when">${when}</span>
        ${captured ? `<span class="data-pip" aria-label="captured"></span>` : ""}
      `;
      btn.addEventListener("click", () => {
        setSelectedISO(iso);
        renderStrip(stripEl, weekLabelEl, recurringEditEl);
      });
      stripEl.appendChild(btn);
    });
  }

  function setWeekOffset(n) { currentWeekOffset = n; }
  function nudgeWeek(delta) { currentWeekOffset += delta; }

  return {
    loadSlot, saveSlot, fmtRecurring, fmtRecurringShort,
    getSelectedISO, setSelectedISO, getCurrentDay, dayInfo,
    nearestClassDayISO, getMockDay, seedPastWeeks,
    renderStrip, setWeekOffset, nudgeWeek,
    isoDate, fromISO, fmtMonthDay, DOW_NAMES, DOW_LONG,
    fetchIndex, getCapturedIndex, isCaptured, lastCapturedISO, onIndexChange,
  };
})();

/* === Page wiring (timeline.html only) ============================ */
(function bootCalendarPage() {
  const stripEl = document.getElementById("calStrip");
  if (!stripEl) return; // not on the calendar page

  const weekLabel = document.getElementById("weekLabel");
  const recurringEdit = document.getElementById("recurringEdit");
  const recurPop = document.getElementById("recurPop");

  // initial selection: nearest class day; snap week offset to its week
  const slot = RoomCalendar.loadSlot();
  let selectedISO = RoomCalendar.getSelectedISO() || RoomCalendar.nearestClassDayISO(slot);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const sel = RoomCalendar.fromISO(selectedISO);
  const startOfThis = (function () { const d = new Date(today); d.setDate(d.getDate() - d.getDay()); return d; })();
  const diffDays = Math.round((sel.getTime() - startOfThis.getTime()) / (24 * 3600 * 1000));
  RoomCalendar.setWeekOffset(Math.floor(diffDays / 7));
  RoomCalendar.setSelectedISO(selectedISO);
  RoomCalendar.renderStrip(stripEl, weekLabel, recurringEdit);

  document.getElementById("prevWeekBtn")?.addEventListener("click", () => {
    RoomCalendar.nudgeWeek(-1); RoomCalendar.renderStrip(stripEl, weekLabel, recurringEdit);
  });
  document.getElementById("nextWeekBtn")?.addEventListener("click", () => {
    RoomCalendar.nudgeWeek(1);  RoomCalendar.renderStrip(stripEl, weekLabel, recurringEdit);
  });
  document.getElementById("todayWeekBtn")?.addEventListener("click", () => {
    RoomCalendar.setWeekOffset(0);
    RoomCalendar.setSelectedISO(RoomCalendar.nearestClassDayISO(RoomCalendar.loadSlot()));
    RoomCalendar.renderStrip(stripEl, weekLabel, recurringEdit);
  });

  // "Jump to last captured" — if a button exists in the page, hook it.
  // We also offer the affordance via the new daypicker button below.
  document.getElementById("lastCapturedBtn")?.addEventListener("click", () => {
    const iso = RoomCalendar.lastCapturedISO();
    if (!iso) return;
    const sel = RoomCalendar.fromISO(iso);
    const today = new Date(); today.setHours(0,0,0,0);
    const dStart = (() => { const d = new Date(today); d.setDate(d.getDate() - d.getDay()); return d; })();
    const diffDays = Math.round((sel.getTime() - dStart.getTime()) / (24 * 3600 * 1000));
    RoomCalendar.setWeekOffset(Math.floor(diffDays / 7));
    RoomCalendar.setSelectedISO(iso);
    RoomCalendar.renderStrip(stripEl, weekLabel, recurringEdit);
  });

  // Fetch the captured-day index once, then re-render so dots appear.
  RoomCalendar.fetchIndex().then(() => {
    RoomCalendar.renderStrip(stripEl, weekLabel, recurringEdit);
    // mount the daypicker (drop-down list of captured days) once we
    // know what's there
    mountDaypicker();
  });

  function mountDaypicker() {
    const host = document.getElementById("daypicker");
    if (!host) return;
    const idx = RoomCalendar.getCapturedIndex();
    if (!idx || !idx.days.length) {
      host.innerHTML = `<span class="daypicker-empty">No captured days</span>`;
      return;
    }
    const today = RoomCalendar.isoDate(new Date());
    const list = idx.days.slice().sort((a, b) => a.iso > b.iso ? -1 : 1); // newest first
    host.innerHTML = `
      <details class="daypicker-pop">
        <summary><span class="dot data-pip"></span><span class="label">${list.length} captured</span></summary>
        <div class="daypicker-list">
          ${list.map((d) => `
            <button type="button" class="daypicker-row ${d.iso > today ? "future" : ""} ${d.iso === today ? "today" : ""}" data-iso="${d.iso}">
              <span class="iso">${d.iso}</span>
              <span class="lbl">${escapeHtml(d.label)}</span>
              <span class="meta">${d.assignments || 0}q · ${d.ideas || 0}i</span>
            </button>`).join("")}
        </div>
      </details>
    `;
    host.querySelectorAll(".daypicker-row").forEach((row) => {
      row.addEventListener("click", () => {
        const iso = row.dataset.iso;
        const sel = RoomCalendar.fromISO(iso);
        const today = new Date(); today.setHours(0,0,0,0);
        const dStart = (() => { const d = new Date(today); d.setDate(d.getDate() - d.getDay()); return d; })();
        const diffDays = Math.round((sel.getTime() - dStart.getTime()) / (24 * 3600 * 1000));
        RoomCalendar.setWeekOffset(Math.floor(diffDays / 7));
        RoomCalendar.setSelectedISO(iso);
        RoomCalendar.renderStrip(stripEl, weekLabel, recurringEdit);
        host.querySelector("details")?.removeAttribute("open");
      });
    });
  }
  function escapeHtml(s) { return String(s ?? "").replace(/[&<>"']/g, (c) => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c])); }

  recurringEdit?.addEventListener("click", openRecur);
  recurringEdit?.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") openRecur(); });
  document.getElementById("recurClose")?.addEventListener("click", () => recurPop.classList.remove("open"));
  document.getElementById("recurSave")?.addEventListener("click", () => {
    const newSlot = {
      dow: Number(document.getElementById("recurDow").value),
      startClock: document.getElementById("recurTime").value || "16:45",
      durationHours: Number(document.getElementById("recurHours").value) || 3,
    };
    RoomCalendar.saveSlot(newSlot);
    recurPop.classList.remove("open");
    RoomCalendar.setSelectedISO(RoomCalendar.nearestClassDayISO(newSlot));
    RoomCalendar.renderStrip(stripEl, weekLabel, recurringEdit);
  });

  function openRecur() {
    const s = RoomCalendar.loadSlot();
    document.getElementById("recurDow").value = String(s.dow);
    document.getElementById("recurTime").value = s.startClock;
    document.getElementById("recurHours").value = String(s.durationHours);
    recurPop.classList.add("open");
  }
})();
