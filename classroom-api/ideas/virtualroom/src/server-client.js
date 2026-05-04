import { SOURCE } from "./conventions.js";

async function getJson(path) {
  try {
    const response = await fetch(path);
    if (!response.ok) return { ok: false, status: response.status, error: response.statusText };
    return { ok: true, data: await response.json() };
  } catch (error) {
    return { ok: false, status: 0, error: error.message };
  }
}

export async function getConfig() {
  return getJson("/api/config");
}

export async function getTagMap() {
  return getJson("/api/tag-map");
}

export async function getCalibration() {
  return getJson("/api/calibration");
}

export async function getState() {
  return getJson("/api/state");
}

export async function getReplay() {
  return getJson("/api/replay?limit=500");
}

export function connectEvents({ onState, onEvent } = {}) {
  const source = new EventSource("/api/events");
  if (onState) {
    source.addEventListener("state", (event) => {
      try {
        onState(JSON.parse(event.data));
      } catch (error) {
        console.warn("virtual-room state parse failed", error);
      }
    });
  }
  if (onEvent) {
    source.addEventListener("room-event", (event) => {
      try {
        onEvent(JSON.parse(event.data));
      } catch (error) {
        console.warn("virtual-room event parse failed", error);
      }
    });
  }
  return () => source.close();
}

export async function postAction(actionType, payload) {
  try {
    const response = await fetch("/api/action", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ type: actionType, source: SOURCE, payload }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) return { ok: false, status: response.status, error: data.error || response.statusText };
    return { ok: true, status: response.status, data };
  } catch (error) {
    return { ok: false, status: 0, error: error.message };
  }
}

export async function ingestDetections({ surface, sourceSpace, detections }) {
  return postAction("fiducial.detections.ingest", { surface, sourceSpace, detections });
}
