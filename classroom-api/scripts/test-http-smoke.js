"use strict";

const assert = require("assert");
const http = require("http");

const baseUrl = process.env.SMART_ROOM_URL || "http://127.0.0.1:4177";

function request(pathname) {
  return new Promise((resolve, reject) => {
    const url = new URL(pathname, baseUrl);
    const req = http.request(
      url,
      { method: "GET" },
      (res) => {
        let text = "";
        res.on("data", (chunk) => {
          text += chunk;
        });
        res.on("end", () => {
          resolve({ statusCode: res.statusCode, text, headers: res.headers });
        });
      },
    );
    req.on("error", reject);
    req.end();
  });
}

async function expectHtml(pathname, marker) {
  const res = await request(pathname);
  assert.equal(res.statusCode, 200, `${pathname} should return 200`);
  assert(
    (res.headers["content-type"] || "").includes("text/html"),
    `${pathname} should return html`,
  );
  assert(res.text.includes(marker), `${pathname} should include ${marker}`);
}

async function expectJson(pathname, predicate, description) {
  const res = await request(pathname);
  assert.equal(res.statusCode, 200, `${pathname} should return 200`);
  const parsed = JSON.parse(res.text || "{}");
  assert(predicate(parsed), description);
}

async function expectText(pathname, marker) {
  const res = await request(pathname);
  assert.equal(res.statusCode, 200, `${pathname} should return 200`);
  assert(res.text.includes(marker), `${pathname} should include ${marker}`);
}

async function expectStatus(pathname) {
  const res = await request(pathname);
  assert.equal(res.statusCode, 200, `${pathname} should return 200`);
}

async function main() {
  await expectHtml("/", "Smart Classroom API");
  await expectHtml("/heartbeat", "Project heartbeat");
  await expectHtml("/start.html", "Student Start");
  await expectHtml("/interaction.html", "Tag Grammar Matrix");
  await expectText("/interaction.js", "tagGrammarRows");
  await expectText("/shared.js", "recoveryItems");
  await expectHtml("/class-objects.html", "Class Object Workbench");
  await expectHtml("/projects.html", "Projects");
  await expectHtml("/project.html?id=smart-stage", "Start Live Test");
  await expectHtml("/timeline.html", "Class Timeline");
  await expectText("/timeline.js", "emitCue");
  await expectJson(
    "/session-timeline.json",
    (data) => Array.isArray(data.phases) && data.phases.length >= 5,
    "session timeline should include phases",
  );
  await expectHtml("/report.html", "Readiness");
  await expectHtml("/cameras.html", "Cameras");
  await expectHtml("/events.html", "Events");
  await expectHtml("/board.html", "Board");
  await expectHtml("/setup.html", "Calibration Source");
  await expectHtml("/cards.html", "Marker Cards");
  await expectHtml("/tag-reference.html", "Tag Reference");
  await expectHtml("/tag-debugger.html", "Tag Debugger");
  await expectText("/tag-debugger.js", "tagDebugVideo");
  await expectHtml("/tag-board.html", "Mobile Tag Board");
  await expectText("/tag-board.js", "virtualTagLayer");
  await expectHtml("/calibration-board.html", "Calibration Checker Board");
  await expectText("/tag-reference.html", "Tag Grammar Matrix");
  const generatedTags = await request("/generated-tags/board-tags.html");
  if (generatedTags.statusCode === 200) {
    assert(generatedTags.text.includes("Board Calibration"), "generated board tags should include Board Calibration");
  }
  const threeRuntime = await request("/vendor/three/build/three.module.js");
  if (threeRuntime.statusCode === 200) {
    assert(threeRuntime.text.includes("REVISION"), "Three runtime should include REVISION");
  }

  await expectJson("/api/health", (data) => data.ok === true, "health should be ok");
  await expectJson(
    "/api/figurate/status",
    (data) => data.ok === true && data.figurate && typeof data.figurate.provider === "string",
    "figurate status should expose adapter configuration",
  );
  await expectJson(
    "/api/projects/readiness",
    (data) => Array.isArray(data.projects) && data.summary && data.summary.total >= 1,
    "readiness should include projects",
  );
  await expectJson(
    "/api/cameras",
    (data) => Array.isArray(data.cameras),
    "camera snapshot should include cameras array",
  );
  await expectJson(
    "/room/context",
    (data) => data.task && Array.isArray(data.task.recent_events),
    "room context should include recent events",
  );

  console.log("http smoke ok");
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
