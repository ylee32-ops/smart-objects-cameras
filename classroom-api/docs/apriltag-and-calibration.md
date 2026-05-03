# AprilTags And Calibration Plan

## Can We Style AprilTags?

AprilTags are stricter than QR codes.

What must stay unchanged:

- The black/white tag grid.
- The black border and encoded interior cells.
- The square shape.
- A clean white quiet margin around the tag.
- High contrast and flat printing.

What we can style:

- Put the tag on a designed card.
- Add icons, labels, colors, and shapes outside the quiet margin.
- Use different card colors per object type.
- Add human-readable IDs like `Emitter`, `Mirror`, `Target`, `Board Note 3`.
- Put the tag in a corner of a sticky note.
- Use arrows/ports/affordance graphics around the tag.

What to avoid:

- Do not put an icon inside the tag.
- Do not round the tag itself.
- Do not use gradients or colored cells inside the tag.
- Do not crop the quiet margin.
- Do not laminate with glare if the camera angle is steep.

Design pattern: make "tag cards," not decorative tags. The AprilTag is the machine-readable anchor; the rest of the card is for people.

## Tag Card Types

| Card | Tag Placement | Human Design |
| --- | --- | --- |
| Light emitter | Tag in top-left corner | Beam icon and direction arrow |
| Mirror | Tag in corner | Reflective stripe and rotation handle |
| Target | Tag in corner | Receiver ring |
| Function card | Tag in corner | Verb label: `explain`, `copy`, `invert`, `simulate` |
| Sticky note | Small tag in one corner | Writable note area, color-coded note type |
| Surface marker | Large fixed tag | Label: `TABLE TL`, `BOARD BR`, `PROJECTOR TARGET` |

## Recommended First Tags

Use one AprilTag family consistently, likely `tag36h11`.

Initial IDs:

| Tag ID | Object |
| --- | --- |
| 0 | Table top-left calibration |
| 1 | Table top-right calibration |
| 2 | Table bottom-right calibration |
| 3 | Table bottom-left calibration |
| 4 | Board top-left calibration |
| 5 | Board top-right calibration |
| 6 | Board bottom-right calibration |
| 7 | Board bottom-left calibration |
| 10 | Emitter |
| 11 | Mirror |
| 12 | Blue filter |
| 13 | Target |
| 14 | Explain function card |
| 20-29 | Movable sticky notes |

## Calibration Model

Everything should map into normalized surface coordinates first:

```text
camera pixels -> detected tag corners -> surface coordinates 0..1
projector pixels -> surface coordinates 0..1
phone target -> object/surface id
```

The room server should not care whether an object came from:

- dragged browser mock,
- AprilTag detection,
- phone AR target,
- hand tracking,
- manual console event.

All should emit the same event shape.

## Table Calibration

1. Put four fixed calibration tags at the table corners.
2. Measure table width and height.
3. Detect each tag's center/corners in camera pixels.
4. Assign known table coordinates:

```text
top-left:     0,0
top-right:    1,0
bottom-right: 1,1
bottom-left:  0,1
```

5. Compute a homography from camera pixels to table coordinates.
6. Save calibration as JSON.

Then every movable tag detected by the camera can be transformed into table coordinates.

## Projector Calibration

Start with a browser projection window:

```text
http://localhost:4177/projector.html
```

For real projection:

1. Put the projector window fullscreen on the second display.
2. Show four projected calibration dots.
3. Either manually click those dots in the camera view or detect them visually.
4. Compute projector pixels to surface coordinates.
5. Save the transform for the table or board.

MVP shortcut:

- Use the fullscreen browser output as the "projector."
- Tune layout in CSS/browser first.
- Add real projector warping only after the interaction loop works.

## Board Calibration

Same as table calibration, but for the whiteboard:

- Four fixed board tags.
- Board physical width/height.
- Camera pixel to board coordinate homography.
- Optional projector-to-board homography for projected overlays.

Sticky-note tags can then be tracked as movable board objects.

## Phone AR / Companion Calibration

Start simple:

- QR or AprilTag target selects a room object or surface.
- Phone sends `phone.target.selected`.
- Controls operate on that target.

Later true AR:

- Use known AprilTag size.
- Use phone camera intrinsics or browser estimates.
- Estimate phone pose from tag corners.
- Render a phone overlay in screen coordinates.

The first useful AR behavior is object targeting, not perfect 3D placement.

## DMX Focus Beam Calibration

1. Pick known board/table points.
2. Aim the DMX light manually at each point.
3. Record pan/tilt values.
4. Fit interpolation from surface coordinate to pan/tilt.
5. Add safety bounds and intensity limits.

MVP shortcut:

- Use projected highlight first.
- Add DMX after the point/focus interaction is stable.

## Calibration Data Shape

```json
{
  "surfaces": {
    "table": {
      "width_mm": 1800,
      "height_mm": 900,
      "calibration_tags": [0, 1, 2, 3],
      "camera_to_surface_homography": [1, 0, 0, 0, 1, 0, 0, 0, 1]
    },
    "board": {
      "width_mm": 2400,
      "height_mm": 1200,
      "calibration_tags": [4, 5, 6, 7],
      "camera_to_surface_homography": [1, 0, 0, 0, 1, 0, 0, 0, 1]
    }
  }
}
```

## Server Calibration Actions

The boring important foundation is now explicit:

| Action | Purpose |
| --- | --- |
| `calibration.sample.add` | Add one camera/projector-to-surface point pair. |
| `calibration.solve` | Compute homography and reprojection error from at least four samples. |
| `calibration.set` | Manually set a homography. |
| `calibration.clear` | Clear samples and transforms for a surface. |
| `fiducial.detections.ingest` | Ingest AprilTag detections in camera or projector coordinates and update room markers. |

Endpoints:

```text
GET /api/calibration
GET /api/config
GET /api/export
GET /api/replay
```

Detection ingestion shape:

```json
{
  "type": "fiducial.detections.ingest",
  "payload": {
    "surface": "table",
    "sourceSpace": "camera",
    "detections": [
      {
        "tagId": 11,
        "center": { "x": 500, "y": 400 },
        "corners": [
          { "x": 480, "y": 380 },
          { "x": 520, "y": 382 },
          { "x": 518, "y": 420 },
          { "x": 482, "y": 418 }
        ],
        "angle": 0.4,
        "confidence": 0.92
      }
    ]
  }
}
```

If `sourceSpace` is `camera`, the server uses `cameraToSurfaceHomography`. If `sourceSpace` is `surface` or `table.normalized`, the point is already normalized and no homography is needed.

## Auto vs Assisted Calibration

There are two different meanings of "auto":

| Mode | Meaning | When To Use |
| --- | --- | --- |
| Auto-calibrate (sim truth) | The virtual room already knows where the corners are, projects them into the selected virtual camera, and sends those samples to the server. | Simulation only; validates server math. |
| Auto-detect AprilTags | A real camera sees tags `0-3` or `4-7`, detector posts their camera pixel positions, and the server solves calibration. | Real room, preferred path. |
| Assisted click | Human clicks the four visible corner tags in the camera view when auto-detection fails or is ambiguous. | Fallback/debug path. |

The intended real-world flow is:

1. Place printed calibration tags.
2. Run detector.
3. Detector finds tags automatically.
4. Server solves homography.
5. Human only assists if a corner tag is missed, occluded, or misidentified.

If the detector has already posted corner-tag events into the replay log, you can try:

```powershell
npm run solve:calibration
```

This reads `/api/replay`, looks for the latest four table corner detections, posts them as calibration samples, then calls `calibration.solve`.

Or run the detector in automatic calibration mode:

```powershell
.\scripts\run-detector.ps1 -Display -AutoCalibrate -AutoSolve
```

## Detection Scripts

Repeatable simulator:

```powershell
npm run simulate:detections
```

Real webcam bridge:

```powershell
pip install -r requirements-detector.txt
python scripts/apriltag-detector.py --url http://localhost:4177 --camera 0 --display
```

Tag mapping:

```text
data/tag-map.json
```

The detector script only posts detections. The room server owns calibration, marker identity, surface transforms, and Light Lab state.

## Practical First Step

Print designed tag cards:

- Keep a real AprilTag square untouched.
- Add icon/label/color around it.
- Test detection from the webcam before using the projector.
- Use the camera simulator page until real detection works.
