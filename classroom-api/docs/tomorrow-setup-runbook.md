# Tomorrow Physical Setup Runbook

Goal: prove the physical loop.

> Printed marker moves in camera view -> server transforms it through calibration -> projector output reacts.

## Bring / Prepare

- Laptop with this repo.
- Webcam.
- Projector or second monitor.
- Tape.
- Printed marker cards.
- Extension/power as needed.
- Phone on same WiFi for companion controls.

## Before Leaving Home

Run:

```powershell
npm run check
npm run test:calibration
.\scripts\start-room.ps1
npm run preflight
```

If Python is available:

```powershell
.\scripts\setup-detector.ps1
.\.venv-detector\Scripts\python.exe scripts\generate-apriltag-cards.py
```

Print:

```text
http://localhost:4177/generated-tags/cards.html
```

If official tag generation is blocked, print the layout mock as a visual placeholder only:

```text
http://localhost:4177/cards.html
```

## Room Setup Order

1. Start server:

   ```powershell
   .\scripts\start-room.ps1
   ```

2. Open projector output:

   ```text
   http://localhost:4177/projector.html?map=1
   ```

3. Put projector output on second display/projector and press `Fullscreen` or `F`.

   Keep the black background. The page is a projection-mapping output, not a dashboard. Use `M` to toggle the corner/grid map overlay and `S` only when you need temporary status text.

4. Open camera/operator page:

   ```text
   http://localhost:4177/camera.html
   ```

5. Place table corner tags:

   ```text
   0 top-left
   1 top-right
   2 bottom-right
   3 bottom-left
   ```

6. Place Light Lab markers:

   ```text
   10 emitter
   11 mirror
   12 filter
   13 splitter
   14 blocker
   15 target
   16 explain
   ```

## No-Camera Fallback

Run:

```powershell
npm run simulate:detections
```

This proves the server/calibration/ingestion path without the webcam.

## Real Camera Test

Run:

```powershell
.\scripts\run-detector.ps1 -Display
```

Expected:

- Detector window opens.
- Tag outlines appear over printed markers.
- `/projector.html` marker positions update.
- `GET /api/replay?limit=20` shows `fiducial.detected`.

## Calibration Test

Current real-calibration target:

- Table status becomes `calibrated`.
- Moving tag `11` moves `mirror-a`.
- Beam/rays recompute after marker movement.

Check:

```text
http://localhost:4177/api/calibration
http://localhost:4177/api/replay?limit=20
```

## Projector Pass

Do not solve perfect projection mapping first.

First goal:

- Projector window visible and fullscreen.
- Black projector output visible, with map overlay available from `M`.
- Board reaction visible.
- Markers are readable.
- Reveal mode can show calibration status.

Only after that:

- Tune scale/layout.
- Add projector-to-surface calibration.
- Add DMX light.

## Success Criteria

- Camera detects at least one printed marker.
- Server ingests real detection.
- Marker moves in room state.
- Projector output updates.
- Reveal mode explains calibration/tag state.

## Stop Server

```powershell
.\scripts\stop-room.ps1
```
