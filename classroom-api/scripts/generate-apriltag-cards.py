#!/usr/bin/env python3
"""Generate printable AprilTag marker cards.

Requires the detector environment:
    pip install -r requirements-detector.txt

This uses OpenCV's official DICT_APRILTAG_36h11 dictionary when available.
It outputs marker PNGs plus an HTML print sheet.
"""

from __future__ import annotations

import argparse
import html
import json
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
ROOM_CONFIG = ROOT / "data" / "room-config.json"
TAG_MAP = ROOT / "data" / "tag-map.json"
OUTPUT_DIR = ROOT / "public" / "generated-tags"

ROLE_PATTERNS: dict[str, list[int]] = {
    "sticky": [1, 1, 0, 1, 1, 0, 0, 0, 0],
    "zone": [1, 1, 1, 1, 0, 1, 1, 1, 1],
    "scene": [1, 1, 1, 0, 1, 0, 1, 1, 1],
    "focus": [0, 1, 0, 1, 1, 1, 0, 1, 0],
    "capture": [1, 1, 1, 1, 1, 0, 1, 0, 0],
    "feedback": [0, 1, 0, 1, 0, 1, 0, 1, 0],
    "check": [0, 0, 1, 0, 1, 0, 1, 0, 0],
    "character": [1, 1, 1, 1, 0, 1, 0, 1, 0],
    "timer": [0, 1, 0, 0, 1, 1, 0, 1, 0],
    "ambience": [1, 0, 1, 0, 1, 0, 1, 0, 1],
    "media": [1, 0, 0, 1, 1, 0, 1, 1, 1],
    "object3d": [1, 0, 1, 0, 1, 0, 1, 0, 1],
    "tool": [1, 0, 1, 0, 1, 0, 1, 0, 1],
    "write": [1, 0, 0, 0, 1, 0, 0, 0, 1],
    "slide": [1, 1, 1, 0, 0, 0, 1, 1, 1],
    "video": [1, 0, 0, 1, 1, 0, 1, 1, 1],
    "vertex": [1, 0, 0, 0, 1, 0, 0, 0, 1],
    "action": [0, 0, 1, 0, 1, 1, 1, 1, 1],
    "figurate": [1, 1, 1, 1, 0, 1, 0, 1, 0],
    "calibration": [1, 1, 1, 1, 0, 1, 1, 1, 1],
    "emitter": [1, 0, 0, 1, 1, 1, 1, 0, 0],
    "mirror": [0, 0, 1, 0, 1, 0, 1, 0, 0],
    "filter": [1, 1, 1, 0, 1, 0, 0, 1, 0],
    "splitter": [0, 1, 0, 1, 1, 1, 1, 0, 1],
    "blocker": [1, 1, 1, 1, 1, 1, 1, 1, 1],
    "target": [0, 1, 0, 1, 0, 1, 0, 1, 0],
    "function": [1, 0, 1, 0, 1, 0, 1, 0, 1],
}

CORNER_PATTERNS: dict[str, list[int]] = {
    "top-left": [1, 1, 0, 1, 0, 0, 0, 0, 0],
    "top-right": [0, 1, 1, 0, 0, 1, 0, 0, 0],
    "bottom-right": [0, 0, 0, 0, 0, 1, 0, 1, 1],
    "bottom-left": [0, 0, 0, 1, 0, 0, 1, 1, 0],
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--size", type=int, default=520, help="Marker image size in px")
    parser.add_argument("--output", type=Path, default=OUTPUT_DIR)
    parser.add_argument("--cards", type=Path, default=OUTPUT_DIR / "cards.html")
    parser.add_argument("--board-grid", type=Path, default=OUTPUT_DIR / "board-tags.html")
    return parser.parse_args()


def load_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def marker_rows() -> list[dict[str, Any]]:
    room = load_json(ROOM_CONFIG)
    tag_map = load_json(TAG_MAP)
    rows: list[dict[str, Any]] = []

    for tag_id, data in tag_map.get("calibrationTags", {}).items():
        rows.append(
            {
                "tagId": int(tag_id),
                "id": f"{data['surface']}-{data['corner']}",
                "label": f"{data['surface'].title()} {data['corner'].replace('-', ' ')}",
                "kind": "calibration",
                "surface": data["surface"],
                "color": "#e5e7eb",
                "description": f"{data['surface'].title()} calibration {data['corner'].replace('-', ' ')} corner",
            }
        )

    marker_by_tag = {str(marker["tagId"]): marker for marker in room.get("markers", [])}
    for tag_id, data in tag_map.get("objectTags", {}).items():
        marker = marker_by_tag.get(str(tag_id), {})
        rows.append(
            {
                "tagId": int(tag_id),
                "id": data.get("id", marker.get("id", f"tag-{tag_id}")),
                "label": data.get("label", marker.get("label", f"Tag {tag_id}")),
                "kind": data.get("role", marker.get("kind", "object")),
                "surface": data.get("surface", marker.get("surface", "table")),
                "color": data.get("color", marker.get("color", "#e5e7eb")),
                "description": data.get("description", ""),
            }
        )

    return sorted(rows, key=lambda row: row["tagId"])


def generate_marker_pngs(rows: list[dict[str, Any]], output_dir: Path, size: int) -> None:
    try:
        import cv2
    except ImportError as exc:
        raise SystemExit("OpenCV is missing. Run setup-detector first.") from exc

    if not hasattr(cv2, "aruco"):
        raise SystemExit("cv2.aruco is missing. Install opencv-contrib-python.")

    dictionary = cv2.aruco.getPredefinedDictionary(cv2.aruco.DICT_APRILTAG_36h11)
    output_dir.mkdir(parents=True, exist_ok=True)

    for row in rows:
        tag_id = row["tagId"]
        if hasattr(cv2.aruco, "generateImageMarker"):
            image = cv2.aruco.generateImageMarker(dictionary, tag_id, size)
        else:
            image = cv2.aruco.drawMarker(dictionary, tag_id, size)
        path = output_dir / f"tag-{tag_id}.png"
        cv2.imwrite(str(path), image)


def pattern_for_row(row: dict[str, Any]) -> list[int]:
    if row.get("kind") == "calibration":
        corner = str(row.get("id", "")).removeprefix(f"{row.get('surface', '')}-")
        return CORNER_PATTERNS.get(corner, ROLE_PATTERNS["calibration"])
    return ROLE_PATTERNS.get(str(row.get("kind", "")).lower(), ROLE_PATTERNS["function"])


def semantic_mark(row: dict[str, Any]) -> str:
    label = html.escape(str(row.get("kind", "tag")).upper())
    dots = "".join(
        f"<span{' class=\"on\"' if value else ''}></span>"
        for value in pattern_for_row(row)
    )
    return f"""<div class="semantic-mark" aria-label="{label} function mark">{dots}</div>"""


def write_cards_html(rows: list[dict[str, Any]], output_dir: Path, cards_path: Path) -> None:
    output_dir.mkdir(parents=True, exist_ok=True)
    cards = []
    for row in rows:
        color = html.escape(row["color"])
        label = html.escape(row["label"])
        kind = html.escape(row["kind"])
        surface = html.escape(row["surface"])
        tag_id = int(row["tagId"])
        description = html.escape(row.get("description", ""))
        mark = semantic_mark(row)
        cards.append(
            f"""
            <article class="card {'calibration' if row['kind'] == 'calibration' else ''}" style="--accent:{color}">
              <div class="tag-wrap">
                <img src="tag-{tag_id}.png" alt="AprilTag {tag_id}">
                <div class="tag-label">{label}</div>
                {mark}
              </div>
              <div class="meta">
                <div class="id">#{tag_id}</div>
                <h2>{label}</h2>
                <p>{kind} / {surface}</p>
                <div class="desc">{description}</div>
              </div>
            </article>
            """
        )

    cards_path.write_text(
        f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Smart Classroom Marker Cards</title>
<style>
  @page {{ size: letter; margin: 0.35in; }}
  * {{ box-sizing: border-box; }}
  body {{ margin: 0; font-family: Arial, sans-serif; color: #111827; }}
  .sheet {{ display: grid; grid-template-columns: repeat(3, 1fr); gap: 0.18in; }}
  .card {{ min-height: 2.35in; border: 1px solid #111827; display: grid; grid-template-columns: 1.18in 1fr; gap: 0.14in; padding: 0.14in; break-inside: avoid; border-left: 0.12in solid var(--accent); }}
  .tag-wrap {{ background: white; border: 0.08in solid white; display: grid; justify-items: center; align-content: start; gap: 0.05in; }}
  img {{ width: 0.96in; height: 0.96in; image-rendering: pixelated; }}
  .tag-label {{ width: 1.04in; text-align: center; font-size: 0.095in; line-height: 1.05; font-weight: 800; text-transform: uppercase; letter-spacing: 0.006in; color: #111827; }}
  .semantic-mark {{ width: 0.58in; display: grid; grid-template-columns: repeat(3, 1fr); gap: 0.025in; color: var(--accent); }}
  .semantic-mark span {{ width: 0.052in; height: 0.052in; justify-self: center; border: 0.009in solid currentColor; border-radius: 999px; opacity: 0.18; }}
  .semantic-mark span.on {{ background: currentColor; opacity: 1; }}
  .id {{ font-size: 0.14in; font-weight: 800; letter-spacing: 0.02in; color: #4b5563; }}
  h2 {{ margin: 0.06in 0 0.05in; font-size: 0.18in; line-height: 1.05; }}
  p {{ margin: 0; font-size: 0.115in; color: #4b5563; text-transform: uppercase; letter-spacing: 0.012in; }}
  .desc {{ margin-top: 0.08in; font-size: 0.11in; color: #374151; line-height: 1.25; }}
  .note {{ margin: 0.16in 0 0.2in; font-size: 0.12in; color: #374151; }}
  @media screen {{ body {{ padding: 24px; background: #f3f4f6; }} .sheet {{ max-width: 980px; margin: 0 auto; }} .card {{ background: white; }} }}
</style>
</head>
<body>
<p class="note">Keep the AprilTag square clean. Design, labels, and icons belong outside the white tag margin.</p>
<section class="sheet">
{''.join(cards)}
</section>
</body>
</html>
""",
        encoding="utf-8",
    )


def write_board_grid_html(rows: list[dict[str, Any]], output_dir: Path, path: Path) -> None:
    output_dir.mkdir(parents=True, exist_ok=True)
    cards = []
    board_rows = [row for row in rows if row["surface"] == "board"]
    for row in board_rows:
        color = html.escape(row["color"])
        label = html.escape(row["label"])
        kind = html.escape(row["kind"])
        description = html.escape(row.get("description", ""))
        tag_id = int(row["tagId"])
        mark = semantic_mark(row)
        cards.append(
            f"""
            <article class="card {'calibration' if row['kind'] == 'calibration' else ''}" style="--accent:{color}">
              <div class="tag-print">
                <img src="tag-{tag_id}.png" alt="AprilTag {tag_id}">
                <div class="tag-label">{label}</div>
                {mark}
              </div>
              <div class="meta">
                <div class="id">#{tag_id}</div>
                <p>{kind}</p>
                <div class="desc">{description}</div>
              </div>
            </article>
            """
        )

    path.write_text(
        f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Smart Classroom Board Tags</title>
<style>
  * {{ box-sizing: border-box; }}
  body {{ margin: 0; padding: 24px; background: #0b0d10; color: #eef2f6; font-family: Arial, sans-serif; }}
  h1 {{ margin: 0 0 8px; font-size: 28px; }}
  p {{ margin: 0 0 20px; color: #9ca3af; }}
  .actions {{ display: flex; gap: 8px; margin: 0 0 18px; }}
  button {{ border: 1px solid #334155; background: #111419; color: #eef2f6; padding: 8px 11px; cursor: pointer; }}
  .grid {{ display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 14px; }}
  .card {{ border: 1px solid #29313b; background: #111419; border-left: 8px solid var(--accent); padding: 12px; display: grid; gap: 10px; border-radius: 4px; }}
  .tag-print {{ display: grid; gap: 7px; justify-items: center; }}
  img {{ width: 100%; aspect-ratio: 1 / 1; object-fit: contain; image-rendering: pixelated; background: white; padding: 16px; border-radius: 4px; }}
  .tag-label {{ width: 100%; min-height: 24px; display: grid; place-items: center; text-align: center; color: #eef2f6; font-weight: 800; font-size: 13px; line-height: 1.05; text-transform: uppercase; letter-spacing: .06em; }}
  .semantic-mark {{ width: 74px; display: grid; grid-template-columns: repeat(3, 1fr); gap: 5px; color: var(--accent); }}
  .semantic-mark span {{ width: 10px; height: 10px; justify-self: center; border: 1px solid currentColor; border-radius: 999px; opacity: .2; }}
  .semantic-mark span.on {{ background: currentColor; opacity: 1; box-shadow: 0 0 10px color-mix(in srgb, currentColor 42%, transparent); }}
  .id {{ font-size: 11px; font-weight: 800; color: #9ca3af; letter-spacing: .08em; }}
  h2 {{ margin: 4px 0; font-size: 18px; line-height: 1.05; }}
  p {{ margin: 0; color: #cbd5e1; font-size: 11px; text-transform: uppercase; letter-spacing: .08em; }}
  .desc {{ color: #cbd5e1; font-size: 13px; line-height: 1.35; }}
  .calibration {{ background: #171b21; }}
  @media print {{ body {{ background: #fff; color: #111827; }} .actions {{ display: none; }} .card {{ background: #fff; color: #111827; break-inside: avoid; }} p, .desc {{ color: #334155; }} .tag-label {{ color: #111827; }} .semantic-mark span.on {{ box-shadow: none; }} }}
  @media (max-width: 1100px) {{ .grid {{ grid-template-columns: repeat(3, minmax(0, 1fr)); }} }}
  @media (max-width: 760px) {{ .grid {{ grid-template-columns: repeat(2, minmax(0, 1fr)); }} }}
</style>
</head>
<body>
  <h1>Board Calibration + Semantic Tags</h1>
  <p>Printable AprilTags for the whiteboard-first room. Keep the black tag square untouched; labels and meaning stay outside it. Use tags 4-7 for calibration.</p>
  <div class="actions"><button onclick="window.print()">Print Board Sheet</button></div>
  <section class="grid">
    {''.join(cards)}
  </section>
</body>
</html>
""",
        encoding="utf-8",
    )


def main() -> int:
    args = parse_args()
    rows = marker_rows()
    generate_marker_pngs(rows, args.output, args.size)
    write_cards_html(rows, args.output, args.cards)
    write_board_grid_html(rows, args.output, args.board_grid)
    print(f"Generated {len(rows)} marker cards")
    print(f"Open: {args.cards}")
    print(f"Board: {args.board_grid}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
