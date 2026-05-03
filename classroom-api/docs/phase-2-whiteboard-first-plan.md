# Phase 2 Whiteboard-First Plan

This phase simplifies the smart classroom direction:

- one projector
- projector aimed at the whiteboard
- whiteboard is the main interaction surface
- table interactions become secondary/supporting

This is a deliberate simplification. It reduces setup complexity and makes the system more distinctive than common table-tag demos.

## Why This Direction

- easier physical setup
- easier calibration story
- fewer moving parts
- better fit for OCR, stickies, notes, board tools, AprilTags, and human collaboration
- stronger support for wall robot writing and camera reading
- more interesting than projector-on-table alone

## New Center Of Gravity

The main system should be about:

1. humans interacting with the whiteboard
2. board markers / stickies / AprilTags
3. camera(s) reading whiteboard state
4. one projector augmenting the whiteboard
5. room character narrating / reacting to whiteboard activity

## Core Foundation Priorities

1. **Whiteboard-first surface model**
   - board tools
   - stickies
   - board tags
   - board text / OCR state

2. **Single-projector whiteboard calibration**
   - simpler projection footprint
   - simpler camera/projector mapping

3. **Board camera detection + projection frame sim**
   - board-focused camera frustums
   - board-focused detection events
   - board-focused projection events

4. **Student project contract shift**
   - reads board
   - writes board
   - reacts to board
   - safeguards board/robot/humans

## Not The Focus

- multi-projector complexity
- table-centric AprilTag demos as the primary story
- polishing 3D robots/humans before board data contracts are stable

## CSS / UI Agent Prompt

Use this prompt for a dedicated CSS/UI pass:

```text
You are working in:
C:\Users\ithrel\Documents\GitHub\smart-objects-cameras\classroom-api

Read first:
- README.md
- docs/canonical-master-plan.md
- docs/engineering-rules.md
- docs/class-object-simulation-plan.md
- public/class-objects.html
- public/events.html
- public/projects.html
- public/project.html
- ideas/virtualroom/index.html
- ideas/virtualroom/virtual-room.css

Context:
We are simplifying the product direction:
- One projector only
- Projector aims at the whiteboard
- Whiteboard is the main interaction surface
- Table interactions are secondary
- The current student-project-sim branch already has working foundation and event/data layers
- Do NOT redesign backend contracts or server logic
- Do NOT add new dependencies
- Do NOT introduce dashboard-heavy UI
- We want a cleaner, more beautiful IA using the visual language of the virtual room

Your job:
Do a UI / IA / CSS pass only.

Goals:
1. Make the browser app feel centered around the whiteboard workflow.
2. Use the virtual-room design language:
   - dark restrained background
   - elegant thin rules
   - mono labels
   - quiet floating panels
   - minimal but clear controls
3. The landing/control experience should feel like a live room console, not a generic dashboard.
4. Prefer one strong central scene/preview area with smaller floating controls around it.
5. Keep everything simple and readable. Reduce clutter and repeated buttons.
6. Preserve existing functionality and routes.

Specific targets:
- public/index.html
- public/class-objects.html
- public/events.html
- public/projects.html
- public/project.html
- public/shared.css

Design direction:
- Use the virtual classroom 3D view as inspiration for layout and atmosphere.
- The main interface should feel like floating tools around a scene, not stacked admin cards.
- Reduce bubble/button heaviness.
- Make hierarchy obvious:
  - primary action area
  - current status
  - supporting tools
- Keep controls compact and professional.
- Avoid colorful dashboard blocks unless they communicate state clearly.
- Keep typography disciplined.
- Make mobile not terrible, but optimize for desktop first.

Constraints:
- No backend/server changes.
- No JS logic changes unless absolutely needed for layout toggles or small UI state.
- No new libraries.
- Keep HTML/CSS maintainable.
- Do not touch ideas/virtual-room.html (read-only inspiration).
- If a page is already functionally dense, improve grouping and spacing instead of adding more chrome.

Deliverable:
A clean CSS/IA pass that makes the student-project-sim pages feel coherent, minimal, and visually aligned with the virtual room.
```

## Merge Guidance

Do not merge Phase 2 styling before the whiteboard-first foundation is stable.

Foundation first:

- event contracts
- class object state
- board-first scenarios
- board-first project packets

Then UI pass.
