"use strict";

const assert = require("assert");
const http = require("http");

const baseUrl = process.env.SMART_ROOM_URL || "http://127.0.0.1:4177";
const EVENT_TYPE_RE = /^[a-z][a-z0-9-]*(\.[a-z][a-z0-9-]*)+$/;

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
  return requestJson("POST", "/api/action", { type, source: "test-project-packets", payload });
}

async function main() {
  const before = await requestJson("GET", "/api/projects");
  const classObjects = await requestJson("GET", "/api/class-objects");
  assert(Array.isArray(before.projects), "projects should be an array");
  assert(before.projects.length >= 10, `expected at least 10 projects, got ${before.projects.length}`);
  const classObjectIds = new Set((classObjects.objects || []).map((object) => object.id));

  const allowedPrefixes = ["board.", "class.", "session.", "character.", "projection.", "room."];
  before.projects.forEach((project) => {
    assert(
      classObjectIds.has(project.fallbackObjectId),
      `${project.id} fallbackObjectId does not exist in class objects: ${project.fallbackObjectId}`,
    );
    assertCanonicalEventList(project, "canonicalSubscribes");
    assertCanonicalEventList(project, "canonicalEmits");
    assertCanonicalEventList(project, "subscribes");
    assertCanonicalEventList(project, "emits");
    if (project.eventType) {
      assert(EVENT_TYPE_RE.test(project.eventType), `${project.id} has non-canonical eventType ${project.eventType}`);
    }
    (project.scenario?.events || []).forEach((event) => {
      assert(
        allowedPrefixes.some((prefix) => String(event.event_type || "").startsWith(prefix)),
        `${project.id} has non-canonical scenario event ${event.event_type}`,
      );
    });
  });

  const smartStage = before.projects.find((project) => project.id === "smart-stage");
  assert(smartStage, "smart-stage should exist");
  assert(typeof smartStage.fallbackObjectId === "string" && smartStage.fallbackObjectId.length > 0, "smart-stage should declare fallbackObjectId");
  assert(Array.isArray(smartStage.modes) && smartStage.modes.length > 0, "smart-stage should declare modes");
  assert(Array.isArray(smartStage.canonicalSubscribes) && smartStage.canonicalSubscribes.length > 0, "smart-stage should declare canonical subscribes");
  assert(Array.isArray(smartStage.canonicalEmits) && smartStage.canonicalEmits.length > 0, "smart-stage should declare canonical emits");
  assert(typeof smartStage.acceptance?.trigger === "string" && smartStage.acceptance.trigger.length > 0, "smart-stage should declare an acceptance trigger");
  assert(Array.isArray(smartStage.scenario?.events) && smartStage.scenario.events.length > 0, "smart-stage should declare scenario events");

  await postAction("project.set", {
    id: "smart-stage",
    state: { scene: "demo", captions: false },
  });

  const afterSet = await requestJson("GET", "/api/projects");
  const updated = afterSet.projects.find((project) => project.id === "smart-stage");
  assert(updated.state.scene === "demo", `expected scene demo, got ${updated.state.scene}`);
  assert(updated.state.captions === false, `expected captions false, got ${updated.state.captions}`);

  await postAction("project.reset", { id: "smart-stage" });
  const afterReset = await requestJson("GET", "/api/projects");
  const reset = afterReset.projects.find((project) => project.id === "smart-stage");
  assert(reset.state.scene !== "demo", "reset should restore baseline project state");

  console.log("project packet state ok");
}

function assertCanonicalEventList(project, key) {
  (project[key] || []).forEach((eventType) => {
    assert(
      EVENT_TYPE_RE.test(String(eventType || "")),
      `${project.id} has non-canonical ${key} event ${eventType}`,
    );
  });
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
