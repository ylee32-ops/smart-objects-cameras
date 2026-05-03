# Canonical Master Plan

Purpose: keep `master` stable while letting experiments move quickly on branches.

This repo is the clean smart-classroom integration layer. Older class repos are reference, not architecture to copy.

## Branch Roles

| Branch | Role | Merge Status |
| --- | --- | --- |
| `master` | stable local foundation | keep clean |
| `event-contract-hardening` | event contract, recent/replay filters, simplicity rules | candidate for master |
| `class-object-foundation` | planning doc for 13 class objects | candidate after event contract |
| `student-project-sim` | full class-object simulator, inspector, projector/detection sim | candidate after review |
| `next-foundation` | heavy virtual room, robot/human/spatial experiments | do not merge wholesale |

## Master Merge Order

1. **Event foundation**
   - Branch: `event-contract-hardening`
   - Cherry-pick:
     - `9e63c7c define event contract`
     - `5510f05 add recent event filters`
     - `26d1fef document engineering simplicity rules`
   - Why: this is the lowest-risk shared foundation.

2. **Class object plan**
   - Branch: `class-object-foundation`
   - Cherry-pick:
     - `052d676 plan class object simulations`
   - Why: documents the supported student-project surface area.

3. **Student simulator**
   - Branch: `student-project-sim`
   - Review first, then cherry-pick in order:
     - `bd9030b add class object simulator`
     - `343e7a0 add 2d and 3d class object views`
     - `94b78f1 simulate projection and detection frames`
     - `994ea0d map class object events to room surfaces`
     - `8549434 add event inspector prototype`
     - `81a3947 add class object scenarios`
   - Why: useful, but larger UI surface. Should be reviewed after event contract lands.

4. **Virtual room experiments**
   - Branch: `next-foundation`
   - Do not cherry-pick wholesale.
   - Mine selectively later:
     - local-only dependency lesson
     - diagnostic/access-log ideas if needed
     - spatial frame lessons
     - robot/human prototype lessons
   - Rebuild cleanly if those ideas graduate.

## Merge Gate

Before each cherry-pick or merge to `master`:

```powershell
npm run check
npm run test:calibration
npm run preflight
```

If event contract changes are included:

```powershell
npm run test:events
```

If server startup changes are touched:

```powershell
.\scripts\stop-room.ps1
.\scripts\start-room.ps1
Invoke-RestMethod http://127.0.0.1:4177/api/health
```

## Engineering Rules

Follow `docs/engineering-rules.md`.

Important constraints:

- No wrapper classes around simple functions.
- No second event bus on top of SSE.
- No project registry until the simulator proves it needs one.
- No capability router until multiple real providers exist.
- No config system for one config.
- No schema library until hand-written validation becomes painful.

## What Master Should Support

Master should become a reliable local classroom runtime:

- local server
- `POST /api/action`
- SSE `/api/events`
- replay `/api/replay`
- current state `/api/state`
- event contract helpers
- projector, board, table, camera pages
- class-object simulator after review
- event inspector after review

## What Master Should Not Absorb Yet

- procedural 3D humans
- robot-arm kinematic experiments
- virtual-room spatial hacks
- dependency-heavy 3D asset/model loading
- Flowstate integration beyond documented event contracts
- OAK-D multi-camera fusion code before hardware testing

## Criteria For Promoting Experiments

An experiment can move toward master only when:

- it has a simple contract
- it passes preflight
- it runs without internet
- it does not require hardware to test
- it has a clear fallback path
- its abstractions are justified by real repeated use

## Current Recommendation

Merge `event-contract-hardening` first.

Then pause and review `student-project-sim` in the browser before bringing it to master. It is useful, but it should stay optional until the event contract is settled.
