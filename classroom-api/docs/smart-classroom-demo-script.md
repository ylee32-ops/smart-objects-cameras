# Smart Classroom Demo Script

This doc turns the ideation backlog into a tight demo sequence. The framing is inspired by small breakthrough demos: one shared technical setup, several short scenes, and one new physical interaction loop per scene.

The goal is not to show a giant finished product. The goal is to make the audience feel that the classroom has become a spatial computer.

## Demo Philosophy

- One demo should prove one new interaction verb.
- Reused infrastructure is the point: same cameras, projector, room graph, tags, surfaces, and event bus.
- Every scene should work in mock mode before hardware is reliable.
- The audience should see cause and effect in under 10 seconds.
- The room character should explain only when useful, not narrate constantly.
- The system should preserve normal classroom actions: place, point, pass, ask, reveal, bind.
- Invisible by default, legible on request. The normal mode should feel magical; Reveal mode shows the machinery only when asked.
- The interface is the object, not the dashboard.

## Shared Setup

| Piece | Used By |
| --- | --- |
| Projected table surface | Place, Pass, Reveal, Bind |
| Whiteboard/projector surface | Pass, Point, Reveal, Bind |
| Camera + AprilTags | Place, Pass, Reveal, Bind |
| Room event server | All scenes |
| Room object graph | All scenes |
| Phone web client | Pass, Bind, optional Point |
| Flowstate room character | Ask, Reveal, optional all scenes |
| DMX Sharpie light or projected spotlight | Point |
| Replay/mock console | All fallback paths |

## Selected Six

| Order | Verb | Prototype | Breakthrough Interaction | Reused Setup | Fallback |
| --- | --- | --- | --- | --- | --- |
| 1 | Place | Light Lab | Physical markers bend, split, color, and block a projected beam. | Table projection, tags, object graph | Browser draggable markers |
| 2 | Pass | Spatial Clipboard | A concept moves from table to board/phone/projector as a room object. | Same object graph, phone, surfaces | Button-driven send |
| 3 | Point | Focus Beam | Pointing becomes an addressable room control for attention. | Camera calibration, board surface, optional DMX | Click-to-aim overlay |
| 4 | Ask | Room Character | The room can explain what it sees, what changed, and what to do next. | Flowstate, room context, event log | Text-only response panel |
| 5 | Reveal | Room Debugger | The room projects its own perception, confidence, routing, and errors. | Same surface renderer and event bus | Static replay trace |
| 6 | Bind | Slide/Object Binding | A physical object becomes a handle for an abstract slide or lesson element. | Tags, slides, room object graph | Manual slide target selection |

## Run Of Show

### 0. Setup Beat

Audience sees:

- A projected table.
- A projected board or wall.
- A few tagged physical tokens.
- A phone controller.
- Optional DMX light pointed away or idle.

Spoken setup:

> This is not six separate apps. It is one room graph. The room knows about surfaces, objects, devices, and events. Each scene shows a different way to interact with that same graph.

Technical state:

- Room server running.
- Table and board surfaces calibrated.
- Tags mapped to object IDs.
- Flowstate character selected but silent.
- Mock console ready.

## Scene 1: Place

Prototype: Light Lab

Audience action:

1. Place `Emitter`, `Mirror`, `Filter`, and `Target` markers on the table.
2. A projected beam appears from the emitter.
3. Move or rotate the mirror and the beam reflects.
4. Add a filter or splitter and the beam changes.
5. Solve the puzzle by routing light into the target.

Spoken line:

> The new interaction is place. The room reads physical objects as optical behavior. Arrangement becomes the program, but it feels like moving light.

What proves it:

- Token enters table space.
- Projected beam updates immediately.
- Mirror angle and object position change the path.
- The target visibly activates when the path is solved.

Events:

```text
fiducial.detected
light.object.placed
light.ray.updated
light.target.hit
light.puzzle.solved
```

Fallback:

- Use draggable browser markers on the projected table.
- Emit the same events as real fiducials.

## Scene 2: Pass

Prototype: Spatial Clipboard

Audience action:

1. Select the solved light path or activated target on the table.
2. Point the phone at the board or scan the board tag.
3. Tap send.
4. The beam path appears on the board as a live diagram/explanation card.

Spoken line:

> The new interaction is pass. The object is not trapped inside the table app. It belongs to the room, so it can move to another surface.

What proves it:

- Same light-path object exists first on the table, then on the board.
- Surface coordinates change, but object identity persists.

Events:

```text
object.selected
clipboard.object.copied
surface.destination.selected
clipboard.object.sent
surface.object.spawned
```

Fallback:

- Use a visible "Send to board" button.
- Keep the object transfer and event log identical.

## Scene 3: Point

Prototype: Focus Beam / Projected Attention

Audience action:

1. Point at the board card created in Scene 2.
2. A projected highlight locks onto that region.
3. Optional: the DMX Sharpie light aims at the same target.
4. Move the pointer and the focus follows after a small intentional delay.

Spoken line:

> The new interaction is point. Attention becomes a room-level output. A gesture does not just move a cursor; it tells the room where shared attention should land.

What proves it:

- Pointing target maps into board coordinates.
- Highlight or light lands on the selected region.
- Sustained pointing triggers focus; casual motion does not.

Events:

```text
pointer.targeted
surface.focus.requested
surface.focus.started
dmx.focus.requested
dmx.focus.aimed
```

Fallback:

- Click on a camera/debug view to aim.
- Use projected highlight before DMX.

## Scene 4: Ask

Prototype: Flowstate Room Character

Audience action:

1. Ask: "What did we just build?"
2. The room character answers using the event log and room context.
3. Ask: "Why isn't the beam hitting the target?"
4. The character gives one short hint, not a full solution.

Spoken line:

> The new interaction is ask. The room has a voice, but it is grounded in its own state. It can explain what happened because the objects, surfaces, and events are shared.

What proves it:

- Character references the actual beam state or last moved marker.
- Response changes when the table state changes.
- Character stays quiet unless asked or routed by policy.

Flowstate path:

```text
/api/voice/pipeline/text
```

Example context sent to Flowstate:

```json
{
  "phase": "activity",
  "active_prototype": "light-lab",
  "recent_events": [
    "Emitter placed on table",
    "Mirror changed beam direction",
    "Beam missed target by 18 degrees"
  ],
  "speaking_policy": "short_hint_only"
}
```

Events:

```text
user.voice.turn
room.context.requested
character.utterance.started
character.utterance.completed
character.suggestion
```

Fallback:

- Type the question into a text box.
- Display text response only.

## Scene 5: Reveal

Prototype: Room Debugger Mode

Audience action:

1. Turn on debugger mode.
2. The room projects tag IDs, surface bounds, confidence, event routes, and active subscribers.
3. Cover or move a tag.
4. The room shows the lost object and the last known location.

Spoken line:

> The new interaction is reveal. The room can show its own uncertainty. Debugging becomes part of the interface instead of a hidden developer screen.

What proves it:

- Audience sees the same event stream that drives the demos.
- A failure becomes visible and recoverable.
- The room character can ask for concrete help in setup mode.

Events:

```text
debug.mode.enabled
fiducial.lost
surface.error
route.debug.rendered
character.calibration.requested
```

Fallback:

- Replay a prerecorded event trace showing a tag lost and recovered.

## Scene 6: Bind

Prototype: Slide/Object Binding

Audience action:

1. Place a physical `Mirror` marker in a bind zone.
2. The current slide highlights angle of incidence and reflection.
3. Move the same marker to the table and it bends the beam again.
4. Place an `Explain` function card near it and the room character gives a short explanation.

Spoken line:

> The new interaction is bind. A physical object can be a handle for an idea in a slide, a piece in a puzzle, or a thing the room can explain. Meaning follows the object across surfaces.

What proves it:

- Same physical marker controls slide focus in one context and light behavior in another.
- Object identity stays stable while capabilities change by zone.

Events:

```text
fiducial.zone_entered
object.capability.changed
slide.element.bound
slide.element.highlighted
function_card.applied
character.suggestion
```

Fallback:

- Use manual slide target selection.
- Use projected function cards instead of physical cards.

## Closing Beat

Spoken close:

> The point is not the puzzle, the spotlight, or the voice by itself. The point is that the room has one shared model. Place, pass, point, ask, reveal, and bind are different verbs over the same room computer.

Optional final move:

- Switch the table from `Light Lab` mode to `Force Field` mode.
- Reuse the same tags and zones.
- Show that the framework is reusable, not a single-purpose demo.

## Demo Roles

| Role | Responsibility |
| --- | --- |
| Presenter | Narrates the six interaction verbs |
| Operator | Watches server, mock console, and fallback controls |
| Participant | Places tokens, points, asks questions |
| Camera/projector lead | Handles calibration and physical alignment |

## Build Plan

### Phase 1: Mocked Room

- Browser room server.
- Mock table surface.
- Draggable Light Lab markers.
- Event log.
- Flowstate text-only character response.
- Script can be rehearsed without camera/projector.

### Phase 2: Physical Table

- Projected table calibration.
- AprilTag detection.
- Tag-to-contract bridge.
- Light Lab ray simulation.
- Replay recording.

### Phase 3: Multi-Surface

- Board/projector surface.
- Spatial clipboard.
- Phone destination selector.
- Slide/object binding.

### Phase 4: Attention And Voice

- Pointer or click-to-aim focus.
- Projected spotlight.
- Optional DMX focus beam.
- Flowstate spoken response.
- Speaking cooldown and salience policy.

### Phase 5: Polish And Fallbacks

- Debugger mode.
- Pre-recorded replay traces.
- One-click reset.
- Visual status for mock vs live hardware.

## Success Criteria

- Each scene has one visible cause and one visible effect.
- Each scene can run in mock mode.
- The same event log drives every scene.
- The room character references actual room state.
- A hardware failure can be shown as part of Reveal instead of ending the demo.
- The audience can describe the six verbs afterward.

## Open Decisions

- Which six physical tokens should be printed first?
- Should the first spotlight be projected-only or DMX-backed?
- Should the room character speak aloud during the demo, or stay text-only until the final scene?
- Which slide deck or content should be used for the Bind scene?
- Should the phone client be required, or should Pass work from the table alone?

## Marker Mode Strategy

Markers are not hardcoded to one demo. A marker has identity, pose, type, params, and surface. The active mode decides what the marker means.

| Mode | Marker Meanings | Why It Works |
| --- | --- | --- |
| Light Lab | emitter, mirror, splitter, filter, blocker, target | Magical, visual, teaches angles/vectors/state |
| Force Field | attractor, repeller, gravity well, particle emitter | Good next mode; shows invisible fields |
| Beginner Programming | if, loop, variable, trigger, output | Same physical grammar becomes code |
| Motion Game | reflector, portal, hazard, goal, power-up | Playful demo using same tracker |
| Sticky Note Mode | note, concept, claim, question, evidence | Connects board/learning workflows |

Primary plan: build Light Lab first. Keep Force Field as the next marker mode because it reuses the same marker/renderer architecture and feels equally invisible.
