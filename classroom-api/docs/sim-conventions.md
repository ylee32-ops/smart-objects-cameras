# Sim Conventions

How orientation, hierarchy, and ID assignment work inside `ideas/virtual-room.html` so we don't keep tripping over the same coordinate-system bugs.

## Coordinate system

Standard three.js, right-handed, Y-up.

| Axis | Direction in the room |
|---|---|
| **+X** | toward the right wall (room-right when standing at the audience) |
| **−X** | toward the whiteboard (left wall) |
| **+Y** | up (ceiling at +3.0 m) |
| **−Y** | down (floor at 0) |
| **+Z** | toward the audience (front of room) |
| **−Z** | toward the back wall |

Room half-extents: `ROOM_HALF = 3.0` (X), `ROOM_DEPTH = 3.0` (Z), `ROOM_HEIGHT = 3.0` (Y).
The collab table surface is centered at the origin, 1.8 × 1.8 m, at `TABLE_Y = 0.72`.

## Forward conventions

This is the one that keeps biting us:

- **`PerspectiveCamera`**, **`SpotLight`**, **`DirectionalLight`** — forward is **local −Z**.
- **`Object3D` / `Mesh` / `Group`** — by three.js convention also **local −Z**, BUT…

### `lookAt()` is asymmetric

`Object3D.lookAt(target)`:
- For **cameras and lights**: rotates so the object's **−Z** points at `target`. (What you want.)
- For **non-cameras** (Group, Mesh): rotates so the object's **+Z** points at `target`. (Backwards from camera convention.)

This caused both early camera bugs in the sim — the camera child looked the opposite direction from the body mesh's lens.

**Use `aimHeadAt(head, target)`** in `virtual-room.html` instead of `Group.lookAt()`. It computes yaw + pitch directly so −Z faces the target, matching camera convention.

```js
function aimHeadAt(head, target) {
  const wp = new THREE.Vector3(); head.getWorldPosition(wp);
  const dx = target.x - wp.x, dy = target.y - wp.y, dz = target.z - wp.z;
  const horiz = Math.sqrt(dx*dx + dz*dz);
  head.rotation.set(-Math.atan2(dy, horiz), Math.atan2(dx, -dz), 0);
}
```

In the clean virtual-room implementation, the shared helper is `ideas/virtualroom/src/orientation.js`:

```js
import { aimMinusZAt, headingForObject } from "./orientation.js";
```

Use `aimMinusZAt(object, target)` for cameras, projectors, and any future directional rigs. Use `headingForObject(object)` for 2D arrows. Do not hand-roll yaw math in individual modules.

## Camera rig hierarchy

Each camera is three nested objects. Don't collapse them:

```
rig (Group)             ← selectable, anchored on the floor (or ceiling for overhead)
├─ stem / tripod / base ← visual support, stays vertical
└─ head (Group)         ← rotates to aim
   ├─ body, lens hood, viewfinder, REC light  ← visual indicators of "front"
   └─ PerspectiveCamera                       ← actual three.js camera, default forward −Z
```

- **Translate (W)** attaches the gizmo to the **rig** with `moveAxis: 'xz'` → drag on floor only.
- **Rotate (E)** attaches the gizmo to the **head** with full XYZ rotation → tilt freely without flopping the tripod.
- The phone is a single object (no rig/head separation) and rotates freely on XYZ.

## Camera body visual indicators

The lens hood (a `CylinderGeometry` ring) sticks out of the camera's **−Z** face. The REC light (red dot) is on **+Z** (back). The viewfinder hump is on **+Y** (top). When the visual is rotated wrong, look for these landmarks first — they tell you which way the camera is actually facing.

## Tag IDs

Match `data/tag-map.json` so simulator detections are interchangeable with real-detector detections.

| Tag | Role |
|---|---|
| 0–3 | Table calibration corners (TL, TR, BR, BL) |
| 4–7 | Board calibration corners |
| 10 | Emitter |
| 11 | Mirror |
| 12 | Filter |
| 13 | Splitter |
| 14 | Blocker |
| 15 | Target |
| 16 | Function (Explain) |
| 20–29 | Sticky notes on board |

Sim uses `nextTagId(role)` to start at the role's `startTag` and bump by 10 on collision.

## Detection payload shape

Server expects `{x, y}` for `center` and `corners`, NOT `{u, v}`. Sim respects this. Don't change unilaterally.

```json
{
  "type": "fiducial.detections.ingest",
  "payload": {
    "surface": "table",
    "sourceSpace": "camera" | "surface",
    "detections": [
      { "tagId": 11, "center": {"x":..,"y":..}, "corners":[...], "angle":.., "confidence":.. }
    ]
  }
}
```

Sim posts both `center` (camera-space pixels) and `surface` (already-normalized 0..1) so either ingest path works.

## Selectable objects

An object is selectable iff `userData.selectable === true`. Children indicate their selectable parent via `userData.parent`. The pick logic walks up the chain via `findSelectableAncestor`.

| Kind | `allowMove` | `allowRotate` | Notes |
|---|---|---|---|
| `marker` | drag-only (no widget) | wheel-only | Doubleclick removes. |
| `table` | XZ | yaw | Two parallel tables form one logical surface. |
| `whiteboard` | full | (handled by `snapsToWalls`) | Snaps to nearest wall within 0.6 m. |
| `projector` | full | yaw | |
| `camera` | XZ on rig | head: XYZ free | See rig hierarchy above. |
| `phone` | full | XYZ free | |
| `person` | XZ | yaw | Removable. |

## Render passes (per frame)

1. Main perspective view (`renderer.render(scene, mainCam)`)
2. POV panel (`povRenderer.render(scene, activeCamera)`) — gizmos & helpers hidden
3. Phone-lens preview panel (`phoneRenderer.render(scene, phoneCam)`) — phone itself hidden
4. Phone-screen render-target (`renderer.setRenderTarget(phoneScreenRT); renderer.render(scene, phoneCam)`) — drives the texture on the in-scene phone screen mesh
5. Detection generation + overlay drawing on the right-rail canvases

Gizmo (`tcGizmo`) and camera helpers visibility are restored after off-screen passes.

---

# Calibration plan (deferred — track here)

Three independent calibrations, each a one-time-per-session homography. The server already has the actions (`calibration.sample.add`, `calibration.solve`) — we just need to drive them from a UI.

## 1. Camera-to-surface (each camera × each surface it sees)

Standard 4-point homography. The four visible calibration corner tags (IDs 0–3 for table, 4–7 for board) give us the four `{ surfacePoint, cameraPoint }` pairs. Solve and store in `.local/calibration.json`.

UI: in the operator console (or sim), display the camera POV, click each of the four corner tags in order, hit "Solve." Reprojection error should land < 1 px. If not, re-mount and retry.

The sim already projects calibration-corner positions from each camera every frame, so we can drive the sample step automatically — a button labeled "Auto-calibrate (sim)" can fill in the four samples without clicks.

## 2. Projector quad-warp (keystone correction per projector)

Real projectors are rarely perfectly orthogonal to the surface. Each projector needs a **homography from projector pixels → surface coordinates**, applied as an inverse pre-warp before render.

Two ways to do this:

**Manual quad-warp**: project four numbered dots at the corners of the intended surface area, drag each in the projector UI to the actual surface corner. Store `projectorCorners` and compute the inverse-perspective transform. Apply via a CSS `matrix3d()` on the projector page or via WebGL render-target warp.

**Camera-assisted**: project the four dots, let the camera detect their actual positions on the surface, compute the projector→camera homography directly. More accurate, requires camera calibration done first.

The Epson EF-12 has hardware keystone, so for the wall projector that may be enough at first. The AAXA P6U on the table needs software warping if it's not perfectly perpendicular.

## 3. Projector pose in 3D (only if doing AR-style projection mapping later)

Required if we ever want to project onto non-flat surfaces (e.g., a tilted notebook on the table). For flat surfaces, the homography in step 2 is sufficient.

## What to wire up first

1. Camera-to-table calibration (the 4-corner ingest path the server already supports).
2. Projector keystone for the table projector via the AAXA's built-in keystone — software warp later.
3. Camera-to-board calibration once the second camera is mounted.
4. Projector keystone for the wall projector via Epson hardware.

Skip projector→camera homography until we actually need overlay alignment for AR effects.

## Sim ↔ real parity

The sim's "Source: surface" mode bypasses calibration (uses ground-truth coords). The "Source: camera" mode forces the server's homography path to run, which is the same code real detector calls. Use the camera-pixels mode in the sim to validate the server's calibration math before touching real hardware.
