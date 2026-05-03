"use strict";

const EVENT_TYPE_RE = /^[a-z][a-z0-9-]*(\.[a-z][a-z0-9-]*)+$/;

const CATEGORY_PREFIXES = [
  ["fiducial.", "detection"],
  ["detection.", "detection"],
  ["projection.", "projection"],
  ["slide.", "projection"],
  ["sensor.", "sensor"],
  ["presence.", "sensor"],
  ["attention.", "sensor"],
  ["gesture.", "sensor"],
  ["camera.", "sensor"],
  ["classifier.", "sensor"],
  ["zone.", "rule"],
  ["rule.", "rule"],
  ["safety.", "safety"],
  ["character.", "character"],
  ["user.", "character"],
  ["whiteboard.", "surface"],
  ["surface.", "surface"],
  ["clipboard.", "surface"],
  ["phone.", "surface"],
  ["light.", "room"],
  ["room.", "room"],
  ["debug.", "room"],
  ["mode.", "room"],
  ["participant.", "room"],
  ["project.", "project"],
];

function normalizeEvent(input, fallback = {}) {
  const raw = input && typeof input === "object" ? input : {};
  const eventType = String(raw.event_type || raw.eventType || fallback.event_type || "event.unknown");
  const source = String(raw.source || fallback.source || "server").slice(0, 120);
  const payload = raw.payload && typeof raw.payload === "object" ? raw.payload : {};
  const createdAt = normalizeTimestamp(raw.created_at || raw.createdAt || fallback.created_at);
  const category = classifyEventType(eventType);

  return {
    id: String(raw.id || fallback.id || ""),
    event_type: eventType,
    category,
    source,
    target: raw.target ?? fallback.target ?? null,
    salience: raw.salience || fallback.salience || routeSalience(eventType),
    created_at: createdAt,
    payload,
  };
}

function validateEvent(event) {
  const errors = [];
  if (!event || typeof event !== "object") errors.push("event must be an object");
  if (!event?.id || typeof event.id !== "string") errors.push("id must be a string");
  if (!event?.event_type || !EVENT_TYPE_RE.test(event.event_type)) errors.push("event_type must be dotted lower-case text");
  if (!event?.source || typeof event.source !== "string") errors.push("source must be a string");
  if (!event?.created_at || Number.isNaN(Date.parse(event.created_at))) errors.push("created_at must be an ISO timestamp");
  if (!event?.payload || typeof event.payload !== "object" || Array.isArray(event.payload)) errors.push("payload must be an object");
  return { ok: errors.length === 0, errors };
}

function classifyEventType(eventType) {
  const type = String(eventType || "");
  const hit = CATEGORY_PREFIXES.find(([prefix]) => type.startsWith(prefix));
  return hit ? hit[1] : "event";
}

function routeSalience(eventType, debug = false) {
  if (debug) return "broadcast";
  if (String(eventType).startsWith("debug.")) return "ambient";
  if (String(eventType).startsWith("character.")) return "directed";
  if (String(eventType).startsWith("surface.error")) return "broadcast";
  if (eventType === "fiducial.detected") return "ambient";
  return "broadcast";
}

function parseEventLine(line) {
  try {
    const parsed = JSON.parse(line);
    const event = normalizeEvent(parsed);
    const validation = validateEvent(event);
    return validation.ok ? event : null;
  } catch {
    return null;
  }
}

function filterEvents(events, filters = {}) {
  return events.filter((event) => {
    if (filters.type && event.event_type !== filters.type) return false;
    if (filters.category && event.category !== filters.category) return false;
    if (filters.source && event.source !== filters.source) return false;
    return true;
  });
}

function normalizeTimestamp(value) {
  if (!value) return new Date().toISOString();
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
}

module.exports = {
  classifyEventType,
  filterEvents,
  normalizeEvent,
  parseEventLine,
  routeSalience,
  validateEvent,
};
