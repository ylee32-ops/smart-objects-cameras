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
          else resolve({ statusCode: res.statusCode, text, headers: res.headers });
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
  const cameraId = `compat-${process.pid}-${Date.now()}`;

  const reset = await requestJson("POST", "/mock/reset", {});
  assert.strictEqual(reset.phase, "activity", "mock reset should return the reset phase");

  const phase = await requestJson("POST", "/phase", { phase: "lecture" });
  assert.strictEqual(phase.phase, "lecture", "phase route should set the room phase");

  const phaseRead = await requestJson("GET", "/phase");
  assert.strictEqual(phaseRead.phase, "lecture", "phase route should read the room phase");

  const pushed = await requestJson("POST", "/push/state", {
    camera_id: cameraId,
    person_detected: true,
    person_count: 3,
    predicted_class: "presentation",
    prediction_confidence: 0.9,
    whiteboard_text_detected: true,
    whiteboard_text: ["legacy state shape"],
  });
  assert.strictEqual(pushed.room_mode, "presentation", "push/state should expose old top-level room_mode");
  assert.strictEqual(pushed.phase, "lecture", "push/state should expose old top-level phase");
  assert(pushed.routing, "push/state should expose routing counts");

  const state = await requestJson("GET", "/state");
  assert.strictEqual(state.room_mode, "presentation", "legacy /state should expose top-level room_mode");
  assert.strictEqual(state.total_persons, 3, "legacy /state should expose top-level total_persons");
  assert.strictEqual(state.whiteboard_active, true, "legacy /state should expose top-level whiteboard_active");
  assert(state.cameras[cameraId], "legacy /state should include camera states");

  const camera = await requestJson("GET", `/state/${encodeURIComponent(cameraId)}`);
  assert.strictEqual(camera.camera_id, cameraId, "legacy camera state route should return the camera");

  const heartbeat = await requestJson("POST", "/projects/calmball/heartbeat", {
    status: "online",
    capabilities: ["calm.activated"],
    consumes: ["session.mode.changed"],
    emits: ["calm.activated"],
    message: "legacy compat heartbeat",
  });
  assert.strictEqual(heartbeat.status.project_id, "calmball", "legacy heartbeat should expose old status shape");
  assert.strictEqual(heartbeat.status.is_live, true, "legacy heartbeat should mark fresh heartbeat live");

  const legacyEvent = await requestJson("POST", "/projects/forest-classroom/events", {
    event_type: "forest.mood_set",
    payload: { mood: "active" },
  });
  assert.strictEqual(legacyEvent.event.event_type, "forest.mood-set", "legacy underscores should be canonicalized");
  assert.strictEqual(legacyEvent.event.payload.legacyEventType, "forest.mood_set", "legacy event type should be preserved in payload");

  const filtered = await requestJson("GET", "/events?event_type=forest.mood_set&limit=20");
  assert(filtered.events.some((event) => event.event_type === "forest.mood-set"), "legacy event_type filter should map to canonical type");

  const contract = await requestJson("GET", "/projects/calmball/contract");
  assert.strictEqual(contract.project_id, "calmball", "legacy project packets should resolve by old ID");

  const validation = await requestJson("POST", "/contracts/validate", {
    project_id: "calmball",
    event_type: "room_mode_change",
    payload: { mode: "group" },
  });
  assert.strictEqual(validation.ok, true, "contract validator should accept legacy event aliases");
  assert.strictEqual(validation.event_type, "session.mode.changed", "contract validator should return canonical event type");

  const nudges = await request("GET", "/projects/nudges.md");
  assert(nudges.text.includes("Project Nudges"), "legacy nudges markdown should exist");

  const roster = await request("GET", "/projects/roster.csv");
  assert(roster.text.startsWith("project_id,title,owner,score,status"), "legacy roster CSV should exist");

  const report = await request("GET", "/showcase/report");
  assert(report.text.includes("Smart Classroom Showcase Report"), "legacy showcase markdown should exist");

  console.log("classroom api compatibility ok");
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
