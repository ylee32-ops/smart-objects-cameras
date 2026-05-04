# Tag-Triggered Project Demo — Design

- **Date:** 2026-04-26
- **Status:** Approved by user; pending implementation plan.
- **Audience:** Anyone implementing this feature.

## Goal

In-class demo flow: each student project gets an AprilTag. Placing the tag on the projected/printed board fires a "demo" of that project on the projector. If the student's project is online (recent heartbeat + recent contract event), the room reflects their **real** output. If not, a clearly-labeled **mock fallback** fires so the class still sees what the project is supposed to do.

The mock fallback is intentionally distinguishable: it makes "is your project actually online?" physically tangible.

## Non-goals

- Persistent multi-demo (queues, side-by-side spotlights).
- Tag-in-zone routing (placing a tag in zone X changes behavior).
- Concurrent demos beyond "most recent tag wins."
- Replacing the existing `Run Mock Emit` button — this complements it.
- Sticky-while-tag-visible model (could be added later if 8 s linger feels wrong).

## Components

### 1. Tag → project mapping

New file: `data/project-tags.json`.

```json
{
  "tagFamily": "tag36h11",
  "range": [100, 199],
  "assignments": {
    "100": "smart-stage",
    "101": "focus-beam",
    "102": "forest-classroom"
  }
}
```

- Tag IDs **100–199** reserved for student projects.
- Corner tags (4–7) and focus tag (23) unaffected.
- Loaded at server start. Hot reload is out of scope for now.

### 2. Detection → demo trigger

New module: `server/demo-trigger.js`.

When the existing detection pipeline reports a tag with ID in 100–199 on the **board** surface:

1. Look up `project_id` in `project-tags.json`. If unmapped, ignore.
2. Query readiness for that project (heartbeat freshness + recent contract events).
3. Decide `mock`:
   - `mock = false` if the project's heartbeat is fresh **(≤ 5 s)**.
   - `mock = true` otherwise.
   - Heartbeat is the sole gate — keep it simple.
4. Emit:

   ```json
   { "event_type": "class.demo.fired",
     "payload": { "project_id": "<id>",
                  "tag_id": <int>,
                  "mock": <bool>,
                  "title": "<project title>",
                  "owner": "<owner>" } }
   ```

5. If `mock: true`, immediately replay the project packet's `scenario.events` 250 ms apart. Replayed event payloads are **not** tagged; `class.demo.fired.mock` is the sole source of truth.
6. If `mock: false`, do nothing else; the student's script handles its own emission.

### 3. Persistence model

- **One-shot.** Each detection fires one `class.demo.fired`.
- Spotlight panel on projector lingers **8 s** after the most recent event for that project, then fades.
- Re-placing the tag re-fires.
- **Most-recent-detection wins.** If a different project tag is detected while another is spotlighted, the new project replaces it.

### 4. Projector spotlight overlay

New module on `/projector.html`.

- Slide-in panel, top-right, ~30 % width.
- **Three lines, no more:**
  - Project title (small, top).
  - **One giant word — `LIVE` or `MOCK`** (the entire mock/live signal — green for `LIVE`, warm yellow for `MOCK`).
  - Owner + tag ID (small, bottom).
- That is the whole spotlight v1. Per-project event-shape adapters (number / visual / data) are deliberately deferred — see "Smallest shippable slice / Once green."
- Debounce in the panel, not the trigger: a tag flicker should not cause panel re-mount.

### 5. Authoring & printing

- Extend `/projects.html` with a column showing each project's tag ID and a "Print my tag" link.
- Extend `scripts/generate-apriltag-cards.py` to emit one card per project, labeled with project title, owner, and tag ID, into `public/generated-tags/projects/<project_id>.html`.

### 6. Manual control

New action `class.demo.cleared` (teacher button on `/start.html` or `/console.js`).

## Data flow

```
camera → detector → POST /api/action  (board.tags.detected)
                             │
                             ▼
                  server/demo-trigger.js
                    1. tag in 100–199?
                    2. resolve project_id
                    3. check readiness
                             │
                             ▼
                    emit class.demo.fired
                    if mock: replay scenario events (with mock:true)
                             │
                             ▼
            projector spotlight panel renders
            (with MOCK badge if mock:true)
```

## Smallest shippable slice

1. `data/project-tags.json` with 3 projects mapped.
2. `server/demo-trigger.js` wired into the detection pipeline.
3. Minimal projector spotlight panel — title + giant `LIVE`/`MOCK` + owner / tag ID.
4. Verify by manually POSTing a tag detection.

Once green:

5. Map all 13 projects.
6. Card generator (one labeled card per project).
7. `/projects.html` tag-id column + Print link.
8. `class.demo.cleared` teacher button.
9. **Future:** per-event-shape body adapters (number / visual / data) inside the spotlight.

## Verification

- **Manual:** POST `board.tags.detected` for tag 100 → confirm `class.demo.fired` with `mock: true` and projector spotlight shows MOCK badge.
- **Test script:** new `scripts/test-demo-trigger.js`:
  - tag in range → fires
  - tag out of range → ignored
  - offline project → `mock: true` + scenario replayed
  - online project (faked heartbeat + recent canonical event) → `mock: false`, no replay
  - second tag fires → spotlight project_id changes
- Existing `test:syntax`, `test:events`, `test:smoke` remain green.

## Risks / open questions

- **Linger duration.** 8 s is a guess. Tune from a real class run.
- **Online thresholds.** 5 s heartbeat + 60 s recent event is a guess. Tune from a real class run.
- **Detection cadence.** 300 ms per the current pipeline. Rapid remove/replace could cause flicker; debounce panel mount, not the trigger.
- **Tag printing UX.** Card layout / scale / margin not specified beyond "labeled card per project." Defer to the existing card generator's defaults; revisit if cards don't read at room distance.

## Out of scope but adjacent (don't drift)

- Tutorials feature — separate spec, separate plan.
- Replacing `Run Mock Emit`.
- Real-time student dashboards beyond the spotlight.
- Multi-room / multi-board topologies.
