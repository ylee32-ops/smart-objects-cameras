#!/usr/bin/env python3
"""Detect AprilTags from one image data URL on stdin."""

from __future__ import annotations

import base64
import json
import math
import re
import sys
from typing import Any


def detection_angle(corners: list[list[float]]) -> float:
    if len(corners) < 2:
        return 0.0
    dx = corners[1][0] - corners[0][0]
    dy = corners[1][1] - corners[0][1]
    return math.atan2(dy, dx)


def tag_confidence(tag: Any) -> float:
    margin = float(getattr(tag, "decision_margin", 50.0))
    return float(max(0.0, min(1.0, margin / 80.0)))


def main() -> int:
    try:
        import cv2
        import numpy as np
        from pupil_apriltags import Detector
    except ImportError as error:
        print(json.dumps({"ok": False, "error": f"missing dependency: {error}"}))
        return 0

    try:
        payload = json.loads(sys.stdin.read() or "{}")
        image_data_url = str(payload.get("imageDataUrl") or "")
        match = re.match(r"^data:image/(?:jpeg|jpg|png|webp);base64,([\s\S]+)$", image_data_url, re.I)
        if not match:
            raise ValueError("imageDataUrl must be a base64 image data URL")

        raw = base64.b64decode(re.sub(r"\s+", "", match.group(1)))
        if len(raw) > 6_000_000:
            raise ValueError("image is too large")

        image = cv2.imdecode(np.frombuffer(raw, np.uint8), cv2.IMREAD_COLOR)
        if image is None:
            raise ValueError("could not decode image")

        height, width = image.shape[:2]
        pad = max(20, int(min(width, height) * 0.08))
        padded = cv2.copyMakeBorder(
            image,
            pad,
            pad,
            pad,
            pad,
            cv2.BORDER_CONSTANT,
            value=(255, 255, 255),
        )
        gray = cv2.cvtColor(padded, cv2.COLOR_BGR2GRAY)
        clahe = cv2.createCLAHE(clipLimit=2.4, tileGridSize=(8, 8))
        processed = clahe.apply(gray)

        detector = Detector(
            families=str(payload.get("family") or "tag36h11"),
            nthreads=2,
            quad_decimate=1.0,
            quad_sigma=0.0,
            refine_edges=True,
            decode_sharpening=0.25,
        )
        tags = detector.detect(processed)
        detections = []
        for tag in tags:
            corners = [[float(x) - pad, float(y) - pad] for x, y in tag.corners]
            detections.append(
                {
                    "tagId": int(tag.tag_id),
                    "center": {"x": float(tag.center[0]) - pad, "y": float(tag.center[1]) - pad},
                    "corners": [{"x": x, "y": y} for x, y in corners],
                    "angle": detection_angle(corners),
                    "confidence": tag_confidence(tag),
                    "decisionMargin": float(getattr(tag, "decision_margin", 0.0)),
                    "hamming": int(getattr(tag, "hamming", 0)),
                }
            )

        print(json.dumps({
            "ok": True,
            "width": int(width),
            "height": int(height),
            "detections": detections,
        }))
        return 0
    except Exception as error:
        print(json.dumps({"ok": False, "error": str(error)}))
        return 0


if __name__ == "__main__":
    raise SystemExit(main())
