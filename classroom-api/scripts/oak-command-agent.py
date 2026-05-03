#!/usr/bin/env python3
"""
OAK command agent for the Smart Classroom room server.

Run this on Orbit, Gravity, or Horizon next to the existing detector scripts.
It listens for directed room commands and writes the latest command to a JSON
file that detector/supervisor scripts can read.

Environment:
  SMART_ROOM_URL=http://ROOM_PC_IP:4177
  CAMERA_ID=orbit

Example:
  python scripts/oak-command-agent.py --camera orbit
"""

from __future__ import annotations

import argparse
import json
import os
import socket
import time
from pathlib import Path
from urllib.parse import quote

import requests


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--url", default=os.getenv("SMART_ROOM_URL", "http://localhost:4177"))
    parser.add_argument("--camera", default=os.getenv("CAMERA_ID", socket.gethostname()))
    parser.add_argument("--output", type=Path, default=Path.home() / "oak-projects" / "room_command.json")
    parser.add_argument("--heartbeat-sec", type=float, default=30.0)
    return parser.parse_args()


def post_state(base_url: str, camera_id: str, status: str = "command-agent") -> None:
    try:
        requests.post(
            f"{base_url.rstrip('/')}/push/state",
            json={"camera_id": camera_id, "running": True, "agent_status": status},
            timeout=2,
        )
    except requests.RequestException:
        pass


def write_command(path: Path, event: dict) -> None:
    payload = event.get("payload") or {}
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps({
        "received_at": time.time(),
        "event_type": event.get("event_type"),
        "source": event.get("source"),
        "target": event.get("target"),
        "payload": payload,
    }, indent=2))


def sse_events(response):
    event_name = "message"
    data_lines = []
    for raw in response.iter_lines(decode_unicode=True):
        if raw is None:
            continue
        line = raw.strip("\r")
        if not line:
            if data_lines:
                yield event_name, "\n".join(data_lines)
            event_name = "message"
            data_lines = []
            continue
        if line.startswith("event:"):
            event_name = line.split(":", 1)[1].strip()
        elif line.startswith("data:"):
            data_lines.append(line.split(":", 1)[1].strip())


def main() -> int:
    args = parse_args()
    base_url = args.url.rstrip("/")
    camera_id = args.camera
    stream_url = f"{base_url}/subscribe/events?subscriber_id={quote(camera_id)}"
    last_heartbeat = 0.0

    print(f"camera={camera_id}")
    print(f"room={base_url}")
    print(f"commands={args.output}")

    while True:
        try:
            now = time.time()
            if now - last_heartbeat >= args.heartbeat_sec:
                post_state(base_url, camera_id)
                last_heartbeat = now

            with requests.get(stream_url, stream=True, headers={"Accept": "text/event-stream"}, timeout=45) as response:
                response.raise_for_status()
                print("listening")
                for name, data in sse_events(response):
                    if name == "ping" or not data:
                        continue
                    event = json.loads(data)
                    event_type = event.get("event_type", "")
                    if event_type.startswith("camera.") or event_type == "fiducial.request":
                        write_command(args.output, event)
                        print(f"command {event_type}: {event.get('payload', {})}")
        except KeyboardInterrupt:
            print("stopped")
            return 0
        except Exception as error:
            print(f"connection lost: {error}; retrying")
            time.sleep(3)


if __name__ == "__main__":
    raise SystemExit(main())
