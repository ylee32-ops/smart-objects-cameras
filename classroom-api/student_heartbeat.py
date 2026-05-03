#!/usr/bin/env python3
"""
Minimum Smart Classroom heartbeat client.

Run:
    set CLASSROOM_API=http://localhost:4177
    set PROJECT_ID=smart-stage
    set CAPABILITIES=board.scene.requested,session.timer.offered
    set CONSUMES=board.zone.activated,board.tag.detected,session.mode.changed
    set EMITS=board.scene.requested,session.timer.offered
    python student_heartbeat.py
"""

from __future__ import annotations

import json
import os
import sys
import time
from datetime import datetime
from urllib import request, error


API_BASE = os.getenv("CLASSROOM_API", "http://localhost:4177").rstrip("/")
PROJECT_ID = os.getenv("PROJECT_ID", "student-project")
INTERVAL_SEC = float(os.getenv("HEARTBEAT_INTERVAL_SEC", "30"))


def csv_env(name: str, default: str = "") -> list[str]:
    raw = os.getenv(name, default)
    return [item.strip() for item in raw.split(",") if item.strip()]


CAPABILITIES = csv_env("CAPABILITIES")
CONSUMES = csv_env("CONSUMES")
EMITS = csv_env("EMITS")
MESSAGE = os.getenv("MESSAGE", f"{PROJECT_ID} heartbeat running")


def post_json(path: str, payload: dict) -> dict:
    data = json.dumps(payload).encode("utf-8")
    req = request.Request(
        f"{API_BASE}{path}",
        data=data,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with request.urlopen(req, timeout=10) as response:
            return json.loads(response.read().decode("utf-8"))
    except error.HTTPError as exc:
        body = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"HTTP {exc.code}: {body}") from exc


def heartbeat() -> dict:
    return post_json(
        f"/api/projects/{PROJECT_ID}/heartbeat",
        {
            "status": "online",
            "capabilities": CAPABILITIES,
            "consumes": CONSUMES,
            "emits": EMITS,
            "message": MESSAGE,
            "meta": {
                "client": "student_heartbeat.py",
                "hostname": os.getenv("COMPUTERNAME") or os.getenv("HOSTNAME"),
            },
        },
    )


def main() -> int:
    print("Smart Classroom heartbeat")
    print(f"  API: {API_BASE}")
    print(f"  project: {PROJECT_ID}")
    print(f"  consumes: {', '.join(CONSUMES) or '(none)'}")
    print(f"  emits: {', '.join(EMITS) or '(none)'}")
    print()

    while True:
        try:
            result = heartbeat()
            status = result.get("status", {})
            ts = datetime.now().strftime("%H:%M:%S")
            print(
                f"[{ts}] heartbeat ok: "
                f"{status.get('projectId', PROJECT_ID)} "
                f"live={status.get('live')} "
                f"lastSeen={status.get('lastSeen')}"
            )
        except KeyboardInterrupt:
            print("\nStopped")
            return 0
        except Exception as exc:
            ts = datetime.now().strftime("%H:%M:%S")
            print(f"[{ts}] heartbeat failed: {exc}", file=sys.stderr)
        time.sleep(INTERVAL_SEC)


if __name__ == "__main__":
    sys.exit(main())
