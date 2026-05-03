"use strict";

const assert = require("assert");
const http = require("http");

const baseUrl = process.env.SMART_ROOM_URL || "http://127.0.0.1:4177";

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
  return requestJson("POST", "/api/action", { type, source: "test-featured-scenarios", payload });
}

async function runProjectScenario(project) {
  await postAction("project.set", { id: project.id, state: project.state || {} });
  for (const item of project.scenario?.events || []) {
    await postAction("event.manual", {
      event_type: item.event_type,
      payload: {
        ...(item.payload || {}),
        projectId: project.id,
        title: project.title,
        owner: project.owner,
        kind: project.kind,
        surface: project.surface,
        sourceProject: project.id,
        state: {
          ...(project.state || {}),
          ...(item.payload?.state || {}),
        },
        modes: project.modes,
      },
    });
  }
}

async function main() {
  const data = await requestJson("GET", "/api/projects");
  const projects = data.projects || [];
  const featured = projects.filter((project) => project.scenario?.featured);
  assert(featured.length > 0, "expected at least one featured scenario");

  for (const project of featured) {
    await runProjectScenario(project);
    const recent = await requestJson("GET", "/api/events/recent?limit=120");
    const matching = (recent.events || []).filter((event) => {
      const payload = event.payload || {};
      return payload.projectId === project.id || payload.sourceProject === project.id;
    });
    const seenTypes = new Set(matching.map((event) => event.event_type));
    for (const expected of project.acceptance?.expectEvents || []) {
      assert(seenTypes.has(expected), `${project.id} missing expected event ${expected}`);
    }
  }

  console.log(`featured scenarios ok (${featured.length})`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
