# Phase 2 brief

**Calibration + perception realism.** This is the phase that turns the virtual room from "ground-truth toy" into "tool that exercises the real perception pipeline." After Phase 2 lands, swapping to real cameras becomes physical placement + clicking four corners — nothing else.

Read first:
- `phase-1-brief.md`, `phase-1b-brief.md`, `phase-1c-brief.md` — what Phase 2 builds on.
- `contract-map.md` "Calibration" section — exact action shapes.
- `docs/apriltag-and-calibration.md` — server's calibration model.
- `docs/sim-conventions.md` "Calibration plan" section.
- `anti-patterns.md` (no new ones; but #3 still applies — `{x, y}` everywhere).

## Scope

1. **Camera-space detections.** Add `sourceSpace: 'camera'` mode. Sim emits pixel coords and corners, server runs the homography, marker should land at the same place as in surface mode.
2. **Calibration UI.** Click each of the four corner tags in a camera POV, hit Solve, see the reprojection error.
3. **Auto-calibrate from sim.** One button that fills the four samples programmatically using the sim's known truth.
4. **Reprojection error display.** Per-camera, per-surface, in the inspector.
5. **Replay** (the surprise) — pull events from `/api/replay` into the virtual room and watch a recorded session play back from any camera angle.

If 1-5 ship cleanly with time to spare, take from the **bonuses** at the end. Don't pre-build Phase 3.

---

## 1. Camera-space detections

Extend `detections.js` to support both source spaces:

```js
pipeline.setSourceSpace('surface' | 'camera');
```

When `'camera'`:
- For each marker, project center to camera-space pixels (`detections.js` already has this from Phase 1).
- Project the four marker corners (use marker's `userData.bounds` × the marker's world rotation).
- Emit `{ tagId, center: {x,y}, corners: [...], angle, confidence }` in pixel coordinates of the camera's resolution (`1280 × 960` is fine; expose as a constant).
- Source field stays `"virtual-room"`. Throttle stays ≤ 12 Hz.

When `'surface'`:
- Existing Phase 1b behavior.

UI: replace the "Stream" toggle with a small group:
```
[ STREAM ]    [ surface · truth | camera · pixels ]
```
Active variant gets the amber highlight. Document this in the UI spec at the top of `app.js`.

### Acceptance

☐ Default mode: `surface · truth`. Behavior matches Phase 1b exactly.
☐ Switch to `camera · pixels`. **Without** a calibration solved, server should reject (or silently drop) detections — verify the marker stops moving in `public/projector.html`. Don't crash.
☐ After solving calibration (next section), `camera · pixels` mode works: marker positions in `public/projector.html` are within ±2 px of `surface` mode positions.

---

## 2. Calibration UI

A new right-rail panel: **Calibration**. One row per (camera × surface) pair:

```
Calibration
─────────────────────────────────────
Overhead · table        not solved   [ Sample ]
Overhead · board        n/a (no fov coverage)
Wall     · table        not solved   [ Sample ]
Wall     · board        not solved   [ Sample ]
─────────────────────────────────────
                                    [ Auto-calibrate (sim) ]
```

When you press `[ Sample ]`:

1. The matching camera becomes the active POV.
2. Coverage overlay turns ON automatically (so you can see what the camera sees).
3. The four calibration tags for that surface (IDs 0–3 for table, 4–7 for board) are marked in the POV with crosshair indicators.
4. Click each indicator in order (0 → 1 → 2 → 3).
5. Each click POSTs `calibration.sample.add` with:
   ```js
   {
     surface: 'table',
     tagId: 0,
     camera: { x: clickPixelX, y: clickPixelY },
     surfacePoint: { x: 0, y: 0 }   // from data/tag-map.json
   }
   ```
6. After the fourth click, POST `calibration.solve` for `{ surface: 'table', sourceSpace: 'camera' }`.
7. Show the reprojection error returned by the server (or fetched via `getCalibration()`).

Visual feedback: each clicked indicator turns from outline to filled amber. After Solve, the row updates from `not solved` to `0.42 px rms` (or whatever the server reports). Color the value:
- Green-ish (`var(--ink)`) if rms < 1 px
- Amber (`var(--amber)`) if 1–3 px
- Coral (`var(--coral)`) if > 3 px or solve failed

Cancel a sampling session with Esc. Re-running Sample on a row clears the previous samples for that pair.

### Acceptance

☐ Sample button highlights the four corner tags in the POV.
☐ Clicking the four corners in order POSTs four `calibration.sample.add` actions, then one `calibration.solve`.
☐ The status row updates with the reprojection error.
☐ Subsequent `camera · pixels` detections produce marker positions in `public/projector.html` that match `surface` mode within tolerance.

---

## 3. Auto-calibrate from sim

A single `[ Auto-calibrate (sim) ]` button at the bottom of the Calibration panel.

What it does, for each (camera × surface) pair where the camera can see all four corner tags:

1. Project each corner tag's known world position into camera-space pixels (the sim knows truth — no clicking needed).
2. POST four `calibration.sample.add` actions with those projected pixel coords.
3. POST one `calibration.solve`.
4. Refresh all rows with new errors.

This is the dry-run path: sim → server → server's calibration math → back. If the sim's projection is correct AND the server's homography solver is correct, the resulting reprojection error should be near-zero (sub-pixel). Any deviation is a clue.

### Acceptance

☐ Click Auto-calibrate (sim). All visible (camera × surface) pairs solve.
☐ Reprojection errors are < 0.5 px for sim cameras.
☐ Server `/api/calibration` returns the homographies and matches what the sim projects.

This button is the fastest way to verify that the server's calibration code path is healthy before any human starts clicking corners on real footage.

---

## 4. Reprojection error display

Already covered in section 2 (per-row). Also surface it in the inspector when a camera is selected:

```
CAMERA · OVERHEAD
─────────────────
POS    1.10 · 2.70 · 1.10 m
ROT    -45° y
FOV    [—————•———] 60°
─────────
TABLE  0.42 px ✓
BOARD  n/a
```

That's it — no new acceptance, just visual feedback.

---

## 5. Replay (the surprise)

The server already records every event to `.local/event-log.jsonl` and exposes it via `GET /api/replay`. Phase 2 adds the ability to **load that log into the virtual room and watch the session play out from any camera angle.**

This is the killer feature for calibration iteration: you record a real session (or a sim session), then change calibration parameters and replay the same input to see how the marker positions change. No need to re-do manual moves.

It also bridges sim and real — a recording from the real detector can be inspected in the virtual room from camera angles you didn't have during recording.

### UI

A new panel: **Replay**.

```
Replay
─────────────────────────────────────
Source:  [ live ▾ ]                    ← dropdown: live / file / paste
                                       ← when 'file': file picker
                                       ← when 'paste': textarea for JSONL
[●] play   [⏸] pause   [⏪]   [⏩]
████████████░░░░░░░░░░░░░░░░░░░░░░░    ← scrubber
00:42 / 02:15
speed: [ 1× ▾ ]   loop: [ ]
```

### Behavior

Pulling a session:
- `Source: live` → fetch `/api/replay` once, get the JSONL event stream so far.
- `Source: file` → user uploads a `.jsonl` file from disk.
- `Source: paste` → user pastes JSONL into a textarea.

Parse the events. Filter to ones the virtual room can re-create:
- `fiducial.detections.ingest` → for each detection, position the matching marker on the table (creating it if it doesn't exist; removing it if absent in subsequent events for >1 s).
- `light.object.placed`, `light.object.moved` (if present in the log).
- Other event types are recorded in a transcript pane but don't drive geometry.

While replaying:
- Stream is automatically OFF (we're not posting; we're consuming).
- `[●] play` advances events by their original timestamps × speed.
- `[⏸]` halts.
- `⏪` / `⏩` jump 5 s.
- Scrubber drags to any point in the timeline; geometry snaps to the state at that point.
- Loop checkbox restarts at the end.

Keep it functional — no fancy timeline UI yet. A simple horizontal track with current position is enough.

### Why this matters

Three immediate uses:

1. **Calibration A/B**: solve calibration version A, replay a session, screenshot. Solve version B, replay same session, screenshot. Compare.
2. **Bug isolation**: a real session produced weird marker jumps — replay it in the sim to see if the sim reproduces, narrowing whether the bug is in detection or in server logic.
3. **Demo rehearsal**: record a clean run, hand the log to anyone — they can see the demo at any angle without rerunning hardware.

### Acceptance

☐ Replay panel visible in the rail.
☐ Source `live`: pulls `/api/replay` and parses successfully.
☐ Press play: markers move to match the recorded events at original timing.
☐ Speed `2×`: events play at half the original interval.
☐ Scrubber: drag to a midpoint; geometry instantly reflects state at that timestamp.
☐ Loop: at end, restarts.
☐ Stream toggle is forced OFF while replay is playing (and re-enabled when stopped — only if it was on before). Display a small "REPLAY" badge over the Stream toggle.
☐ Replay works in both 2D and 3D modes (it just moves markers; both views render them).

---

## Module additions

```
src/calibration.js     calibration UI logic + sample collection state machine
src/replay.js          parse JSONL, scheduler, playback engine
src/widgets/scrubber.js   simple timeline scrubber widget
```

`detections.js` extends to support `setSourceSpace('camera')`.
`server-client.js` gains `getReplay()` (already proposed in Phase 1, may already exist).
`app.js` wires the new panels.

No new dependencies. No edits to `public/`, `data/`, `lib/`, or `scripts/`. `server.js` already returns `/api/replay` — no change needed there either.

---

## Bonuses (only if everything above ships)

In rough priority order. Pick one or two; don't try them all.

### B1. Time-of-day lighting

A small slider in the header: `[ ☀ —•—— 🌙 ]`. Drives:
- `sunlight.position.x` (sweeps from `-6` morning to `+6` evening through the clerestory window angle).
- `sunlight.color` (warm `0xfff1cc` at noon, cooler `0xc8d8e8` at edges).
- `sunlight.intensity` (dimmer at edges).

Three preset buttons: `morning · noon · evening`. Plus a `night` preset that drops sunlight to 0 and bumps the projector intensity to compensate.

Why: real classrooms have real windows. Detection robustness changes with lighting. Worth seeing.

### B2. Marker jitter / dropout

A tiny "Realism" panel:
- Position jitter: `0–5 px` slider — adds Gaussian noise to camera-space `center` and `corners` per frame.
- Confidence floor: `0.5–1.0` slider — drops detections below this confidence randomly per frame.
- Dropout rate: `0–20%` slider — % chance per frame to omit a detection entirely.

This is what real cameras do. The room should already handle it; this lets us prove that.

### B3. Layout snapshots

Save / restore named scene states. Right-rail row: `[ Save ] [ Demo A ▾ ] [ Load ]`. Stores marker positions, camera positions, projector positions, whiteboard position to `localStorage` under `virtualroom.layouts.{name}`. Useful for switching between rehearsal scenarios fast.

### B4. Camera comparison mode

Split the POV panel in half showing two cameras side-by-side. Useful for evaluating overlap regions when placing a second camera.

### B5. Network latency simulator

A `latency: 0–500 ms` knob in the dev panel. Adds artificial delay to each POST. Tests how the room behaves under bad WiFi.

---

## What's NOT in Phase 2

These belong to later phases. Don't anticipate them in module shape — keep boundaries minimal.

- **Phone lens** (Phase 3): render phone POV onto phone screen mesh, lens overlay UI, `phone.target` POSTs.
- **Beam projection on table** (Phase 3 visual): `SpotLight.map` projection of the beam path. Phase 1c's coverage overlay is a different layer.
- **Drawable whiteboard** (Phase 3): draw on the board with a virtual marker, see strokes appear.
- **People + IK** (Phase 4): lo-fi humans, hand-follows-marker, the CCDIKSolver path. Maybe a robot arm option.
- **Reveal overlay** (Phase 5): the elegant in-room debug projection.
- **Pose-from-camera** (Phase 4): synthetic pose detection on the people for testing the full perception pipeline.

If the agent finds itself touching any of these to do Phase 2 work, stop and check in.

---

## Acceptance — Phase 2 (top level)

☐ All 1a, 1b, 1c acceptance criteria still pass.
☐ `npm run preflight` passes.
☐ `npm run simulate:detections` still works.
☐ `camera · pixels` mode works end-to-end: solve calibration → drag marker in sim → marker moves in `public/projector.html`.
☐ Auto-calibrate (sim) produces sub-pixel reprojection errors.
☐ Replay can ingest `/api/replay` and play back a recorded session in either 2D or 3D mode.
☐ No edits to `public/`, `data/`, `lib/`, or `scripts/`.

---

## Hand-off checklist

☐ All Phase 2 acceptance criteria checked.
☐ Inspector shows reprojection error on camera select.
☐ Replay forces Stream OFF while playing; restores prior state on stop.
☐ Comments in `calibration.js` reference `contract-map.md` for the action shapes.
☐ Comments in `replay.js` document the JSONL parsing format and what fields are honored.
☐ Bonus features used (if any) are flagged at the top of their file.
