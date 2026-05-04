# Interaction Affordance Audit

This project is a board-first interaction design prototype. The goal is not just to make controls work; the room has to communicate what can be done, what just happened, and what the system inferred.

## Core Model

The simplest mental model for students:

1. Tags are handles.
2. Zones are places.
3. Action commits the thing it is touching.
4. Projection answers back.
5. The phone explains or asks the room what it sees.

Everything should reinforce that grammar. If an interaction needs a paragraph of explanation, it is probably too hidden for the video shoot.

## Affordance Terms

- Physical affordance: what the body can do, such as move a tag, place a sticky note, write with a marker, or aim a phone.
- Perceived affordance: what the interface makes obvious, such as a glowing zone, label, pulse, border, or projected instruction.
- Signifier: the cue that tells the student what action is available.
- Feedback: the immediate response after action, such as a pulse, projected fill, classroom-screen update, or phone response.
- Constraint: a boundary that prevents wrong use, such as calibration tags staying fixed or action zones turning green only when action can be dropped.
- Mapping: the relation between physical movement and projected result. Dragging right must move the projected object right.

## Explicit Interactions

Explicit interactions are things the student deliberately does.

| Interaction | Student action | Signifier | Feedback |
|---|---|---|---|
| Place a zone | Put one or two Zone tags on the board | Zone tag label, projected rectangle | Projected zone border and label |
| Resize a zone | Add a second Zone tag diagonally | Corner tag position | Rectangle resizes between the two tags |
| Commit a zone | Drag Action into a zone | Green projected drop zones while dragging Action | Action pulse, zone capture sent to classroom projector |
| Focus | Place/rotate Focus tag | Focus tag sits outside the highlight | White highlighter ring grows/shrinks by rotation |
| Write | Place Write tag or draw in a zone | Projected writing mode/status | Thick projected highlighter over writing |
| Erase | Move Tool/Erase action near writing | Eraser label and cursor | Nearby strokes disappear, tag pulses |
| Slides | Place Slide tag | Slide card projected beside tag | Action left/right changes slide |
| Video | Place Video tag | Video frame projected beside tag | Action play/pause area, rotation scrubs |
| Vertex polygon | Place 2+ Vertex tags | Numbered vertices and connecting line | 3+ vertices close the polygon and fill inside |
| 3D object | Place 3D tag | Projected 3D wire model | Rotation changes shape |
| Figurate | Place Figurate tag or use phone Live | Character card and phone status | Character response on board/classroom screen |
| Phone Look | Tap Look on phone | Lens reticle and status copy | Captured visual context becomes Figurate context |
| Phone Live | Tap Live on phone | Live button state | Live room-character state opens/closes |

## Tag Grammar Matrix

The active tag set should stay small and composable:

| Role | Primary affordance | Contextual affordance | Projected feedback |
|---|---|---|---|
| Calibration | Place fixed board corners | Preserved when tags are cleared | Mapping frame aligns |
| Zone | Define a board area | Second Zone resizes or changes hue | Rectangle and green drop affordance |
| Action | Commit the touched target | Controls zone, slide, video, Figurate, erase | Target pulse and state change |
| Focus | Highlight attention | Rotation changes radius | White highlighter ring |
| Write | Enable annotation | Action commits writing or erases by context | Highlight follows strokes |
| Tool | Erase/clear nearby content | Miss pulse if nothing is nearby | Strokes or overlays disappear |
| Sticky | Represent a normal note | Color detection can replace the tag | Sticky glow follows the note |
| Slide | Create board-to-slide summary | Action left/right changes slide | Classroom slide updates |
| Video | Project media player | Rotation scrubs, Action play/pause | Video frame and scrub bar |
| Vertex | Add polygon points | Three or more tags close the shape | Filled projected polygon |
| 3D Object | Place spatial model | Rotation changes shape | Wireframe changes visibly |
| Timer | Start a classroom timer | Pose can suggest start/pause later | Timer card pulses |
| Figurate | Summon room character | Phone Look/Ask/Live adds context | Character response appears |

Compatibility roles such as `scene`, `capture`, `feedback`, `check`, `character`, `ambience`, and `media` can remain for older project packets, but the demo grammar should route them through the core roles above where possible.

## Implicit Interactions

Implicit interactions are inferred by the room without asking the student to press a command.

| Signal | What the room infers | Required feedback |
|---|---|---|
| AprilTag detection | Tag identity, board position, rotation | Projected object follows the tag; tag pulses on movement |
| Sticky-note color | A physical sticky note is present | Projected highlight follows the detected note, no tag required |
| Marker writing/OCR | There is writing inside a board region | Projected highlighter lands on writing, not the whole zone |
| Action overlaps zone | Student intends to commit/capture that zone | Green drop-zone affordance, then capture confirmation |
| Action overlaps slide/video/figurate card | Student intends contextual control | Local action area label, then pulse/result |
| Camera/OAK stream | Board/room activity and possible pose/class state | Status appears on classroom projector, not hidden UI |
| Phone image capture | User wants visual explanation | Figurate response references the capture |

Implicit behavior must be conservative. If the room is unsure, it should show "thinking" or "needs action" rather than silently doing something large.

## IA Pass

The IA should separate roles by intent:

- Student: `Start`, `Objects`, `Projects`, `Report`
- Room: `Console`, `Board`, `Projector`, `Viewer`, `Cameras`, `Events`
- Lab: `Camera`, `Phone`, `Setup`

For filming, the important pages are:

- `Board`: operator control and quick tag creation.
- `Viewer`: 3D rehearsal and camera/projector setup simulation.
- `Projector`: real fullscreen projection-mapped output.
- `Phone`: handheld lens, Look, Ask, Live.
- `Setup`: calibration tags and detector readiness.

The older table/object-sandbox ideas should not be primary IA. If kept, they should read as compatibility or project-library material, not the main room model.

## Current Affordance Risks

- Too many tag types can blur the grammar. Keep Action as the general commit/control tag instead of adding one-off command tags.
- Rotation is overloaded. It is acceptable for Focus radius, Video scrub, Zone color, and 3D shape only if each projected card states that mapping.
- Implicit sticky/color detection needs visible confirmation; otherwise users will not know whether the camera or projector is responsible.
- Projector mapping must feel physically direct. Any inverted drag or text mirroring breaks trust immediately.
- Board, Viewer, and Projector need to share server state. If one page becomes a private source of truth, the performance will look broken.
- Status messages belong on the classroom projector or board projection during demos, not only in browser chrome.

## CV Stack Decision

The Monday test should keep AprilTags and QR/phone targets as the reliable primary layer. They provide identity, XY, rotation, and calibration with understandable failure modes.

OpenCV preprocessing should be tuned for whiteboard/projector lighting before adding heavier models:

- Use grayscale plus CLAHE by default for AprilTags so projector hotspots and uneven room light do not wash out black/white edges.
- Keep camera buffers short so stale frames do not lag behind hand movement.
- Prefer 1280x720 or 1920x1080 only if the camera can still run at a usable frame rate.
- Use detector decimation as a performance knob after the board is in view.
- Show a debug-preprocess view during setup, then hide it for the demo.

Pose, hands, YOLO/ONNX, and V-JEPA should be secondary layers:

- Pose/hands are worth adding because they fit the classroom body grammar: point-to-focus, two-hand resize, open-palm pause/play, raised-hand timer, and dwell-to-confirm.
- Pose/hands should not be the only way to complete a project. They should add implicit shortcuts on top of Action, tags, board controls, and phone controls.
- YOLO/ONNX object detection is useful for the phone lens and OAK object hints, but it should not be required for Monday because class labels are less stable than tags.
- V-JEPA/classification should describe room state or activity, not drive exact projector geometry.

Every CV inference needs a visible projected affordance before it commits. If confidence is low, the room should ask for Action, phone confirmation, or a tag.

## Video Shoot Beats

1. Calibration: show tags 4-7 on the board, camera sees them, projector mapping aligns.
2. Zone capture: make a zone, drag Action, green zones appear, classroom projector receives summary.
3. Writing: write inside a zone, project highlighter on writing, erase with Tool/Action.
4. Polygon: place Vertex tags, line connects, third tag closes and fills the shape.
5. Slide/video: Slide tag projects deck, Action changes slide; Video tag scrubs/plays.
6. Phone lens: tap Look, ask Figurate what it sees, then start Live.
7. Sticky note: place colored sticky, camera samples color, projector highlights it without a tag.

## Design Rules Going Forward

- Every implicit action needs an explicit projected signifier before it commits.
- Every explicit action needs feedback within 200 ms: pulse, border, label, or projected change.
- Every tag should have one primary meaning and one optional contextual meaning.
- The projector output is the user-facing truth; browser controls are backstage.
- Use green only for "acceptable/actionable drop here" affordances.
- Use yellow/orange for pending/thinking.
- Use blue/cyan for informational overlays.
- Use white glow for focus/highlight.
- Keep calibration markers visually separate from student interaction tags.
