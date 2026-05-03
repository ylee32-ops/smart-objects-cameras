#!/usr/bin/env bash
set -euo pipefail

VENV_PATH="${1:-.venv-detector}"
PYTHON_BIN="${PYTHON_BIN:-python3}"

echo "Creating detector venv at ${VENV_PATH}"
"${PYTHON_BIN}" -m venv "${VENV_PATH}"

echo "Installing detector requirements"
"${VENV_PATH}/bin/python" -m pip install --upgrade pip
"${VENV_PATH}/bin/python" -m pip install -r requirements-detector.txt

if [[ ! -f ".env" ]]; then
  cp .env.example .env
  echo "Created .env from .env.example"
fi

echo
echo "Detector environment ready."
echo "Run:"
echo "  ${VENV_PATH}/bin/python scripts/apriltag-detector.py --url http://localhost:4177 --camera 0 --display"
