# Monday No-Hardware Rehearsal

Use this before going into the classroom. It proves the same routes that Orbit, Gravity, Horizon, and student projects will use.

## One Terminal: Start The Room

```powershell
cd C:\Users\ithrel\Documents\GitHub\smart-objects-cameras\classroom-api
npm start
```

Open:

```text
http://localhost:4177/start.html
http://localhost:4177/cameras.html
http://localhost:4177/events.html
http://localhost:4177/report.html
```

## Second Terminal: Simulate The OAKs

```powershell
npm run simulate:oaks
```

Expected result:

```text
orbit: camera.state.updated, class.presence.changed, classifier.probe.changed, session.mode.changed
gravity: camera.state.updated, class.presence.changed, attention.fatigue.changed, attention.direction.changed
horizon: camera.state.updated, classifier.probe.changed, session.mode.changed, whiteboard.changed
command -> orbit: camera.mode.requested vjepa
command -> gravity: camera.capture.requested gaze
project smart-stage -> horizon: fiducial.request
OAK rehearsal ok
```

## What To Check In The Browser

- `/cameras.html` shows Orbit, Gravity, and Horizon as seen.
- `/events.html` shows `class.presence.changed`, `classifier.probe.changed`, `whiteboard.changed`, and `camera.*.requested`.
- `/report.html` still shows project readiness.

## Optional: Simulate AprilTags

```powershell
npm run simulate:detections
```

This tests the table calibration and fiducial ingestion path.

## Optional: Run The Full Local Suite

```powershell
npm run check
npm run test:events
npm run test:calibration
```

For server-backed checks, start `npm start` first, then run:

```powershell
npm run preflight
npm run test:readiness
npm run test:projects
npm run test:featured-scenarios
```

## Monday Hardware Swap

Replace `npm run simulate:oaks` with the real OAK scripts:

```bash
export CLASSROOM_API_URL=http://ROOM_PC_IP:4177
export SMART_ROOM_URL=http://ROOM_PC_IP:4177

python3 person_detector.py
python scripts/oak-command-agent.py --camera orbit
```

The room server should see the same `/push/state` shape and send the same `camera.*.requested` command events.
