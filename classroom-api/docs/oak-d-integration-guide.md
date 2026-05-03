# OAK-D And V-JEPA Integration Guide

This project keeps the useful parts of `smart-objects-cameras` while moving the room runtime to the simpler Node server.

## What We Can Reuse

| Previous work | Existing files | New room event |
| --- | --- | --- |
| Person detection | `person_detector.py`, `webcam/webcam_person_detector.py` | `class.presence.changed` |
| Fatigue detection | `fatigue_detector.py`, face landmark helpers | `attention.fatigue.changed` |
| Gaze/head pose | `gaze_detector.py`, `utils/host_concatenate_head_pose.py` | `attention.direction.changed` |
| Whiteboard OCR | `whiteboard_reader.py`, `whiteboard_reader_full.py` | `whiteboard.changed` |
| V-JEPA room probe | `v-jepa/probe_inference.py` | `classifier.probe.changed`, then `session.mode.changed` |
| Skeleton/pose tests | `pc-testing/test_skeleton_depth*.py`, `test_skeleton_hands_depth.py` | `gesture.pose.changed` |
| AprilTag/object tracking | current `scripts/apriltag-detector.py` and old fiducial work | `fiducial.detected` |

## Compatibility Endpoint

Old camera workers already post to:

```text
POST /push/state
```

The new server accepts that shape directly. `/api/push/state` also works.

Example from the old person detector:

```json
{
  "camera_id": "orbit",
  "person_detected": true,
  "person_count": 12,
  "detector_host": "orbit",
  "detector_user": "student"
}
```

Example from V-JEPA probe inference:

```json
{
  "camera_id": "orbit",
  "predicted_class": "presentation",
  "prediction_confidence": 0.88,
  "class_probs": {
    "presentation": 0.88,
    "discussion": 0.08,
    "empty": 0.04
  }
}
```

## Canonical Mapping

The new server does not keep old snake_case bus events as primary events. It maps detector state into dotted room events:

| Incoming field | Emitted event | Why |
| --- | --- | --- |
| `person_count`, `person_detected` | `class.presence.changed` | shared occupancy signal |
| `predicted_class`, `prediction_confidence`, `class_probs` | `classifier.probe.changed` | slow room-context classification |
| computed room mode from camera states | `session.mode.changed` | room-level mode signal |
| `fatigue_detected`, `fatigue_percent` | `attention.fatigue.changed` | privacy-sensitive attention signal |
| `whiteboard_text_detected`, `whiteboard_text` | `whiteboard.changed` | board semantic state |
| `gaze_direction`, `gaze_x/y/z` | `attention.direction.changed` | focus/attention direction |
| `anomaly_level`, `anomaly_score` | `safety.anomaly.changed` | safety/debug signal |
| `pose`, `poses`, `skeletons`, `keypoints` | `gesture.pose.changed` | skeleton and body-pose input |

## How To Tap The Cameras

1. Start the room server:

```powershell
npm start
```

2. On the OAK-D/Pi side, point old workers at the new room server:

```bash
export CLASSROOM_API_URL=http://ROOM_PC_IP:4177
export CLASSROOM_API_KEY=testkey
python3 person_detector.py
```

3. For V-JEPA:

```bash
export CLASSROOM_API_URL=http://ROOM_PC_IP:4177
python3 v-jepa/probe_inference.py --server http://GPU_PC_IP:8765 --probe ~/oak-projects/classroom_probe.pt
```

4. Open:

```text
http://localhost:4177/events.html
http://localhost:4177/report.html
http://localhost:4177/room/context
```

## Sending Commands Back To Cameras

Room-side command endpoints:

```text
GET  /api/cameras
POST /api/cameras/{camera_id}/command
POST /api/projects/{project_id}/camera-request
```

Open the command UI:

```text
http://localhost:4177/cameras.html
```

Send a direct command:

```bash
curl -X POST http://ROOM_PC_IP:4177/api/cameras/orbit/command \
  -H "Content-Type: application/json" \
  -d '{"command":"set-mode","mode":"vjepa","reason":"Smart Stage requested room-mode classification"}'
```

Send a request from a student project:

```bash
curl -X POST http://ROOM_PC_IP:4177/api/projects/smart-stage/camera-request \
  -H "Content-Type: application/json" \
  -d '{"cameraId":"horizon","command":"fiducial","mode":"fiducial","reason":"stage setup needs board tags"}'
```

These become directed SSE events:

- `camera.mode.requested`
- `camera.capture.requested`
- `camera.command.requested`
- `fiducial.request`

An OAK system receives them by subscribing as its camera ID:

```text
GET /subscribe/events?subscriber_id=orbit
GET /subscribe/events?subscriber_id=gravity
GET /subscribe/events?subscriber_id=horizon
```

Run the lightweight command agent on each Pi:

```bash
export SMART_ROOM_URL=http://ROOM_PC_IP:4177
export CAMERA_ID=orbit
python scripts/oak-command-agent.py --camera orbit
```

The command agent writes the latest directed command to:

```text
~/oak-projects/room_command.json
```

Detector supervisors can read that file and decide which worker to run:

- `person` -> `person_detector.py`
- `vjepa` -> `v-jepa/probe_inference.py`
- `gaze` -> `gaze_detector.py`
- `fatigue` -> `fatigue_detector.py`
- `whiteboard` -> `whiteboard_reader_full.py`
- `fiducial` -> AprilTag/fiducial worker
- `idle` -> stop active detector

For now this is intentionally a command contract, not a process manager. It avoids killing camera processes unexpectedly while still giving the room a clean control path.

## Full System Run Order

1. Start the room server on the room PC:

```powershell
cd C:\Users\ithrel\Documents\GitHub\smart-objects-cameras\classroom-api
npm start
```

2. Find the room PC LAN IP:

```powershell
ipconfig
```

3. On each OAK/Pi, run a detector or V-JEPA worker with the new room URL:

```bash
export CLASSROOM_API_URL=http://ROOM_PC_IP:4177
export CLASSROOM_API_KEY=testkey
python3 person_detector.py
```

4. On each OAK/Pi, run the command agent in a second terminal:

```bash
export SMART_ROOM_URL=http://ROOM_PC_IP:4177
python scripts/oak-command-agent.py --camera orbit
```

5. Open these on the room PC:

```text
http://localhost:4177/start.html
http://localhost:4177/cameras.html
http://localhost:4177/events.html
http://localhost:4177/report.html
```

6. Verify:

```text
/api/cameras shows orbit/gravity/horizon as seen after their first /push/state
/events.html shows class.presence.changed or classifier.probe.changed
/cameras.html can send camera.mode.requested to a subscribed camera
~/oak-projects/room_command.json updates on the target Pi
```

## Pedagogical Rule

Use camera models as observation workers, not project owners.

Good:

```text
OAK-D -> /push/state -> classifier.probe.changed -> student project reacts
```

Avoid:

```text
OAK-D script directly controls projector, lights, or student project UI
```

This preserves the previous work while keeping student projects contract-first and mockable.
