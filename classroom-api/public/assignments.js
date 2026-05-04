"use strict";

/* assignments.js renders the per-day class evidence.
   - The calendar subnav drives selection (shared with /timeline.html via
     calendar.js + the "room:day-changed" event).
   - Data lives at /public/data/<ISO>.json. Days without a data file
     render the empty state.
*/

const DONE_KEY = "smart-classroom.assignmentsActionsDone";

const els = {
  weekEyebrow: document.getElementById("weekEyebrow"),
  weekTitle:   document.getElementById("weekTitle"),
  weekVerdict: document.getElementById("weekVerdict"),
  weekDate:    document.getElementById("weekDate"),
  weekDuration:document.getElementById("weekDuration"),
  weekFormat:  document.getElementById("weekFormat"),
  weekLead:    document.getElementById("weekLead"),
  assignList:  document.getElementById("assignList"),
  assignCount: document.getElementById("assignCount"),
  grammarList: document.getElementById("grammarList"),
  grammarCount:document.getElementById("grammarCount"),
  sectionsGrid:document.getElementById("sectionsGrid"),
  sectionCount:document.getElementById("sectionCount"),
  engDeck:     document.getElementById("engDeck"),
  ideasGrid:   document.getElementById("ideasGrid"),
  ideaCount:   document.getElementById("ideaCount"),
  quotesList:  document.getElementById("quotesList"),
  actionList:  document.getElementById("actionList"),
  actionCount: document.getElementById("actionCount"),
};

let currentISO = null;

function currentDayISO() {
  if (typeof RoomCalendar !== "undefined") {
    const day = RoomCalendar.getCurrentDay();
    if (day) return day.iso;
  }
  return null;
}

window.addEventListener("room:day-changed", () => loadDay(currentDayISO()));

// initial: wait a tick for calendar.js to seed/select, then load
setTimeout(() => loadDay(currentDayISO()), 0);

async function loadDay(iso) {
  currentISO = iso;
  if (!iso) return renderEmpty(null, "Pick a day on the calendar above to see what happened.");
  try {
    const res = await fetch(`/data/${iso}.json`, { cache: "no-store" });
    if (!res.ok) throw new Error("No transcript captured for this day yet.");
    const data = await res.json();
    data._iso = iso;
    render(data);
  } catch (error) {
    renderEmpty(iso, error.message);
  }
}

function render(data) {
  const dateLabel = formatDate(data.date) || formatDate(data._iso) || "—";

  els.weekEyebrow.textContent = data.label || dateLabel;
  els.weekTitle.textContent = data.subtitle || "Class read-back";
  els.weekVerdict.textContent = data.verdict || "";
  els.weekDate.textContent = dateLabel;
  els.weekDuration.textContent = data.duration || "—";
  els.weekFormat.textContent = data.format || "—";
  els.weekLead.textContent = data.instructor || "—";

  // Assignments
  const assigns = data.assignments || [];
  els.assignCount.textContent = String(assigns.length);
  els.assignList.innerHTML = assigns.map((a, i) => `
    <article class="assign-row">
      <div class="num">${String(i + 1).padStart(2, "0")}</div>
      <div class="body">
        <h3>${escapeHtml(a.title)}</h3>
        ${a.spec ? `<div class="spec">${escapeHtml(a.spec)}</div>` : ""}
        ${(a.rubric || []).length ? `<ul class="rubric">${(a.rubric || []).map((r) => `<li>${escapeHtml(r)}</li>`).join("")}</ul>` : ""}
        ${a.ambiguity ? `<div class="ambiguity">⚠ ${escapeHtml(a.ambiguity)}</div>` : ""}
      </div>
      <div class="meta-cell">
        <span class="k">Type</span>
        <span class="v">${escapeHtml(a.type || "—")}</span>
      </div>
      <div class="meta-cell">
        <span class="k">Due</span>
        <span class="v">${escapeHtml(a.due || "—")}</span>
      </div>
      <div class="actions">
        <button class="primary" data-emit="assignment.set" data-id="${escapeHtml(a.id)}">Send</button>
      </div>
    </article>
  `).join("");

  els.assignList.querySelectorAll("button[data-emit]").forEach((btn) => {
    btn.addEventListener("click", () => {
      Room.action("event.manual", {
        event_type: btn.dataset.emit,
        payload: { day: currentISO, weekId: data.weekId, assignmentId: btn.dataset.id, source: "assignments-page" },
      }).catch((err) => alert(err.message || String(err)));
    });
  });

  // Grammar
  const grammar = data.grammar || [];
  els.grammarCount.textContent = String(grammar.length);
  els.grammarList.innerHTML = grammar.map((g) => `
    <div class="grammar-row sev-${escapeHtml(g.severity || "info")}">
      <div class="moment">${escapeHtml(g.moment || "—")}</div>
      <div class="cat">${escapeHtml(g.category || "—")}</div>
      <div class="issue">${escapeHtml(g.issue || "")}</div>
      <div class="fix">${escapeHtml(g.fix || "")}</div>
      <div class="sev">${escapeHtml(g.severity || "info")}</div>
    </div>
  `).join("");

  // Sections / evidence
  const sections = data.sections || [];
  els.sectionCount.textContent = String(sections.length);
  els.sectionsGrid.innerHTML = sections.map((s) => `
    <div class="sec-row ${s.issue ? "has-issue" : ""}">
      <div class="when">${escapeHtml(String(s.minutes || 0))} min</div>
      <div class="name">
        <strong${s.issue ? ` data-issue="${escapeHtml(s.issue)}"` : ""}>${escapeHtml(s.label)}</strong>
        <div class="summary">${escapeHtml(s.summary || "")}</div>
      </div>
      <div class="duration">${escapeHtml(s.id || "—")}</div>
      <div class="engagement ${escapeHtml(s.engagement || "")}">${escapeHtml(s.engagement || "—")}</div>
    </div>
  `).join("");

  // Engagement
  const eng = data.engagement || [];
  els.engDeck.innerHTML = eng.map((e) => `
    <div class="cell ${escapeHtml(e.tone || "")}">
      <span class="key">${escapeHtml(e.label)}</span>
      <span class="val">${escapeHtml(e.value)}</span>
      <span class="note">${escapeHtml(e.note || "")}</span>
    </div>
  `).join("");

  // Ideas
  const ideas = data.ideas || [];
  els.ideaCount.textContent = String(ideas.length);
  els.ideasGrid.innerHTML = ideas.map((idea) => `
    <article class="idea">
      <div class="title-line">
        <h4>${escapeHtml(idea.title)}</h4>
        <span class="quadrant">${escapeHtml(idea.quadrant || "")}</span>
        ${idea.followup ? `<span class="followup">follow up</span>` : ""}
      </div>
      <div class="by">${escapeHtml(idea.by || "")}</div>
      <div class="summary">${escapeHtml(idea.summary || "")}</div>
    </article>
  `).join("");

  // Quotes
  const quotes = data.quotes || [];
  els.quotesList.innerHTML = quotes.map((q) => `
    <div class="quote-row">
      <blockquote>${escapeHtml(q.text)}</blockquote>
      <div class="by">— ${escapeHtml(q.speaker)}</div>
    </div>
  `).join("");

  // Actions
  const actions = data.actions || [];
  const done = loadDone();
  const dataKey = data._iso || data.weekId || "—";
  const openCount = actions.filter((a) => !done.has(actionKey(dataKey, a.id))).length;
  els.actionCount.textContent = String(openCount);
  els.actionList.innerHTML = actions.map((a) => {
    const isDone = done.has(actionKey(dataKey, a.id));
    return `
      <div class="action-row ${isDone ? "is-done" : ""}" data-action="${escapeHtml(a.id)}">
        <div class="check" role="checkbox" aria-checked="${isDone ? "true" : "false"}" tabindex="0"></div>
        <div class="title">${escapeHtml(a.title)}</div>
        <div class="owner">${escapeHtml(a.owner || "—")}</div>
        <div class="due">${escapeHtml(a.due || "—")}</div>
        <div class="status">${isDone ? "done" : escapeHtml(a.status || "open")}</div>
      </div>
    `;
  }).join("");

  els.actionList.querySelectorAll(".action-row").forEach((row) => {
    const toggle = () => {
      const id = row.dataset.action;
      const set = loadDone();
      const k = actionKey(dataKey, id);
      if (set.has(k)) set.delete(k); else set.add(k);
      saveDone(set);
      render(data);
    };
    row.querySelector(".check").addEventListener("click", toggle);
    row.querySelector(".check").addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggle(); }
    });
  });
}

function renderEmpty(iso, message) {
  const date = iso ? formatDate(iso) : "—";
  els.weekEyebrow.textContent = iso ? date : "No day selected";
  els.weekTitle.textContent = iso ? "Nothing captured yet." : "Pick a day on the calendar.";
  els.weekVerdict.textContent = message || "Drop a transcript review at /public/data/<ISO>.json and reload.";
  els.weekDate.textContent = date;
  els.weekDuration.textContent = "—";
  els.weekFormat.textContent = "—";
  els.weekLead.textContent = "—";

  els.assignCount.textContent = "0";
  els.assignList.innerHTML = `<div class="assign-row"><div class="num">—</div><div class="body"><div class="spec" style="color: var(--ink-faint);">No assignments captured for this day.</div></div></div>`;

  els.grammarCount.textContent = "0";
  els.grammarList.innerHTML = "";
  els.sectionCount.textContent = "0";
  els.sectionsGrid.innerHTML = "";
  els.engDeck.innerHTML = "";
  els.ideaCount.textContent = "0";
  els.ideasGrid.innerHTML = "";
  els.quotesList.innerHTML = "";
  els.actionCount.textContent = "0";
  els.actionList.innerHTML = "";
}

function formatDate(iso) {
  if (!iso) return null;
  const [y, m, d] = String(iso).split("-").map(Number);
  if (!y || !m || !d) return null;
  const date = new Date(); date.setFullYear(y, m - 1, d); date.setHours(0, 0, 0, 0);
  return date.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
}

function loadDone() {
  try { return new Set(JSON.parse(localStorage.getItem(DONE_KEY) || "[]")); }
  catch { return new Set(); }
}
function saveDone(set) {
  try { localStorage.setItem(DONE_KEY, JSON.stringify([...set])); } catch {}
}
function actionKey(scope, id) { return `${scope}::${id}`; }

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (c) => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]));
}
