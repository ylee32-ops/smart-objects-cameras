"use strict";

const video = document.getElementById("rgbVideo");
const canvas = document.getElementById("rgbCanvas");
const view = document.getElementById("rgbView");
const crosshair = document.getElementById("rgbCrosshair");
const markerSelect = document.getElementById("markerSelect");
const toleranceInput = document.getElementById("tolerance");
const minPixelsInput = document.getElementById("minPixels");
const sampleSwatch = document.getElementById("sampleSwatch");
const statusEl = document.getElementById("rgbStatus");

let stream = null;
let running = false;
let sampled = { r: 56, g: 189, b: 248 };
let lastSent = 0;
let frameCount = 0;

Room.connect();
Room.initIdentity("rgb-demo");

document.getElementById("startRgb").addEventListener("click", startCamera);
document.getElementById("stopRgb").addEventListener("click", stopCamera);
document.getElementById("useBlue").addEventListener("click", () => setSample({ r: 56, g: 189, b: 248 }));
document.getElementById("useGreen").addEventListener("click", () => setSample({ r: 74, g: 222, b: 128 }));

view.addEventListener("click", (event) => {
  if (!video.videoWidth) return;
  const rect = view.getBoundingClientRect();
  const x = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
  const y = Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height));
  const frame = getFrame();
  if (!frame) return;
  const px = Math.floor(x * frame.width);
  const py = Math.floor(y * frame.height);
  const i = (py * frame.width + px) * 4;
  setSample({ r: frame.data[i], g: frame.data[i + 1], b: frame.data[i + 2] });
});

async function startCamera() {
  if (!navigator.mediaDevices?.getUserMedia) {
    statusEl.textContent = "Camera access is unavailable in this browser.";
    return;
  }
  stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: "environment" },
    audio: false,
  });
  video.srcObject = stream;
  await video.play();
  running = true;
  setSample(sampled);
  tick();
}

function stopCamera() {
  running = false;
  if (stream) stream.getTracks().forEach((track) => track.stop());
  stream = null;
  video.srcObject = null;
}

function setSample(color) {
  sampled = color;
  sampleSwatch.style.background = `rgb(${color.r}, ${color.g}, ${color.b})`;
}

function getFrame() {
  if (!video.videoWidth || !video.videoHeight) return null;
  const width = 320;
  const height = Math.max(1, Math.round(width * (video.videoHeight / video.videoWidth)));
  const offscreen = document.createElement("canvas");
  offscreen.width = width;
  offscreen.height = height;
  const ctx = offscreen.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(video, 0, 0, width, height);
  return ctx.getImageData(0, 0, width, height);
}

function tick() {
  if (!running) return;
  frameCount += 1;
  const frame = getFrame();
  if (frame) {
    const blob = findBlob(frame);
    drawOverlay(blob);
    if (blob && blob.count >= Number(minPixelsInput.value)) {
      sendMarkerPosition(blob);
    }
    renderStatus(blob);
  }
  requestAnimationFrame(tick);
}

function findBlob(frame) {
  const tolerance = Number(toleranceInput.value);
  const toleranceSq = tolerance * tolerance;
  let count = 0;
  let sumX = 0;
  let sumY = 0;
  let minX = frame.width;
  let minY = frame.height;
  let maxX = 0;
  let maxY = 0;

  for (let y = 0; y < frame.height; y += 2) {
    for (let x = 0; x < frame.width; x += 2) {
      const i = (y * frame.width + x) * 4;
      const dr = frame.data[i] - sampled.r;
      const dg = frame.data[i + 1] - sampled.g;
      const db = frame.data[i + 2] - sampled.b;
      const dist = dr * dr + dg * dg + db * db;
      if (dist <= toleranceSq) {
        count += 1;
        sumX += x;
        sumY += y;
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    }
  }

  if (!count) return null;
  return {
    count,
    x: sumX / count / frame.width,
    y: sumY / count / frame.height,
    bounds: {
      x: minX / frame.width,
      y: minY / frame.height,
      w: (maxX - minX) / frame.width,
      h: (maxY - minY) / frame.height,
    },
  };
}

function drawOverlay(blob) {
  const rect = view.getBoundingClientRect();
  canvas.width = rect.width;
  canvas.height = rect.height;
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (!blob) {
    crosshair.hidden = true;
    return;
  }

  const x = blob.x * canvas.width;
  const y = blob.y * canvas.height;
  crosshair.hidden = false;
  crosshair.style.left = `${blob.x * 100}%`;
  crosshair.style.top = `${blob.y * 100}%`;

  ctx.strokeStyle = "rgba(238, 242, 246, .82)";
  ctx.lineWidth = 1.5;
  ctx.strokeRect(
    blob.bounds.x * canvas.width,
    blob.bounds.y * canvas.height,
    blob.bounds.w * canvas.width,
    blob.bounds.h * canvas.height,
  );
  ctx.beginPath();
  ctx.arc(x, y, 8, 0, Math.PI * 2);
  ctx.stroke();
}

async function sendMarkerPosition(blob) {
  const now = Date.now();
  if (now - lastSent < 140) return;
  lastSent = now;
  try {
    await Room.action("token.move", {
      id: markerSelect.value,
      x: blob.x,
      y: blob.y,
    });
  } catch (error) {
    statusEl.textContent = error.message;
  }
}

function renderStatus(blob) {
  const marker = markerSelect.options[markerSelect.selectedIndex]?.textContent || markerSelect.value;
  if (!blob) {
    statusEl.innerHTML = `Tracking ${marker}. No blob found.`;
    return;
  }
  statusEl.innerHTML = `
    <div><strong>Tracking ${marker}</strong></div>
    <div>pixels: ${blob.count}</div>
    <div>x: ${blob.x.toFixed(3)} y: ${blob.y.toFixed(3)}</div>
    <div>frame: ${frameCount}</div>
  `;
}
