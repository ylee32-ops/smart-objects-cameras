# Board Medium Plan

## Purpose

Turn the whiteboard wall into the main runtime surface for the room:

- one projector
- one primary whiteboard surface
- camera perception aimed at the board
- tags, stickies, markers, drawings, and hands as inputs
- projection, character output, and robot actions as outputs

This replaces the weaker table-first demo story with a cleaner board-first system.

## Core Rule

Everything should reduce to:

```text
board perception -> board state -> board projection
```

Projects do not talk directly to each other. They read or write the shared board runtime.

## Inputs

- AprilTags
- colored markers
- handwriting / OCR text
- freehand strokes
- stickies / paper notes
- hand gestures
- presence / attention signals

## Outputs

- projected overlays
- scene / media changes
- 3D board objects
- digital erase
- character narration
- robot write / draw / erase requests

## Canonical Board State

```json
{
  "surface": "board",
  "scene": null,
  "focus": null,
  "texts": [],
  "strokes": [],
  "notes": [],
  "tags": [],
  "media": [],
  "objects3d": [],
  "gestures": [],
  "tools": []
}
```

## Event Families

### Perception

- `board.tag.detected`
- `board.stroke.added`
- `board.text.detected`
- `board.note.detected`
- `board.gesture.detected`
- `board.pointer.moved`

### Interpretation

- `board.zone.activated`
- `board.tool.selected`
- `board.scene.requested`
- `board.focus.changed`
- `board.object3d.requested`

### Runtime / Rendering

- `board.media.opened`
- `board.media.closed`
- `board.object3d.spawned`
- `board.object3d.transformed`
- `board.overlay.cleared`

### Character / Robot

- `character.prompt.requested`
- `audio.speak.requested`
- `board.robot.write.requested`
- `board.robot.draw.requested`
- `board.robot.erase.requested`

## Modes

1. `stage`
2. `focus`
3. `write`
4. `explore`
5. `check-understanding`
6. `character`
7. `safety-control`

Projects can strongly own one mode and lightly participate in others.

## Interaction Types

### Explicit

- drop a tag into a labeled zone
- write a keyword
- pin a sticky
- point at a region
- gesture to start/pause/clear
- pinch/scale/rotate a board object
- ask Gus or Tony for help

### Implicit

- dwell near a zone
- gaze / attention direction
- nodding or hesitation
- repeated circling / underlining
- clustered stickies
- board clutter level
- silence after a prompt

## Ownership

### Core

- calibration
- board geometry
- board state
- event transport
- shared project state

### Projects

- interpretation
- prompts
- overlays
- projected scenes
- hints
- guidance

## Transport

### Server -> Browser

- SSE `GET /api/events`
- snapshots via `GET /api/state`

### Browser / Device -> Server

- `POST /api/action`

### Client-side rule

Use direct page listeners only. No second client event framework.

## Near-Term Foundation Work

1. keep project packets aligned with real student submissions
2. keep one shared project-state endpoint
3. keep whiteboard-first mode metadata in packet data
4. add board-first scenarios before any large UI rewrite
5. let the CSS pass follow the data contracts, not lead them
