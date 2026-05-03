# Board Coordinate Contract

This is the shared contract for the whiteboard, camera calibration, 2D mapper, and projector output.

## Surface Coordinates

The whiteboard uses normalized board coordinates:

| Value | Meaning |
| --- | --- |
| `x = 0` | left edge of the board |
| `x = 1` | right edge of the board |
| `y = 0` | top edge of the board |
| `y = 1` | bottom edge of the board |

Every board event should use this coordinate space unless it explicitly says it is in camera pixels or projector pixels.

## Calibration Tags

Use these board calibration tags until the real measurements are taken:

| Tag | Corner | Board Point |
| --- | --- | --- |
| `4` | top-left | `{ "x": 0.12, "y": 0.12 }` |
| `5` | top-right | `{ "x": 0.88, "y": 0.12 }` |
| `6` | bottom-right | `{ "x": 0.88, "y": 0.88 }` |
| `7` | bottom-left | `{ "x": 0.12, "y": 0.88 }` |

They are intentionally inset so the camera can still see all four points if it cannot see the full floor-to-ceiling board.

## Camera Calibration

Camera detections come in camera pixels. The server solves:

```text
camera pixels -> board normalized coordinates
```

The virtual room's auto-calibrate button uses simulated camera pixels but posts the same calibration samples the real detector will post tomorrow.

## Projector Mapping

The 2D Map polygon is the projector warp contract. It represents:

```text
projector pixels -> board normalized coordinates
```

The runtime also computes the inverse:

```text
board normalized coordinates -> projector pixels
```

Every projected zone, focus highlight, sticky glow, slide card, video card, writing trail, and model overlay should draw through that inverse transform. If the quad is moved in 2D Map mode, the projected content should follow the calibrated board position.

The real projector output is `/projector.html`. It is intentionally a black fullscreen projection layer, not a dashboard. Use:

| Key / Control | Purpose |
| --- | --- |
| `Fullscreen` or `F` | Put the browser output on the physical projector. |
| `Map Overlay` or `M` | Show projector-frame corners/grid while aligning the physical quad. |
| `Status` or `S` | Temporarily show room status; keep off during normal projection. |

## Tomorrow Setup Order

1. Print the board tag sheet from `/generated-tags/board-tags.html`.
2. Place tags `4-7` on the board, inset from the true corners if needed.
3. Open `/projector.html?map=1` on the projector display and enter fullscreen.
4. Open `/ideas/virtualroom/` and verify the camera sees all four calibration tags.
5. Run Auto-calibrate or the real detector calibration flow.
6. Switch to `2D`, choose `Map`, and drag the projector quad corners until the projected map fits the board.
7. Turn off the map overlay with `M`.
8. Add one Focus, one Write, one Erase, one Slide, and one Action tag; confirm each projected output lands where the tag is on the board.
