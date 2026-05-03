"use strict";

const http = require("http");

const baseUrl = process.env.SMART_ROOM_URL || process.argv[2] || "http://localhost:4177";
const surface = process.env.SMART_ROOM_SURFACE || process.argv[3] || "board";
const limit = Number(process.env.SMART_ROOM_REPLAY_LIMIT || 500);

const SURFACE_POINTS = {
  table: {
    0: { x: 0, y: 0 },
    1: { x: 1, y: 0 },
    2: { x: 1, y: 1 },
    3: { x: 0, y: 1 },
  },
  board: {
    4: { x: 0, y: 0 },
    5: { x: 1, y: 0 },
    6: { x: 1, y: 1 },
    7: { x: 0, y: 1 },
  },
};

function requestJson(method, pathname, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : "";
    const url = new URL(pathname, baseUrl);
    const req = http.request(
      url,
      {
        method,
        headers: data
          ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(data) }
          : {},
      },
      (res) => {
        let text = "";
        res.on("data", (chunk) => {
          text += chunk;
        });
        res.on("end", () => {
          const parsed = text ? JSON.parse(text) : {};
          if (res.statusCode >= 400) reject(new Error(parsed.error || `HTTP ${res.statusCode}`));
          else resolve(parsed);
        });
      },
    );
    req.on("error", reject);
    if (data) req.write(data);
    req.end();
  });
}

async function postAction(type, payload) {
  return requestJson("POST", "/api/action", { type, source: "calibration-replay-solver", payload });
}

function latestCornerDetections(events) {
  const needed = SURFACE_POINTS[surface];
  if (!needed) throw new Error(`unknown surface ${surface}`);
  const found = new Map();
  for (const event of events) {
    if (event.event_type !== "fiducial.detected" && event.event_type !== "fiducial.raw.detected") continue;
    const tagId = Number(event.payload?.tag_id ?? event.payload?.tagId);
    if (!needed[tagId]) continue;
    const center =
      event.payload?.camera ||
      event.payload?.center ||
      (Number.isFinite(event.payload?.cameraX) && Number.isFinite(event.payload?.cameraY)
        ? { x: event.payload.cameraX, y: event.payload.cameraY }
        : null);
    if (!center || !Number.isFinite(center.x) || !Number.isFinite(center.y)) continue;
    if (!found.has(tagId)) found.set(tagId, { tagId, camera: center, surfacePoint: needed[tagId] });
  }
  return [...found.values()];
}

async function main() {
  const replay = await requestJson("GET", `/api/replay?limit=${limit}`);
  const events = [...(replay.events || [])].reverse();
  const samples = latestCornerDetections(events);
  console.log(`Found ${samples.length}/4 ${surface} corner detections in replay`);
  if (samples.length < 4) {
    console.log("Need corner detections with camera-space x/y before auto-solving real calibration.");
    process.exit(1);
  }

  await postAction("calibration.clear", { surface });
  for (const sample of samples) {
    await postAction("calibration.sample.add", {
      surface,
      tagId: sample.tagId,
      camera: sample.camera,
      surfacePoint: sample.surfacePoint,
    });
  }
  const solved = await postAction("calibration.solve", { surface, sourceSpace: "camera" });
  console.log(`Solved ${surface}: ${solved.calibration.status}`);
  console.log(JSON.stringify(solved.calibration.error?.camera || {}, null, 2));
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
