#!/usr/bin/env python3
"""AprilTag detector bridge for the smart classroom prototype.

This is intentionally a small bridge:
- capture webcam frames
- detect AprilTags
- post camera-space detections to /api/action

Install dependencies when ready:
    pip install opencv-python pupil-apriltags requests

Example:
    python scripts/apriltag-detector.py --url http://localhost:4177 --camera 0
"""

from __future__ import annotations

import argparse
import json
import math
import sys
import time
from typing import Any
from urllib import request


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--url", default="http://localhost:4177")
    parser.add_argument("--camera", default=0)
    parser.add_argument("--surface", default="board")
    parser.add_argument("--family", default="tag36h11")
    parser.add_argument("--interval", type=float, default=0.12)
    parser.add_argument("--camera-width", type=int, default=1280)
    parser.add_argument("--camera-height", type=int, default=720)
    parser.add_argument("--detector-threads", type=int, default=2)
    parser.add_argument("--quad-decimate", type=float, default=1.0)
    parser.add_argument("--quad-sigma", type=float, default=0.0)
    parser.add_argument("--decode-sharpening", type=float, default=0.25)
    parser.add_argument(
        "--preprocess",
        choices=["gray", "equalize", "clahe", "auto"],
        default="clahe",
        help="Frame preprocessing before AprilTag detection. CLAHE is the default for uneven projector/board lighting.",
    )
    parser.add_argument("--clahe-clip", type=float, default=2.4)
    parser.add_argument("--clahe-grid", type=int, default=8)
    parser.add_argument("--blur", type=float, default=0.0, help="Optional Gaussian blur sigma after contrast normalization")
    parser.add_argument("--sharpen", action="store_true", help="Apply a light unsharp mask after preprocessing")
    parser.add_argument("--display", action="store_true")
    parser.add_argument("--debug-preprocess", action="store_true", help="Show the processed grayscale frame next to the color frame")
    parser.add_argument("--once", action="store_true")
    parser.add_argument("--auto-calibrate", action="store_true", help="Send calibration corner tags as samples")
    parser.add_argument("--auto-solve", action="store_true", help="Solve homography after enough calibration samples")
    return parser.parse_args()


def post_action(base_url: str, action_type: str, payload: dict[str, Any]) -> dict[str, Any]:
    body = json.dumps(
        {"type": action_type, "payload": payload, "source": "apriltag-detector"}
    ).encode("utf-8")
    req = request.Request(
        f"{base_url.rstrip('/')}/api/action",
        data=body,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with request.urlopen(req, timeout=5) as response:
        return json.loads(response.read().decode("utf-8"))


def detection_angle(corners: list[list[float]]) -> float:
    if len(corners) < 2:
        return 0.0
    dx = corners[1][0] - corners[0][0]
    dy = corners[1][1] - corners[0][1]
    return math.atan2(dy, dx)


def preprocess_frame(frame: Any, cv2: Any, args: argparse.Namespace) -> Any:
    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
    if args.preprocess == "gray":
        processed = gray
    elif args.preprocess == "equalize":
        processed = cv2.equalizeHist(gray)
    else:
        # CLAHE keeps tag edges visible under projector hotspots and uneven board lighting.
        grid = max(2, int(args.clahe_grid))
        clahe = cv2.createCLAHE(clipLimit=max(0.1, float(args.clahe_clip)), tileGridSize=(grid, grid))
        processed = clahe.apply(gray)
        if args.preprocess == "auto":
            processed = cv2.convertScaleAbs(processed, alpha=1.08, beta=2)

    if args.blur > 0:
        processed = cv2.GaussianBlur(processed, (0, 0), args.blur)
    if args.sharpen:
        soft = cv2.GaussianBlur(processed, (0, 0), 1.0)
        processed = cv2.addWeighted(processed, 1.55, soft, -0.55, 0)
    return processed


def tag_confidence(tag: Any) -> float:
    margin = float(getattr(tag, "decision_margin", 50.0))
    # pupil-apriltags decision_margin increases as detection quality improves.
    return float(max(0.0, min(1.0, margin / 80.0)))


def draw_preprocess_preview(frame: Any, processed: Any, cv2: Any) -> Any:
    preview = cv2.cvtColor(processed, cv2.COLOR_GRAY2BGR)
    height = min(frame.shape[0], preview.shape[0])
    width = min(frame.shape[1], preview.shape[1])
    return cv2.hconcat([frame[:height, :width], preview[:height, :width]])


def main() -> int:
    args = parse_args()
    try:
        import cv2
        from pupil_apriltags import Detector
    except ImportError as error:
        print(f"Missing dependency: {error}", file=sys.stderr)
        print("Install with: pip install opencv-python pupil-apriltags", file=sys.stderr)
        return 2

    detector = Detector(
        families=args.family,
        nthreads=max(1, int(args.detector_threads)),
        quad_decimate=max(0.25, float(args.quad_decimate)),
        quad_sigma=max(0.0, float(args.quad_sigma)),
        refine_edges=True,
        decode_sharpening=max(0.0, float(args.decode_sharpening)),
    )

    camera_id: int | str
    try:
        camera_id = int(args.camera)
    except ValueError:
        camera_id = args.camera

    cap = cv2.VideoCapture(camera_id)
    if not cap.isOpened():
      print(f"Could not open camera {args.camera}", file=sys.stderr)
      return 1
    if args.camera_width:
        cap.set(cv2.CAP_PROP_FRAME_WIDTH, args.camera_width)
    if args.camera_height:
        cap.set(cv2.CAP_PROP_FRAME_HEIGHT, args.camera_height)
    cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)

    print(
        f"Posting detections to {args.url} for surface {args.surface} "
        f"with preprocess={args.preprocess}"
    )
    try:
        while True:
            ok, frame = cap.read()
            if not ok:
                print("Camera frame read failed", file=sys.stderr)
                break

            processed = preprocess_frame(frame, cv2, args)
            tags = detector.detect(processed)
            detections = []

            for tag in tags:
                corners = [[float(x), float(y)] for x, y in tag.corners]
                detections.append(
                    {
                        "tagId": int(tag.tag_id),
                        "center": {"x": float(tag.center[0]), "y": float(tag.center[1])},
                        "corners": [{"x": x, "y": y} for x, y in corners],
                        "angle": detection_angle(corners),
                        "confidence": tag_confidence(tag),
                    }
                )

                if args.display:
                    pts = [(int(x), int(y)) for x, y in corners]
                    for i in range(4):
                        cv2.line(frame, pts[i], pts[(i + 1) % 4], (0, 255, 0), 2)
                    cv2.putText(
                        frame,
                        str(tag.tag_id),
                        (pts[0][0], pts[0][1] - 8),
                        cv2.FONT_HERSHEY_SIMPLEX,
                        0.7,
                        (0, 255, 0),
                        2,
                    )

            if detections:
                result = post_action(
                    args.url,
                    "fiducial.detections.ingest",
                    {
                        "surface": args.surface,
                        "sourceSpace": "camera",
                        "autoCalibration": args.auto_calibrate,
                        "autoSolve": args.auto_solve,
                        "detections": detections,
                    },
                )
                print(
                    f"tags={len(detections)} updated={len(result.get('updated', []))} skipped={len(result.get('skipped', []))}"
                )

            if args.display:
                display_frame = draw_preprocess_preview(frame, processed, cv2) if args.debug_preprocess else frame
                cv2.imshow("AprilTag detector", display_frame)
                if cv2.waitKey(1) & 0xFF == ord("q"):
                    break

            if args.once:
                break
            time.sleep(args.interval)
    finally:
        cap.release()
        if args.display:
            cv2.destroyAllWindows()

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
