# Phase 3 brief

**Interaction & visual polish.** Phase 1 placed the room. Phase 2 calibrated it. Phase 3 makes it feel alive: the projector actually projects a beam, the whiteboard accepts ink, and the phone becomes a real lens that targets things.

Read first:
- `phase-1-brief.md`, `phase-1b-brief.md`, `phase-1c-brief.md`, `phase-2-brief.md` — what Phase 3 builds on.
- `ideas/phone-lens.html` — the design language for the phone lens overlay UI.
- `anti-patterns.md` #4 (`SpotLight.map` darkness) and #7 (don't render the phone in its own POV).
- `contract-map.md` "Phone Targeting" section.
- `docs/sim-conventions.md` "Render passes" — Phase 3 adds passes.

Don't start until Phase 2 is signed off.

## Scope

1. **Phone lens** — render the phone-camera POV onto the phone screen mesh in 3D, plus a small in-screen lens UI overlay (acquired-state arc dial, like `ideas/phone-lens.html`).
2. **`phone.target` POSTs** — when a marker is acquired (centered for ≥ 250 ms) the sim emits the server's `phone.target` action.
3. **Beam projection on table** — `SpotLight.map` driven by a CanvasTexture that renders the beam path. The beam visibly lands on the table surface, not just floats above it. Real projector lighting.
4. **Drawable whiteboard** — a "marker" tool. Drag on the whiteboard with the marker tool active and strokes appear on the board. Camera can see them. Emits `board.stroke.add` POSTs.
5. **Phone-as-flashlight** (the surprise) — selecting the phone activates a small warm SpotLight that follows the phone's aim. When pointed at a marker, the marker glows. Makes the lens metaphor physical.

---

## 1. Phone lens

```
src/phone-lens.js   already a stub from Phase 1; flesh out here
```

### Phone object

- A `THREE.Group` with a flat phone body (rounded box), screen on +Z (toward "user"), lens cylinder on −Z (the camera).
- A child `PerspectiveCamera` (`phoneCam`) with default forward −Z (matches lens). FOV ~60.
- Selectable. Allow XYZ rotation (`allowRotate: true`) and full XYZ translation. Use the orientation helpers in `src/orientation.js` for any default aim.

### Phone screen as render target

- Create a `WebGLRenderTarget` (256 × 540).
- Set the screen mesh's material to `MeshBasicMaterial({ map: phoneScreenRT.texture, toneMapped: false })`.
- Each frame, **hide the phone**, render `scene` from `phoneCam` to `phoneScreenRT`, restore phone visibility. (Anti-pattern #7.)
- Also render the same view to the right-rail "Phone · lens" preview canvas (separate WebGL canvas is fine, or you can share via render targets).

### Phone frustum helper

`CameraHelper(phoneCam)` always visible. Same hide-during-off-screen-render rule as other helpers.

### Lens UI overlay

A 2D Canvas overlay on top of the phone screen (in the right-rail panel — not on the in-scene screen mesh).

When no marker is centered:
- Subtle reticle in the middle, "AIM" label.

When a marker is detected near the center (within 30% of min(w, h)):
- Locking corner reticle around it.
- Tag annotation: `MIRROR · 11`, confidence underneath.
- Arc dial wrapping the marker (270° opening at the bottom toward the thumb), showing the marker's actual angle. Big serif angle reading below the dial. Same visual language as `ideas/phone-lens.html`.

Detection method: raycast from `phoneCam` through pixel center to all markers; pick the closest hit. Note this in a code comment as the placeholder for real BarcodeDetector / AprilTag wasm later.

### Acceptance

☐ Phone visible in scene; selectable; rotates XYZ in rotate mode.
☐ Phone screen mesh shows what `phoneCam` sees, in real time. Phone is not visible in its own view.
☐ Phone frustum (`CameraHelper`) visible in 3D mode; hidden in 2D.
☐ When no marker centered: reticle + "AIM" overlay.
☐ When a marker is centered: lens overlay shows acquired state with name, tag id, conf, arc dial, angle reading.

---

## 2. `phone.target` POSTs

When a marker stays acquired for ≥ 250 ms, POST one `phone.target` action:

```json
{
  "type": "phone.target",
  "source": "virtual-room",
  "payload": {
    "mode": "ar",
    "target": {
      "id": "mirror-a",
      "kind": "object",
      "label": "Mirror",
      "surface": "table"
    }
  }
}
```

`id` and `label` come from the tag map. `mode: "ar"` because the sim phone is acting like the AR companion mode. Don't re-POST while still locked on the same target — emit once when acquired, again when released or when target changes.

### Acceptance

☐ Aim phone at the mirror for ~250 ms → see one `phone.target` POST in `/api/replay`.
☐ Move the phone away → see another `phone.target` with `target: null` (or omit `target`; pick whichever the server expects — check `server.js`).
☐ Aim at a different marker → another `phone.target` for the new marker.

---

## 3. Beam projection on table

The Phase 1 / Phase 2 projector is mesh-only. Phase 3 makes it actually project.

### How

In `src/room-scene.js` (or a new `src/projector-output.js`):

```js
const projCanvas = document.createElement('canvas');
projCanvas.width = 1024; projCanvas.height = 1024;
const projCtx = projCanvas.getContext('2d');
const projTex = new THREE.CanvasTexture(projCanvas);
projTex.colorSpace = THREE.SRGBColorSpace;

const projLight = new THREE.SpotLight(0xfff5dc, 18, 8, projAngle * 1.05, 0.05, 1.0);
projLight.map = projTex;
// ... position, target, shadows
```

Each frame, draw on `projCtx`:
- Full black background.
- The beam path — emitter through any mirrors (reflection math) to target. Glowing amber stroke.
- Subtle hairline grid that projects onto the table as a faint warm wash.
- Pulse on target hit.

Then `projTex.needsUpdate = true`.

### The lighting trick

`SpotLight.map` is multiplicative — black areas project no light. The table goes dark outside the beam. Add a separate `projFill` SpotLight (warm, no map) so the table stays readable. (Anti-pattern #4.)

### Beam math

Project emitter → through mirrors (compute reflection: `R = D - 2(D·N)N`) → to the first hit. Limit to 6 bounces. Filter changes the beam color. Splitter spawns a branch.

The beam computation is pure data; share it with the 2D view. In 2D, draw the beam as a glowing polyline on the Canvas2D top-down — no `SpotLight` involved.

### Acceptance

☐ With the default scene (emitter + mirror + target), a glowing amber beam visibly lands on the **table surface** (not floating above).
☐ Move the mirror → beam reflects in real time.
☐ Add a filter card → beam color shifts.
☐ Add a blocker → beam halts at the blocker.
☐ Target hit produces a soft pulse on the target spot.
☐ The 2D view shows the same beam path as a polyline.
☐ Toggle Dim mode (Phase 1) → projector dominates the scene; the beam is the brightest thing.

---

## 4. Drawable whiteboard

The whiteboard already has a CanvasTexture from Phase 1. Phase 3 makes it drawable.

### Marker tool

A new toolbar button: `[ ✎ Draw ]`. Hotkey `D`.

When Draw mode is active and the pointer is down on the whiteboard:
- Raycast from the pointer to the whiteboard plane.
- Get the UV coordinate of the hit.
- Convert UV → canvas pixels.
- Draw a line segment from the previous point on the whiteboard's CanvasTexture.
- `wbTexture.needsUpdate = true`.

While drawing, `orbit.enabled = false` so the camera doesn't move (anti-pattern bridge: this was bug #15 in the prototype).

POST `board.stroke.add` once per stroke (not per pixel) when the pointer goes up:

```json
{
  "type": "board.stroke.add",
  "source": "virtual-room",
  "payload": {
    "id": "stroke-{timestamp}",
    "color": "#1a1410",
    "points": [{"x":0.42,"y":0.31}, ...],
    "strokeWidth": 4
  }
}
```

UV-normalized 0..1 coords. The server already supports this action — see `contract-map.md` "Board Notes" section (it's listed under `board.object.create` etc.; verify the `board.stroke.add` shape from `server.js`).

### Marker color

A row of pen swatches (already on the whiteboard tray as visual decoration in the prototype) becomes interactive: click a pen → marker color updates. Black, red, blue, green.

### Camera "sees" it

No work — the whiteboard plane is part of the scene; cameras render it; strokes appear in their POVs naturally. Note this in a comment so future work knows it's already covered.

### Clear

A small `[ ⌫ ]` button next to the Draw toggle. Posts `board.clear`.

### Acceptance

☐ Press D → marker tool active. Drag on the whiteboard → strokes appear.
☐ Strokes persist across pan/orbit.
☐ Switch pen color → next stroke is the new color.
☐ Each completed stroke POSTs `board.stroke.add` to the server.
☐ Strokes appear in the wall camera's POV.
☐ Clear button removes all strokes locally and POSTs `board.clear`.
☐ During draw, the orbit camera does NOT move.

---

## 5. Phone-as-flashlight (the surprise)

Selecting the phone reveals a soft warm SpotLight that follows the phone's aim. When pointed at a marker, that marker visually highlights — you can see what the phone is "about to" interact with, even before it's centered enough to lock.

### How

- A child `SpotLight` of `phoneObj`, positioned at the lens (local `(0, 0, -0.04)`), targeting `(0, 0, -1)` in local space (i.e., shines along the lens direction).
- Color: warm `0xffd9a8`. Intensity 2-3. Distance 4. Angle ~`Math.PI / 12` (narrow). Penumbra 0.5.
- Visible only when the phone is selected OR a marker is acquired (so it doesn't constantly light the room).

When the spotlight cone touches a marker, that marker's card material gets a brief emissive bump (`emissiveIntensity` 0.3 → 0). Ramps back down over 200 ms when the cone leaves.

### Why it's worth doing

It makes the lens metaphor physical. Right now the phone is a magic camera that *secretly* knows what it sees. With a flashlight, the room *visibly* responds to where the phone is pointed. This becomes the canonical "you point, the room reacts" feel — which is exactly the Pass / Bind verb experience.

### Acceptance

☐ Select the phone → soft warm cone appears from the lens.
☐ Aim the cone at a marker → the marker brightens slightly.
☐ Aim away → marker fades back to normal over ~200 ms.
☐ Deselect the phone → cone disappears (unless a marker is acquired).
☐ Cone does not appear in the phone's own POV (anti-pattern #7).

---

## Module additions

```
src/phone-lens.js               flesh out (was stub)
src/projector-output.js         NEW — beam canvas + SpotLight.map setup
src/whiteboard-draw.js          NEW — pointer→UV→canvas drawing logic
src/beam.js                     NEW — pure beam-path computation (shared by 3D + 2D)
```

The beam computation is pure data → both `projector-output.js` (3D) and `view2d.js` (2D) consume it. Don't duplicate the math.

---

## Bonuses (only if everything ships and there's time)

### B1. Stroke detection in camera POV

Each camera has a CameraHelper. Add a "stroke recognition" stub that looks for whiteboard strokes in the camera's view and posts a synthetic `whiteboard.stroke.detected` event. For Phase 3 this is just a pass-through (we already know the strokes from `board.stroke.add`); the value is showing the wiring so Phase 5's reveal overlay can highlight detected strokes.

### B2. Multi-pen on whiteboard tray

Make the existing tray pens (black, red, blue, green) draggable. Drag a pen onto the whiteboard surface = active marker color is the pen's color. Drag the pen back to the tray = marker tool becomes inactive. This is a more direct mapping than the toolbar toggle.

### B3. Eraser

A second "pen" that's actually a small eraser texture. Same drag mechanic, but draws cream-colored strokes on top.

---

## What's NOT in Phase 3

- People + IK. Phase 4.
- Pose detection. Phase 4.
- Reveal overlay. Phase 5.
- Snapshot save/restore. Bonus, deferred.
- Calibration UI changes. Phase 2 owned that.

---

## Acceptance — Phase 3 (top level)

☐ All Phase 1, 1b, 1c, 2 acceptance criteria still pass.
☐ `npm run preflight` passes.
☐ Phone lens shows live POV on the screen mesh and in the right-rail panel.
☐ Phone aim → `phone.target` POST after 250 ms hold.
☐ Beam visibly projected on the table; reflects through mirrors; halts on blockers.
☐ Whiteboard accepts strokes via the marker tool, posts `board.stroke.add`, strokes are visible in the wall camera POV.
☐ Phone-as-flashlight: selecting the phone reveals a cone that highlights what it's pointed at.
☐ 2D view continues to render correctly (beam, strokes, phone).
☐ No edits to `public/`, `data/`, `lib/`, or `scripts/`. `server.js` only if `board.stroke.add` needs verification (likely already supported — read first, edit only if needed).

## Hand-off checklist

☐ All Phase 3 acceptance checked.
☐ Comments in `phone-lens.js` reference anti-pattern #7.
☐ Comments in `projector-output.js` reference anti-pattern #4.
☐ Comments in `whiteboard-draw.js` note the orbit-disable while drawing.
☐ Beam math lives in one place (`src/beam.js`) and both renderers import from it.
