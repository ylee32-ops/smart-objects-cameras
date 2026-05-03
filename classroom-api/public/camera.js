"use strict";

const sim = document.getElementById("cameraSim");
const markerLayer = document.getElementById("markerLayer");
const preview = document.getElementById("cameraPreview");
let stream = null;
let dragging = null;

Room.connect();
Room.initIdentity("camera");

document.getElementById("startCamera").addEventListener("click", startPreview);
document.getElementById("stopCamera").addEventListener("click", stopPreview);
document.getElementById("snapPuzzle").addEventListener("click", snapPuzzle);
document.getElementById("scatterTags").addEventListener("click", scatterTags);
document.getElementById("sampleCalibration").addEventListener("click", sampleCalibration);
document.getElementById("ingestDetection").addEventListener("click", ingestCameraDetection);
document.getElementById("clearCalibration").addEventListener("click", () => Room.action("calibration.clear", { surface: "board" }).catch(alertError));
document.getElementById("lostTag").addEventListener("click", () => {
  Room.action("event.manual", {
    event_type: "fiducial.lost",
    payload: { id: "mirror-a", tag_id: "MIR", last_seen_surface: "board" },
  }).catch(alertError);
});
document.getElementById("toggleDebug").addEventListener("click", () => Room.action("debug.toggle").catch(alertError));

Room.onState((state) => {
  renderMarkers(state);
  document.getElementById("cameraStatus").innerHTML = `
    <strong>Simulated detector</strong>
    <div>Tags: ${markersFromState(state).length}</div>
    <div>Recent: ${state.events[0]?.event_type || "none"}</div>
    <div>Target: ${state.light.targetHit ? "hit" : "miss"}</div>
    <div>Calibration: ${state.calibration.board?.status || "unknown"} (${state.calibration.board?.samples?.length || 0} samples)</div>
  `;
});

async function startPreview() {
  if (!navigator.mediaDevices?.getUserMedia) {
    alert("Camera preview needs browser camera support and usually HTTPS/localhost.");
    return;
  }
  stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
  preview.srcObject = stream;
  await preview.play();
}

function stopPreview() {
  if (stream) stream.getTracks().forEach((track) => track.stop());
  stream = null;
  preview.srcObject = null;
}

function renderMarkers(state) {
  markerLayer.innerHTML = "";
  markersFromState(state).forEach((token) => {
    const marker = document.createElement("div");
    marker.className = "camera-marker";
    marker.dataset.id = token.id;
    marker.style.left = `${token.x * 100}%`;
    marker.style.top = `${token.y * 100}%`;
    marker.style.background = token.color;
    marker.innerHTML = `<div>${token.tagId}<div class="small">${token.label}</div></div>`;
    marker.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      dragging = { id: token.id, pointerId: event.pointerId };
      marker.setPointerCapture(event.pointerId);
    });
    markerLayer.appendChild(marker);
  });
}

sim.addEventListener("pointermove", (event) => {
  if (!dragging) return;
  const pt = Room.normalizedPoint(event, sim);
  const marker = [...markerLayer.children].find((child) => child.dataset.id === dragging.id);
  if (marker) {
    marker.style.left = `${pt.x * 100}%`;
    marker.style.top = `${pt.y * 100}%`;
  }
});

sim.addEventListener("pointerup", (event) => {
  if (!dragging) return;
  const pt = Room.normalizedPoint(event, sim);
  Room.action("token.move", { id: dragging.id, x: pt.x, y: pt.y }).catch(alertError);
  dragging = null;
});

async function snapPuzzle() {
  await Room.action("token.move", { id: "emitter", x: 0.14, y: 0.5 });
  await Room.action("token.move", { id: "mirror-a", x: 0.42, y: 0.5 });
  await Room.action("token.move", { id: "filter-blue", x: 0.62, y: 0.35 });
  await Room.action("token.move", { id: "splitter", x: 0.58, y: 0.68 });
  await Room.action("token.move", { id: "blocker", x: 0.72, y: 0.52 });
  await Room.action("token.move", { id: "target", x: 0.86, y: 0.35 });
  await Room.action("token.move", { id: "explain-card", x: 0.72, y: 0.78 });
}

async function scatterTags() {
  const ids = ["emitter", "mirror-a", "filter-blue", "splitter", "blocker", "target", "explain-card"];
  for (const id of ids) {
    await Room.action("token.move", { id, x: 0.12 + Math.random() * 0.76, y: 0.18 + Math.random() * 0.68 });
  }
}

async function sampleCalibration() {
  const corners = [
    { tagId: 4, camera: { x: 140, y: 100 }, surfacePoint: { x: 0.12, y: 0.12 } },
    { tagId: 5, camera: { x: 900, y: 120 }, surfacePoint: { x: 0.88, y: 0.12 } },
    { tagId: 6, camera: { x: 880, y: 700 }, surfacePoint: { x: 0.88, y: 0.88 } },
    { tagId: 7, camera: { x: 150, y: 680 }, surfacePoint: { x: 0.12, y: 0.88 } },
  ];
  await Room.action("calibration.clear", { surface: "board" });
  for (const corner of corners) {
    await Room.action("calibration.sample.add", {
      surface: "board",
      tagId: corner.tagId,
      camera: corner.camera,
      surfacePoint: corner.surfacePoint,
    });
  }
  await Room.action("calibration.solve", {
    surface: "board",
    sourceSpace: "camera",
  });
}

async function ingestCameraDetection() {
  await Room.action("fiducial.detections.ingest", {
    surface: "board",
    sourceSpace: "camera",
    detections: [
      {
        tagId: 11,
        center: { x: 500, y: 400 },
        confidence: 0.92,
        angle: 0.4,
      },
    ],
  });
}

function markersFromState(state) {
  return state?.markers?.items || state?.fiducials?.markers || state?.table?.tokens || [];
}

function alertError(error) {
  alert(error.message || String(error));
}
