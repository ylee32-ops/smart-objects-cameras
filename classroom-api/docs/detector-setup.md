# Detector Setup

This sets up the webcam AprilTag bridge for the smart classroom prototype.

The detector is intentionally separate from the room server:

- Node room server owns state, calibration, marker identity, and Light Lab.
- Python detector only sees AprilTags and posts camera-space detections.
- Detection simulator is available when no camera is connected.

## Quick Start

Start the room server:

```powershell
npm start
```

Open the room:

```text
http://localhost:4177
```

Run the no-camera simulator:

```powershell
npm run simulate:detections
```

## Windows Detector Setup

From the repo root:

```powershell
.\scripts\setup-detector.ps1
```

This installs [requirements-detector.txt](../requirements-detector.txt), including `opencv-contrib-python`, `pupil-apriltags`, and `requests`.

Run the detector:

```powershell
.\scripts\run-detector.ps1 -Display
```

For real table calibration with corner tags visible:

```powershell
.\scripts\run-detector.ps1 -Display -AutoCalibrate -AutoSolve
```

If your camera is not device `0`, try:

```powershell
.\scripts\run-detector.ps1 -Camera 1 -Display
```

## macOS / Linux Detector Setup

```bash
bash scripts/setup-detector.sh
bash scripts/run-detector.sh --display
```

## Environment

Copy `.env.example` to `.env` if you want shared defaults:

```text
SMART_ROOM_URL=http://localhost:4177
SMART_ROOM_SURFACE=table
SMART_ROOM_CAMERA=0
SMART_ROOM_TAG_FAMILY=tag36h11
SMART_ROOM_DETECTOR_INTERVAL=0.12
```

The PowerShell/Bash run scripts read these environment variables when present.

## What The Detector Sends

The detector posts this action:

```json
{
  "type": "fiducial.detections.ingest",
  "source": "apriltag-detector",
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

The server transforms camera pixels into surface coordinates using calibration.

## Calibration Before Real Detection

For now, use the camera simulator page:

```text
http://localhost:4177/camera.html
```

Click:

1. `Sample Table Corners`
2. `Ingest Camera Detection`

This creates mock calibration data and proves the ingestion path.

Real calibration later:

1. Print table corner tags `0`, `1`, `2`, `3`.
2. Put them on table corners.
3. Detector sees their camera pixel coordinates.
4. Server maps those tag IDs to known surface points.
5. Server solves `cameraToSurfaceHomography`.

## Troubleshooting

If setup fails on Windows:

- Install Python 3.10+ from python.org.
- Make sure `py -3 --version` works in PowerShell.
- Re-run `.\scripts\setup-detector.ps1`.

If camera preview opens but no tags are detected:

- Use high-contrast printed AprilTags.
- Keep the tag square and flat.
- Avoid glare.
- Make sure the tag is not too small in the frame.
- Try moving the camera closer.

If detections are posted but markers do not move:

- Check `GET /api/calibration`; table should be `calibrated`.
- Check `data/tag-map.json` and `data/room-config.json` for tag IDs.
- Check `GET /api/replay?limit=20` for skipped detections.
