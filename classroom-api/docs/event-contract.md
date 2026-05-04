# Event Contract

The room uses one simple event shape across server, replay, SSE, class-object simulation, cameras, projector, board, and future voice/Flowstate integrations.

## Transport

Client to server:

```text
POST /api/action
```

Server to clients:

```text
GET /api/events
```

Replay:

```text
GET /api/replay?limit=160
```

Recent in-memory events:

```text
GET /api/events/recent?limit=80
```

Both replay and recent accept simple filters:

```text
?type=sensor.light.changed
?category=sensor
?source=class-object-simulator
```

## Shape

```json
{
  "id": "evt-...",
  "event_type": "sensor.light.changed",
  "category": "sensor",
  "source": "class-object-simulator",
  "target": null,
  "salience": "broadcast",
  "created_at": "2026-04-22T00:00:00.000Z",
  "payload": {}
}
```

Required:

- `id`: string
- `event_type`: dotted lowercase string, e.g. `sensor.light.changed`
- `source`: string
- `created_at`: ISO timestamp
- `payload`: object

Server-normalized:

- `category`
- `salience`
- missing/invalid timestamp

## Categories

Known category prefixes:

| Prefix | Category |
| --- | --- |
| `fiducial.*`, `detection.*` | `detection` |
| `projection.*`, `slide.*` | `projection` |
| `sensor.*`, `presence.*`, `attention.*`, `gesture.*`, `camera.*`, `classifier.*` | `sensor` |
| `zone.*`, `rule.*` | `rule` |
| `safety.*` | `safety` |
| `character.*`, `user.*` | `character` |
| `whiteboard.*`, `surface.*`, `clipboard.*`, `phone.*` | `surface` |
| `light.*`, `room.*`, `debug.*`, `mode.*`, `participant.*` | `room` |
| `project.*` | `project` |

Unknown event types are allowed and categorized as `event` if they still match the required shape.

## Class Object Events

The class-object simulator emits events through:

```json
{
  "type": "event.manual",
  "source": "class-object-simulator",
  "payload": {
    "event_type": "sensor.light.changed",
    "payload": {
      "objectId": "ambient-light",
      "sourceProject": "smartobjects-labs-week2",
      "state": {}
    }
  }
}
```

No new backend contract is required for early student-project simulation.

## Student Project Evidence

The replacement for the old classroom API readiness layer is generated from project packets:

```text
GET  /api/projects/readiness
GET  /api/projects/{id}/contract.md
POST /api/projects/{id}/heartbeat
POST /api/projects/{id}/events
GET  /report.html
```

Each contract page gives students a promptable consume/emit boundary.

## OAK-D Compatibility

Existing camera workers can still post detector state to:

```text
POST /push/state
```

The server maps the old detector fields into canonical dotted events:

- `person_count` -> `class.presence.changed`
- `predicted_class` -> `classifier.probe.changed`
- computed camera room mode -> `session.mode.changed`
- `whiteboard_text_detected` -> `whiteboard.changed`
- `gaze_direction` -> `attention.direction.changed`
- `pose`, `skeletons`, or `keypoints` -> `gesture.pose.changed`

## Focus Nodes

The board can hold more than one active focus target. Use `room.focus` for the latest target and `room.focuses[]` for the full active list.

```json
{
  "type": "focus.set",
  "payload": {
    "id": "focus-a",
    "surface": "board",
    "x": 0.42,
    "y": 0.3,
    "label": "Key idea",
    "append": true
  }
}
```

`surface.focus.requested` and `surface.focus.started` keep the legacy top-level `x`, `y`, `surface`, and `label` fields, and also include `focus` plus `focuses` for multi-node consumers.

Clear one focus with `focus.clear` plus an `id`, or clear all focus nodes with `focus.clear` and an empty payload.

## Slide Controller Bridge

The virtual room Slide tag plus Action tag also emits a generic slide control event for external slide environments.

```json
{
  "event_type": "slide.control.requested",
  "source": "virtual-room",
  "payload": {
    "action": "next",
    "direction": 1,
    "target": "slide.current",
    "sourceSurface": "board",
    "controller": "virtual-room-slide-tag",
    "slideIndex": 2,
    "slideCount": 5
  }
}
```

Slide adapters should subscribe to `GET /api/events` or `GET /subscribe/events` and treat `action: "next"` / `"previous"` as the external deck command.

## Replay Robustness

Replay parsing must skip corrupt JSONL lines instead of failing the entire endpoint. This supports interrupted local runs and manual debugging.

## Tests

Run:

```powershell
npm run test:events
npm run preflight
```
