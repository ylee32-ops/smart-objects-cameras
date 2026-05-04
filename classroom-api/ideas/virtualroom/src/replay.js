import { getReplay } from "./server-client.js";

export class ReplayEngine {
  constructor({ markers, onStatus, onChange }) {
    this.markers = markers;
    this.onStatus = onStatus || (() => {});
    this.onChange = onChange || (() => {});
    this.events = [];
    this.index = 0;
    this.playing = false;
    this.timer = null;
    this.startedAt = 0;
    this.baseTime = 0;
    this.baseState = [];
    this.captureBaseState();
  }

  async loadLive() {
    const result = await getReplay();
    if (!result.ok) {
      this.onStatus({ status: "failed", message: result.error });
      return result;
    }
    this.loadEvents(result.data.events || [], "live");
    return { ok: true, count: this.events.length };
  }

  loadJsonl(text, source = "jsonl") {
    const events = parseJsonl(text);
    this.loadEvents(events, source);
    return { ok: true, count: this.events.length };
  }

  loadEvents(events, source = "events") {
    this.captureBaseState();
    this.events = normalizeEvents(events);
    this.index = 0;
    this.resetToBaseState();
    this.onStatus({ status: "loaded", source, count: this.events.length, duration: this.duration(), progress: 0 });
  }

  play() {
    if (!this.events.length) return;
    if (this.index >= this.events.length) {
      this.index = 0;
      this.resetToBaseState();
    }
    this.playing = true;
    this.startedAt = performance.now();
    this.baseTime = this.events[this.index]?.t || 0;
    this.tick();
  }

  pause() {
    this.playing = false;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.onStatus({ status: "paused", index: this.index, count: this.events.length });
  }

  seek(progress) {
    if (!this.events.length) return;
    const target = this.events[0].t + this.duration() * progress;
    this.index = this.events.findIndex((event) => event.t >= target);
    if (this.index < 0) this.index = this.events.length - 1;
    this.resetToBaseState();
    this.applyUpTo(this.index);
    this.onStatus({ status: "seek", index: this.index, count: this.events.length, progress });
  }

  duration() {
    if (this.events.length < 2) return 0;
    return this.events[this.events.length - 1].t - this.events[0].t;
  }

  tick() {
    if (!this.playing) return;
    const now = performance.now();
    const elapsed = now - this.startedAt;
    while (this.index < this.events.length && this.events[this.index].t - this.baseTime <= elapsed) {
      this.applyEvent(this.events[this.index]);
      this.index += 1;
    }
    this.onStatus({ status: "playing", index: this.index, count: this.events.length, progress: this.index / Math.max(1, this.events.length - 1) });
    if (this.index >= this.events.length) {
      this.playing = false;
      if (this.timer) clearTimeout(this.timer);
      this.timer = null;
      this.onStatus({ status: "complete", index: this.index, count: this.events.length, progress: 1, restoreStream: true });
      return;
    }
    this.timer = setTimeout(() => this.tick(), 35);
  }

  applyUpTo(index) {
    this.resetToBaseState();
    for (let i = 0; i <= index; i += 1) this.applyEvent(this.events[i]);
    this.onChange();
  }

  applyEvent(event) {
    if (!event) return;
    if (event.event_type === "fiducial.detected") {
      const tagId = event.payload?.tag_id ?? event.payload?.tagId;
      const marker = this.markers.markerByTagId(tagId);
      if (marker && Number.isFinite(event.payload.x) && Number.isFinite(event.payload.y)) {
        this.markers.applySurfacePoint(marker, {
          x: Number(event.payload.x),
          y: Number(event.payload.y),
        });
      }
    }
    if (event.event_type === "fiducial.batch.ingested") {
      // Batch events are summaries only; individual fiducial.detected events carry positions.
    }
    this.onChange();
  }

  captureBaseState() {
    this.baseState = this.markers.list().map((marker) => ({
      tagId: marker.userData.tagId,
      x: marker.position.x,
      z: marker.position.z,
      rotY: marker.rotation.y,
    }));
  }

  resetToBaseState() {
    const byTag = new Map(this.markers.list().map((marker) => [String(marker.userData.tagId), marker]));
    this.baseState.forEach((item) => {
      const marker = byTag.get(String(item.tagId));
      if (!marker) return;
      marker.position.x = item.x;
      marker.position.z = item.z;
      marker.rotation.y = item.rotY;
    });
    this.onChange();
  }
}

function normalizeEvents(events) {
  return events
    .map((event) => ({ ...event, t: Date.parse(event.created_at || event.timestamp || 0) }))
    .filter((event) => Number.isFinite(event.t))
    .sort((a, b) => a.t - b.t);
}

function parseJsonl(text) {
  if (!text.trim()) return [];
  const trimmed = text.trim();
  if (trimmed.startsWith("[")) return JSON.parse(trimmed);
  return trimmed
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}
