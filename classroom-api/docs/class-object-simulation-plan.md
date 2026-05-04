# Class Object Simulation Plan

Goal: simulate the Smart Objects class project space inside this repo without copying the class repo code directly.

Sources read:

- `../smartobjects-labs-week2/labs/README.md`
- `../smartobjects-labs-week2/server/objects.json`
- `../smartobjects-labs-week2/server/README.md`
- `../smartobjects-labs-week2/conversational-machines/labs/*/README.md`
- `../smartobjects-labs-week2/docs/demo-suggestions.md`
- `../smartobjects-labs-week2/docs/student-experimentation-starter.md`
- selected `../smart-objects-cameras` detector/classroom API docs and scripts

Keep the simulation local, metadata-first, and compatible with the current room server contracts.

## Simulation Contract

Each simulated class object should resolve to:

```json
{
  "id": "object-or-sensor-id",
  "kind": "object | zone | sensor | rule | agent",
  "surface": "table | board | room | camera",
  "state": {},
  "events": []
}
```

Do not start by recreating every student UI. Start by making each object emit or consume room events.

## The 13 Objects

1. **Ambient Light Sensor**
   - Source: Week 2 Lab 01.
   - Simulates: room light level from 0 to 100.
   - Event: `sensor.light.changed`.
   - Room effect: dim/bright projector and table ambient state.

2. **Zone Response Map**
   - Source: Week 2 Lab 02 and `server/objects.json`.
   - Simulates: podium, whiteboard, collaboration, entrance zones.
   - Event: `zone.entered`, `zone.exited`.
   - Room effect: focus, projector mode, collaboration mode.

3. **Declarative Rule Engine**
   - Source: Week 2 Lab 03 and `objects.json` rules.
   - Simulates: if/then rules over objects, zones, sensors.
   - Event: `rule.triggered`.
   - Room effect: presentation mode, whiteboard active, collaboration.

4. **Live Object Stream**
   - Source: Week 2 Lab 04 WebSocket listener.
   - Simulates: moving classroom objects from a stream.
   - Event: `object.position.updated`.
   - Room effect: virtual room + projector sync.

5. **AprilTag Detector**
   - Source: Week 2 Lab 05 and current detector bridge.
   - Simulates: fiducial IDs, centers, corners, confidence.
   - Event: `fiducial.raw.detected`, `fiducial.detected`.
   - Room effect: marker card position and calibration.

6. **Sensor Simulator Pack**
   - Source: Week 2 Lab 06.
   - Simulates: temperature, motion, proximity, light.
   - Event: `sensor.reading.changed`.
   - Room effect: abstract sensor cards that can be assigned behaviors.

7. **Presence Detector**
   - Source: Conversational Machines Lab 01.
   - Simulates: occupied/empty, distance/closeness.
   - Event: `presence.changed`.
   - Room effect: room wakes up, character notices arrival.

8. **Face / Attention Direction**
   - Source: Conversational Machines Lab 02.
   - Simulates: left/center/right attention.
   - Event: `attention.direction.changed`.
   - Room effect: focus target shifts between table, board, door/screen.

9. **Gesture Response**
   - Source: Conversational Machines Lab 03.
   - Simulates: open palm, fist, pointing, peace.
   - Event: `gesture.detected`.
   - Room effect: mode switch, focus beam, calm/alert state.

10. **OCR / Board Reader**
    - Source: Conversational Machines Lab 04 and `smart-objects-cameras/WHITEBOARD_READER.md`.
    - Simulates: text read from board or held card.
    - Event: `text.detected`.
    - Room effect: whiteboard semantic object, room narration, replayable note.

11. **Teachable Object Classifier**
    - Source: Conversational Machines Lab 05.
    - Simulates: custom labels with confidence.
    - Event: `classifier.prediction.changed`.
    - Room effect: student-defined object behaviors without changing code.

12. **Room Character / Figurate Voice**
    - Source: Conversational Machines Labs 06-07 and Flowstate plan.
    - Simulates: voice/personality layer consuming room events.
    - Event: `character.ask`, `character.speaks`.
    - Room effect: room explains what it sees and what it is doing.

13. **Camera / Robot Safety Boundary**
    - Source: `smart-objects-cameras/robot_boundary_monitor.py`, person/fatigue/gaze detectors.
    - Simulates: unsafe zone, fatigue, attention, robot proximity.
    - Event: `safety.boundary.warning`, `fatigue.detected`, `gaze.estimated`.
    - Room effect: robot slows/stops, reveal overlay explains why.

## First Implementation Slice

Create a simple object simulator panel/page that can emit these events without camera hardware.

Minimum controls:

- Select object type.
- Move object on table/room map.
- Toggle sensor state.
- Emit event.
- Show last event in `/api/replay`.

Minimum server changes:

- No new primary contracts yet.
- Use existing `event.manual` for unfamiliar event types.
- Keep all source fields explicit: `source: "class-object-simulator"`.

## Future Mapping To Hardware

- AprilTag and OAK-D detections replace object positions.
- RGB demo can fake the object stream.
- Board robot/whiteboard stroke state feeds the OCR object.
- Flowstate character consumes the same event log.
- Replay lets us inspect class object sessions without rerunning hardware.

## Lessons From Robot/Human Prototype

- Define frames first: table frame, board frame, floor frame, camera frame.
- Make visible mesh orientation separate from interaction frame.
- Distinguish `visible`, `active`, and `controlled`.
- Hit targets must be larger than visible objects.
- Actor behaviors should be event consumers/producers, not hardcoded scene hacks.
