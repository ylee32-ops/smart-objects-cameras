"use strict";

const CORNERS = {
  board: [
    { tagId: 4, label: "top-left", surfacePoint: { x: 0.12, y: 0.12 } },
    { tagId: 5, label: "top-right", surfacePoint: { x: 0.88, y: 0.12 } },
    { tagId: 6, label: "bottom-right", surfacePoint: { x: 0.88, y: 0.88 } },
    { tagId: 7, label: "bottom-left", surfacePoint: { x: 0.12, y: 0.88 } },
  ],
};

const surfaceSelect = document.getElementById("surfaceSelect");
const sourceSelect = document.getElementById("sourceSelect");
const refreshBtn = document.getElementById("refreshBtn");
const calibrateBtn = document.getElementById("calibrateBtn");
const cornerGrid = document.getElementById("cornerGrid");
const visibleTags = document.getElementById("visibleTags");
const setupStatus = document.getElementById("setupStatus");

let detections = {};

Room.connect();

surfaceSelect.addEventListener("change", refresh);
sourceSelect.addEventListener("change", refresh);
refreshBtn.addEventListener("click", refresh);
calibrateBtn.addEventListener("click", calibrate);

setInterval(refresh, 1200);
refresh();

async function refresh() {
  const surface = surfaceSelect.value;
  const sourceSpace = sourceSelect.value;
  const res = await fetch(`/api/detections?surface=${surface}&sourceSpace=${sourceSpace}`);
  const data = await res.json();
  detections = data.rawDetections || {};
  render();
}

function render() {
  const surface = surfaceSelect.value;
  const corners = CORNERS[surface];
  const missing = corners.filter((corner) => !detections[String(corner.tagId)]);
  const ready = missing.length === 0;
  setupStatus.textContent = ready
    ? `${surface} ready: all four corner tags visible`
    : `${surface} missing: ${missing.map((corner) => corner.tagId).join(", ")}`;
  setupStatus.style.color = ready ? "var(--green)" : "var(--yellow)";
  calibrateBtn.disabled = !ready;

  cornerGrid.innerHTML = "";
  corners.forEach((corner) => {
    const visible = detections[String(corner.tagId)];
    const cell = document.createElement("div");
    cell.className = `tag-cell ${visible ? "visible" : "missing"}`;
    const center = visible?.detection?.center;
    cell.innerHTML = `
      <strong>${corner.tagId}</strong>
      <div>${corner.label}</div>
      <div class="small">${center ? `${Math.round(center.x)}, ${Math.round(center.y)}` : "not seen"}</div>
    `;
    cornerGrid.appendChild(cell);
  });

  visibleTags.innerHTML = "";
  Object.values(detections)
    .sort((a, b) => Number(a.tagId) - Number(b.tagId))
    .forEach((entry) => {
      const row = document.createElement("div");
      row.className = "object-row";
      row.innerHTML = `
        <div>
          <strong>tag ${entry.tagId}</strong>
          <div class="small">${entry.surface} / ${entry.sourceSpace}</div>
        </div>
        <div class="small">${new Date(entry.updatedAt).toLocaleTimeString()}</div>
      `;
      visibleTags.appendChild(row);
    });
}

async function calibrate() {
  const surface = surfaceSelect.value;
  const sourceSpace = sourceSelect.value;
  const corners = CORNERS[surface];
  await Room.action("calibration.clear", { surface });
  for (const corner of corners) {
    const hit = detections[String(corner.tagId)];
    if (!hit) continue;
    await Room.action("calibration.sample.add", {
      surface,
      tagId: corner.tagId,
      camera: sourceSpace === "camera" ? hit.detection.center : undefined,
      projector: sourceSpace === "projector" ? hit.detection.center : undefined,
      surfacePoint: corner.surfacePoint,
    });
  }
  const solved = await Room.action("calibration.solve", { surface, sourceSpace });
  setupStatus.textContent = solved.calibration?.error?.[sourceSpace]
    ? `calibrated: ${solved.calibration.error[sourceSpace].avg.toFixed(2)} px rms`
    : "calibrated";
  setupStatus.style.color = "var(--green)";
  await refresh();
}
