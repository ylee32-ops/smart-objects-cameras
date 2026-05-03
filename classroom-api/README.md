# Smart Classroom API

This folder is the current room runtime for the Smart Classroom demo. It owns the classroom bus, timeline, project contracts, mock events, OAK-D bridge, and readiness report.

It is the layer that lets us run the class demo even when hardware or student projects are incomplete:

- timeline/run-of-show cues
- student project roster and contract packets
- project heartbeats and mock events
- OAK-D / detector state pushes
- SSE event streams for listeners
- readiness report and event evidence for critique

## Start Here

```powershell
cd classroom-api
npm start
```

Open:

```text
http://localhost:4177
```

From another laptop or Raspberry Pi, replace `localhost` with the room computer IP:

```text
http://ROOM_PC_IP:4177
```

## Pages To Use In Class

| Page | Use |
| --- | --- |
| `/` | Main dashboard: live status, projects, recent events |
| `/timeline.html` | Run-of-show. Scrub, play, and manually emit class/project cues |
| `/projects.html` | All project packets and featured mock scenarios |
| `/project.html?id=smart-stage` | One project contract, controls, live mock, and prompt |
| `/heartbeat` | No-code student check-in page |
| `/report.html` | Readiness / critique evidence |
| `/events.html` | Live event stream and replay inspection |
| `/cameras.html` | OAK-D state, camera commands, and camera request events |
| `/projector.html` | Projector output |
| `/board.html` | Board state, notes, tags, and manual inputs |

## Student Project Loop

Each project only needs to prove one loop:

1. Send a heartbeat.
2. Listen for events it cares about.
3. Emit one event back.
4. Verify it appears in `/report.html` or `/events.html`.

The no-code fallback is:

```text
http://localhost:4177/heartbeat
```

Python fallback:

```powershell
cd classroom-api
$env:CLASSROOM_API="http://localhost:4177"
$env:PROJECT_ID="smart-stage"
$env:CAPABILITIES="board.scene.requested,session.timer.offered"
$env:CONSUMES="board.zone.activated,board.tag.detected,session.mode.changed"
$env:EMITS="board.scene.requested,session.timer.offered"
python student_heartbeat.py
```

Open each student's exact contract prompt:

```text
http://localhost:4177/api/projects/PROJECT_ID/contract.md
```

The roster and contract source lives in:

```text
public/project-packets.json
data/project-tags.json
```

To adapt this for a new class, update those two files first.

## Current Project Roster

| Project ID | Project | Student(s) |
| --- | --- | --- |
| `smart-stage` | Smart Stage | Gordon Cheng |
| `focus-beam` | Focus Beam | Feifey Wang |
| `forest-classroom` | Forest in the Classroom | Sophie Lee |
| `imprint` | Imprint | Darren Chia |
| `nodcheck` | NodCheck | Kathy Choi |
| `tony-ramon` | Tony the Bot | Ramon Naula |
| `tony-shuyang` | Tony the Bot (Emotion Layer) | Shuyang Tian |
| `grammar-coach` | English Communication Coach (Lumi) | Yuxuan Chen |
| `gesture-timer` | Timer | Phil Cote |
| `gus-mode` | Gus Mode / Virtual Gus | Juju Kim, Kathy Choi, Seren Kim |
| `seren-room` | A Room (Context-Aware Classroom) | Seren Kim |

## OAK-D / Detector Compatibility

Old detector workers can keep posting to the classroom API shape:

```text
POST http://localhost:4177/push/state
```

Example payload:

```json
{
  "camera_id": "orbit",
  "person_detected": true,
  "person_count": 12,
  "predicted_class": "presentation",
  "prediction_confidence": 0.88,
  "whiteboard_text_detected": true,
  "whiteboard_text": ["contracts", "room state"]
}
```

The server maps that into room events such as:

- `class.presence.changed`
- `classifier.probe.changed`
- `session.mode.changed`
- `whiteboard.changed`
- `attention.direction.changed`

Run the no-hardware OAK rehearsal:

```powershell
npm run simulate:oaks
```

## Mock The Whole Class

Keep all submitted student projects live with mock heartbeats and scenario events:

```powershell
npm run mock:projects
```

Use `/timeline.html` when you want the demo to follow the class schedule. Turn on **Emit while playing** to fire cues automatically, or press **Emit** on individual cues when something needs to be forced manually.

## API Surface

Compatibility endpoints kept for old scripts:

```text
GET  /health
GET  /state
GET  /mode
GET  /room/context
GET  /projects
GET  /projects/readiness
GET  /projects/{id}/packet.md
GET  /subscribe/events?subscriber_id=PROJECT_ID
POST /push/state
POST /projects/{id}/heartbeat
POST /projects/{id}/events
POST /phase
```

Current endpoints:

```text
GET  /api/state
GET  /api/projects
GET  /api/projects/readiness
GET  /api/projects/{id}/contract.md
GET  /api/events/recent
GET  /api/cameras
POST /api/projects/{id}/heartbeat
POST /api/projects/{id}/events
POST /api/cameras/{id}/command
POST /api/action
```

## Checks

Syntax and local data checks:

```powershell
npm run check
npm run test:projects
npm run test:readiness
npm run test:classroom-api-compat
```

Smoke checks need the server running:

```powershell
npm start
npm run test:smoke
```

Port `4177` is the new classroom API port. The old `8766` FastAPI service has been retired in this folder.
