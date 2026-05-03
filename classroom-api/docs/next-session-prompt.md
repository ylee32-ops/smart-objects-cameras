# Next Session Prompt

Use this prompt to start the next design/build session.

```text
We are working in:
C:\Users\ithrel\Documents\GitHub\smart-objects-cameras\classroom-api

Project summary:
This is a local smart classroom / spatial computing prototype. The goal is a magical, mostly invisible room interaction system using a projector, webcam/AprilTags, phone companion, semantic whiteboard, and a future Flowstate room character.

Current primary demo:
Light Lab. Physical/virtual markers become optical objects:
- tag 10 / emitter
- tag 11 / mirror
- tag 12 / blue filter
- tag 13 / splitter
- tag 14 / blocker
- tag 15 / target
- tag 16 / explain

Core demo verbs:
1. Place: place markers and projected light reacts.
2. Pass: send a room object/result to the board.
3. Point: focus a board/table region.
4. Ask: room character explains/hints from room state.
5. Reveal: show tags, calibration, rays, errors, event routing.
6. Bind: bind a marker to a slide/concept.
7. Collaborate/AR: phone companion selects and controls targets.

Important design principle:
Magic first, reveal second.
The projected/audience-facing UI should feel like the room is responding to physical objects, not like a dashboard. Debug, logs, calibration, and controls should be hidden/offstage or only appear in Reveal mode.

Current local URLs:
- Control: http://localhost:4177
- Projector output: http://localhost:4177/projector.html
- Camera simulator/operator: http://localhost:4177/camera.html
- Table: http://localhost:4177/table.html
- Board: http://localhost:4177/board.html
- Phone: http://localhost:4177/phone.html
- Marker card preview: http://localhost:4177/cards.html
- Official generated tag cards: http://localhost:4177/generated-tags/cards.html

What is already implemented:
- Vanilla Node server in server.js.
- Static browser pages in public/.
- Room config in data/room-config.json.
- Tag map in data/tag-map.json.
- Calibration homography math in lib/homography.js.
- Persistent calibration in .local/calibration.json.
- Replay log in .local/event-log.jsonl.
- Detector venv setup scripts.
- Real AprilTag detector bridge scaffold: scripts/apriltag-detector.py.
- Detection simulator: npm run simulate:detections.
- Official marker card generation already works using .venv-detector.

Current validation:
Run:
npm run preflight
Expected:
preflight passes with 0 warnings.

Detector setup done:
.\scripts\setup-detector.ps1 has been run.
Generated cards exist in public/generated-tags/.

Important files:
- README.md
- docs/tomorrow-setup-runbook.md
- docs/apriltag-and-calibration.md
- docs/oak-room-perception-plan.md
- docs/room-setup.md
- docs/smart-classroom-demo-script.md
- docs/smart-classroom-ideation.md
- docs/detector-setup.md
- docs/next-session-prompt.md

Next desired session:
Do a serious UI/interaction design overhaul, probably with standalone experimental pages under ideas/.
We want less dashboard, less bubble, more elegant/magical/serious.
The main projector experience should feel like a spatial instrument or responsive room surface.
The phone should feel like a lens/wand/remote that only reveals controls for the selected object.
The camera/operator page can stay utilitarian, but should not be audience-facing.

Possible standalone ideas pages:
- ideas/light-lab-stage.html: pure magical Light Lab projection concept.
- ideas/phone-lens.html: phone companion concept with object-specific controls.
- ideas/reveal-overlay.html: elegant reveal/debug overlay concept.
- ideas/marker-card-system.html: print/card visual design system.
- ideas/board-notes.html: semantic whiteboard/sticky-note interaction concept.

First tasks:
1. Review the current app quickly.
2. Propose a UI overhaul direction.
3. Build 2-3 standalone concept pages under ideas/ without breaking the working prototype.
4. Keep existing server/API stable.
5. Only integrate the best design direction after review.
```
```
