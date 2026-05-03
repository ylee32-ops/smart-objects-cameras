#!/usr/bin/env bash
set -euo pipefail

VENV_PATH="${VENV_PATH:-.venv-detector}"
SMART_ROOM_URL="${SMART_ROOM_URL:-http://localhost:4177}"
SMART_ROOM_CAMERA="${SMART_ROOM_CAMERA:-0}"
SMART_ROOM_SURFACE="${SMART_ROOM_SURFACE:-table}"
SMART_ROOM_TAG_FAMILY="${SMART_ROOM_TAG_FAMILY:-tag36h11}"

if [[ ! -x "${VENV_PATH}/bin/python" ]]; then
  echo "Detector venv not found. Run scripts/setup-detector.sh first." >&2
  exit 1
fi

"${VENV_PATH}/bin/python" scripts/apriltag-detector.py \
  --url "${SMART_ROOM_URL}" \
  --camera "${SMART_ROOM_CAMERA}" \
  --surface "${SMART_ROOM_SURFACE}" \
  --family "${SMART_ROOM_TAG_FAMILY}" \
  "$@"
