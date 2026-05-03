"use strict";

const cameraIdEl = document.getElementById("cameraId");
const commandEl = document.getElementById("command");
const modeEl = document.getElementById("mode");
const reasonEl = document.getElementById("reason");
const sendCommandBtn = document.getElementById("sendCommandBtn");
const refreshBtn = document.getElementById("refreshBtn");
const resultLine = document.getElementById("resultLine");
const cameraGrid = document.getElementById("cameraGrid");

Room.connect();
loadCameras().catch(showError);
Room.onEvent((event) => {
  if (String(event.event_type || "").startsWith("camera.")) loadCameras().catch(showError);
});

sendCommandBtn.addEventListener("click", sendCommand);
refreshBtn.addEventListener("click", () => loadCameras().catch(showError));

async function loadCameras() {
  const res = await fetch("/api/cameras", { cache: "no-store" });
  if (!res.ok) throw new Error(`Could not load cameras: HTTP ${res.status}`);
  render(await res.json());
}

async function sendCommand() {
  try {
    const cameraId = cameraIdEl.value;
    const res = await fetch(`/api/cameras/${encodeURIComponent(cameraId)}/command`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        command: commandEl.value,
        mode: modeEl.value,
        reason: reasonEl.value,
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    resultLine.textContent = `Sent ${data.command.eventType} to ${data.command.cameraId}`;
    await loadCameras();
  } catch (error) {
    showError(error);
  }
}

function render(snapshot) {
  cameraGrid.innerHTML = (snapshot.cameras || []).map((camera) => {
    const state = camera.state || {};
    const commands = camera.commands || [];
    return `
      <article class="camera-card">
        <div class="row">
          <span class="pill">${escapeHtml(camera.cameraId)}</span>
          <span class="pill">${camera.online ? "seen" : "waiting"}</span>
        </div>
        <h2>${escapeHtml(camera.cameraId)}</h2>
        <div class="small">last seen: ${escapeHtml(camera.lastSeen ? new Date(camera.lastSeen).toLocaleTimeString() : "none")}</div>
        <div class="small">people: ${escapeHtml(state.person_count ?? "unknown")}</div>
        <div class="small">probe: ${escapeHtml(state.predicted_class || "unknown")}</div>
        <div class="small">latest command: ${escapeHtml(commands[0]?.eventType || "none")}</div>
      </article>
    `;
  }).join("");
}

function showError(error) {
  resultLine.textContent = error.message || String(error);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
