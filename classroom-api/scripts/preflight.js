"use strict";

const fs = require("fs");
const http = require("http");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const SERVER_URL = process.env.SMART_ROOM_URL || "http://localhost:4177";

const checks = [];

function check(name, ok, detail = "", required = true) {
  checks.push({ name, ok: Boolean(ok), detail, required });
}

function exists(relativePath) {
  return fs.existsSync(path.join(ROOT, relativePath));
}

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, relativePath), "utf8"));
}

function readText(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), "utf8");
}

function httpGetJson(url) {
  return new Promise((resolve) => {
    const req = http.get(url, (res) => {
      let body = "";
      res.on("data", (chunk) => {
        body += chunk;
      });
      res.on("end", () => {
        try {
          resolve({
            ok: res.statusCode >= 200 && res.statusCode < 300,
            statusCode: res.statusCode,
            data: body ? JSON.parse(body) : null,
          });
        } catch (error) {
          resolve({ ok: false, statusCode: res.statusCode, error: error.message });
        }
      });
    });
    req.on("error", (error) => resolve({ ok: false, error: error.message }));
    req.setTimeout(2500, () => {
      req.destroy();
      resolve({ ok: false, error: "timeout" });
    });
  });
}

function httpGetStatus(url) {
  return new Promise((resolve) => {
    const req = http.get(url, (res) => {
      res.resume();
      res.on("end", () => {
        resolve({
          ok: res.statusCode >= 200 && res.statusCode < 300,
          statusCode: res.statusCode,
        });
      });
    });
    req.on("error", (error) => resolve({ ok: false, error: error.message }));
    req.setTimeout(2500, () => {
      req.destroy();
      resolve({ ok: false, error: "timeout" });
    });
  });
}

function markerSummary(config) {
  const markers = Array.isArray(config.markers) ? config.markers : [];
  const roleCounts = {};
  markers.forEach((marker) => {
    roleCounts[marker.kind] = (roleCounts[marker.kind] || 0) + 1;
  });
  return `${markers.length} markers (${Object.entries(roleCounts)
    .map(([role, count]) => `${role}:${count}`)
    .join(", ")})`;
}

function mappedTagIds(tagMap) {
  return [
    ...Object.keys(tagMap.calibrationTags || {}),
    ...Object.keys(tagMap.objectTags || {}),
  ].map((id) => Number(id)).filter(Number.isFinite).sort((a, b) => a - b);
}

async function main() {
  check("package.json", exists("package.json"));
  check("server.js", exists("server.js"));
  check("room config", exists("data/room-config.json"));
  check("tag map", exists("data/tag-map.json"));
  check("device specs", exists("data/device-specs.json"));
  check("detector requirements", exists("requirements-detector.txt"));
  check("detector setup script", exists("scripts/setup-detector.ps1"));
  check("detector run script", exists("scripts/run-detector.ps1"));
  check("AprilTag detector bridge", exists("scripts/apriltag-detector.py"));
  check("OAK command agent", exists("scripts/oak-command-agent.py"));
  check("OAK system simulator", exists("scripts/simulate-oak-system.js"));
  check("marker card generator", exists("scripts/generate-apriltag-cards.py"));
  check("student start page", exists("public/start.html"));
  check("interaction grammar page", exists("public/interaction.html"));
  check("readiness report page", exists("public/report.html"));
  check("readiness report script", exists("public/report.js"));
  check("camera command page", exists("public/cameras.html"));
  check("camera command script", exists("public/cameras.js"));
  check("class object simulator page", exists("public/class-objects.html"));
  check("class object simulator data", exists("public/class-objects.json"));
  check("event inspector page", exists("public/events.html"));
  check("project packets page", exists("public/projects.html"));
  check("project packet detail page", exists("public/project.html"));
  check("setup page", exists("public/setup.html"));
  check("tag reference page", exists("public/tag-reference.html"));
  check("tag reference script", exists("public/tag-reference.js"));
  check("virtual room page", exists("ideas/virtualroom/index.html"));
  check("local Three.js runtime", exists("node_modules/three/build/three.module.js"), "run npm install if using the virtual room viewer", false);
  check("project packets data", exists("public/project-packets.json"));
  check("student integration guide", exists("docs/student-integration-guide.md"));
  check("OAK-D integration guide", exists("docs/oak-d-integration-guide.md"));
  check("event contract module", exists("lib/events.js"));
  check("event contract test", exists("scripts/test-events.js"));

  let config = null;
  try {
    config = readJson("data/room-config.json");
    check("room config parses", true, markerSummary(config));
    const surfaces = Array.isArray(config.surfaces) ? config.surfaces : [];
    check("legacy table surface retained", surfaces.some((surface) => surface.id === "table"), "compatibility only", false);
    check("board surface configured", surfaces.some((surface) => surface.id === "board"));
    check("light-lab mode configured", Boolean(config.markerModes?.["light-lab"]));
  } catch (error) {
    check("room config parses", false, error.message);
  }

  try {
    const tagMap = readJson("data/tag-map.json");
    check("tag map parses", true);
    check("legacy table calibration tags 0-3", ["0", "1", "2", "3"].every((id) => tagMap.calibrationTags?.[id]?.surface === "table"), "compatibility only", false);
    check("board calibration tags 4-7", ["4", "5", "6", "7"].every((id) => tagMap.calibrationTags?.[id]?.surface === "board"));
    check("Light Lab object tags 10-16", ["10", "11", "12", "13", "14", "15", "16"].every((id) => Boolean(tagMap.objectTags?.[id])));
    const boardRoles = new Set(Object.values(tagMap.objectTags || {})
      .filter((tag) => tag.surface === "board")
      .map((tag) => tag.role));
    const requiredBoardRoles = ["sticky", "zone", "focus", "timer", "tool", "write", "slide", "video", "object3d", "vertex", "action", "figurate"];
    const missingBoardRoles = requiredBoardRoles.filter((role) => !boardRoles.has(role));
    check("board interaction tag roles", missingBoardRoles.length === 0, missingBoardRoles.length ? `missing ${missingBoardRoles.join(", ")}` : requiredBoardRoles.join(", "));
    check("Figurate tag 40", tagMap.objectTags?.["40"]?.role === "figurate", tagMap.objectTags?.["40"]?.label || "missing");
    const missingPngs = mappedTagIds(tagMap).filter((id) => !exists(`public/generated-tags/tag-${id}.png`));
    check(
      "generated PNGs for mapped tags",
      missingPngs.length === 0,
      missingPngs.length ? `missing ${missingPngs.join(", ")}; run scripts/generate-apriltag-cards.py` : `${mappedTagIds(tagMap).length} tags`,
      false,
    );
  } catch (error) {
    check("tag map parses", false, error.message);
  }

  try {
    const deviceSpecs = readJson("data/device-specs.json");
    check("device specs parses", true);
    check("Kiyo Pro spec present", Boolean(deviceSpecs.cameras?.["razer-kiyo-pro"]));
    check("C920 spec present", Boolean(deviceSpecs.cameras?.["logitech-c920"]));
  } catch (error) {
    check("device specs parses", false, error.message);
  }

  const venvPython = path.join(ROOT, ".venv-detector", "Scripts", "python.exe");
  check("detector venv", fs.existsSync(venvPython), fs.existsSync(venvPython) ? venvPython : "run scripts/setup-detector.ps1", false);
  check("generated real tag sheet", exists("public/generated-tags/cards.html"), "optional until OpenCV generation runs", false);
  check("generated board tag grid", exists("public/generated-tags/board-tags.html"), "optional until OpenCV generation runs", false);
  if (exists("public/generated-tags/board-tags.html")) {
    const boardTagSheet = readText("public/generated-tags/board-tags.html");
    check("board tag sheet labels", boardTagSheet.includes("tag-label") && boardTagSheet.includes("Figurate"));
    check("board tag sheet semantic marks", boardTagSheet.includes("semantic-mark") && boardTagSheet.includes("FIGURATE function mark"));
    check("board tag sheet avoids duplicate titles", !boardTagSheet.includes("<h2>"), "single name under tag");
  }

  const health = await httpGetJson(`${SERVER_URL}/api/health`);
  check("room server reachable", health.ok, health.ok ? SERVER_URL : health.error || `HTTP ${health.statusCode}`);

  if (health.ok) {
    const consolePage = await httpGetStatus(`${SERVER_URL}/`);
    check("console route", consolePage.ok, consolePage.ok ? "/" : consolePage.error || `HTTP ${consolePage.statusCode}`);

    const startPage = await httpGetStatus(`${SERVER_URL}/start.html`);
    check("student start route", startPage.ok, startPage.ok ? "/start.html" : startPage.error || `HTTP ${startPage.statusCode}`);

    const interactionPage = await httpGetStatus(`${SERVER_URL}/interaction.html`);
    check("interaction grammar route", interactionPage.ok, interactionPage.ok ? "/interaction.html" : interactionPage.error || `HTTP ${interactionPage.statusCode}`);

    const reportPage = await httpGetStatus(`${SERVER_URL}/report.html`);
    check("readiness report route", reportPage.ok, reportPage.ok ? "/report.html" : reportPage.error || `HTTP ${reportPage.statusCode}`);

    const camerasPage = await httpGetStatus(`${SERVER_URL}/cameras.html`);
    check("camera command route", camerasPage.ok, camerasPage.ok ? "/cameras.html" : camerasPage.error || `HTTP ${camerasPage.statusCode}`);

    const projectorPage = await httpGetStatus(`${SERVER_URL}/projector.html`);
    check("projector route", projectorPage.ok, projectorPage.ok ? "/projector.html" : projectorPage.error || `HTTP ${projectorPage.statusCode}`);

    const boardPage = await httpGetStatus(`${SERVER_URL}/board.html`);
    check("board route", boardPage.ok, boardPage.ok ? "/board.html" : boardPage.error || `HTTP ${boardPage.statusCode}`);

    const tablePage = await httpGetStatus(`${SERVER_URL}/table.html`);
    check("legacy table route", tablePage.ok, tablePage.ok ? "/table.html" : tablePage.error || `HTTP ${tablePage.statusCode}`, false);

    const cameraPage = await httpGetStatus(`${SERVER_URL}/camera.html`);
    check("camera route", cameraPage.ok, cameraPage.ok ? "/camera.html" : cameraPage.error || `HTTP ${cameraPage.statusCode}`);

    const phonePage = await httpGetStatus(`${SERVER_URL}/phone.html`);
    check("phone route", phonePage.ok, phonePage.ok ? "/phone.html" : phonePage.error || `HTTP ${phonePage.statusCode}`);

    const setupPage = await httpGetStatus(`${SERVER_URL}/setup.html`);
    check("setup route", setupPage.ok, setupPage.ok ? "/setup.html" : setupPage.error || `HTTP ${setupPage.statusCode}`);

    const tagReferencePage = await httpGetStatus(`${SERVER_URL}/tag-reference.html`);
    check("tag reference route", tagReferencePage.ok, tagReferencePage.ok ? "/tag-reference.html" : tagReferencePage.error || `HTTP ${tagReferencePage.statusCode}`);

    const boardTagsPage = await httpGetStatus(`${SERVER_URL}/generated-tags/board-tags.html`);
    check("board tag sheet route", boardTagsPage.ok, boardTagsPage.ok ? "/generated-tags/board-tags.html" : boardTagsPage.error || `HTTP ${boardTagsPage.statusCode}`, false);

    const threeRuntime = await httpGetStatus(`${SERVER_URL}/vendor/three/build/three.module.js`);
    check("local Three.js route", threeRuntime.ok, threeRuntime.ok ? "/vendor/three/build/three.module.js" : threeRuntime.error || `HTTP ${threeRuntime.statusCode}`, false);

    const virtualRoomPage = await httpGetStatus(`${SERVER_URL}/ideas/virtualroom/`);
    check("virtual room route", virtualRoomPage.ok, virtualRoomPage.ok ? "/ideas/virtualroom/" : virtualRoomPage.error || `HTTP ${virtualRoomPage.statusCode}`);

    const classPage = await httpGetStatus(`${SERVER_URL}/class-objects.html`);
    check("class object simulator route", classPage.ok, classPage.ok ? "/class-objects.html" : classPage.error || `HTTP ${classPage.statusCode}`);

    const classData = await httpGetStatus(`${SERVER_URL}/class-objects.json`);
    check("class object simulator data route", classData.ok, classData.ok ? "/class-objects.json" : classData.error || `HTTP ${classData.statusCode}`);

    const classState = await httpGetJson(`${SERVER_URL}/api/class-objects`);
    check("class object state endpoint", classState.ok && Array.isArray(classState.data?.objects), classState.ok ? "/api/class-objects" : classState.error || `HTTP ${classState.statusCode}`);

    const projectState = await httpGetJson(`${SERVER_URL}/api/projects`);
    check("project state endpoint", projectState.ok && Array.isArray(projectState.data?.projects), projectState.ok ? "/api/projects" : projectState.error || `HTTP ${projectState.statusCode}`);

    const readiness = await httpGetJson(`${SERVER_URL}/api/projects/readiness`);
    check("project readiness endpoint", readiness.ok && Array.isArray(readiness.data?.projects), readiness.ok ? "/api/projects/readiness" : readiness.error || `HTTP ${readiness.statusCode}`);

    const contract = await httpGetStatus(`${SERVER_URL}/api/projects/smart-stage/contract.md`);
    check("project contract prompt endpoint", contract.ok, contract.ok ? "/api/projects/smart-stage/contract.md" : contract.error || `HTTP ${contract.statusCode}`);

    const roomContext = await httpGetJson(`${SERVER_URL}/room/context`);
    check("room context compatibility endpoint", roomContext.ok && Boolean(roomContext.data?.room_mode), roomContext.ok ? "/room/context" : roomContext.error || `HTTP ${roomContext.statusCode}`);

    const cameras = await httpGetJson(`${SERVER_URL}/api/cameras`);
    check("camera command endpoint", cameras.ok && Array.isArray(cameras.data?.cameras), cameras.ok ? "/api/cameras" : cameras.error || `HTTP ${cameras.statusCode}`);

    const eventsPage = await httpGetStatus(`${SERVER_URL}/events.html`);
    check("event inspector route", eventsPage.ok, eventsPage.ok ? "/events.html" : eventsPage.error || `HTTP ${eventsPage.statusCode}`);

    const projectsPage = await httpGetStatus(`${SERVER_URL}/projects.html`);
    check("project packets route", projectsPage.ok, projectsPage.ok ? "/projects.html" : projectsPage.error || `HTTP ${projectsPage.statusCode}`);

    const projectPage = await httpGetStatus(`${SERVER_URL}/project.html?id=smart-stage`);
    check("project packet detail route", projectPage.ok, projectPage.ok ? "/project.html?id=smart-stage" : projectPage.error || `HTTP ${projectPage.statusCode}`);
    const state = await httpGetJson(`${SERVER_URL}/api/state`);
    check("state endpoint", state.ok);
    if (state.ok) {
      check("board calibration state present", Boolean(state.data.calibration?.board?.status), state.data.calibration?.board?.status || "");
      const markers = state.data.markers?.items || state.data.fiducials?.markers || state.data.table?.tokens || [];
      check("markers in live state", Array.isArray(markers) && markers.length >= 1, `${markers.length || 0} markers`);
    }

    const tagMapApi = await httpGetJson(`${SERVER_URL}/api/tag-map`);
    check("tag map endpoint", tagMapApi.ok);

    const configApi = await httpGetJson(`${SERVER_URL}/api/config`);
    check("config endpoint", configApi.ok);

    const calibration = await httpGetJson(`${SERVER_URL}/api/calibration`);
    check("calibration endpoint", calibration.ok);

    const deviceSpecsApi = await httpGetJson(`${SERVER_URL}/api/device-specs`);
    check("device specs endpoint", deviceSpecsApi.ok);

    const recentEvents = await httpGetJson(`${SERVER_URL}/api/events/recent?limit=5`);
    check("recent events endpoint", recentEvents.ok && Array.isArray(recentEvents.data?.events));
  }

  const pass = checks.filter((item) => item.ok).length;
  const failures = checks.filter((item) => !item.ok && item.required);
  const warnings = checks.filter((item) => !item.ok && !item.required);
  console.log(`\nSmart classroom preflight: ${pass}/${checks.length} passed, ${warnings.length} warnings\n`);
  checks.forEach((item) => {
    const mark = item.ok ? "OK " : item.required ? "NO " : "WARN";
    console.log(`${mark} ${item.name}${item.detail ? ` - ${item.detail}` : ""}`);
  });

  if (failures.length || warnings.length) {
    console.log("\nFix NO items before continuing. WARN items are expected until detector setup/tag generation is complete.");
  }
  process.exit(failures.length ? 1 : 0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
