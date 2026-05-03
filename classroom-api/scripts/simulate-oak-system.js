"use strict";

const http = require("http");

const baseUrl = process.env.SMART_ROOM_URL || process.argv[2] || "http://localhost:4177";

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
          if (res.statusCode >= 400) reject(new Error(parsed.error || text || `HTTP ${res.statusCode}`));
          else resolve(parsed);
        });
      },
    );
    req.on("error", reject);
    if (data) req.write(data);
    req.end();
  });
}

async function pushCamera(camera_id, payload) {
  const result = await requestJson("POST", "/push/state", {
    camera_id,
    running: true,
    detector_host: `${camera_id}.local`,
    detector_user: "sim",
    ...payload,
  });
  console.log(`${camera_id}: ${result.events.join(", ") || "state updated"}`);
  return result;
}

async function sendCommand(cameraId, body) {
  const result = await requestJson("POST", `/api/cameras/${encodeURIComponent(cameraId)}/command`, body);
  console.log(`command -> ${cameraId}: ${result.command.eventType} ${result.command.mode || ""}`.trim());
  return result;
}

async function sendProjectRequest(projectId, body) {
  const result = await requestJson("POST", `/api/projects/${encodeURIComponent(projectId)}/camera-request`, body);
  console.log(`project ${projectId} -> ${result.command.cameraId}: ${result.command.eventType}`);
  return result;
}

async function main() {
  console.log(`Using room server ${baseUrl}`);

  await pushCamera("orbit", {
    person_detected: true,
    person_count: 9,
    predicted_class: "arrival",
    prediction_confidence: 0.73,
    class_probs: { arrival: 0.73, presentation: 0.12, discussion: 0.15 },
  });

  await pushCamera("gravity", {
    person_detected: true,
    person_count: 3,
    gaze_direction: "center",
    gaze_x: 0.02,
    gaze_y: -0.01,
    gaze_z: 0.91,
    fatigue_detected: false,
  });

  await pushCamera("horizon", {
    whiteboard_text_detected: true,
    whiteboard_text: ["contract", "event", "projection"],
    predicted_class: "presentation",
    prediction_confidence: 0.86,
    class_probs: { presentation: 0.86, discussion: 0.1, empty: 0.04 },
  });

  await sendCommand("orbit", {
    command: "set-mode",
    mode: "vjepa",
    reason: "Monday rehearsal: ask Orbit for room-mode classification",
  });

  await sendCommand("gravity", {
    command: "capture",
    mode: "gaze",
    reason: "Monday rehearsal: request a gaze frame",
    params: { seconds: 3 },
  });

  await sendProjectRequest("smart-stage", {
    cameraId: "horizon",
    command: "fiducial",
    mode: "fiducial",
    reason: "Monday rehearsal: Smart Stage needs board tags",
  });

  const cameras = await requestJson("GET", "/api/cameras");
  const context = await requestJson("GET", "/room/context");
  const recent = await requestJson("GET", "/api/events/recent?limit=120");
  const types = new Set((recent.events || []).map((event) => event.event_type));

  const required = [
    "class.presence.changed",
    "classifier.probe.changed",
    "session.mode.changed",
    "whiteboard.changed",
    "attention.direction.changed",
    "camera.mode.requested",
    "camera.capture.requested",
    "fiducial.request",
  ];
  const missing = required.filter((type) => !types.has(type));
  if (missing.length) throw new Error(`missing expected events: ${missing.join(", ")}`);

  console.log(`cameras seen: ${(cameras.cameras || []).filter((camera) => camera.online).map((camera) => camera.cameraId).join(", ")}`);
  console.log(`room mode: ${context.room_mode}`);
  console.log("OAK rehearsal ok");
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
