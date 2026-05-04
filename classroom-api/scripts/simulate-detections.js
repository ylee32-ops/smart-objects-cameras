"use strict";

const http = require("http");

const baseUrl = process.env.SMART_ROOM_URL || process.argv[2] || "http://localhost:4177";

function postAction(type, payload) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ type, payload, source: "detection-simulator" });
    const url = new URL("/api/action", baseUrl);
    const req = http.request(
      url,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(body),
        },
      },
      (res) => {
        let data = "";
        res.on("data", (chunk) => {
          data += chunk;
        });
        res.on("end", () => {
          const parsed = data ? JSON.parse(data) : {};
          if (res.statusCode >= 400) {
            reject(new Error(parsed.error || `HTTP ${res.statusCode}`));
          } else {
            resolve(parsed);
          }
        });
      },
    );
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

async function calibrateTable() {
  await postAction("calibration.clear", { surface: "table" });
  const samples = [
    { tagId: 0, camera: { x: 100, y: 100 }, surfacePoint: { x: 0, y: 0 } },
    { tagId: 1, camera: { x: 900, y: 120 }, surfacePoint: { x: 1, y: 0 } },
    { tagId: 2, camera: { x: 880, y: 700 }, surfacePoint: { x: 1, y: 1 } },
    { tagId: 3, camera: { x: 120, y: 680 }, surfacePoint: { x: 0, y: 1 } },
  ];
  for (const sample of samples) {
    await postAction("calibration.sample.add", {
      surface: "table",
      tagId: sample.tagId,
      camera: sample.camera,
      surfacePoint: sample.surfacePoint,
    });
  }
  return postAction("calibration.solve", { surface: "table", sourceSpace: "camera" });
}

function detection(tagId, x, y, angle = undefined) {
  const item = {
    tagId,
    center: { x, y },
    confidence: 0.94,
  };
  if (angle !== undefined) item.angle = angle;
  return item;
}

async function sendFrame(frameName, detections) {
  const result = await postAction("fiducial.detections.ingest", {
    surface: "table",
    sourceSpace: "camera",
    detections,
  });
  console.log(`${frameName}: updated=${result.updated.length} skipped=${result.skipped.length}`);
  return result;
}

async function main() {
  console.log(`Using room server ${baseUrl}`);
  const solved = await calibrateTable();
  console.log(`calibration: ${solved.calibration.status}, avg error ${solved.calibration.error.camera.avg}`);

  await sendFrame("frame 1", [
    detection(10, 190, 390, 0),
    detection(11, 430, 392, 0.5),
    detection(12, 610, 300),
    detection(15, 780, 280),
  ]);

  await new Promise((resolve) => setTimeout(resolve, 250));

  await sendFrame("frame 2", [
    detection(10, 190, 390, 0),
    detection(11, 510, 410, 0.85),
    detection(12, 630, 330),
    detection(13, 560, 520, 2.1),
    detection(15, 790, 300),
  ]);

  const lost = await postAction("event.manual", {
    event_type: "fiducial.lost",
    payload: { tagId: 11, id: "mirror-a", reason: "simulated occlusion" },
  });
  console.log(`lost event: ${lost.ok}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
