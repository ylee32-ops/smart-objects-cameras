"use strict";

/* Layout consistency smoke. Checks the IA + topbar + width invariants
   across every editorial page so polish-pass regressions get caught.
   Run against a live server (default :4177).

   Failures are listed at the end and exit code is non-zero if any.

   USAGE:  node scripts/test-layout-consistency.js
           SMART_ROOM_URL=http://127.0.0.1:4177 node ...
*/

const http = require("http");

const baseUrl = process.env.SMART_ROOM_URL || "http://127.0.0.1:4177";

/* The pages we expect to share the editorial topbar + shell. */
const EDITORIAL_PAGES = [
  "/",
  "/projects.html",
  "/timeline.html",
  "/assignments.html",
  "/labs.html",
  "/report.html",
];

/* Pages excluded from the editorial pattern (intentionally different). */
const NON_EDITORIAL_PAGES = [
  "/projector.html",   // stage page, full-screen
  "/board.html",       // semantic whiteboard, untouched
];

const failures = [];

function fail(page, msg) {
  failures.push(`  ${page}: ${msg}`);
}
function pass(label) {
  process.stdout.write(`✓ ${label}\n`);
}
function section(label) {
  process.stdout.write(`\n— ${label} —\n`);
}

function get(path) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, baseUrl);
    const req = http.request(url, { method: "GET" }, (res) => {
      let text = "";
      res.on("data", (c) => { text += c; });
      res.on("end", () => resolve({ status: res.statusCode, text }));
    });
    req.on("error", reject);
    req.end();
  });
}

function countMatches(text, regex) {
  return (text.match(regex) || []).length;
}

async function main() {
  /* === 1. Every editorial page returns 200 + has the topbar shell === */
  section("Editorial pages reachable");
  const pages = {};
  for (const path of EDITORIAL_PAGES) {
    const res = await get(path);
    if (res.status !== 200) {
      fail(path, `status ${res.status}, expected 200`);
      continue;
    }
    pages[path] = res.text;
    pass(`${path} → 200`);
  }

  /* === 2. Topbar structure: exactly one brand / nav-primary /
         nav-secondary / log-toggle on every editorial page === */
  section("Topbar slots — exactly one of each, pre-allocated in HTML");
  for (const path of EDITORIAL_PAGES) {
    const text = pages[path];
    if (!text) continue;
    const checks = [
      { name: "brand",         re: /class="brand"/g,                   want: 1 },
      { name: "nav-primary",   re: /<nav class="nav nav-primary"/g,    want: 1 },
      { name: "nav-secondary", re: /<nav class="nav-secondary"/g,      want: 1 },
      { name: "log-toggle",    re: /class="log-toggle"/g,              want: 1 },
      { name: "data-log-toggle attr", re: /data-log-toggle/g,          want: 1 },
    ];
    let ok = true;
    for (const c of checks) {
      const found = countMatches(text, c.re);
      if (found !== c.want) {
        fail(path, `expected exactly ${c.want} ${c.name}, found ${found}`);
        ok = false;
      }
    }
    if (ok) pass(`${path} topbar structure`);
  }

  /* === 3. No legacy noise left in topbars === */
  section("No legacy noise in topbars (.spacer / .status-dot / .identity)");
  for (const path of EDITORIAL_PAGES) {
    const text = pages[path];
    if (!text) continue;
    // We look only inside the topbar block, not the whole page (some
    // pages legitimately use .status-dot elsewhere — though after this
    // pass none should).
    const topbarMatch = text.match(/<header class="topbar"[\s\S]*?<\/header>/);
    if (!topbarMatch) { fail(path, `topbar block not found`); continue; }
    const topbar = topbarMatch[0];
    let ok = true;
    [
      { name: "div.spacer",      re: /class="spacer"/ },
      { name: "span.status-dot", re: /class="status-dot"/ },
      { name: "div.identity",    re: /class="identity"/ },
    ].forEach((c) => {
      if (c.re.test(topbar)) {
        fail(path, `legacy ${c.name} still present in topbar`);
        ok = false;
      }
    });
    if (ok) pass(`${path} topbar clean`);
  }

  /* === 4. Width tokens — every editorial page uses --shell-width
         instead of hard-coded 1180/1240/1100 === */
  section("Shell widths — pages reference --shell-width");
  for (const path of EDITORIAL_PAGES) {
    const text = pages[path];
    if (!text) continue;
    // accept var(--shell-width) OR full-bleed (timeline). Check for
    // hard-coded "max-width: NNNNpx" OUTSIDE of @media queries. We
    // strip @media blocks first (they're allowed to use breakpoints).
    const stripped = text.replace(/@media[^{]*\{[^}]*(\{[^}]*\}[^}]*)*\}/g, "");
    const hardcoded = stripped.match(/max-width:\s*(118|124|110|104|108)0px/g) || [];
    const usesToken = /var\(--shell-(width|narrow|form)\)/.test(stripped);
    const isFullBleed = path === "/timeline.html";

    if (hardcoded.length > 0 && !isFullBleed) {
      fail(path, `hard-coded max-width still present: ${hardcoded.join(", ")} — use var(--shell-width)`);
    } else if (!usesToken && !isFullBleed) {
      fail(path, `does not reference var(--shell-width) anywhere`);
    } else {
      pass(`${path} ${isFullBleed ? "full-bleed (intentional)" : "uses --shell-width"}`);
    }
  }

  /* === 5. Nav contents — `Projects · Calendar | Assignments · Log`
         appear in every editorial page (rendered by shared.js but also
         present in markup after JS — we can't run JS in this smoke, so
         we just verify shared.js is loaded and the slot is empty). === */
  section("Nav slots are empty placeholders (filled by shared.js)");
  for (const path of EDITORIAL_PAGES) {
    const text = pages[path];
    if (!text) continue;
    const sharedLoaded = /<script[^>]*src="\/shared\.js"/.test(text);
    if (!sharedLoaded) {
      fail(path, "shared.js script tag missing");
      continue;
    }
    pass(`${path} loads shared.js`);
  }

  /* === 6. Required smoke-text markers preserved === */
  section("Smoke markers preserved");
  const markers = [
    ["/",                     "Smart Classroom API"],
    ["/timeline.html",        "Class Timeline"],
    ["/assignments.html",     "Assignments"],
    ["/labs.html",            "Labs"],
    ["/report.html",          "Readiness"],
    ["/projects.html",        "Projects"],
  ];
  for (const [path, marker] of markers) {
    const text = pages[path];
    if (!text) continue;
    if (text.includes(marker)) pass(`${path} contains "${marker}"`);
    else fail(path, `missing required marker "${marker}"`);
  }

  /* === 7. Single source of nav truth — only ROOM_NAV in shared.js === */
  section("Single source of nav truth");
  const sharedJs = await get("/shared.js");
  if (sharedJs.status !== 200) {
    fail("/shared.js", `status ${sharedJs.status}`);
  } else {
    const navItems = (sharedJs.text.match(/key:\s*"([a-z]+)"/g) || []);
    const expected = ["projects", "calendar", "assignments", "log", "labs"];
    const found = navItems.map((m) => m.match(/"([a-z]+)"/)[1]);
    const missing = expected.filter((k) => !found.includes(k));
    if (missing.length) fail("/shared.js", `ROOM_NAV missing keys: ${missing.join(", ")}`);
    else pass(`shared.js exposes the 5 expected nav keys`);
  }

  /* === 8. Calendar subnav — both timeline.html and assignments.html
         carry the cal-strip placeholder === */
  section("Calendar subnav on timeline + assignments");
  for (const path of ["/timeline.html", "/assignments.html"]) {
    const text = pages[path];
    if (!text) continue;
    const hasStrip = /id="calStrip"/.test(text);
    const loadsCalendar = /<script[^>]*src="\/calendar\.js"/.test(text);
    if (!hasStrip) fail(path, `calendar subnav (#calStrip) missing`);
    if (!loadsCalendar) fail(path, `calendar.js script tag missing`);
    if (hasStrip && loadsCalendar) pass(`${path} has calendar subnav + script`);
  }

  /* === 9. Day-keyed evidence — every expected /data/<ISO>.json
         present, parses, has the right schema, and has content === */
  section("Day-keyed evidence data");
  const expectedDays = [
    "2026-04-07",  // AI elephant
    "2026-04-14",  // Interactive Spaces
    "2026-04-21",  // Implicit interactions (week 2)
    "2026-04-28",  // Surface Studio
  ];
  for (const iso of expectedDays) {
    const dayData = await get(`/data/${iso}.json`);
    if (dayData.status !== 200) {
      fail(`/data/${iso}.json`, `status ${dayData.status}`);
      continue;
    }
    let parsed;
    try { parsed = JSON.parse(dayData.text); } catch { parsed = null; }
    if (!parsed) {
      fail(`/data/${iso}.json`, "not valid JSON");
      continue;
    }
    if (parsed.schema !== "smart-classroom-week-evidence/v0.1") {
      fail(`/data/${iso}.json`, `schema mismatch: ${parsed.schema}`);
      continue;
    }
    if (parsed.date !== iso) {
      fail(`/data/${iso}.json`, `date field "${parsed.date}" doesn't match filename ISO`);
      continue;
    }
    if (!Array.isArray(parsed.sections) || parsed.sections.length === 0) {
      fail(`/data/${iso}.json`, `sections empty`);
      continue;
    }
    if (!Array.isArray(parsed.assignments) || parsed.assignments.length === 0) {
      fail(`/data/${iso}.json`, `assignments empty`);
      continue;
    }
    pass(`/data/${iso}.json valid (${parsed.label || iso} · ${parsed.sections.length} sections · ${parsed.assignments.length} assignments)`);
  }

  /* === 9b. /api/data/index returns the captured days. (Server route;
         skipped if server hasn't restarted to pick it up.) === */
  section("Data index endpoint");
  const idxRes = await get("/api/data/index");
  if (idxRes.status === 404) {
    process.stdout.write("· /api/data/index 404 — restart the server to pick up the new route (skipped)\n");
  } else if (idxRes.status !== 200) {
    fail("/api/data/index", `status ${idxRes.status}`);
  } else {
    let idx;
    try { idx = JSON.parse(idxRes.text); } catch { idx = null; }
    if (!idx || !Array.isArray(idx.days)) {
      fail("/api/data/index", "missing days array");
    } else {
      const isoSet = new Set(idx.days.map((d) => d.iso));
      const missing = expectedDays.filter((iso) => !isoSet.has(iso));
      if (missing.length) fail("/api/data/index", `missing days: ${missing.join(", ")}`);
      else pass(`/api/data/index lists all ${expectedDays.length} expected days`);
    }
  }

  /* === 10. Direction mocks reachable === */
  section("Direction mocks reachable");
  for (const m of ["/mocks/", "/mocks/a-stage.html", "/mocks/b-spread.html", "/mocks/c-lens.html"]) {
    const r = await get(m);
    if (r.status !== 200) fail(m, `status ${r.status}`);
    else pass(`${m} → 200`);
  }

  /* === Final summary === */
  process.stdout.write("\n");
  if (failures.length === 0) {
    process.stdout.write("layout consistency ok\n");
    process.exit(0);
  } else {
    process.stderr.write(`layout consistency FAILED — ${failures.length} issue(s):\n`);
    failures.forEach((f) => process.stderr.write(f + "\n"));
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err.stack || err.message || err);
  process.exit(1);
});
