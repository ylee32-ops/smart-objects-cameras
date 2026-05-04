# Phase 4 brief

**Humans in the loop.** People appear in the room, hold things, point at things. Cameras *see* them as poses, not just markers. The room can act on what people do, not just what cards do.

This is the most exploratory phase. Expect to revise this brief during the work — the visual quality of the people and the reliability of the synthetic pose detection will inform what's worth keeping vs cutting.

Read first:
- `phase-3-brief.md` — Phase 3 must be done.
- The three.js IK demo: <https://threejs.org/examples/#webgl_animation_skinning_ik> (the user's primary reference).
- `https://github.com/jsantell/THREE.IK` — alternate IK implementation, optional.
- `contract-map.md` "Future Intent" section — `intent.ray.estimated` and `intent.target.resolved` ride inside `event.manual`.
- `docs/sim-conventions.md` "Forward conventions" — orientation gotchas apply to character bones.

Tone for this phase: **scrappy.** Ship 2-3 lo-fi people, simple bone-rotated arms, a basic synthetic pose pipeline. Don't try to ship a character animation system. The point is testing the *perception* pipeline, not making humans look beautiful.

---

## Scope

1. **Lo-fi people** — 2-3 of them, around the table and at the whiteboard. Selectable, draggable, removable. Same procedural style as the prototype but cleaned up.
2. **CCDIKSolver-based arm IK** — at least the right arm. Hand follows a target Bone. Per-person target resolves to "nearest visible card" or "phone in hand."
3. **Robot arm option** — a draggable robot-arm device that can replace a person at the table. Same target logic; visually different.
4. **Synthetic pose detection** (the surprise) — for each (camera × person) pair, project the person's joints to camera-space pixels with realistic noise and dropout. Emit `intent.ray.estimated` events from the dominant arm. Compute pointing target via raycast and emit `intent.target.resolved`. Closes the perception loop end-to-end.
5. **Hide / show toggles** for people groups (table-side, whiteboard-side, all).

---

## 1. Lo-fi people

```
src/people.js
```

```js
export class PeopleManager {
  constructor({ scene });
  add({ x, z, rotY, pose: 'stand' | 'lean' | 'phone' | 'point' });
  remove(person);
  list();
  setVisibility('table' | 'board' | 'all', visible);
}
```

Each person is a `Group` with:
- Capsule torso, sphere head, cylinder legs/arms.
- Bone hierarchy on the right arm: shoulder → elbow → wrist (Phase 4 IK target). Use `THREE.Bone` so it's compatible with `CCDIKSolver`.
- Optional left-arm phone mesh for the "phone" pose.
- Material: matte warm taupe `0x342f29`. Head slightly lighter `0x4a423a`. Match the design system.

Pose presets are starting positions; once IK is wired, the right arm is overridden by the IK solver.

### Acceptance

☐ Default scene has 2 people: one at the table, one at the whiteboard.
☐ Add Person button drops a new person near the camera focus.
☐ People are selectable, draggable on XZ, rotate (yaw only). Removable.
☐ Visibility toggles: `[ Table-side ] [ Board-side ] [ All ]`.

---

## 2. CCDIKSolver arm IK

The user's referenced demo uses `CCDIKSolver` with a `SkinnedMesh`. Follow the same pattern:

```js
import { CCDIKSolver } from 'three/addons/animation/CCDIKSolver.js';
```

### Per person

Build a minimal `SkinnedMesh` for the right arm:
- Bones: `shoulder` → `upperArm` → `forearm` → `hand` → `target`.
- Skin geometry can be a thin invisible cylinder (we don't actually need to skin visible meshes — we use bone-parented primitives instead). The `SkinnedMesh` exists only to satisfy the `CCDIKSolver` API.
- Mount the visible upper-arm and forearm capsules as **children of the bones** (not skin-bound). When the bones rotate, the capsules follow.

```js
const iks = [{
  target: 4,    // index of `target` bone
  effector: 3,  // index of `hand` bone
  links: [
    { index: 2 },  // forearm
    { index: 1 },  // upperArm
  ]
}];
const ikSolver = new CCDIKSolver(armSkinnedMesh, iks);
```

### What the target tracks

Per-person target rule:
- If person has the phone in hand: target = wherever the phone is.
- Else if person is in `point` pose and a marker is being aimed at: target = nearest visible card to the person.
- Else: idle target = a "rest" position at the side (arm hanging).

Per frame, update `targetBone.position` to the current target, then `ikSolver.update()`.

### Acceptance

☐ For a `phone` pose person, the right hand visibly tracks the phone wherever it moves.
☐ For a `point` pose person, the right hand tracks the nearest visible marker on the table.
☐ When the target moves out of arm reach (e.g., across the room), the arm extends as far as it can but doesn't snap or jitter.
☐ Disabling IK on a person reverts the arm to its rest pose smoothly.
☐ Frame rate stays ≥ 30 fps with 3 people IK-active.

---

## 3. Robot arm option

A multi-link robot arm device that's an alternative to a human. Visually a CAD-like assembly: cylindrical base, two links, a small gripper/pen tip end-effector. Reference: `https://threejs.org/examples/webgl_loader_collada_kinematics.html`.

### Build vs load

Either is fine:
- **Build procedurally** (recommended): 3-bone kinematic chain (`base` → `joint1` → `joint2` → `endEffector`). IK same as person arm.
- **Load FBX/GLB**: only if a free model fits the aesthetic and stays under 1 MB.

Mount on the table edge by default. Selectable, draggable, removable.

The robot arm uses the same `target` API as a person — its target tracks the nearest selected card or follows the phone. Toggle `[ Person | Robot ]` in the table seat.

### Acceptance

☐ Add Robot Arm drops a clean CAD-style arm at the table.
☐ Arm tracks the same target a person would.
☐ Selectable, draggable on XZ.
☐ End effector visibly arrives at the target marker within reach.

---

## 4. Synthetic pose detection (the surprise)

Closes the perception loop end-to-end: virtual person points at virtual card → virtual camera "sees" the pose → sim posts intent events → server resolves a target.

### Pipeline

For each (camera × person) pair the camera can see:

1. **Joint projection.** Project these joints into camera-space pixels: `head`, `shoulder_l`, `shoulder_r`, `elbow_r`, `wrist_r`, `hip_l`, `hip_r`. (Right side only is fine for v1.)
2. **Noise.** Add ±2 px Gaussian per joint (configurable).
3. **Dropout.** 5% chance per joint per frame to be missing (configurable).
4. **Confidence.** Joints inside the FOV with no occlusion get `confidence: 0.85-0.95`. Joints occluded by markers/projector body/other people get `confidence: 0.2-0.5`. Missing joints get omitted.
5. **Multi-camera fusion.** If two cameras both see a joint, average the back-projected 3D positions weighted by confidence. (For v1, single-camera back-projection from the table plane is acceptable — assume the joint is at table height + an estimated body offset.)
6. **Intent ray.** From the right shoulder through the right wrist, build a ray. Extend to the table plane.
7. **Resolved target.** Find the nearest marker to the ray's table intersection within ~15 cm. If found: `intent.target.resolved` for that marker.

### Events

```js
// Once per detection cycle (~12 Hz):
postAction('event.manual', {
  event_type: 'intent.ray.estimated',
  payload: {
    actorId: 'person-1',
    rayType: 'right_hand',
    origin: { x, y, z },           // shoulder world coords
    direction: { x, y, z },        // normalized shoulder→wrist
    confidence: 0.78,
  }
});

// Only when a target resolves AND it's a different target than last time:
postAction('event.manual', {
  event_type: 'intent.target.resolved',
  payload: {
    actorId: 'person-1',
    intent: 'pointing',
    targetId: 'mirror-a',
    targetType: 'object',
    confidence: 0.82,
  }
});
```

(Both events ride inside `event.manual` because the server doesn't have first-class `intent.*` handlers yet — see `contract-map.md` "Future Intent.")

### UI

A "Pose" panel in the rail:
- Toggle `[ Synthetic pose ON ]`.
- Per-person: list with name, currently-resolved target, last ray confidence.
- A small "Show pose stickfigures" overlay: in 3D, draw thin lines connecting detected joints (visible from each camera's POV). In 2D, the same overlay on the top-down view. This makes the synthetic detection legible.

### Why it matters

This is what turns the sim from "we faked detections" into "we faked the whole perception stack." When you swap to real cameras + a real pose model (MediaPipe / OpenPose / OAK-D), the same intent events flow into the same server handlers, and Light Lab's "point at the mirror" interaction works without any other sim code changing.

### Acceptance

☐ Toggle Synthetic pose ON. Each visible person produces an `intent.ray.estimated` event ~12 Hz.
☐ Person in `point` pose, hand near a marker → `intent.target.resolved` for that marker fires.
☐ Move the person → resolved target updates within ~200 ms.
☐ Person standing behind a projector mast → joint confidence drops; events flag low confidence.
☐ Stickfigure overlay visible in both 2D and 3D modes.
☐ Server `/api/replay` shows the new `event.manual` entries with `intent.*` event_types.

---

## 5. Hide / show toggles

In the People panel:
- `[ Table-side ] [ Board-side ] [ All ]` toggles.
- Each toggle hides/shows the matching group.
- An "All off" hotkey for clean demos: `Shift+P`.

This is small but essential — you'll routinely want a clean room for screenshots, then re-add people for testing perception. Don't skip.

---

## Module additions

```
src/people.js                        manage person objects + bones
src/people-ik.js                     CCDIKSolver setup; per-person solver instances
src/robot-arm.js                     procedural robot arm + IK
src/pose-detection.js                synthetic pose pipeline (project + noise + emit)
```

`detections.js` learns `event.manual` posting (or just uses `server-client.postAction` directly).
`view2d.js` learns to render people as circles with chevrons + stickfigures.

No new dependencies. Three.js addons (`CCDIKSolver`) come via the existing importmap.

---

## Bonuses (only if there's time)

### B1. Multi-person occlusion

When one person stands between a camera and a marker, drop the marker's confidence in that camera. Real-world correctness; tests the room's tolerance for transient occlusion.

### B2. Animated idle pose

Subtle breathing motion (head bob, slight torso sway). Kills the "people are statues" feel. Pure cosmetic.

### B3. Two-camera triangulation

Real multi-view geometry. When two cameras both see the right wrist, triangulate the 3D position rather than back-projecting from the table plane. More accurate intent ray.

### B4. Pointer hand pose

Right hand opens to a "pointing finger" geometry when the person is in `point` mode. Cosmetic but closes the visual gap between "raised arm" and "actually pointing."

---

## What's NOT in Phase 4

- Reveal overlay. Phase 5.
- Demo lockdown / one-click clean demo state. Phase 5.
- Real BarcodeDetector / AprilTag-wasm in the phone overlay. Phase 5 or "phone-perception" follow-up.
- Voice / Ask scenes. Out of scope for the sim entirely (lives elsewhere).

---

## Acceptance — Phase 4 (top level)

☐ All Phase 1, 1b, 1c, 2, 3 acceptance criteria still pass.
☐ `npm run preflight` passes.
☐ 2-3 lo-fi people in the default scene; visible in 2D + 3D + camera POVs.
☐ Phone-pose person's right hand visibly tracks the phone via IK.
☐ Robot arm option works as a person alternative at the table.
☐ Synthetic pose detection emits `intent.ray.estimated` and `intent.target.resolved` events.
☐ Stickfigure overlay visible in both modes.
☐ People hide/show toggles work.
☐ Frame rate ≥ 30 fps with everything on.

## Hand-off checklist

☐ All Phase 4 acceptance checked.
☐ Comments in `pose-detection.js` document which joints are projected and which intent events are emitted.
☐ Bones use the established forward conventions (anti-pattern #1 still applies to bone rest positions).
☐ Robot arm and people share IK code where reasonable; don't fork the solver setup.
☐ "All off" demo hotkey works.

---

## Note on revision

This brief will almost certainly be wrong in places by the time it ships. The `CCDIKSolver` setup might need a different bone topology than what I sketched; the synthetic pose noise model might need to be more nuanced; the robot arm might be a one-line load instead of a full procedural build. Treat the section headings as committed scope and the implementation details as suggestions.

When something deviates meaningfully from this brief, leave a brief note at the top of the deviating module — `// deviates from phase-4-brief.md §2 because ...` — so a reviewer can re-orient quickly.
