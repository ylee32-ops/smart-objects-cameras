#!/usr/bin/env bash
# Bootstrap the classroom-api room server on Arch Linux.
#
# Usage (from anywhere):
#     ./scripts/setup-arch.sh
#
# What it does:
#   - sanity-checks that node, npm, python, and git are installed
#   - runs `npm install`
#   - creates `.venv-detector` and installs the AprilTag detector deps
#   - runs `npm run check` and `npm run test:events`
#
# What it does NOT do:
#   - install system packages (run `pacman` yourself; see
#     docs/handoff-arch-linux.md for the list)
#   - add your user to the `video` group
#   - start the server or detector

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

bold()  { printf "\033[1m==> %s\033[0m\n" "$*"; }
warn()  { printf "\033[33m!! %s\033[0m\n" "$*" >&2; }
fail()  { printf "\033[31mxx %s\033[0m\n" "$*" >&2; exit 1; }

bold "Repo root: $ROOT"

bold "Checking required system tools"
missing=()
for cmd in node npm python git; do
  if ! command -v "$cmd" >/dev/null 2>&1; then
    missing+=("$cmd")
  fi
done
if (( ${#missing[@]} > 0 )); then
  warn "Missing: ${missing[*]}"
  warn "Install them on Arch with:"
  warn "    sudo pacman -S nodejs npm python git v4l-utils base-devel cmake"
  fail "Aborting until system deps are present."
fi

bold "Node: $(node --version)   npm: $(npm --version)   python: $(python --version 2>&1)"

bold "Installing node dependencies"
npm install

VENV=".venv-detector"
if [ ! -d "$VENV" ]; then
  bold "Creating Python venv at $VENV"
  python -m venv "$VENV"
else
  bold "Reusing existing venv at $VENV"
fi

# shellcheck disable=SC1091
source "$VENV/bin/activate"
bold "Upgrading pip and installing detector requirements"
pip install --upgrade pip
pip install -r requirements-detector.txt
deactivate

bold "Running JS syntax check (npm run check)"
npm run check

bold "Running events test (npm run test:events)"
npm run test:events

cat <<'EOF'

==> Setup complete.

Start the server (port 4177):
    npm start

Run the AprilTag detector (in a second terminal):
    source .venv-detector/bin/activate
    python scripts/apriltag-detector.py \
        --url http://localhost:4177 \
        --camera 0 \
        --display

Useful URLs:
    http://localhost:4177/tag-board.html
    http://localhost:4177/tag-debugger.html
    http://localhost:4177/projector.html?map=1&status=1
    http://localhost:4177/ideas/virtualroom/

If the detector cannot find your camera:
    v4l2-ctl --list-devices
    groups   # must include 'video'; if not: sudo usermod -aG video "$USER" && relogin

Full runbook: docs/handoff-arch-linux.md
EOF
