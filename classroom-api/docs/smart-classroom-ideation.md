# Smart Classroom Interactive Prototype Ideation

This document tracks ideas for a smart classroom prototype framework. The goal is to keep each demo bare bones while sharing the hard parts: calibration, coordinate systems, tracking, room state, device control, and networking.

## Direction

Build a small framework for room-scale interactions:

- Multiple physical surfaces: table, whiteboard, projector wall, screen, phone.
- Multiple sensing modes: cameras, fiducials, hand/pointer tracking, phone AR, simple object recognition.
- Multiple actuators: projectors, DMX lights, displays, browser UIs, classroom devices.
- Shared interaction model: physical things become addressable objects with position, identity, state, and capabilities.
- Thin prototypes: each idea should be a small composition of shared modules, not a standalone app.

The interesting thesis: a classroom can behave like a spatial computer where surfaces, objects, lights, slides, and phones are all part of one interaction graph.

## Class Background Notes

Source context reviewed:

- `C:\Users\ithrel\Documents\GitHub\smart-objects-cameras`
- `C:\Users\ithrel\Documents\GitHub\smartobjects-labs-week2`

Do not copy these projects directly. Use them as background for interaction patterns, hardware realities, and architecture constraints.

Important prior work:

| Area | Existing Direction | Useful For This Framework |
| --- | --- | --- |
| OAK-D camera templates | Person detection, fatigue, gaze, whiteboard OCR, Discord notifications, status JSON files | Sensor worker pattern, debouncing, detector output shape |
| Classroom API | Node event bus, project heartbeats, contracts, SSE, room context, phase state, capability routing | Room server and contract-first integration |
| Orchestrator design | Manual phase states, ambient/broadcast/directed salience routing | Preventing every prototype from reacting to every signal |
| V-JEPA classroom probe | Classify room modes like lecture, group work, individual work, empty room | Slow context detection, not momentary gesture detection |
| Whiteboard OCR | Text detection/recognition, history logging, change detection, confidence aggregation | Semantic board and lesson capture prototypes |
| PC GPU testing | Skeleton, hands, gestures, depth at higher FPS than on Pi | Interactive table and focus beam tracking |
| Week 2 labs | Zones, rules, object streams, AprilTags, WebSocket listener | Spatial object model and simple rule engine |
| Surface Studio | Projection mapping, quads, camera calibration, hand touch, widgets, action triggers, BroadcastChannel sync | Projected surfaces and editor/projection split |
| Student retros | Focus Beam, nod checking, private grammar feedback, ambient classroom agents, stage/fiducial ideas | Prototype backlog and value ranking |

Core lesson: the first useful framework should not be a polished app. It should be a small room operating system: objects publish state, surfaces render state, devices expose capabilities, and prototypes define thin rules over the shared room context.

## Carry-Forward Principles

- Contract-first beats device-first. A prototype should declare what it consumes and emits before the hardware works.
- Mocks count. A browser mock, replay file, or manual event should exercise the same contract as the real camera, projector, or DMX light.
- Sensors report observations. The orchestrator decides whether those observations become ambient logs, broadcasts, or directed actions.
- Tags and zones are enough for MVPs. AprilTags plus named zones can prove most spatial interactions before object recognition is worth the effort.
- V-JEPA-style classification is for room modes that last seconds or minutes, not quick gestures.
- Hand, pose, and depth tracking should run on the PC when latency matters.
- Whiteboard OCR needs history, confidence, and change detection, not just a single text read.
- Projection tools need two loops: an editor/control loop and a fullscreen projection loop.
- Privacy-sensitive signals need local processing, silhouette/aggregate options, or explicit opt-in.
- Good smart classroom interactions should preserve normal classroom affordances: pointing, writing, placing objects, gathering, talking.

## Frontend Magic Principles

The frontend should feel like a room responding, not software being operated.

- Magical by default: no dashboard, no visible event log, no persistent controls in the main view.
- Invisible interface: the object card, phone target, gesture, or board mark is the control.
- Reveal on request: debug overlays, tag IDs, confidence, routes, rays, normals, and calibration appear only in Reveal mode.
- One-screen spell: the projector window should be the demo's primary visual artifact.
- Phone as wand/lens: the phone shows controls only for the selected object or surface.
- Room character as quiet guide: it speaks when asked, during setup help, or when a safety/calibration issue matters.
- No chrome on the projected surface: fullscreen output should show beams, objects, notes, focus, and hints only.
- Controls belong offstage: stage control and camera simulator pages are operator tools, not audience-facing views.
- Failure should become legible: if a tag is lost or calibration drifts, Reveal mode makes recovery feel intentional.

## Framework Pieces

| Piece | Purpose | Needed For |
| --- | --- | --- |
| Room state graph | Registry of surfaces, devices, objects, users, and capabilities | All prototypes |
| Coordinate transforms | Convert between camera, projector, table, board, phone, and room coordinates | Table, beam, AR, clipboard |
| Calibration tools | QR/AprilTag corners, homography setup, projector-camera alignment, DMX pan/tilt mapping | Table, board, focus beam |
| Event bus | WebSocket/SSE messages for tracking events, gestures, controls, and state changes | All prototypes |
| Contracts | Small schemas for consume/emit loops, mock events, and validation | All prototypes |
| Orchestrator | Phase, context, and salience routing for ambient/broadcast/directed events | Multi-device room behavior |
| Capability router | Resolve requests like `fiducials`, `spotlight`, `timer`, or `surface.project` to a live provider | AR interactor, macros, clipboard |
| Device adapters | Small wrappers for projector, DMX, slide deck, browser display, lights, audio, etc. | Beam, AR controls, macros |
| CV workers | Camera input, fiducials, pointer tracking, hand tracking, object tracking, board capture | Table, tokens, board, gestures |
| Mode detector | Slow room-mode classification from V-JEPA/probes or simple heuristics | Orchestrator context |
| Surface renderers | Browser/canvas views projected onto table, board, or screen | Table, puzzles, overlays |
| Phone client | Web app or native/AR client for pointing at things and exposing contextual controls | AR interactor, clipboard |
| Voice / character adapter | Connect room events to a Figurate/Flowstate character with personality, voice, memory, and response policy | Room narrator, private companion, critique guide |
| Scenario runner | Lightweight way to define a demo as objects, rules, UI, and device actions | All prototypes |
| Logging/replay | Record tracking and event streams for debugging, grading, demos, and portfolio evidence | All prototypes |

## Low-Rewrite Rules

- Every physical thing gets an ID, a pose if available, and a list of capabilities.
- Surfaces expose coordinate spaces, not custom APIs.
- Device controls are network messages, not direct calls buried in prototypes.
- Prototypes should subscribe to state and emit intents.
- Calibration data should be saved and versioned per room layout.
- Fiducials are acceptable early. Replace with recognition only when the interaction is already good.
- A prototype is successful when it proves one complete loop, not when it has a polished UI.
- Every prototype should be runnable in mock mode.
- Every sensor output should include confidence, timestamp, source, and coordinate space.
- Every device action should have a dry-run/log-only version.
- Phase/context should be explicit: arrival, lecture, activity, conclude, departure, unknown.

## Prototype Backlog

| Idea | Description | Needed | Value | Pros | Risks | Difficulty |
| --- | --- | --- | --- | --- | --- | --- |
| Interactive table | Project onto a table, track touches/tokens using QR or AprilTag corner calibration and table width/height. | Projector, overhead camera, fiducials, homography, browser renderer, touch/token CV. | High demo value, high reuse value. | Strong foundation for many demos; collaborative. | Occlusion, projector drift, lighting issues. | Medium |
| Focus beam | Use a Sharpie DMX moving light to aim at the place the teacher points. | DMX control, board/table calibration, pointer tracking, pan/tilt mapping. | High embodied value, medium product value. | Very physical; makes attention direction tangible. | Safety, glare, latency, calibration drift. | Medium-Hard |
| AR interactor phone | Point phone at projector, screen, board, table, or object and get contextual controls. | Phone AR/web client, object markers or visual anchors, room server, device registry. | High product value, high platform value. | Natural universal remote for the room. | Robust anchoring and object selection. | Medium-Hard |
| Projected manipulatives | Physical tokens on the table become live puzzle or simulation pieces. | Fiducial tokens, table projection, object state, puzzle rules. | High demo value, high learning value. | Social, tangible, easy to understand. | Token tracking quality; content authoring. | Medium |
| Light Lab marker puzzle | Markers become emitter, mirror, splitter, filter, blocker, and target; projected beams react as objects move. | Table projection, marker pose, ray simulation, target state. | Very high demo value, high learning value. | Magical and visual; teaches vectors, reflection, state, debugging. | Marker rotation and calibration need care. | Medium |
| XOR / logic puzzle table | Place gates, switches, wires, and outputs as physical tokens or projected pieces; solve circuit challenges. | Token IDs, projected wires, simple logic engine, challenge definitions. | High learning value, medium demo value. | Concrete CS/electronics teaching; easy MVP. | Wire editing interaction needs care. | Medium |
| Circuit challenge table | Build simple circuits with physical components or tokens; projected current/logic state gives feedback. | Component tokens, graph builder, simulation layer, projector overlay. | High learning value, high expansion value. | Bridges physical and abstract reasoning. | Real electronics integration can scope creep. | Medium-Hard |
| Spatial clipboard | Grab content from one surface and send it to another: board to table, table to phone, phone to projector. | Room object graph, surface transforms, gesture or phone interaction, object serialization. | Very high platform value. | Makes the room feel like one computer. | Needs a clean interaction grammar. | Hard |
| Semantic whiteboard | Board drawings become live objects: boxes, arrows, diagrams, equations, sticky notes. | Board camera, stroke detection, OCR, shape parsing, object model. | High product value, high research value. | Useful beyond demo; captures teaching state. | CV complexity, glare, occlusion. | Hard |
| Instrumented pointer | Marker, finger, or pointer becomes a tracked cursor on the board or table. | Camera tracking, gesture states, projected UI hooks. | High reuse value. | Useful input primitive for many ideas. | False positives, hand occlusion. | Medium |
| Gesture zones | Invisible zones in the room trigger actions: discussion zone, presentation zone, table zone. | Pose tracking, zone editor, event rules. | Medium product value. | No device required; easy to demo. | False positives with multiple people. | Medium |
| Classroom macros | A gesture, phone action, or command changes the room mode: discussion, presentation, puzzle, capture. | Device adapters, scenario runner, state machine. | High product value. | Makes individual devices feel coordinated. | Needs integrations to feel real. | Medium |
| Object-aware lesson props | Props trigger overlays or controls when placed on table/board: prism, battery, map, molecule kit. | Fiducials or object recognition, content registry, projector/AR overlay. | High learning value. | Domain-specific and more interesting than generic demos. | Each prop needs setup. | Medium |
| Attention-aware capture | Track active board/table regions and record useful clips, snapshots, or lesson state. | Camera tracking, capture pipeline, optional audio localization. | Medium product value. | Practical archival use. | Privacy and accuracy concerns. | Medium-Hard |
| Room orchestrator simulator | Visualize phase, room mode, event salience, and which agents receive which events. | Room API, mock detectors, event log, simple dashboard. | Very high framework value. | Makes the hidden coordination layer legible. | Not flashy unless paired with visible actuators. | Medium |
| Tag-to-contract bridge | Convert AprilTag detections into typed room events with object names, zones, and capabilities. | AprilTags, mapping file, zone config, event contracts. | Very high platform value. | Connects Week 2 object/zones work to the classroom API pattern. | Needs clean coordinate conventions. | Easy-Medium |
| Sensor replay bench | Record camera/tag/gesture streams and replay them into prototypes. | Event log, replay controls, mock API. | High engineering value. | Debug demos without the full room setup. | Less visible to non-technical viewers. | Easy-Medium |
| Understanding poll | Teacher asks a question; students nod/shake/gesture or place tokens; aggregate appears privately or publicly. | Face/pose/gesture detection, phone fallback, aggregation UI. | High classroom value. | Clear real teaching use case. | Multi-person tracking and privacy. | Medium |
| Private learner companion object | Small desk display gives private feedback or reminders based on room context, voice, or task state. | Speech input, local/phone mic strategy, small display mock, event bus. | Medium-high product value. | Addresses individual support without public exposure. | Voice isolation and privacy. | Medium-Hard |
| Room voice character | A Figurate/Flowstate character gives the room a voice and personality, reacting to room context, events, and direct questions. | Flowstate character, room context prompt, event-to-speech policy, speaker/display output. | High experiential value, high research value. | Makes the room feel inhabited; can explain itself and guide interactions. | Risk of being chatty, uncanny, or distracting. | Medium |
| Slide-aware spotlight | OCR or slide text plus pointing chooses a slide region to dim/highlight or aim a light. | Slide capture/OCR, pointing detection, projector overlay or DMX. | High demo value. | Evolves Focus Beam into a stronger classroom tool. | Ambiguous pointing, diagrams with little text. | Hard |
| Spatial evidence recorder | Capture events, screenshots, calibration state, and short clips for critique/portfolio proof. | Event log, surface screenshots, camera snapshots, export. | High class value. | Makes fragile prototypes reviewable. | Needs permissions and storage policy. | Medium |

## Value Lens

Use these categories when ranking ideas:

- Demo value: how quickly it feels impressive in a room.
- Learning value: how well it supports real classroom concepts.
- Platform value: how much it exercises reusable framework pieces.
- Product value: how plausible it is as a useful tool beyond a demo.
- Research value: how much it explores new interaction patterns.

Additional class-specific value categories:

- Framework value: how much it reduces rewrite across later prototypes.
- Critique value: how easy it is to show evidence even when hardware fails.
- Privacy value: whether it can work with local, aggregate, or opt-in sensing.
- Classroom affordance value: whether it uses existing behaviors like pointing, writing, placing, gathering, and speaking.

Initial high-value bets after reviewing class materials:

1. Interactive table: best foundation and fastest visible win.
2. Room orchestrator simulator: makes the framework real and prevents bus chaos.
3. Tag-to-contract bridge: cheapest bridge from AprilTags/zones to real room events.
4. Light Lab marker puzzle: stronger visual magic and still teaches beginner programming concepts.
5. AR interactor phone: strongest control metaphor for a smart room.
6. Spatial clipboard: most distinctive "one room computer" interaction.
7. Focus beam / slide-aware spotlight: strong physical actuator demo that reuses calibration.

Near-term value matrix:

| Prototype | Demo | Learning | Platform | Product | Research | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| Interactive table | High | High | High | Medium | High | Best first physical surface |
| Tag-to-contract bridge | Medium | Medium | Very high | Medium | Medium | Makes tags useful beyond demos |
| Room orchestrator simulator | Medium | Medium | Very high | High | High | Shows context and salience routing |
| Light Lab marker puzzle | Very high | High | High | Medium | High | Best primary magical demo |
| XOR puzzle table | High | Very high | High | Medium | Medium | Keep as later programming mode |
| AR interactor phone | High | Medium | High | High | High | Universal room remote pattern |
| Spatial clipboard | Very high | Medium | Very high | Medium | Very high | Most distinctive long-term interaction |
| Focus beam | Very high | Medium | Medium | Medium | Medium | Requires careful pointing intent |
| Semantic whiteboard | Medium | High | High | High | Very high | Hard but potentially product-grade |

## Suggested Build Order

1. Create a room server with project/device contracts, heartbeats, state, events, and replay.
2. Create a simple room/orchestrator visualizer for phase, context, zones, objects, and routing.
3. Build tag-to-contract bridge: AprilTag/object detections become typed room events.
4. Build table calibration with a projected browser canvas.
5. Add fiducial/marker tracking and the Light Lab ray puzzle.
6. Add device adapters for DMX and slide/projector control.
7. Add a Flowstate room-character adapter in text-only/mock mode.
8. Add phone web client for object selection and contextual controls.
9. Implement spatial clipboard between table, board, phone, and projector.
10. Explore semantic whiteboard once the room graph is stable.

## MVP Scenario Ideas

### Light Lab Marker Puzzle

Students place markers on the projected table. The room treats them as optical objects: emitter, mirror, splitter, filter, blocker, and target. A projected beam updates as the markers move. The goal is to route the beam into the target.

Bare-bones version:

- Draggable browser markers first.
- AprilTag marker cards later.
- 2D ray simulation only.
- Click or phone action rotates a marker until physical orientation tracking exists.
- Target state projected on the table.

Contract loop:

- Consumes: `fiducial.detected`, `marker.rotated`, `mode.changed`.
- Emits: `light.object.placed`, `light.ray.updated`, `light.target.hit`, `light.puzzle.solved`.
- Mock mode: draggable markers emit the same events as real tags.

### Logic Puzzle Table

Students place input, XOR, AND, OR, NOT, and output tokens. Projected wires connect nearby ports. The system evaluates the graph and highlights signal flow. Challenges ask students to make a target truth table.

Bare-bones version:

- AprilTag token per gate.
- Snap-to-port projected wires.
- Boolean simulation only.
- One output target.
- Success state projected on table.

Contract loop:

- Consumes: `fiducial.detected`, `surface.touch`, `puzzle.challenge.loaded`.
- Emits: `logic.node.placed`, `logic.connection.changed`, `logic.circuit.evaluated`, `puzzle.solved`.
- Mock mode: draggable browser tokens emit the same events as physical tags.

### Focus Beam With Pointer

Teacher points at the board. Camera estimates the target point. Room server maps that point into DMX pan/tilt. The light moves to the target and optionally narrows intensity.

Bare-bones version:

- Click-to-aim calibration UI first.
- AprilTag or colored pointer second.
- Hand/pose pointing later.

Class-context refinements:

- Start with projected overlay highlight before moving the DMX light.
- Treat pointing as an intentional command only when sustained or paired with another signal.
- Test slide/board OCR early with real lecture content; formulas and diagrams will break naive text matching.

### AR Room Remote

Phone sees an object marker on a surface or device. UI appears with controls for that object: next slide, dim projector, spotlight here, send to table, capture snapshot.

Bare-bones version:

- Browser-based phone client.
- QR/AprilTag selection.
- WebSocket controls.
- One control group per object type.

Contract loop:

- Consumes: `object.selected`, `surface.targeted`, `capability.listed`.
- Emits: `device.command`, `clipboard.send`, `surface.capture.requested`.
- Mock mode: select objects from a browser room map if phone AR is unavailable.

### Spatial Clipboard

User selects an object on the table, then points phone at the board or projector and sends it there. The object is serialized through the room graph and re-rendered in the target surface coordinate space.

Bare-bones version:

- Select one projected card on the table.
- Phone selects destination marker.
- Object appears on projector/board surface.

Contract loop:

- Consumes: `object.selected`, `surface.destination.selected`.
- Emits: `clipboard.object.copied`, `clipboard.object.sent`, `surface.object.spawned`.
- First object type: a projected card with text and position only.

### Room Orchestrator Simulator

Show a live map of room state: phase, mode, objects, zones, agents, event stream, and salience routing. This should answer "what does the room think is happening right now?" and "who receives this event?"

Bare-bones version:

- Manual phase selector.
- Mock detector buttons for person, gaze, whiteboard, tag, and mode events.
- Event log with ambient/broadcast/directed classification.
- Agent list with heartbeats and capabilities.
- Replay one recorded interaction.

### Tag-To-Contract Bridge

Detect AprilTags or use simulated object positions, then publish contract events with object identity, normalized surface coordinates, zone membership, and confidence.

Bare-bones version:

- Read an object/tag mapping file.
- Read a zone config.
- Emit `fiducial.detected` and `fiducial.zone_entered`.
- Provide a browser simulator that emits identical events.

### Sensor Replay Bench

Record event streams from mock or hardware sessions and replay them into prototypes. This lets the framework be developed without the full classroom assembled.

Bare-bones version:

- Save events as JSONL.
- Replay at 1x, 2x, paused, and step-by-step.
- Filter by source, event type, or target.
- Mark events as real, mock, or manual.

## Round 2 Ideas

These are creative directions to review later. They should stay thin and attach to the same room graph, contracts, surfaces, and event bus.

| Idea | Core Interaction | Value | Difficulty |
| --- | --- | --- | --- |
| Living lesson map | Physical cards/tokens on the table represent concepts. Rearranging them changes lesson flow, slides, examples, or quiz order. | Turns lesson planning into a spatial object system. | Medium |
| Misconception magnet | Students place answer tokens around projected claims; the room clusters responses and reveals common wrong models. | Better than polling because it shows patterns of thinking. | Medium |
| Executable whiteboard | Draw a logic gate, flowchart, circuit, or state machine; the room parses and runs it. | Strong CV plus education payoff. | Hard |
| Concept conveyor | Drag or throw a concept from table to board to phone to projector; each surface renders it differently. | Extends spatial clipboard into a full room metaphor. | Hard |
| Room debugger mode | Project sensor confidence, camera frustums, tag IDs, zones, event routes, and calibration errors into the room. | Makes the invisible system visible for development and critique. | Medium |
| Question catcher | When someone asks a question, the teacher points to a board/table region and the question gets pinned there as a live note. | Combines speech, pointing, whiteboard, and room memory. | Medium-Hard |
| Physical function cards | Cards like `sort`, `filter`, `compare`, `invert`, `simulate`, and `explain` transform nearby objects. | Programs become physical objects. | Medium |
| Time ghosts | Replay previous class activity as faint projected trails: object movement, board changes, discussion moments. | Makes classroom memory spatial and inspectable. | Medium-Hard |
| Slide-to-room binding | Bind a slide element to a physical object; placing the object highlights or controls the slide element. | Connects abstract slides to tangible classroom props. | Medium |
| Argument floor | Students stand or place tokens in claim/evidence/uncertainty/opposition zones; the board builds an argument map. | Good for discussion and critique classes. | Medium |
| Self-aware room calibration | The room asks for help when confused: lost tag, occluded corner, projector drift, low confidence. | Turns debugging into an interaction. | Medium |
| Expressive focus beam | The DMX beam confirms selected objects, traces paths, marks speakers, or shows room attention. | More expressive than a simple spotlight. | Medium-Hard |
| Projected circuit dungeon | XOR/circuit puzzles become a cooperative escape-room-style table game with gates, keys, wires, and constraints. | More memorable than a bare logic simulator. | Medium |
| Teacher clipboard belt | Phone or small remote shows recently copied room objects and lets the teacher send them back to surfaces. | Practical extension of AR interactor. | Medium |
| Live diagram negotiator | Multiple students build competing diagrams; the room shows overlaps, contradictions, and possible merges. | Strong collaborative reasoning use case. | Hard |
| Attention budget meter | The room tracks how many surfaces/devices are demanding attention and quiets nonessential ones. | Brings calm technology into the framework. | Medium |
| Object trial mode | Put an object in a witness-stand zone and the room shows everything it knows: history, uses, links, controls. | Good for props, tools, and debugging. | Easy-Medium |
| Embodied Boolean voting | Students become boolean inputs by standing in zones or holding gestures; the table/board evaluates logic live. | Pairs well with XOR/circuit learning. | Medium |
| Board-to-table compiler | Draw a circuit or puzzle on the board; the table spawns playable physical tokens from it. | Excellent multi-surface loop. | Hard |
| Room memory search | Ask where an example/object appeared and the room replays or points to the last surface/location. | Product-like and distinctive. | Hard |

### Room Voice Character via Flowstate

Use the Figurate/Flowstate backend at:

```text
C:\Users\ithrel\Documents\GitHub\flowstate
```

Core idea: the room has a character with a designed personality, voice, memory, and speaking policy. It should not narrate constantly. It should speak when the room needs to explain itself, ask for calibration help, guide a puzzle, summarize a discussion, or respond to direct questions.

Useful Flowstate integration notes:

- Prefer the canonical voice pipeline for new work: `/api/voice/pipeline/*`.
- Use `/api/voice/pipeline/text` for room-event narration and debugging because we can inject context each turn.
- Use `/api/voice/pipeline/voice` for spoken user input when we want a real audio turn.
- Treat `/api/voice/conversational/character` as optional later for continuous live voice; it is less controllable mid-session.
- Flowstate already has character identity, personality, voice settings, memory/context, text/voice pipelines, SSE events, and tool-calling hooks.

Bare-bones version:

- Create or select one room character in Flowstate.
- Add a `room-character` adapter service in this repo.
- Subscribe to room events and context.
- Convert selected events into concise text prompts.
- Call Flowstate text pipeline with `characterId`, `text`, and `context`.
- Play or display the response in one place only.
- Add a cooldown and salience policy so the room does not interrupt.

First personality tests:

| Character Mode | Behavior | Good For |
| --- | --- | --- |
| Quiet docent | Speaks rarely, explains what the room is doing when asked. | Critique, demos, visitors |
| Calibration coach | Notices drift, lost tags, bad confidence, and asks for specific help. | Setup and debugging |
| Puzzle guide | Gives hints for XOR/circuit puzzles without solving them. | Learning prototypes |
| Discussion scribe | Summarizes questions, claims, and unresolved threads. | Classroom memory |
| Room conscience | Warns when interactions are too noisy, creepy, or attention-demanding. | Calm tech framing |

Contract loop:

- Consumes: `room.context.updated`, `room.phase.changed`, `fiducial.detected`, `surface.error`, `puzzle.state.changed`, `question.captured`, `user.voice.turn`.
- Emits: `character.utterance.started`, `character.utterance.completed`, `character.suggestion`, `character.calibration.requested`, `character.memory.note`.
- Mock mode: type an event into a browser console and show the character response as text before enabling audio.

Speaking policy:

- Never speak for raw low-confidence detections.
- Prefer one sentence unless explicitly asked for detail.
- Do not publicly reveal private learner state.
- Ask before taking device actions.
- During lecture, default to silent unless addressed or routing says directed.
- During setup/debug mode, be more talkative.

Possible prompt context shape:

```json
{
  "phase": "activity",
  "room_mode": "group_work",
  "recent_events": [
    "tag 12 entered table.logic-zone",
    "puzzle output is false but target is true"
  ],
  "surfaces": ["table", "whiteboard", "projector"],
  "active_prototype": "xor-puzzle",
  "speaking_policy": "short_hint_only"
}
```

Value:

- Makes the room legible without adding more dashboards.
- Gives the framework an experiential center.
- Lets the same room behave differently by swapping character/personality.
- Connects the smart classroom work to the existing Figurate backend instead of building a new voice stack.

## Open Questions

- Should the first room server be Node/TypeScript, Python/FastAPI, or something else?
- Do we want browser-first renderers for all projected surfaces?
- Should the CV pipeline run as one service or separate small workers?
- What camera/projector hardware is available right now?
- Should the phone AR client start marker-based or use ARKit/ARCore from the start?
- Which first classroom content domain should we optimize for: circuits, logic, geometry, maps, physics, or discussion tools?
- Should we reuse the prior FastAPI/SSE style conceptually, or switch to Node/TypeScript because projected surfaces and browser clients will dominate?
- What is the minimum event envelope for this repo: `event_type`, `source`, `target`, `payload`, `created_at`, `confidence`, `coordinate_space`?
- Do we need both WebSocket and SSE, or can one transport cover server-to-client and client-to-server cleanly?
- Which interactions require explicit user intent to avoid creepy or accidental automation?
- Which Flowstate character should be the first room voice, and should it speak aloud or text-only first?
- Should the room character own memory, or should memory stay in the room event log and be passed into Flowstate as context?
