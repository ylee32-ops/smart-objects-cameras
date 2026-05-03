"use strict";

const assert = require("assert");
const fs = require("fs");
const http = require("http");
const path = require("path");

const baseUrl = process.env.SMART_ROOM_URL || "http://127.0.0.1:4177";
const rootDir = path.resolve(__dirname, "..");
const timeline = JSON.parse(fs.readFileSync(path.join(rootDir, "public", "session-timeline.json"), "utf8"));
const packets = JSON.parse(fs.readFileSync(path.join(rootDir, "public", "project-packets.json"), "utf8"));
const submittedProjects = packets.projects.filter((project) => project.submittedProject !== false);
const submittedIds = new Set(submittedProjects.map((project) => project.id));

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
  const result = await requestJson("POST", "/api/action", { type, source: "test-timeline-emit", payload });
  assert(result.ok !== false, `${type} should succeed`);
  return result;
}

function flattenCues(data) {
  return (data.phases || [])
    .flatMap((phase) => (phase.cues || []).map((cue) => ({ ...cue, phaseId: phase.id })))
    .sort((a, b) => Number(a.atMinute || 0) - Number(b.atMinute || 0));
}

async function loadContractsAndHeartbeat() {
  for (const project of submittedProjects) {
    const contract = await requestJson("GET", `/api/projects/${encodeURIComponent(project.id)}/contract`);
    assert.strictEqual(contract.project_id, project.id, `${project.id} contract should resolve`);
    await requestJson("POST", `/api/projects/${encodeURIComponent(project.id)}/heartbeat`, {
      status: "online",
      capabilities: contract.emits || [],
      consumes: contract.consumes || [],
      emits: contract.emits || [],
      message: "timeline emit smoke",
    });
  }
}

async function emitCue(cue) {
  const emitted = [];
  for (const action of cue.actions || []) {
    await postAction(action.type, action.payload || {});
    emitted.push({ kind: "action", cueId: cue.id, type: action.type });
  }
  for (const event of cue.events || []) {
    const payload = {
      ...(event.payload || {}),
      timelineCueId: cue.id,
      timelineCueLabel: cue.label,
    };
    if (event.projectId) {
      assert(submittedIds.has(event.projectId), `timeline cue ${cue.id} references unknown submitted project ${event.projectId}`);
      const result = await requestJson("POST", `/api/projects/${encodeURIComponent(event.projectId)}/events`, {
        event_type: event.event_type,
        payload,
      });
      assert(result.ok, `${cue.id} project event should succeed`);
      emitted.push({ kind: "project", cueId: cue.id, projectId: event.projectId, eventType: result.event.event_type });
    } else {
      await postAction("event.manual", {
        event_type: event.event_type,
        payload,
      });
      emitted.push({ kind: "room", cueId: cue.id, eventType: event.event_type });
    }
  }
  return emitted;
}

async function main() {
  await postAction("room.reset", {});
  await loadContractsAndHeartbeat();

  const cues = flattenCues(timeline);
  assert(cues.length >= 1, "timeline should include cues");

  const expectedEvents = [];
  const projectIdsWithTimelineEvents = new Set();
  for (const cue of cues) {
    const emitted = await emitCue(cue);
    for (const item of emitted) {
      if (item.kind === "project" || item.kind === "room") expectedEvents.push(item);
      if (item.kind === "project") projectIdsWithTimelineEvents.add(item.projectId);
    }
  }

  for (const projectId of submittedIds) {
    assert(projectIdsWithTimelineEvents.has(projectId), `timeline should emit at least one project event for ${projectId}`);
  }

  const state = await requestJson("GET", "/api/state");
  assert.strictEqual(state.room.phase, "wrap", "timeline should finish in wrap phase");
  assert.strictEqual(state.room.boardMode, "explore", "timeline should finish in explore board mode");

  const recent = await requestJson("GET", "/api/events/recent?limit=160");
  const events = recent.events || [];
  for (const expected of expectedEvents) {
    const matched = events.some((event) => {
      const payload = event.payload || {};
      return (
        event.event_type === expected.eventType &&
        payload.timelineCueId === expected.cueId &&
        (!expected.projectId || payload.projectId === expected.projectId)
      );
    });
    assert(matched, `missing timeline event ${expected.eventType} for cue ${expected.cueId}`);
  }

  const readiness = await requestJson("GET", "/api/projects/readiness");
  assert.strictEqual(readiness.summary.submitted, submittedProjects.length, "readiness should count submitted student projects");
  assert.strictEqual(readiness.summary.withEvents, submittedProjects.length, "timeline should produce at least one event for every submitted project");
  assert.strictEqual(readiness.summary.live, submittedProjects.length, "timeline heartbeat setup should leave every submitted project live");

  const context = await requestJson("GET", "/room/context");
  assert.strictEqual(context.phase, "wrap", "room context should expose final wrap phase");
  assert.strictEqual(context.boardMode, "explore", "room context should expose final explore board mode");

  console.log(`timeline emit ok (${cues.length} cues, ${expectedEvents.length} events, ${submittedProjects.length} projects)`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
