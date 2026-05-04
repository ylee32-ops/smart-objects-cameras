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
  return requestJson("POST", "/api/action", { type, source: "test-board-mode", payload });
}

async function main() {
  const before = await requestJson("GET", "/api/state");
  assert(before.room, "room state should exist");

  await postAction("board-mode.set", { mode: "focus" });
  const afterSet = await requestJson("GET", "/api/state");
  assert(afterSet.room.boardMode === "focus", `expected boardMode focus, got ${afterSet.room.boardMode}`);

  await postAction("board-mode.set", { mode: "stage" });
  const afterReset = await requestJson("GET", "/api/state");
  assert(afterReset.room.boardMode === "stage", `expected boardMode stage, got ${afterReset.room.boardMode}`);

  console.log("board mode ok");
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
