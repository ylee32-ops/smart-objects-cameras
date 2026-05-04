"use strict";

const assert = require("assert");
const http = require("http");

const baseUrl = process.env.SMART_ROOM_URL || "http://127.0.0.1:4177";

function request(method, pathname, body) {
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
          if (res.statusCode >= 400) reject(new Error(text || `HTTP ${res.statusCode}`));
          else resolve({ statusCode: res.statusCode, text });
        });
      },
    );
    req.on("error", reject);
    if (data) req.write(data);
    req.end();
  });
}

async function requestJson(method, pathname, body) {
  const res = await request(method, pathname, body);
  return res.text ? JSON.parse(res.text) : {};
}

async function main() {
  const cameraId = `readiness-${process.pid}-${Date.now()}`;

  const readiness = await requestJson("GET", "/api/projects/readiness");
  assert(readiness.summary.total >= 10, "readiness should include project roster");
  const smartStage = readiness.projects.find((project) => project.projectId === "smart-stage");
  assert(smartStage, "smart-stage readiness should exist");
  assert(smartStage.hasContract, "smart-stage should have a contract");

  const contract = await requestJson("GET", "/api/projects/smart-stage/contract");
  assert(contract.project_id === "smart-stage", "contract should identify smart-stage");
  assert(contract.prompt.includes("Build the smallest mock-first integration"), "contract should include a student prompt");

  const contractMarkdown = await request("GET", "/api/projects/smart-stage/contract.md");
  assert(contractMarkdown.text.includes("Prompt Against This Contract"), "markdown contract should include prompt section");

  await requestJson("POST", "/api/projects/smart-stage/heartbeat", {
    status: "online",
    capabilities: ["board.scene.requested"],
    consumes: ["board.zone.activated"],
    emits: ["board.scene.requested"],
    message: "test heartbeat",
  });

  await requestJson("POST", "/api/projects/smart-stage/events", {
    event_type: "board.scene.requested",
    payload: { scene: "test", mock: true },
  });

  const after = await requestJson("GET", "/api/projects/readiness");
  const updated = after.projects.find((project) => project.projectId === "smart-stage");
  assert(updated.hasHeartbeat, "heartbeat should be recorded");
  assert(updated.eventCount > 0, "project event should be counted");
  assert(updated.score >= 4, `expected score >= 4, got ${updated.score}`);

  const legacyPacket = await request("GET", "/projects/smart-stage/packet.md");
  assert(legacyPacket.text.includes("Smart Stage Contract"), "legacy packet route should return contract markdown");

  const cameraPush = await requestJson("POST", "/push/state", {
    camera_id: cameraId,
    person_detected: true,
    person_count: 12,
    predicted_class: "presentation",
    prediction_confidence: 0.88,
    class_probs: { presentation: 0.88, discussion: 0.08 },
    whiteboard_text_detected: true,
    whiteboard_text: ["contracts", "room state"],
    gaze_direction: "center",
  });
  const emittedCameraEvents = new Set(cameraPush.events || []);
  assert(emittedCameraEvents.has("class.presence.changed"), "camera push should emit class.presence.changed");
  assert(emittedCameraEvents.has("classifier.probe.changed"), "camera push should emit classifier.probe.changed");
  assert(emittedCameraEvents.has("whiteboard.changed"), "camera push should emit whiteboard.changed");

  const context = await requestJson("GET", "/room/context");
  assert(context.cameras[cameraId], "room context should include pushed camera state");
  assert(context.room_mode === "presentation", `expected presentation mode, got ${context.room_mode}`);

  const cameras = await requestJson("GET", "/api/cameras");
  assert(cameras.cameras.some((camera) => camera.cameraId === cameraId), "camera snapshot should include pushed camera");

  const command = await requestJson("POST", "/api/cameras/orbit/command", {
    command: "set-mode",
    mode: "vjepa",
    reason: "test command",
  });
  assert(command.command.eventType === "camera.mode.requested", "set-mode should emit camera.mode.requested");

  const projectCameraRequest = await requestJson("POST", "/api/projects/smart-stage/camera-request", {
    cameraId: "horizon",
    command: "fiducial",
    mode: "fiducial",
    reason: "test project request",
  });
  assert(projectCameraRequest.command.eventType === "fiducial.request", "project camera request should emit fiducial.request");

  const capabilityRoute = await requestJson("POST", "/capabilities/route", {
    capability: "board.scene.requested",
    needed_by: "smart-stage",
    reason: "test",
  });
  assert(capabilityRoute.target, "capability route should return a target");

  const recent = await requestJson("GET", "/api/events/recent?limit=80");
  const types = new Set((recent.events || []).map((event) => event.event_type));
  assert(types.has("class.presence.changed"), "camera push should emit class.presence.changed");
  assert(types.has("classifier.probe.changed"), "camera push should emit classifier.probe.changed");
  if (emittedCameraEvents.has("session.mode.changed")) {
    assert(types.has("session.mode.changed"), "camera push should emit session.mode.changed");
  }
  assert(types.has("whiteboard.changed"), "camera push should emit whiteboard.changed");
  assert(types.has("camera.mode.requested"), "camera command should emit camera.mode.requested");
  assert(types.has("fiducial.request"), "project camera request should emit fiducial.request");

  console.log("project readiness and camera bridge ok");
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
