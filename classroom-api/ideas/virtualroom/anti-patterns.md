# Anti-patterns

Specific bugs that bit the prototype (`ideas/virtual-room.html`). Each one cost 10-30 minutes to diagnose. Don't repeat them.

When in doubt, the **correct** patterns are documented in `docs/sim-conventions.md`.

---

## 1. `Object3D.lookAt()` is asymmetric

**Symptom:** Cameras face the wrong direction. The lens hood points at the target, but the camera itself looks the opposite way. POV panel shows the back wall instead of the table.

**Cause:** Three.js `lookAt()` is implemented differently for cameras vs non-cameras:
- For `Camera` and `Light`: `-Z` axis points at target. (Standard "view direction.")
- For `Group` / `Mesh` / `Object3D`: `+Z` axis points at target. (Opposite.)

If you call `mount.lookAt(target)` on a Group containing a camera child, the **mount's +Z** faces target. The camera child (default forward `-Z`) ends up facing the **opposite** direction.

**Fix:** Use a manual aim helper that always sets local `-Z` toward the target (camera convention):

```js
function aimAt(obj, target) {
  const wp = new THREE.Vector3();
  obj.getWorldPosition(wp);
  const dx = target.x - wp.x, dy = target.y - wp.y, dz = target.z - wp.z;
  const horiz = Math.sqrt(dx * dx + dz * dz);
  obj.rotation.set(
    -Math.atan2(dy, horiz),    // pitch: positive = look down
     Math.atan2(dx, -dz),      // yaw:   matches camera -Z convention
    0
  );
}
```

Use this on the camera **head** group (not the rig). Don't call `Group.lookAt()` for any visible object that has a camera child.

---

## 2. `TransformControls` r170+ requires `.getHelper()` for the gizmo

**Symptom:** Selection logic runs (inspector appears, callbacks fire), but no gizmo arrows ever appear in the scene. `tcontrols.visible = true` does nothing.

**Cause:** In three.js r161+, `TransformControls` was split into the controls (event-handling Object3D) and a separate visual `Helper`. Adding the controls to the scene no longer renders the gizmo.

**Fix:**

```js
const tcontrols = new TransformControls(camera, renderer.domElement);
const tcGizmo = tcontrols.getHelper();
scene.add(tcGizmo);
// Toggle visibility on the gizmo, not on tcontrols:
tcGizmo.visible = (someCondition);
```

Don't `helpers.add(tcontrols)`. Don't try to manipulate `tcontrols.visible`.

---

## 3. Detection payload uses `{x, y}`, not `{u, v}`

**Symptom:** POSTs return 200 OK but markers don't move on `public/projector.html`. The server's `fiducial.detections.ingest` silently skips detections with the wrong shape.

**Cause:** I named pixel coordinates `u, v` (image-coord style) by reflex. The server expects `x, y`.

**Fix:** Always emit:

```js
{
  tagId: 11,
  center:  { x: 512, y: 384 },
  corners: [{ x, y }, { x, y }, { x, y }, { x, y }],
  angle:   0.4,
  confidence: 0.96,
}
```

Both `center` and `corners` use `{x, y}`. The server contract is in `docs/apriltag-and-calibration.md` and `ideas/virtualroom/contract-map.md`. Match it exactly.

---

## 4. `SpotLight.map` only emits where the texture is non-black

**Symptom:** Turning on the projector makes the room look dark — nothing visible on the table except the beam path.

**Cause:** `SpotLight.map` *multiplies* the spotlight's color by the texture sample. Black texels = no light contribution. If your projector canvas is mostly black with a beam drawn on it, only the beam casts any light.

**Fix:** Two coexisting lights:

```js
// Beam projection (texture-mapped, dark elsewhere)
const beamLight = new THREE.SpotLight(...);
beamLight.map = beamCanvasTexture;

// Constant warm wash so the table is visible at all
const projFill = new THREE.SpotLight(0xffd9a8, 5.5, 7, angle * 1.35, 0.5, 0.8);
projFill.position.copy(beamLight.position);
projFill.target.position.copy(beamLight.target.position);
```

Tune intensity for your needs. The `projFill` light is what makes the room actually readable.

---

## 5. Disabling an `OrbitControls` mouse button to `-1` does NOT work

**Symptom:** You set `orbit.mouseButtons = { LEFT: -1, ... }` to free up left-click for selection. Left-click then both fails to orbit (good) and fails to select (bad). Worse, no error.

**Cause:** `OrbitControls` doesn't have a documented "disabled" sentinel. `-1` isn't recognized.

**Fix:** Leave default mouse buttons (LEFT = ROTATE). Detect click vs drag on `pointerup`:

```js
let pdown = null;
canvas.addEventListener('pointerdown', e => {
  if (e.button !== 0) return;
  pdown = { x: e.clientX, y: e.clientY, t: performance.now() };
});
canvas.addEventListener('pointerup', e => {
  if (!pdown) return;
  const dx = e.clientX - pdown.x, dy = e.clientY - pdown.y;
  const dt = performance.now() - pdown.t;
  if (Math.hypot(dx, dy) < 5 && dt < 400) {
    handleClick(e);  // small movement, fast = click
  }
  // else OrbitControls already handled the drag
  pdown = null;
});
```

Markers are an exception — they consume the drag directly (see #6).

---

## 6. Tripod must NOT be a child of the rotating camera mount

**Symptom:** Aim the camera up or down → the tripod tilts off into space. The base is no longer on the floor.

**Cause:** Putting the tripod stem and base inside the same Group that you call `aimAt()` on means they inherit the rotation.

**Fix:** Three-level hierarchy:

```
rig (Group)             — selectable, anchored on the floor; only translates in XZ
├─ stem + base mesh     — vertical, never rotated
└─ head (Group)         — rotates freely (this is what aimAt operates on)
   ├─ body, lens, REC light meshes
   └─ PerspectiveCamera
```

Translate (W) attaches to the rig. Rotate (E) on a camera attaches to the **head**, not the rig.

---

## 7. Don't render the phone in its own POV

**Symptom:** The virtual phone's screen shows a phone, which is showing a phone, which is showing a phone — ouroboros.

**Cause:** When you render the phone-camera POV onto the phone screen mesh via a `WebGLRenderTarget`, the phone is visible in the scene during that render, so the camera sees the phone's own back.

**Fix:** Hide the phone before the phone-screen render pass; restore after:

```js
const wasVisible = phoneObj.visible;
phoneObj.visible = false;
renderer.setRenderTarget(phoneScreenRT);
renderer.clear();
renderer.render(scene, phoneCam);
renderer.setRenderTarget(null);
phoneObj.visible = wasVisible;
```

Same trick applies to camera helpers, gizmos, and the `CameraHelper` on the phone — hide them all before any off-screen render and restore after.

---

## 8. Transform widget should not attach to markers

**Symptom:** Markers grow giant axis arrows when "selected." User can drag the widget but can no longer just grab the card.

**Cause:** Treating markers like other selectable objects.

**Fix:** Markers stay simple. In your pointerdown handler:

```js
if (sel?.userData?.kind === 'marker') {
  startMarkerDirectDrag(sel, e);
  return;  // no transform widget, ever
}
selectObject(sel);
```

Markers use direct `pointermove → raycast to table plane → set position`. Wheel rotates. Doubleclick removes. Treat them as physical cards, not as scene objects with metadata to inspect.

---

## 9. Importing `TransformControls` requires a working importmap

**Symptom:** `Failed to resolve module specifier "three"` at runtime. Page is blank.

**Cause:** `TransformControls.js` from three's addons has a bare `import 'three'`. Without an importmap, the browser can't resolve it.

**Fix:** Use the importmap pattern in `dev.md`. Don't try to load three.js as a side-script — it must be a module specifier that can be resolved.

---

## 10. Hardcoding tag IDs / role colors in client code

**Symptom:** Two sources of truth (`data/tag-map.json` AND a local `ROLES` table). They drift; markers stop matching the server's idea of what a tag is.

**Cause:** Convenience.

**Fix:** Fetch tag map from `/api/tag-map` at boot. Use it as the single source of truth. Keep a tiny fallback for offline dev (with a `console.warn` when used).

```js
async function loadTagMap() {
  try {
    const r = await fetch('/api/tag-map');
    if (r.ok) return await r.json();
  } catch {}
  console.warn('Could not load /api/tag-map; using local fallback');
  return LOCAL_TAG_MAP_FALLBACK;
}
```
