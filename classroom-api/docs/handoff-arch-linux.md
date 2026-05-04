# Arch Linux Handoff

How to bring this repo up on a fresh Arch machine and continue the smart-classroom hardware test.

## 1. System packages

```bash
sudo pacman -S nodejs npm python git v4l-utils base-devel cmake
```

- `v4l-utils` — `v4l2-ctl --list-devices` lists webcams.
- `base-devel` + `cmake` — needed if `pupil-apriltags` has to compile from source.

Add yourself to the `video` group so the detector can read the webcam:

```bash
sudo usermod -aG video "$USER"
# log out and back in for the group to take effect
```

## 2. Clone and bootstrap

```bash
git clone <smart-objects-cameras repo URL>
cd smart-objects-cameras/classroom-api
./scripts/setup-arch.sh
```

The script:
- runs `npm install`
- creates `.venv-detector/` and installs `opencv-contrib-python`, `pupil-apriltags`, `requests`
- runs `npm run check` and `npm run test:events`

If the script aborts because something is missing, install it via `pacman` and re-run.

## 3. Run the room

Server (port 4177):

```bash
npm start
```

Detector (separate terminal):

```bash
source .venv-detector/bin/activate
python scripts/apriltag-detector.py \
    --url http://localhost:4177 \
    --camera 0 \
    --display
```

Useful flags:
- `--camera 0` — first webcam. Try `1`/`2` if you have multiple.
- `--display` — opens a preview window. Drop it for headless runs.
- `--interval 0.3` — detect every 300 ms (server-side default cadence).

## 4. Open the surfaces

| URL | Purpose |
|---|---|
| `http://localhost:4177/tag-board.html` | Main tag board — project this onto the wall |
| `http://localhost:4177/tag-debugger.html` | Tag debugger and scan controls |
| `http://localhost:4177/projector.html?map=1&status=1` | Projector output with map + status overlay |
| `http://localhost:4177/ideas/virtualroom/` | Virtual room viewer (defaults to physical C920) |

For phone or other-machine access, swap `localhost` for the LAN IP of the Arch machine.

## 5. Calibration loop

Tag family is `tag36h11`. Corners are `4, 5, 6, 7`. Focus tag is `23`.

1. Open `tag-board.html` fullscreen on the projected surface.
2. Confirm the C920 sees tags `4, 5, 6, 7, 23` in `tag-debugger.html`.
3. Run "Calibrate Visible Corners" from the viewer or tag debugger.
4. Open `projector.html?map=1&status=1`.
5. Verify the focus ring lands on focus tag `23`.
6. If it tracks but is offset → redo camera calibration.
7. If the entire output is warped → adjust projector map / quad.
8. Press `m` and `s` in the projector view to hide overlays once aligned.

## 6. Sanity checks

```bash
npm run check          # JS syntax
npm run test:syntax    # broader JS syntax sweep
npm run test:events    # event contract
npm run test:smoke     # HTTP smoke
```

## 7. Reset state without restarting

```bash
URL=http://localhost:4177/api/action

curl -X POST $URL -H 'Content-Type: application/json' \
  -d '{"action":"board.tags.clear","payload":{"keepCalibration":false}}'
curl -X POST $URL -H 'Content-Type: application/json' \
  -d '{"action":"board.objects.clear","payload":{}}'
curl -X POST $URL -H 'Content-Type: application/json' \
  -d '{"action":"board.clear","payload":{}}'
curl -X POST $URL -H 'Content-Type: application/json' \
  -d '{"action":"focus.clear","payload":{}}'
curl -X POST $URL -H 'Content-Type: application/json' \
  -d '{"action":"calibration.clear","payload":{"surface":"board"}}'
curl -X POST $URL -H 'Content-Type: application/json' \
  -d '{"action":"board.drag.set","payload":{"active":false}}'
```

## 8. Troubleshooting

- **Port 4177 already in use** — `lsof -i :4177` then `kill <pid>`.
- **No camera found** — `ls /dev/video*`; confirm `groups | grep video`; try a different `--camera` index.
- **Detector finds zero tags** — confirm `tag-board.html` is fullscreen at 100 % zoom, lighting is even, camera is in focus.
- **`pip install pupil-apriltags` fails** — ensure `cmake` and `gcc` are installed (`sudo pacman -S cmake gcc`).
- **`npm install` fails** — confirm Node ≥ 18 (`node --version`).
- **Cross-platform line-ending noise** — already handled by `.gitattributes` (LF default, CRLF for `*.ps1`/`*.cmd`/`*.bat`).

## 9. What is intentionally not committed

| Path | Why |
|---|---|
| `node_modules/` | Recreated by `npm install` |
| `.venv-detector/` | Recreated by `setup-arch.sh` |
| `.local/`, `.codex_tmp/` | Runtime state, calibration snapshots, debug logs |
| `public/captures/` | Runtime camera captures |
| `public/generated-tags/` | Generated AprilTag images |
| `*.cer`, `.env` | Dev cert, secrets |

Calibration is per-physical-setup, so a fresh clone has no calibration. You will recalibrate the C920 against the projected tag board on this machine.

## 10. Pushing changes back

```bash
git checkout -b some-feature
# ...edit, commit...
git push -u origin some-feature
```

Then open a PR against `main` from the GitHub UI, or:

```bash
gh pr create --title "..." --body "..."
```
