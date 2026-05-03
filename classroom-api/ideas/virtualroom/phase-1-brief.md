# Phase 1 brief

A self-contained brief for the helper agent. Read this, then `README.md`, `implementation-plan.md`, `contract-map.md`, `dev.md`, and `anti-patterns.md` in this folder. Then start.

The prototype `ideas/virtual-room.html` is **read-only inspiration**. Do not edit it. Do not import from it. It exists so you can see what the design language and behaviors should feel like, but the new code is built from scratch as small modules.

## Goal

Build a virtual-room sandbox served at:

```
http://localhost:4177/ideas/virtualroom/
```

Phase 1 is split into two ships:

- **Phase 1a** — local-only. Scene, drag, single camera POV, inspector. No server.
- **Phase 1b** — same scene, posts `fiducial.detections.ingest` to the server with `sourceSpace: "surface"` so detections drive the live room without going through calibration.

Stop and check in between 1a and 1b.

---

## Files to create

```
ideas/virtualroom/
  index.html              entry — loads importmap, app.js
  virtual-room.css        styles (palette + typography from sim-conventions.md)
  src/
    app.js                boot, layout, hotkeys, wires modules
    conventions.js        constants (room dims, table dims, axes); zero imports
    server-client.js      fetch wrappers; no three.js, no DOM
    room-scene.js         scene, lights, walls, table(s), whiteboard; no DOM
    cameras.js            rig + tripod + head; aimAt(); POV management
    markers.js            marker objects; drag; tag/role lookup from /api/tag-map
    detections.js         project markers via active camera; build payloads; throttle
    phone-lens.js         (Phase 2 stub — file exists but barely populated in Phase 1)
```

Don't add files outside this list in Phase 1. Don't touch `public/`, `server.js`, `data/`, or `lib/`.

---

## Module contracts

### `conventions.js`

Pure constants. Zero imports. Frozen.

```js
export const ROOM   = Object.freeze({ halfX: 3.0, depthZ: 3.0, height: 3.0 });
export const TABLE  = Object.freeze({ widthX: 1.8, depthZ: 1.8, surfaceY: 0.72 });
export const PROJECTOR = Object.freeze({ height: 2.5 });
export const STREAM = Object.freeze({ minPostIntervalMs: 80 });   // ≤ 12.5 Hz
export const SOURCE = 'virtual-room';
```

If something becomes configurable later, promote to runtime config. Never hardcode dimensions in three other modules and a CSS file — read from here.

### `server-client.js`

```js
// All POSTs include source: 'virtual-room' so server logs can distinguish.
// All errors are swallowed and returned as { ok: false, status, error }.

export async function getConfig();
export async function getTagMap();
export async function getCalibration();
export async function getState();
export async function postAction(actionType, payload);
export async function ingestDetections({ surface, sourceSpace, detections });
```

`ingestDetections` is sugar over `postAction('fiducial.detections.ingest', {...})`. Use it in `detections.js`.

No retries. Fire-and-forget. If a POST fails, return the error and let the caller decide.

### `room-scene.js`

```js
export function createRoomScene({ tableConfig }) {
  // returns { scene, lights, table, whiteboard, projectors, floor, walls }
}
```

Floor at y=0, three walls (back, left, right), ceiling. Two parallel tables at y=`TABLE.surfaceY` forming a 1.8×1.8 square at origin (Phase 1: hardcode this layout). Whiteboard against left wall, floor-to-ceiling, with calibration corners drawn into its texture.

Lighting per `docs/sim-conventions.md` — bright ambient + warm key + cool fill + sunlight through a clerestory above the whiteboard. Two projectors (overhead pointing at table; wall projector pointing at whiteboard). For Phase 1, the projectors are visual only — no `SpotLight.map` projection of beam content. (That comes in Phase 2.)

No DOM. No event listeners. Returns the scene and its top-level groups. Caller decides how to add gizmos / helpers.

### `cameras.js`

```js
export function createCameraRig({ name, kind, position, lookAt, fov, aspect, mountOnCeiling });
// returns { rig, head, cam, helper }

export function aimAt(head, target);
// sets head.rotation so head's local -Z faces world `target`.
// Use this — NEVER call Group.lookAt() (anti-pattern #1).

export class CameraSwitcher {
  constructor({ rigs, povRenderer });
  setActive(index);
  getActive();    // returns { rig, cam, helper }
}
```

Two rigs in Phase 1: overhead (ceiling-mounted near front-right corner, looking down at table) and wall (tripod across the room from whiteboard). User picks via dropdown. POV panel renders the active one each frame.

### `markers.js`

```js
export class MarkerManager {
  constructor({ scene, table, tagMap, onChange });
  add({ role, x, z, rotY });    // returns marker (THREE.Group)
  remove(marker);
  list();                       // returns marker[]
  // calls onChange() whenever any marker's position/rotation changes
}
```

A marker is a `THREE.Group` with `userData = { tagId, role, kind: 'marker', card, bounds }`. The card is a Plane mesh with a procedural canvas-texture face (cream paper + role band + procedural fiducial-looking grid). Don't claim this is a real AprilTag — the card label includes "SIMULATED · NOT PRINTABLE."

Drag: pointerdown on the card → raycast to table plane → drag. Wheel rotates around Y. Doubleclick removes. **No TransformControls on markers** (anti-pattern #8).

Tag IDs come from the tag map fetched via `server-client.getTagMap()`. Use `nextTagId(role)` to start at the role's `startTag` and bump by 10 on collision.

`onChange()` is the hook `detections.js` listens to.

### `detections.js`

```js
export class DetectionPipeline {
  constructor({ markers, cameras, throttleMs, onPost });
  setSurface(surfaceName);              // default 'table'
  setSourceSpace('surface' | 'camera'); // default 'surface' for Phase 1b
  tick();                               // call once per frame
  start();                              // begins posting
  stop();                               // pauses posting
}
```

Each `tick()` builds the current detection payload:

For `sourceSpace: 'surface'`:
```js
{
  tagId,
  center: { x: surfaceX, y: surfaceY },   // 0..1
  angle, confidence
}
```

For `sourceSpace: 'camera'`:
```js
{
  tagId,
  center:  { x: pixelX, y: pixelY },
  corners: [ { x, y }, { x, y }, { x, y }, { x, y } ],
  angle, confidence
}
```

Throttle: minimum 80 ms between POSTs (≤ 12.5 Hz). Fire-and-forget. Track success/failure rate for the UI badge.

`onPost(result)` is called with `{ ok, count, ms, error? }`.

### `app.js`

Wires everything. Owns the DOM, the layout, the inspector, the hotkeys, the toolbar. Imports the modules above and the renderers. Does not contain any three.js or fetch calls itself — only orchestration.

Render loop:
1. orbit.update()
2. renderer.render(scene, mainCam)
3. povRenderer.render(scene, switcher.getActive().cam)
4. detections.tick()
5. update DOM panels (rate badge, detection list, FPS)

---

## What goes in `index.html`

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Virtual Room</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,300;1,9..144,300&family=IBM+Plex+Mono:wght@300;400;500&family=IBM+Plex+Sans:wght@300;400;500&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="virtual-room.css">
  <script type="importmap">
  {
    "imports": {
      "three": "https://unpkg.com/three@0.170.0/build/three.module.js",
      "three/addons/": "https://unpkg.com/three@0.170.0/examples/jsm/"
    }
  }
  </script>
</head>
<body>
  <header class="top">…</header>
  <main class="grid">
    <section id="scene"></section>
    <aside class="rail">
      <section class="panel">
        <h3>Camera POV</h3>
        <select id="camSelect"></select>
        <div class="preview-frame"><canvas id="povCanvas"></canvas></div>
      </section>
      <section class="panel">
        <h3>Detection stream</h3>
        <div id="detList"></div>
      </section>
      <section class="panel">
        <h3>Add</h3>
        <div id="markerPad"></div>
      </section>
    </aside>
  </main>
  <footer class="bottom">…</footer>
  <script type="module" src="src/app.js"></script>
</body>
</html>
```

CSS borrows from `ideas/virtual-room.html` for the design language (warm parchment ink on near-black, hairline rules, IBM Plex Mono labels, Fraunces italic for emphasis). Don't copy the whole stylesheet — extract only what these panels need.

---

## Phase 1a — Acceptance

Open `http://localhost:4177/ideas/virtualroom/`. You should see:

☐ A 3D room with two parallel tables forming a 1.8 × 1.8 m square at the origin.
☐ Floor-to-ceiling whiteboard against the left wall (purely visual in 1a; drawing not required).
☐ Three default markers on the table: emitter, mirror, target — each with a cream card with a "SIMULATED" label and a role-colored edge band.
☐ Drag any marker — it moves on the table (clamped to the surface bounds). Wheel over a marker rotates it. Doubleclick removes.
☐ Right-click + drag orbits the perspective view. Scroll dollies.
☐ One POV panel in the right rail showing the active camera. Dropdown switches between `Camera · Overhead` and `Camera · Wall`.
☐ Detection stream panel lists current markers with `tagId`, `role`, surface coords, angle.
☐ Add panel has 6 role buttons that drop a new marker on the table.
☐ Inspector pop-up appears when you click a non-marker selectable (camera, table, whiteboard) showing position + rotation.
☐ Hotkeys: Q select, W move, E rotate, F focus, Esc deselect.
☐ FPS badge in the corner reads ≥ 30 with the default scene.
☐ `npm run preflight` still passes.

Don't ship Phase 1b until all of the above pass.

## Phase 1b — Acceptance

In addition to 1a:

☐ Tag map is fetched from `/api/tag-map` at boot. Falls back to local sample with a `console.warn` if the fetch fails.
☐ A "Stream" toggle in the header. Default ON.
☐ With Stream ON, the sim POSTs `fiducial.detections.ingest` to `/api/action` on a ≤ 12 Hz throttle, with `sourceSpace: "surface"` and `source: "virtual-room"`.
☐ Detection rate badge in the right rail shows `N/s` and updates every second.
☐ With `npm start` running, opening `http://localhost:4177/projector.html` in a second window: dragging the mirror in the sim moves the mirror in projector.html within ~200 ms.
☐ POSTs that fail (network or server 4xx) turn the rate badge to coral until the next success. Don't retry.
☐ `npm run preflight` still passes.
☐ `npm run simulate:detections` still works alongside the sim (last-write-wins per tag is acceptable).

---

## What's NOT in Phase 1

Don't build:

- Phone (file exists, mostly empty).
- Whiteboard drawing.
- Lo-fi people / IK.
- Calibration UI (Phase 2).
- Camera-space detections (Phase 2; sim ground-truth surface coords are fine for 1b).
- Beam projection on the table via `SpotLight.map` (Phase 2; Phase 1 has no projector beam at all — the projectors are mesh-only).
- Reveal overlay (Phase 5).

If you finish Phase 1 with extra time, leave it. Don't pre-build Phase 2.

---

## Things to read before starting

In this order:

1. `ideas/virtualroom/README.md` — strategic framing.
2. `ideas/virtualroom/dev.md` — run + test policy.
3. `ideas/virtualroom/anti-patterns.md` — bugs not to repeat.
4. `ideas/virtualroom/contract-map.md` — exact server contract.
5. `docs/sim-conventions.md` — coordinate system, lookAt gotcha, rig hierarchy.
6. `docs/apriltag-and-calibration.md` — server detection ingestion shape.
7. `data/room-config.json` — surface dimensions and calibration tag layout.
8. `data/tag-map.json` — tag IDs and roles.
9. `ideas/virtual-room.html` — design-language reference only. Read; don't import.

When you're done with Phase 1a, open a brief check-in. Don't immediately ship Phase 1b.

## Hand-off checklist (when Phase 1 is fully done)

☐ All Phase 1a + 1b acceptance criteria checked.
☐ `npm run preflight` passes.
☐ Manual smoke test: server up, both windows open, drag → see updates in `public/projector.html`.
☐ No edits to `public/`, `server.js`, `data/`, `lib/`.
☐ All new files under `ideas/virtualroom/`.
☐ `console.warn` if tag map fallback was used.
☐ Comments in code reference `anti-patterns.md` for any non-obvious choice (e.g., `// see anti-patterns.md #1` next to `aimAt()`).
