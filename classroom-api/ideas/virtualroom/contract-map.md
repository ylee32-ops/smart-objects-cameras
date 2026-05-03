# Virtual Room Contract Map

This maps virtual-room concepts to existing room-server contracts.

## Markers

Virtual object:

```js
{
  tagId: 11,
  role: "mirror",
  surfacePosition: { x: 0.42, y: 0.5 },
  angle: 0.4
}
```

Server action:

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
        "center": { "x": 0.42, "y": 0.5 },
        "angle": 0.4,
        "confidence": 0.96
      }
    ]
  }
}
```

## Calibration

Virtual calibration sample:

```json
{
  "type": "calibration.sample.add",
  "source": "virtual-room",
  "payload": {
    "surface": "table",
    "tagId": 0,
    "camera": { "x": 100, "y": 100 },
    "surfacePoint": { "x": 0, "y": 0 }
  }
}
```

Solve:

```json
{
  "type": "calibration.solve",
  "source": "virtual-room",
  "payload": {
    "surface": "table",
    "sourceSpace": "camera"
  }
}
```

## Phone Targeting

```json
{
  "type": "phone.target",
  "source": "virtual-room",
  "payload": {
    "mode": "ar",
    "target": {
      "id": "target",
      "kind": "object",
      "label": "Target",
      "surface": "table"
    }
  }
}
```

## Board Notes

Create:

```json
{
  "type": "board.object.create",
  "source": "virtual-room",
  "payload": {
    "kind": "sticky",
    "label": "Question",
    "text": "Why did the beam bend?",
    "x": 0.42,
    "y": 0.31,
    "color": "#facc15"
  }
}
```

Move:

```json
{
  "type": "board.object.move",
  "source": "virtual-room",
  "payload": {
    "id": "note-welcome",
    "x": 0.5,
    "y": 0.4
  }
}
```

## Future Intent

Estimated ray:

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

Resolved target:

```json
{
  "type": "event.manual",
  "source": "virtual-room",
  "payload": {
    "event_type": "intent.target.resolved",
    "payload": {
      "actorId": "person-1",
      "intent": "pointing",
      "targetId": "mirror-a",
      "targetType": "object",
      "confidence": 0.82
    }
  }
}
```

