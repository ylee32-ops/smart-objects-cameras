"use strict";

const video = document.getElementById("tagDebugVideo");
const overlay = document.getElementById("tagDebugOverlay");
const ctx = overlay.getContext("2d");
const startButton = document.getElementById("startTagDebug");
const stopButton = document.getElementById("stopTagDebug");
const deviceSelect = document.getElementById("tagDebugDevice");
const statusEl = document.getElementById("tagDebugStatus");
const listEl = document.getElementById("tagDebugList");
const connectionEl = document.getElementById("tagDebugConnection");
const tagSizeInput = document.getElementById("tagDebugSize");
const fovInput = document.getElementById("tagDebugFov");
const intervalInput = document.getElementById("tagDebugInterval");
const calibrateButton = document.getElementById("calibrateVisibleBoard");
const stickySampleButton = document.getElementById("sampleStickyColor");
const stickySampleSwatch = document.getElementById("stickySampleSwatch");
const stickySampleText = document.getElementById("stickySampleText");

let mediaStream = null;
let scanning = false;
let busy = false;
let lastScanAt = 0;
let lastResult = null;
let lastSample = null;

const STICKY_COLORS = [
  { label: "yellow sticky", hex: "#facc15" },
  { label: "pale yellow sticky", hex: "#fde68a" },
  { label: "blue sticky", hex: "#bfdbfe" },
  { label: "pink sticky", hex: "#f9a8d4" },
  { label: "green sticky", hex: "#a7f3d0" },
  { label: "orange sticky", hex: "#ffb360" },
];

startButton.addEventListener("click", () => startCamera().catch(showError));
stopButton.addEventListener("click", stopCamera);
calibrateButton.addEventListener("click", () => calibrateVisibleBoard().catch(showError));
stickySampleButton.addEventListener("click", () => sampleStickyColor().catch(showError));
overlay.addEventListener("pointerdown", (event) => {
  if (!mediaStream) return;
  sampleStickyColor(event).catch(showError);
});
deviceSelect.addEventListener("change", () => {
  if (mediaStream) startCamera().catch(showError);
});
window.addEventListener("resize", drawOverlay);

loadDevices().catch(() => {
  deviceSelect.innerHTML = "<option value=\"\">Default camera</option>";
});

async function loadDevices(selectedId = deviceSelect.value) {
  if (!navigator.mediaDevices?.enumerateDevices) return;
  const devices = await navigator.mediaDevices.enumerateDevices();
  const cameras = devices.filter((device) => device.kind === "videoinput");
  deviceSelect.innerHTML = [
    `<option value=""${selectedId ? "" : " selected"}>Default camera</option>`,
    ...cameras.map((device, index) =>
      `<option value="${escapeHtml(device.deviceId)}"${device.deviceId === selectedId ? " selected" : ""}>${escapeHtml(device.label || `Camera ${index + 1}`)}</option>`
    ),
  ].join("");
}

async function startCamera() {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error("Browser camera access is unavailable. Use localhost or HTTPS.");
  }
  stopCamera();
  const deviceId = deviceSelect.value;
  mediaStream = await navigator.mediaDevices.getUserMedia({
    video: deviceId
      ? { deviceId: { exact: deviceId }, width: { ideal: 1280 }, height: { ideal: 720 } }
      : { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } },
    audio: false,
  });
  video.srcObject = mediaStream;
  await video.play();
  const activeDeviceId = mediaStream.getVideoTracks()[0]?.getSettings?.().deviceId || deviceId;
  await loadDevices(activeDeviceId).catch(() => {});
  scanning = true;
  connectionEl.textContent = "camera on";
  statusEl.textContent = "Scanning for AprilTags...";
  requestAnimationFrame(scanLoop);
}

function stopCamera() {
  scanning = false;
  busy = false;
  if (mediaStream) {
    mediaStream.getTracks().forEach((track) => track.stop());
    mediaStream = null;
  }
  video.srcObject = null;
  lastSample = null;
  clearOverlay();
  connectionEl.textContent = "idle";
}

async function scanLoop(nowMs = performance.now()) {
  if (!scanning) return;
  if (video.readyState >= 2 && !busy && nowMs - lastScanAt >= scanInterval()) {
    lastScanAt = nowMs;
    scanFrame().catch(showError);
  }
  drawOverlay();
  requestAnimationFrame(scanLoop);
}

async function scanFrame() {
  const frame = captureFrame();
  if (!frame) return;
  busy = true;
  connectionEl.textContent = "detecting";
  try {
    const response = await fetch("/api/tag-debugger/detect", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ imageDataUrl: frame.imageDataUrl }),
    });
    const result = await response.json();
    if (!response.ok || !result.ok) {
      throw new Error(result.error || `HTTP ${response.status}`);
    }
    lastResult = result;
    renderResult(result);
  } finally {
    busy = false;
    connectionEl.textContent = "camera on";
  }
}

function captureFrame() {
  if (!video.videoWidth || !video.videoHeight) return null;
  const maxWidth = 960;
  const scale = Math.min(1, maxWidth / video.videoWidth);
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
  canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
  const captureCtx = canvas.getContext("2d");
  captureCtx.drawImage(video, 0, 0, canvas.width, canvas.height);
  return {
    width: canvas.width,
    height: canvas.height,
    imageDataUrl: canvas.toDataURL("image/jpeg", 0.72),
  };
}

function renderResult(result) {
  const detections = result.detections || [];
  if (!detections.length) {
    statusEl.textContent = "No tags detected. Move closer, reduce glare, and keep the white margin visible.";
    listEl.innerHTML = "";
    drawOverlay();
    return;
  }

  statusEl.textContent = `${detections.length} tag${detections.length === 1 ? "" : "s"} detected.`;
  listEl.innerHTML = detections.map((detection) => {
    const tag = detection.tag || {};
    const distance = estimateDistance(detection, result.width);
    return `
      <article class="tag-debug-card">
        <strong>#${escapeHtml(tag.tagId ?? detection.tagId)} ${escapeHtml(tag.label || "Unknown tag")}</strong>
        <div class="meta">
          role=${escapeHtml(tag.role || "tag")} surface=${escapeHtml(tag.surface || "board")}<br>
          confidence=${Math.round(Number(detection.confidence || 0) * 100)}%
          margin=${Number(detection.decisionMargin || 0).toFixed(1)}
          width=${Math.round(detection.size?.pixelWidth || 0)}px
          frame=${Number(detection.size?.frameWidthPercent || 0).toFixed(1)}%<br>
          ${distance ? `rough distance=${distance}` : "rough distance=enter tag size + HFOV"}
        </div>
      </article>
    `;
  }).join("");
  drawOverlay();
}

function drawOverlay() {
  const rect = overlay.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  overlay.width = Math.max(1, Math.round(rect.width * dpr));
  overlay.height = Math.max(1, Math.round(rect.height * dpr));
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  clearOverlay();

  const result = lastResult;
  if (!video.videoWidth || !video.videoHeight) return;

  if (result?.detections?.length) {
    const transform = videoTransform(rect.width, rect.height, result.width, result.height);

    result.detections.forEach((detection) => {
      const corners = (detection.corners || []).map((point) => ({
        x: transform.x + point.x * transform.scale,
        y: transform.y + point.y * transform.scale,
      }));
      if (corners.length < 4) return;
      ctx.lineWidth = 3;
      ctx.strokeStyle = "#86efac";
      ctx.fillStyle = "rgba(134, 239, 172, 0.14)";
      ctx.beginPath();
      corners.forEach((point, index) => {
        if (index === 0) ctx.moveTo(point.x, point.y);
        else ctx.lineTo(point.x, point.y);
      });
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      const tag = detection.tag || {};
      const label = `#${tag.tagId ?? detection.tagId} ${tag.label || "tag"}`;
      ctx.font = "14px ui-monospace, SFMono-Regular, Consolas, monospace";
      const labelX = Math.min(Math.max(8, corners[0].x), rect.width - 220);
      const labelY = Math.max(24, corners[0].y - 10);
      const metrics = ctx.measureText(label);
      ctx.fillStyle = "rgba(2, 6, 23, 0.86)";
      ctx.fillRect(labelX - 6, labelY - 18, metrics.width + 12, 24);
      ctx.fillStyle = "#dcfce7";
      ctx.fillText(label, labelX, labelY);
    });
  }

  drawStickySampleMarker(rect.width, rect.height);
}

function clearOverlay() {
  const rect = overlay.getBoundingClientRect();
  ctx.clearRect(0, 0, rect.width, rect.height);
}

function videoTransform(viewWidth, viewHeight, frameWidth, frameHeight) {
  const scale = Math.min(viewWidth / frameWidth, viewHeight / frameHeight);
  return {
    scale,
    x: (viewWidth - frameWidth * scale) / 2,
    y: (viewHeight - frameHeight * scale) / 2,
  };
}

function estimateDistance(detection, frameWidth) {
  const tagMm = Number(tagSizeInput.value);
  const hfovDeg = Number(fovInput.value);
  const pixelWidth = Number(detection.size?.pixelWidth || 0);
  if (!Number.isFinite(tagMm) || !Number.isFinite(hfovDeg) || !pixelWidth || !frameWidth) return "";
  const hfovRad = (hfovDeg * Math.PI) / 180;
  const distanceMm = (tagMm * frameWidth) / (2 * pixelWidth * Math.tan(hfovRad / 2));
  if (!Number.isFinite(distanceMm)) return "";
  if (distanceMm >= 1000) return `${(distanceMm / 1000).toFixed(2)}m`;
  return `${Math.round(distanceMm)}mm`;
}

async function calibrateVisibleBoard() {
  const required = [4, 5, 6, 7];
  const detections = Array.isArray(lastResult?.detections) ? lastResult.detections : [];
  const byId = new Map(detections.map((detection) => [Number(detection.tagId), detection]));
  const missing = required.filter((tagId) => !byId.has(tagId));
  if (missing.length) {
    throw new Error(`Need corner tags ${missing.join(", ")} visible before calibration.`);
  }

  calibrateButton.disabled = true;
  statusEl.textContent = "Calibrating board from visible corner tags...";
  try {
    await Room.action("calibration.clear", { surface: "board" });
    const calibrationResult = await Room.action("fiducial.detections.ingest", {
      surface: "board",
      sourceSpace: "camera",
      autoCalibration: true,
      autoSolve: true,
      detections: required.map((tagId) => detectionPayload(byId.get(tagId))),
    });
    if (!calibrationResult.calibration?.cameraToSurfaceHomography) {
      throw new Error(calibrationResult.error || "Calibration did not produce a camera map.");
    }
    await Room.action("fiducial.detections.ingest", {
      surface: "board",
      sourceSpace: "camera",
      detections: detections.map(detectionPayload),
    }).catch(() => {});
    const avg = calibrationResult.calibration?.error?.camera?.avg;
    statusEl.textContent = Number.isFinite(Number(avg))
      ? `Board calibrated from C920 view: ${Number(avg).toFixed(2)} px rms.`
      : "Board calibrated from visible C920 tags.";
  } finally {
    calibrateButton.disabled = false;
  }
}

function detectionPayload(detection) {
  return {
    tagId: detection.tagId,
    center: detection.center,
    corners: detection.corners,
    angle: detection.angle,
    confidence: detection.confidence,
  };
}

async function sampleStickyColor(event = null) {
  if (!video.videoWidth || !video.videoHeight) {
    throw new Error("Start the camera before sampling a sticky note.");
  }
  const point = event ? overlayPointToVideo(event) : { x: video.videoWidth / 2, y: video.videoHeight / 2 };
  const sample = sampleVideoPatch(point.x, point.y);
  const match = closestStickyColor(sample);
  lastSample = {
    x: point.x,
    y: point.y,
    color: sample.hex,
    match,
    box: findStickyRegionBox(sample),
  };
  stickySampleSwatch.style.background = sample.hex;
  stickySampleText.textContent = `${sample.hex} rgb(${sample.r}, ${sample.g}, ${sample.b}) -> nearest ${match.label} (${match.hex})`;
  drawOverlay();
}

function overlayPointToVideo(event) {
  const rect = overlay.getBoundingClientRect();
  const transform = videoTransform(rect.width, rect.height, video.videoWidth, video.videoHeight);
  return {
    x: clamp((event.clientX - rect.left - transform.x) / transform.scale, 0, video.videoWidth - 1),
    y: clamp((event.clientY - rect.top - transform.y) / transform.scale, 0, video.videoHeight - 1),
  };
}

function sampleVideoPatch(x, y) {
  const size = 42;
  const sx = clamp(Math.round(x - size / 2), 0, Math.max(0, video.videoWidth - size));
  const sy = clamp(Math.round(y - size / 2), 0, Math.max(0, video.videoHeight - size));
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const sampleCtx = canvas.getContext("2d");
  sampleCtx.drawImage(video, sx, sy, size, size, 0, 0, size, size);
  const pixels = sampleCtx.getImageData(0, 0, size, size).data;
  let r = 0;
  let g = 0;
  let b = 0;
  const count = pixels.length / 4;
  for (let index = 0; index < pixels.length; index += 4) {
    r += pixels[index];
    g += pixels[index + 1];
    b += pixels[index + 2];
  }
  r = Math.round(r / count);
  g = Math.round(g / count);
  b = Math.round(b / count);
  return { r, g, b, hex: rgbToHex(r, g, b) };
}

function closestStickyColor(sample) {
  return STICKY_COLORS
    .map((color) => ({
      ...color,
      distance: colorDistance(sample, hexToRgb(color.hex)),
    }))
    .sort((a, b) => a.distance - b.distance)[0];
}

function drawStickySampleMarker(viewWidth, viewHeight) {
  if (!lastSample) return;
  const transform = videoTransform(viewWidth, viewHeight, video.videoWidth, video.videoHeight);
  const x = transform.x + lastSample.x * transform.scale;
  const y = transform.y + lastSample.y * transform.scale;
  if (lastSample.box) {
    ctx.lineWidth = 3;
    ctx.strokeStyle = "#facc15";
    ctx.strokeRect(
      transform.x + lastSample.box.x * transform.scale,
      transform.y + lastSample.box.y * transform.scale,
      lastSample.box.w * transform.scale,
      lastSample.box.h * transform.scale,
    );
  }
  ctx.lineWidth = 2;
  ctx.strokeStyle = "#f8fafc";
  ctx.fillStyle = lastSample.color;
  ctx.beginPath();
  ctx.arc(x, y, 13, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x - 20, y);
  ctx.lineTo(x + 20, y);
  ctx.moveTo(x, y - 20);
  ctx.lineTo(x, y + 20);
  ctx.stroke();
}

function findStickyRegionBox(sample) {
  const step = 6;
  const canvas = document.createElement("canvas");
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  const sampleCtx = canvas.getContext("2d");
  sampleCtx.drawImage(video, 0, 0, canvas.width, canvas.height);
  const pixels = sampleCtx.getImageData(0, 0, canvas.width, canvas.height).data;
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  let count = 0;
  for (let y = 0; y < canvas.height; y += step) {
    for (let x = 0; x < canvas.width; x += step) {
      const index = (y * canvas.width + x) * 4;
      const color = { r: pixels[index], g: pixels[index + 1], b: pixels[index + 2] };
      if (colorDistance(sample, color) > 64) continue;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
      count += 1;
    }
  }
  if (count < 10 || !Number.isFinite(minX)) return null;
  return {
    x: clamp(minX - step, 0, canvas.width),
    y: clamp(minY - step, 0, canvas.height),
    w: clamp(maxX - minX + step * 2, 0, canvas.width),
    h: clamp(maxY - minY + step * 2, 0, canvas.height),
  };
}

function colorDistance(a, b) {
  return Math.hypot(a.r - b.r, a.g - b.g, a.b - b.b);
}

function hexToRgb(hex) {
  const value = String(hex).replace("#", "");
  return {
    r: parseInt(value.slice(0, 2), 16),
    g: parseInt(value.slice(2, 4), 16),
    b: parseInt(value.slice(4, 6), 16),
  };
}

function rgbToHex(r, g, b) {
  return `#${[r, g, b].map((value) => clamp(Math.round(value), 0, 255).toString(16).padStart(2, "0")).join("")}`;
}

function clamp(value, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return min;
  return Math.max(min, Math.min(max, number));
}

function scanInterval() {
  const value = Number(intervalInput.value);
  return Number.isFinite(value) ? Math.max(200, value) : 300;
}

function showError(error) {
  statusEl.textContent = error.message || String(error);
  connectionEl.textContent = "error";
  console.error(error);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
