"use strict";

const ClassEventEffects = (() => {
  const listeners = new Set();
  let latest = null;

  function handle(event) {
    if (!isClassEvent(event)) return;
    latest = reduceEvent(event);
    listeners.forEach((listener) => listener(latest, event));
  }

  function isClassEvent(event) {
    const payload = event?.payload || {};
    return (
      payload.sourceProject === "smartobjects-labs-week2" ||
      Boolean(payload.projectId) ||
      event.event_type === "projection.frame.simulated" ||
      event.event_type === "detection.frame.simulated" ||
      event.source === "class-object-simulator" ||
      event.source === "project-packet"
    );
  }

  function reduceEvent(event) {
    const type = event.event_type;
    const payload = event.payload || {};
    const objectState = payload.state || {};
    const effect = {
      type,
      projectId: payload.projectId || payload.sourceProject || null,
      title: payload.title || payload.label || payload.projectId || type,
      label: payload.label || payload.activeObjectId || payload.objectId || type,
      message: type,
      tone: "neutral",
      focus: null,
      boardNote: null,
      projection: null,
      detection: null,
      boardCard: null,
      projectionCard: null,
      characterLine: "",
      statusLine: "",
    };

    if (type === "sensor.light.changed") {
      const level = Number(objectState.level ?? 50);
      effect.tone = level < 35 ? "dim" : level > 70 ? "bright" : "neutral";
      effect.message = `Ambient light ${level}`;
    }
    if (type === "zone.entered") {
      effect.tone = "focus";
      effect.focus = { surface: "board", x: 0.5, y: 0.38 };
      effect.message = `${objectState.object || "Object"} entered ${objectState.zone || "zone"}`;
    }
    if (type === "gesture.detected") {
      effect.tone = objectState.gesture === "fist" ? "cool" : objectState.gesture === "pointing" ? "alert" : "warm";
      effect.message = `Gesture ${objectState.gesture}`;
    }
    if (type === "text.detected") {
      effect.tone = "board";
      effect.boardNote = objectState.text || "Detected text";
      effect.message = `Read: ${effect.boardNote}`;
    }
    if (type === "board.scene.requested") {
      effect.tone = "projection";
      effect.statusLine = `${effect.title}: ${objectState.scene || payload.scene || "board"}`;
      effect.projectionCard = makeCard(effect.title, objectState.scene || payload.scene || "board", "#dbeafe");
      effect.message = effect.statusLine;
    }
    if (type === "board.focus.changed" || type === "beam.pointed") {
      effect.tone = "focus";
      effect.focus = targetPoint(objectState.target || payload.target || "board");
      effect.statusLine = `${effect.title}: ${objectState.target || payload.target || "board"}`;
      effect.message = effect.statusLine;
    }
    if (type === "projection.scene.changed" || type === "forest.mood.changed") {
      effect.tone = "projection";
      effect.statusLine = `${effect.title}: ${objectState.mood || payload.scene || "active"}`;
      effect.projectionCard = makeCard(effect.title, [objectState.mood, objectState.layer].filter(Boolean).join(" / ") || "ambient scene", "#dcfce7");
      effect.message = effect.statusLine;
    }
    if (type === "grammar.suggestion" || type === "board.text.feedback.created") {
      effect.tone = "board";
      effect.boardNote = payload.text || objectState.text || effect.title;
      effect.boardCard = makeCard(effect.title, effect.boardNote, "#d1fae5");
      effect.statusLine = `${effect.title}: feedback ready`;
      effect.message = effect.boardNote;
    }
    if (type === "handwriting.captured" || type === "note.saved" || type === "board.note.saved" || type === "board.annotation.created") {
      effect.tone = "board";
      effect.boardNote = payload.text || objectState.text || effect.title;
      effect.boardCard = makeCard(effect.title, effect.boardNote, "#fef3c7");
      effect.statusLine = `${effect.title}: note saved`;
      effect.message = effect.boardNote;
    }
    if (type === "class.comprehension.sampled" || type === "nodcheck.summary") {
      effect.tone = "focus";
      effect.statusLine = `${effect.title}: ${objectState.classState || "sampled"}${objectState.yesRate !== undefined ? ` / ${objectState.yesRate}% yes` : ""}`;
      effect.projectionCard = makeCard(effect.title, objectState.prompt || "class check", "#e0e7ff");
      effect.message = effect.statusLine;
    }
    if (type === "character.prompt.requested" || type === "tony.responds") {
      effect.tone = "character";
      effect.characterLine = payload.text || payload.prompt || `${effect.title} is offering help.`;
      effect.statusLine = effect.title;
      effect.message = effect.characterLine;
    }
    if (type === "class.emotion.changed" || type === "tony.alert" || type === "character.alerted") {
      effect.tone = "warn";
      effect.statusLine = `${effect.title}: ${objectState.emotion || payload.emotion || "alert"}`;
      effect.projectionCard = makeCard(effect.title, objectState.emotion || payload.emotion || "alert", "#fee2e2");
      effect.message = effect.statusLine;
    }
    if (type === "session.timer.started" || type === "session.timer.offered" || type === "timer.started" || type === "timer.offer") {
      effect.tone = "focus";
      effect.statusLine = `${effect.title}: ${objectState.duration || payload.duration || 0} min`;
      effect.projectionCard = makeCard(effect.title, `${objectState.duration || payload.duration || 0} min`, "#e0e7ff");
      effect.message = effect.statusLine;
    }
    if (type === "character.state.changed" || type === "gus.present") {
      effect.tone = "character";
      effect.characterLine = `${effect.title}: ${objectState.state || payload.characterState || "active"}`;
      effect.projectionCard = makeCard(effect.title, [objectState.state, objectState.energy].filter(Boolean).join(" / ") || "active", "#fde68a");
      effect.message = effect.characterLine;
    }
    if (type === "room.adapted" || type === "session.mode.recommended") {
      effect.tone = "projection";
      effect.statusLine = `${effect.title}: ${objectState.ambience || objectState.adaptation || payload.mode || "adapted"}`;
      effect.projectionCard = makeCard(effect.title, [objectState.ambience, objectState.adaptation].filter(Boolean).join(" / ") || "adapted", "#e9d5ff");
      effect.message = effect.statusLine;
    }
    if (type === "safety.boundary.warning") {
      effect.tone = objectState.severity === "stop" ? "alert" : "warn";
      effect.message = `${objectState.warning || "Safety"} ${objectState.severity || ""}`.trim();
    }
    if (type === "projection.frame.simulated") {
      effect.tone = "projection";
      effect.projection = payload;
      effect.message = `Projection frame: ${payload.projectedObjects?.length || 0} objects`;
    }
    if (type === "detection.frame.simulated") {
      effect.tone = "detection";
      effect.detection = payload;
      effect.message = `Detection frame: ${payload.detections?.length || 0} detections`;
    }

    return effect;
  }

  function makeCard(title, text, color) {
    return { title, text, color };
  }

  function targetPoint(target) {
    const map = {
      "board-center": { surface: "board", x: 0.5, y: 0.36 },
      "top-left": { surface: "board", x: 0.28, y: 0.18 },
      "right-column": { surface: "board", x: 0.76, y: 0.36 },
      "sticky-cluster": { surface: "board", x: 0.58, y: 0.24 },
      board: { surface: "board", x: 0.5, y: 0.36 },
    };
    return map[target] || map.board;
  }

  function onEffect(listener) {
    listeners.add(listener);
    if (latest) listener(latest, null);
    return () => listeners.delete(listener);
  }

  function current() {
    return latest;
  }

  if (window.Room?.onEvent) {
    window.Room.onEvent(handle);
  } else {
    window.addEventListener("DOMContentLoaded", () => window.Room?.onEvent?.(handle), { once: true });
  }

  return { current, onEffect };
})();
