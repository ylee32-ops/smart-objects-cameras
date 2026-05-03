# Student Integration Guide

Use this when finishing a student project against the room server.

## The Smallest Passing Loop

1. Open your project packet at `/projects.html`.
2. Open the contract prompt from the packet.
3. Build a mock-first script or page that:
   - sends a heartbeat
   - listens for room events
   - emits one contract event
   - prints what it receives and sends
4. Check `/report.html`.

The real hardware can replace the mock later. The event names should not change.

## API Base

```text
http://localhost:4177
```

Use the classroom machine LAN IP instead of `localhost` when running from a student laptop or Raspberry Pi.

## Heartbeat

```http
POST /api/projects/{project_id}/heartbeat
```

```json
{
  "status": "online",
  "capabilities": ["board.focus.changed"],
  "consumes": ["board.pointer.moved"],
  "emits": ["board.focus.changed"],
  "message": "mock path running"
}
```

## Listen

Browser or Python SSE clients can use the compatibility stream:

```text
GET /subscribe/events?subscriber_id={project_id}
```

The current room stream is also available:

```text
GET /api/events
```

Room context is useful when a project needs current board state:

```text
GET /room/context
```

For projected attention, read `task.focus` for the latest focus target or `task.focuses[]` for multiple active focus nodes.

## Emit Evidence

```http
POST /api/projects/{project_id}/events
```

```json
{
  "event_type": "board.focus.changed",
  "payload": {
    "mock": true,
    "target": "board-center"
  }
}
```

## Prompt Pattern

Each project contract page includes a prompt. Use it as the source of truth.

```text
Open /api/projects/{project_id}/contract.md.
Paste the "Prompt Against This Contract" block into Codex or Claude.
Ask for the smallest mock-first integration.
Run it.
Open /report.html to verify heartbeat and event evidence.
```

## Readiness Score

- 1/5: project exists in the room roster
- 2/5: project has a clear consume/emit contract
- 3/5: heartbeat plus at least one emitted event
- 4/5: contract plus heartbeat plus event
- 5/5: live heartbeat plus contract plus event

Minimum useful evidence is 3/5. Full critique evidence is 5/5.
