# Virtual Room Handoff

This handoff now points at the active modular sim, not the retired single-file sketch.

## Current Path

- Active app: `http://localhost:4177/ideas/virtualroom/`
- Active files:
  - `ideas/virtualroom/index.html`
  - `ideas/virtualroom/src/app.js`
  - `ideas/virtualroom/src/detections.js`
  - `ideas/virtualroom/src/server-client.js`
  - `ideas/virtualroom/src/calibration.js`
  - `ideas/virtualroom/src/replay.js`
- Reference-only prototype: `ideas/virtual-room.html`

Do not add new work to `ideas/virtual-room.html`. It still contains the old no-op hook and is kept only as design/reference material.

## What Already Works

- The sim loads from `/ideas/virtualroom/` through the existing server.
- Detection posts go through the real room contract via `POST /api/action`.
- `fiducial.detections.ingest` is already wired in `ideas/virtualroom/src/server-client.js`.
- The UI can switch between `surface` truth and `camera` pixels in `ideas/virtualroom/src/app.js`.
- Auto-calibration from the sim is available through the calibration panel.
- Replay loading is wired through `/api/replay`.
- Posted events identify themselves as source `virtual-room`.

## Remaining Follow-Up

- If we want detector-grade lost-tag behavior, add server-derived `fiducial.lost` expiry in `server.js`. Today the lost-tag story is still manual/simulated.
- Keep docs and setup references pointed at `/ideas/virtualroom/`, not `ideas/virtual-room.html`.
- Promote pieces into `public/` only after they prove stable as operator tooling.

## IA Consolidation Note

The virtual room should become the central operator surface because it already contains the 2D board view, 3D room preview, projector mapping, camera POV, detection stream, replay, and marker pad.

Keep these pages separate for now:
- `/projector.html` remains output-only for the physical projector. It should never become an operator dashboard.
- `/board.html` remains the direct board fallback for tomorrow's hardware test: draw, move board notes, manage focus, and control board tags.
- `/class-objects.html` remains an inspector for class-object state and scenario/mood controls until those controls are migrated into the virtual-room rail.

Consolidation path:
- Move the useful parts of `/board.html` into the virtual-room 2D view: board object controls, board tag list, focus/draw tools, and reset/clear controls.
- Move the useful parts of `/class-objects.html` into the virtual-room rail: object state, scenarios/moods, and project/scenario launch controls.
- Keep the server as the source of truth so board, virtual room, and projector stay interchangeable while the UI consolidates.
- Only retire the separate board/object pages after the virtual room passes the same smoke coverage and works during a real projector/camera test.

## Definition Of Done For Future Virtual-Room Work

1. The change lands under `ideas/virtualroom/`.
2. The room still uses the existing server contracts:
   - `GET /api/state`
   - `GET /api/config`
   - `GET /api/calibration`
   - `GET /api/replay`
   - `POST /api/action`
3. Detection payloads still match `fiducial.detections.ingest` exactly.
4. `npm run preflight` still passes with the server running.
5. The sim remains distinguishable from the real detector through `source: "virtual-room"`.

## Related References

- `ideas/virtualroom/README.md`
- `ideas/virtualroom/contract-map.md`
- `ideas/virtualroom/anti-patterns.md`
- `docs/apriltag-and-calibration.md`
