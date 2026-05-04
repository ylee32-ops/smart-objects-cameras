# Virtual Room Implementation Plan

## Principle

The virtual room should simulate the physical perception stack, not replace the real app.

It should answer:

```text
If the room had cameras here, markers here, and a projector here, what would the server receive?
```

## Phase 1: Server-Compatible Virtual Detections

Build a minimal virtual table scene:

- 2D or simple 3D table plane.
- Draggable marker cards using IDs from `data/room-config.json`.
- Virtual camera projection.
- Detection objects shaped exactly like the server expects.

Post:

```json
{
  "type": "fiducial.detections.ingest",
  "source": "virtual-room",
  "payload": {
    "surface": "table",
    "sourceSpace": "surface",
    "detections": [
      {
        "tagId": 11,
        "center": { "x": 0.42, "y": 0.50 },
        "angle": 0.4,
        "confidence": 0.96
      }
    ]
  }
}
```

Why `sourceSpace: surface` first:

- It avoids camera calibration complexity.
- It proves marker movement updates the live room server.
- It keeps the first version stable.

## Phase 2: Camera-Space Simulation

Add virtual camera pixel projection.

Post:

```json
{
  "type": "fiducial.detections.ingest",
  "source": "virtual-room",
  "payload": {
    "surface": "table",
    "sourceSpace": "camera",
    "detections": [
      {
        "tagId": 11,
        "center": { "x": 512, "y": 384 },
        "corners": [
          { "x": 480, "y": 360 },
          { "x": 544, "y": 362 },
          { "x": 542, "y": 420 },
          { "x": 482, "y": 418 }
        ],
        "angle": 0.4,
        "confidence": 0.96
      }
    ]
  }
}
```

Then use real server calibration:

- add virtual calibration corner samples,
- call `calibration.solve`,
- post camera-space detections,
- verify markers move in `/projector.html`.

## Phase 3: Phone Lens

Add a virtual phone camera.

Use it to simulate:

- phone looking at table marker,
- phone looking at board note,
- phone selecting target,
- phone controls scoped to target.

Post:

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

## Phase 4: Pointing And Intent Rays

Add simple human figures and hand/head rays.

Post future events:

```json
{
  "type": "event.manual",
  "source": "virtual-room",
  "payload": {
    "event_type": "intent.ray.estimated",
    "payload": {
      "actorId": "person-1",
      "rayType": "right_hand",
      "origin": { "x": 1.2, "y": 0.5, "z": 1.1 },
      "direction": { "x": -0.4, "y": 0.1, "z": -0.6 },
      "confidence": 0.78
    }
  }
}
```

Then add `intent.target.resolved` once the server supports storing target candidates.

## Phase 5: Reveal Overlay

The virtual room should be excellent for Reveal mode:

- camera frustums,
- projected rays,
- tag IDs,
- confidence,
- calibrated planes,
- server event stream,
- target candidates.

This can be more technical than `/projector.html` because it is an operator/simulator tool.

## Milestones

1. Virtual marker drag updates real `/api/state`.
2. Virtual detections appear in `/api/replay`.
3. Virtual camera calibration solves homography.
4. Virtual phone selects a real room target.
5. Virtual pointing ray resolves a real room target.

