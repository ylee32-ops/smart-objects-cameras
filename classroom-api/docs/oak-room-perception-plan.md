# OAK-D Room Perception And Intent Plan

This plan prepares a future layer of the smart classroom system: using one or more OAK-D cameras to understand where people, phones, hands, and objects are in the room, then resolve likely interaction targets.

We are not testing the OAK-D cameras in this repo yet. This document defines the architecture and fallback plan so this labs repo can prepare clean interfaces now, and later integrate working code from:

```text
C:\Users\ithrel\Documents\GitHub\smart-objects-cameras
```

## Core Thesis

The room should not just detect objects. It should resolve intent:

```text
person + hand/phone/head direction + known surfaces + room context -> target candidate
```

Example output:

```json
{
  "event_type": "intent.target.resolved",
  "source": "oak-room-perception",
  "payload": {
    "actorId": "person-1",
    "intent": "pointing",
    "targetId": "board.note-3",
    "targetType": "object",
    "surface": "board",
    "confidence": 0.82,
    "evidence": ["right_hand_ray", "head_pose", "camera_2_depth"]
  }
}
```

## Fallback Ladder

| Tier | Input | What It Can Do | Good Enough For |
| --- | --- | --- | --- |
| 0. Manual/mock | Browser simulator, phone target selection | Emit target events by hand | UI, demos, rehearsals |
| 1. RGB webcam | 2D pose/hand/AprilTag detection | Surface-relative pointing and marker tracking | Single-table demo |
| 2. Single OAK-D | RGB + stereo depth | 3D person/object/hand positions from one view | Table/board target inference |
| 3. Multi OAK-D triangle | Multiple OAK-D cameras in shared room coordinates | Room-level tracking, occlusion recovery, target consensus | Pointing/attention |
| 4. V-JEPA mode probe | 3-second room clips | Slow context: lecture, group work, empty, discussion | Orchestrator context |
| 5. Custom object learning | User-labeled photos and object snapshots | Named objects beyond tags | Personalized room memory |

The contract should work with Tier 0 first. Hardware upgrades should improve confidence, not change the event model.

## Why Not YOLO Alone?

YOLO answers:

```text
what objects are in this frame?
```

The room needs:

```text
what is the user trying to interact with?
```

That requires fusing object detection, hand pose, head direction, phone targeting, known calibrated surfaces, and room context. YOLO is one worker, not the full intent system.

## Sensor Roles

| Sensor / Model | Role |
| --- | --- |
| AprilTags | Stable identity, calibration, known object pose |
| OAK-D stereo depth | 3D position for people, hands, objects |
| YOLO / object detector | Common object classes and people |
| Pose / hand tracking | Explicit gesture and pointing rays |
| Head pose / gaze estimate | Implicit attention cue |
| Phone companion | Explicit target selection and lens mode |
| V-JEPA probe | Slow room mode classification |
| User-labeled photos | Custom object recognition and room memory |

## Room Coordinate Frame

The target architecture is one shared coordinate system:

```text
room.world
  table.plane
  board.plane
  projector.output
  oak.front
  oak.left
  oak.right
  phone.target
```

MVP shortcut:

- Use table/board homographies first.
- Treat each OAK as a 2.5D sensor.
- Add full 3D camera extrinsics later.

## Intent Pipeline

1. Perception workers emit observations:

```text
fiducial.detected
person.pose.detected
hand.pose.detected
phone.target.selected
head.pose.detected
room.mode.classified
```

2. The room server transforms them into shared coordinates.
3. Intent resolver creates candidate rays: hand, head/gaze, phone lens, body orientation.
4. Resolver raycasts against table, board, known object bounds, sticky notes, projected cards, slide elements, and Light Lab markers.
5. Resolver ranks candidates by evidence, context, recency, and ambiguity.
6. It emits a best target plus alternatives.

## Event Contracts

### Person Pose

```json
{
  "event_type": "person.pose.detected",
  "source": "oak-front",
  "payload": {
    "personId": "person-1",
    "cameraId": "oak-front",
    "roomPosition": { "x": 1.2, "y": 0.4, "z": 0.0 },
    "keypoints": {
      "right_wrist": { "x": 1.4, "y": 0.5, "z": 1.1, "confidence": 0.88 },
      "right_elbow": { "x": 1.2, "y": 0.5, "z": 1.0, "confidence": 0.84 }
    },
    "confidence": 0.86
  }
}
```

### Pointing Ray

```json
{
  "event_type": "intent.ray.estimated",
  "source": "intent-resolver",
  "payload": {
    "actorId": "person-1",
    "rayType": "right_hand",
    "origin": { "x": 1.4, "y": 0.5, "z": 1.1 },
    "direction": { "x": 0.7, "y": -0.1, "z": 0.2 },
    "confidence": 0.74
  }
}
```

### Resolved Target

```json
{
  "event_type": "intent.target.resolved",
  "source": "intent-resolver",
  "payload": {
    "actorId": "person-1",
    "intent": "pointing",
    "targetId": "board",
    "targetType": "surface",
    "surfacePoint": { "x": 0.48, "y": 0.31 },
    "confidence": 0.82,
    "alternatives": [
      { "targetId": "note-welcome", "confidence": 0.61 }
    ],
    "evidence": ["right_hand_ray", "head_pose"]
  }
}
```

### Room Mode From V-JEPA

```json
{
  "event_type": "room.mode.classified",
  "source": "vjepa-room-probe",
  "payload": {
    "mode": "group_work",
    "confidence": 0.87,
    "windowSec": 3,
    "cameraIds": ["oak-front", "oak-left"]
  }
}
```

## Phone Lens Interaction

Phone lens should be an explicit intent source.

MVP:

- phone selects `targetId`,
- phone sends `phone.target.selected`,
- server routes controls for that target.

Next:

- phone camera scans a tag,
- tag maps to object/surface,
- phone shows object-specific controls.

Later:

- estimate phone pose from tag corners,
- cast a phone lens ray into the room,
- fuse phone ray with hand/head cues.

## Object Learning Path

Do not start with full custom model training.

Start with active labeling:

1. User takes a photo or crops an object.
2. User names it: "this is the whiteboard eraser."
3. System stores local snapshots and labels.
4. Use tags/manual labels first.
5. Add embeddings or fine-tune after repeated failures are known.

## Immediate Prep In This Repo

Already present:

- `fiducial.detections.ingest`
- calibration solve/apply
- replay log
- room state graph
- phone target selection
- Light Lab marker objects

Next foundation tasks:

1. Add generic `intent.target.resolved` handling to server state.
2. Add a simulator for pointing rays and target candidates.
3. Add a `room-perception/` folder for future OAK bridge scripts.
4. Add a replay fixture for pointing at board/table/marker.
5. Add Reveal overlay for intent rays and target confidence.

## Short Talk Track

> The goal is not to make a camera that recognizes everything. The goal is to make the room understand intent. A person points, looks, moves a phone, or places a marker, and the room resolves the likely target in shared coordinates. The OAK-D cameras give us depth and multiple viewpoints, AprilTags give stable identity and calibration, and V-JEPA gives slow room context. All of those workers feed one room graph. If the fancy perception fails, the fallback is still useful: phone target selection and tagged objects use the same event contracts. That means we can prototype the interaction now and replace the sensors later without rewriting the room.

## Open Questions

- Which OAK-D cameras are USB vs PoE?
- Can all cameras see the calibration tags at once?
- Is the PC GPU available for hand/pose inference?
- What is the first real intent target: table marker, board note, projected card, or phone-selected object?
- Do we need identity tracking, or is anonymous actor tracking enough?
- How strict should privacy be for saved photos/object-learning snapshots?
