# Phase 1c brief

Historical note: the live implementation now keeps view-mode switching as plain functions in `src/app.js`. Do not recreate `src/views/view-manager.js` unless a future change needs a real shared boundary.

The visual / spatial-comprehension ship. Three additions:

1. **2D top-down CAD mode** — toggle between 3D perspective and 2D plan view.
2. **ViewCube** — Unity-style orientation widget in the corner.
3. **Camera coverage overlay** (the surprise) — show, in both 2D and 3D, exactly what each camera can see on the table. This is the placement-validation tool that makes "swap to real cameras" mean "place camera, look at coverage, you're done."

Read first:
- `phase-1-brief.md` Phase 1a section
- `anti-patterns.md` (no new ones; just keep them in mind)
- `docs/sim-conventions.md` "Coordinate system"

Don't ship 1c until 1b is in.

## Why both 2D and 3D

The user's hypothesis: in the real classroom, the 3D-people / IK / character work may not pan out, but a clean 2D plan view of the same room is independently useful — for placement decisions, for projection planning, for reading what the system perceives. So both modes share the same data model and selection logic; only the renderer differs.

This means the 2D code is **not a separate app**. It's a second view onto the same scene state, with the same drag/select/rotate inputs.

---

## 1. 2D top-down CAD mode

### Architecture

Add `src/views/` directory:

```
src/views/
  view3d.js        wraps the existing three.js render path
  view2d.js        new — Canvas2D top-down renderer
  app.js           swaps between them; both read the same scene state
```

In `app.js`:

```js
function setViewMode(mode);
function getViewMode();
function resizeViews(width, height);
function renderViews();
```

The toolbar gets a new toggle: `[3D ⇄ 2D]`. Hotkey `2` for 2D, `3` for 3D.

### What the 2D view draws

Top-down orthographic projection. World scale: 1m = 100 px (configurable). Origin at canvas center. +X right, +Z down (matches map convention from above; document this in `view2d.js` header).

Symbol vocabulary (CAD-flavored, monochrome with role-color accents):

| Object | Symbol |
|---|---|
| **Table(s)** | thin-stroke rectangle with hairline grid every 10 cm |
| **Whiteboard** | thick edge (the wall side) + thin perpendicular tick + hatch fill on the room side |
| **Projector (overhead)** | small filled triangle pointing into the page (down) + dotted projected footprint quad |
| **Projector (wall)** | small triangle on the wall + dotted projected footprint on the wall edge |
| **Camera** | small isoceles triangle pointing in its facing direction + dashed FOV cone (frustum projected to the table plane) |
| **Phone** | tiny rounded rectangle + small triangle for lens direction |
| **Marker (card)** | square with role-colored left band + tag id label |
| **Person** | circle with a small forward chevron indicating facing |
| **Calibration corners** | small filled squares with labels (CAL · 00 etc.) |

Lines: 0.5 px hairline. Labels: IBM Plex Mono 8-9 px, 0.18em letter-spacing, all caps. Role colors from `marker-card-system.html`. Background: very dark `#0a0c10` with a sparse dot grid (matches the projector top-down panel in the prototype).

### Interactions in 2D

Same pickable objects, same hotkeys:
- Drag a marker → moves on the table plane (XZ).
- Wheel over a marker → rotates.
- Click a non-marker selectable → inspector pops.
- Move (W) and Rotate (E) hotkeys still apply but with a 2D-appropriate widget:
  - Move: a square handle at the object center; drag to translate.
  - Rotate: a small line sticking out from the object you can grab; drag rotates.
  - For cameras: also expose a tiny dotted line you can drag from the camera tip to re-aim it (like dragging a flashlight).

### Pan / zoom in 2D

- Right-drag pans (matches 3D's right-drag-orbit muscle memory).
- Scroll wheel zooms (centered on cursor).
- `F` while a selectable is hovered/selected centers the view on it.

### Don't do

- Don't try to render the 3D scene in 2D via an OrthographicCamera. It will look wrong (lighting, shading, depth). Build a clean Canvas2D path that reads the same scene-state model.
- Don't fork the data model. Markers, cameras, etc. live in `src/markers.js` etc. Both renderers read from those.
- Don't draw shadows or lighting in 2D. CAD = clear, schematic, no atmosphere.

---

## 2. ViewCube

A small (88 × 88 px) orientation widget in the **top-right** corner of the scene area.

```
src/widgets/view-cube.js
```

Two implementations are acceptable. Pick whichever you ship faster:

**Option A — three.js mini-render**: a tiny `OrthographicCamera` and a labeled cube `Mesh` rendered to a separate canvas every frame. Camera reuses main camera's rotation (not position). Click a face raycasts onto the cube → animate main orbit camera to that view.

**Option B — HTML/CSS 3D cube**: an absolutely-positioned `div` with six face divs styled with `transform: rotate*` and `perspective`. JS updates the wrapper's transform from the main camera's quaternion each frame. Click each face div animates the main orbit camera.

Either is fine. Option B avoids another WebGL context and matches the rest of the design system better.

### Behavior

- Hover a face → highlight + tooltip: `TOP`, `BOTTOM`, `FRONT`, `BACK`, `LEFT`, `RIGHT`.
- Click a face → animate the main camera (or 2D pan/zoom) to that orthogonal view over ~400 ms.
- Always shows the live camera orientation (rotates as you orbit).
- In 2D mode: hide the cube; show a simpler "compass" widget instead — a small disk with N/S/E/W labels indicating the table orientation. Click to rotate the 2D view by 90°.

### Visual

Hairline white edges on a near-black face. Face labels in IBM Plex Mono 8 px, 0.4em letter-spacing, parchment ink. The active face (the one the camera is closest to) gets a small amber dot on its center. Don't over-design — this is an instrument, not a logo.

---

## 3. Camera coverage overlay (the surprise)

The placement-validation feature. With this, finding the right physical camera position becomes "drag camera until the table glows in your color, no gaps."

### Toolbar toggle

Add `[Coverage]` button. Off by default. When on:

- Each camera's table-plane coverage is drawn as a translucent colored quad on the table surface.
- Each camera gets a distinct color from the existing palette (overhead = amber, wall = cyan).
- Where two cameras overlap, the colors blend and a small "2×" badge appears.
- Where no camera covers, the un-covered area is hatched with a faint coral pattern + a small "GAP" label centered in the gap region.

### Geometry

For each camera:

1. Compute the 4 frustum corners on the near clip plane (in local camera space): `(-w, -h, -near)`, `(w, -h, -near)`, etc., where `w = near * tan(fov/2) * aspect`, `h = near * tan(fov/2)`.
2. Convert each to world space via `camera.matrixWorld`.
3. From each corner, shoot a ray from the camera position **through** that corner toward infinity.
4. Intersect each ray with the table plane (`y = TABLE.surfaceY`).
5. The four intersection points form a (probably non-rectangular) quadrilateral on the table.
6. Clip the quad to the table bounds (`±TABLE.widthX/2` × `±TABLE.depthZ/2`). If a ray misses (camera looks away from table) or the projected quad falls entirely outside the table bounds, the coverage is empty.

Math is straightforward; no need for THREE.IK or anything fancy. Pure vector math.

### 3D rendering

Add a thin geometry plane just above the table surface (`y = TABLE.surfaceY + 0.001`). For each camera, a `Mesh` with custom geometry from the clipped quad. Material: `MeshBasicMaterial({ color, transparent: true, opacity: 0.18, depthWrite: false, blending: THREE.AdditiveBlending })`. Updated each frame (or on camera move).

Gap region: the table area minus the union of camera quads. Compute via polygon clipping. For Phase 1c, "good enough" is acceptable: rasterize the table to a 36×36 grid, mark cells covered by any camera quad, render the uncovered cells as a hatched pattern via a CanvasTexture.

### 2D rendering

Same geometry, drawn directly on the Canvas2D view as filled polygons with the same colors and opacities. Hatched gap area same way.

### Acceptance for coverage

☐ Toggle Coverage on with the default scene → see two colored quads on the table (overhead = amber, wall = cyan).
☐ Drag the overhead camera off-axis → its quad updates in real time.
☐ Move both cameras to look entirely at the floor → the table goes fully gap-hatched with a "GAP" label.
☐ Add a third camera (manually for now) → the third color blends in correctly.
☐ Coverage is identical between 2D and 3D modes (toggle 2/3 — same shapes).
☐ Frame rate doesn't drop below 30 fps with coverage on and 2 cameras.

### Wiring

```
src/coverage.js
  computeCameraCoverage(camera, tableBounds) → polygon (Vector3[])
  computeGap(coverages, tableBounds) → polygon[]
```

Pure functions. Both views call them. Coverage objects pushed into the scene and the 2D renderer once, updated when cameras move.

---

## Module additions

```
src/views/view3d.js          existing render path, lifted into a class
src/views/view2d.js          NEW — Canvas2D top-down renderer
src/app.js                   UPDATE — switches modes with plain functions
src/widgets/view-cube.js     NEW — orientation widget + 2D-mode compass
src/coverage.js              NEW — frustum→table polygon math
```

`app.js` orchestrates. None of the new files import from each other except via clean exports — keep dependency edges shallow.

---

## Acceptance — Phase 1c

☐ Toolbar shows `[3D] [2D] [Coverage]` toggles.
☐ Press `2` → switches to 2D top-down. Press `3` → switches back. Hotkey hints visible in the bottom strip.
☐ All Phase 1a/1b interactions still work in 2D: drag marker, wheel rotate, doubleclick remove, select non-markers, inspector.
☐ ViewCube visible in top-right corner of scene area in 3D mode. Clicking a face animates the orbit camera.
☐ In 2D mode, the ViewCube is replaced by a small compass widget.
☐ Coverage toggle on → table shows colored coverage quads from each camera.
☐ Drag a camera in either mode → its coverage quad updates live.
☐ With cameras pointed away from the table, the table renders fully gap-hatched.
☐ 2D and 3D show the same underlying truth — toggling between modes never changes the data, only the look.
☐ `npm run preflight` passes.
☐ Phase 1b acceptance criteria still pass (Stream POSTs continue to work in both modes).

## Hand-off checklist

☐ No edits to `server.js`, `public/`, `data/`, `lib/`, or `scripts/` (Phase 1b touched server.js — that's the only such edit).
☐ All new files under `ideas/virtualroom/src/`.
☐ The 2D view is genuinely 2D (Canvas2D), not a top-down 3D render. Reviewer should be able to confirm by reading `view2d.js` and seeing no `THREE.WebGLRenderer` references.
☐ ViewCube and Coverage both render at ≥ 30 fps in the default scene.
☐ Comments at the top of each new file note: purpose, inputs, outputs, and which Phase brief asked for it.

---

## What remains for Phase 2 (do not start)

- Phone: lens render, lens overlay (Phase 2 phone work).
- Beam projection on table via `SpotLight.map` and beam math.
- Drawable whiteboard.
- Lo-fi people + IK.
- Calibration UI (camera-pixel sourceSpace + the calibration.* actions).
- Reveal overlay.
- Layout snapshot save/restore (parking-lot — bring up only if Phase 1c finishes early).
