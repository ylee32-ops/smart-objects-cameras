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
  return requestJson("POST", "/api/action", { type, source: "test-class-objects", payload });
}

async function main() {
  const before = await requestJson("GET", "/api/class-objects");
  assert(Array.isArray(before.objects), "objects should be an array");
  assert(before.objects.length >= 13, `expected at least 13 objects, got ${before.objects.length}`);

  const ambient = before.objects.find((object) => object.id === "ambient-light");
  assert(ambient, "ambient-light should exist");

  await postAction("class-object.set", {
    id: "ambient-light",
    state: { level: 47, mode: "class", x: 0.21, y: 0.31 },
  });

  const afterSet = await requestJson("GET", "/api/class-objects");
  const updated = afterSet.objects.find((object) => object.id === "ambient-light");
  assert(updated.state.level === 47, `expected updated level 47, got ${updated.state.level}`);
  assert(updated.state.mode === "class", `expected mode class, got ${updated.state.mode}`);
  assert(updated.state.x === 0.21, `expected x 0.21, got ${updated.state.x}`);
  assert(updated.state.y === 0.31, `expected y 0.31, got ${updated.state.y}`);

  await postAction("class-object.reset", { id: "ambient-light" });
  const afterReset = await requestJson("GET", "/api/class-objects");
  const reset = afterReset.objects.find((object) => object.id === "ambient-light");
  assert(reset.state.level !== 47, "reset should restore baseline state");

  console.log("class object state ok");
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
