"use strict";

const assert = require("assert");
const {
  classifyEventType,
  filterEvents,
  normalizeEvent,
  parseEventLine,
  routeSalience,
  validateEvent,
} = require("../lib/events");

const event = normalizeEvent({
  id: "evt-test",
  event_type: "sensor.light.changed",
  source: "test",
  payload: { level: 42 },
});

assert.strictEqual(event.category, "sensor");
assert.strictEqual(event.salience, "broadcast");
assert.strictEqual(validateEvent(event).ok, true);

assert.strictEqual(classifyEventType("projection.frame.simulated"), "projection");
assert.strictEqual(classifyEventType("slide.control.requested"), "projection");
assert.strictEqual(classifyEventType("detection.frame.simulated"), "detection");
assert.strictEqual(classifyEventType("camera.state.updated"), "sensor");
assert.strictEqual(classifyEventType("room.phase.changed"), "room");
assert.strictEqual(classifyEventType("project.heartbeat"), "project");
assert.strictEqual(classifyEventType("text.detected"), "event");
assert.strictEqual(classifyEventType("safety.boundary.warning"), "safety");
assert.strictEqual(classifyEventType("character.utterance.completed"), "character");

assert.strictEqual(routeSalience("debug.mode.changed"), "ambient");
assert.strictEqual(routeSalience("character.utterance.completed"), "directed");
assert.strictEqual(routeSalience("fiducial.detected"), "ambient");
assert.strictEqual(routeSalience("debug.mode.changed", true), "broadcast");

assert.strictEqual(parseEventLine(JSON.stringify(event)).event_type, "sensor.light.changed");
assert.strictEqual(parseEventLine("not json"), null);
assert.strictEqual(parseEventLine(JSON.stringify({ event_type: "Bad Type", payload: {} })), null);

const invalid = validateEvent(normalizeEvent({ event_type: "bad", payload: [] }));
assert.strictEqual(invalid.ok, false);

const events = [
  normalizeEvent({ id: "evt-1", event_type: "sensor.light.changed", source: "sim", payload: {} }),
  normalizeEvent({ id: "evt-2", event_type: "projection.frame.simulated", source: "sim", payload: {} }),
  normalizeEvent({ id: "evt-3", event_type: "sensor.reading.changed", source: "other", payload: {} }),
];
assert.strictEqual(filterEvents(events, { category: "sensor" }).length, 2);
assert.strictEqual(filterEvents(events, { source: "sim" }).length, 2);
assert.strictEqual(filterEvents(events, { type: "projection.frame.simulated" }).length, 1);

console.log("event contract ok");
