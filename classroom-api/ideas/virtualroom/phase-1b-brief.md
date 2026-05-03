# Phase 1b brief

Small ship. Two things: unblock serving, then start posting detections.

Read first:
- `phase-1-brief.md` "Phase 1b — Acceptance"
- `anti-patterns.md` #3 (`{x, y}` not `{u, v}`) and #10 (tag map fetch)
- `contract-map.md` "Markers" section

## Scope

1. **Server static fix.** The only sanctioned edit to `server.js` in Phase 1.
2. **Detection POSTs.** Surface-coord ground truth, throttled, source-tagged.
3. **UI signals.** Stream toggle in header, rate badge in detection panel.

That's it. No 2D mode yet. No ViewCube yet. Those are Phase 1c.

---

## 1. Server static fix

`server.js` currently confines static serving to `PUBLIC_DIR`. Extend to also serve `IDEAS_DIR`. Keep the path-traversal guard.

Suggested diff (illustrative — adjust to actual code structure):

```js
// near other path constants
const PUBLIC_DIR = path.join(__dirname, "public");
const IDEAS_DIR  = path.join(__dirname, "ideas");

// in the request handler, after API routes, before the existing public lookup:
function resolveStaticPath(pathname) {
  // /ideas/* maps to IDEAS_DIR/* (strip the prefix once)
  if (pathname.startsWith("/ideas/")) {
    const rel = pathname.slice("/ideas/".length);
    const p = path.normalize(path.join(IDEAS_DIR, rel));
    if (p.startsWith(IDEAS_DIR + path.sep) || p === IDEAS_DIR) return p;
    return null;  // path traversal attempt — refuse
  }
  // everything else continues to map to PUBLIC_DIR (existing behavior)
  const p = path.normalize(path.join(PUBLIC_DIR, pathname));
  if (p.startsWith(PUBLIC_DIR + path.sep) || p === PUBLIC_DIR) return p;
  return null;
}
```

Replace the inline `path.join(PUBLIC_DIR, pathname)` + traversal check with a call to `resolveStaticPath(pathname)`. Return `404` when it returns `null`.

For directory requests (`/ideas/virtualroom/` with no file), append `index.html` and try again — same logic that `public/` already uses for `/`.

### Acceptance for the server fix

- `curl http://localhost:4177/projector.html` still returns the projector page (no regression).
- `curl http://localhost:4177/ideas/virtualroom/` returns the new `index.html`.
- `curl http://localhost:4177/ideas/virtualroom/src/app.js` returns the JS module (correct MIME).
- `curl http://localhost:4177/ideas/../package.json` returns 404 (traversal blocked).
- `npm run preflight` still passes.

Don't add new MIME types you don't need. The existing list covers `.html .css .js .json .svg .png` which is enough.

---

## 2. Detection POSTs

Wire up `src/detections.js` per its contract in `phase-1-brief.md`. Defaults:

```js
{
  surface: 'table',
  sourceSpace: 'surface',
  throttleMs: 80,             // ≤ 12.5 Hz
}
```

Build the payload from current marker state once per frame in `tick()`. If less than `throttleMs` since the last POST, return without posting. Otherwise POST and increment a counter.

Each detection:
```js
{
  tagId,                       // from marker.userData.tagId
  center: { x, y },            // surface coords in [0, 1]
  angle,                       // marker rotation around Y (radians)
  confidence: 0.96,            // constant for sim is fine; small jitter ok
}
```

Compute `surface.x = (marker.position.x + TABLE.widthX/2) / TABLE.widthX`. Same for `y` from `position.z`.

The action:
```js
{
  type: 'fiducial.detections.ingest',
  source: 'virtual-room',
  payload: { surface, sourceSpace, detections }
}
```

POST to `/api/action` via `server-client.postAction(...)`. `source: 'virtual-room'` goes at the top level so server logs distinguish sim from the real detector.

### Tag map

At boot in `app.js`:

```js
let tagMap = await server.getTagMap();
if (!tagMap) {
  console.warn('No /api/tag-map; using local fallback');
  tagMap = LOCAL_TAG_MAP_FALLBACK;  // a small embedded copy of data/tag-map.json
}
```

Pass `tagMap` into `MarkerManager`. Don't hardcode the role→startTag mapping in two places.

---

## 3. UI signals

In the header, add a "Stream" toggle button. Default ON. Toggling it calls `pipeline.start()` / `pipeline.stop()`.

In the Detection panel header, show a rate badge:
```
Stream    12/s
```

Update once per second:
- Green-ish (`var(--ink)`) when posts succeed.
- Coral (`var(--coral)`) when the last 3 posts failed.
- Returns to normal on the next success.

`onPost(result)` from the pipeline drives this. Keep a small ring buffer of the last 5 results.

---

## Acceptance — Phase 1b

☐ `http://localhost:4177/ideas/virtualroom/` loads the page (server fix works).
☐ Tag map fetched from `/api/tag-map` at boot. Verified by `console.log` or a small badge.
☐ Stream toggle in header, default ON.
☐ Drag a marker → detection panel updates → rate badge reads ~12/s.
☐ Open `http://localhost:4177/projector.html` in a second window. Drag the mirror marker in the sim. The mirror in projector.html moves within ~200 ms.
☐ Toggle Stream OFF → no more POSTs (verify via `/api/replay` ceasing to grow).
☐ Stop the server. Drag a marker. Rate badge turns coral, no errors thrown in console.
☐ Restart the server. Drag a marker. Rate badge returns to normal.
☐ `npm run preflight` passes.
☐ `npm run simulate:detections` still works alongside the sim (last-write-wins per tag is fine).

## Hand-off checklist

☐ Server diff is the minimum needed. No new dependencies. No new endpoints.
☐ Comments in `server.js` reference Phase 1b in case the change ever needs auditing.
☐ Comments in `detections.js` reference `anti-patterns.md` #3 next to the `{x, y}` payload shape.
☐ No other files in `public/`, `data/`, `lib/`, or `scripts/` changed.
