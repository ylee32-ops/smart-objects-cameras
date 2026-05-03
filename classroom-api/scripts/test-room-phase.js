"use strict";

const assert = require("assert");
const http = require("http");

const baseUrl = process.env.SMART_ROOM_URL || "http://127.0.0.1:4177";

function requestJson(method, pathname, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : "";
    const url = new URL(pathname, baseUrl);
    const req = http.request(
      url,
      {
        method,
        headers: data
          ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(data) }
          : {},
      },
      (res) => {
        let text = "";
        res.on("data", (chunk) => {
          text += chunk;
        });
        res.on("end", () => {
          const parsed = text ? JSON.parse(text) : {};
          if (res.statusCode >= 400) reject(new Error(parsed.error || `HTTP ${res.statusCode}`));
          else resolve(parsed);
        });
      },
    );
    req.on("error", reject);
    if (data) req.write(data);
    req.end();
  });
}

async function postAction(type, payload) {
  return requestJson("POST", "/api/action", { type, source: "test-room-phase", payload });
}

async function main() {
  await postAction("room.reset", {});
  const before = await requestJson("GET", "/api/state");
  assert(before.room, "room state should exist");
  const originalPhase = String(before.room.phase || "activity");
  const nextPhase = originalPhase === "demo" ? "activity" : "demo";

  await postAction("phase.set", { phase: nextPhase });

  const afterSet = await requestJson("GET", "/api/state");
  assert(afterSet.room.phase === nextPhase, `expected phase ${nextPhase}, got ${afterSet.room.phase}`);

  const recent = await requestJson("GET", "/api/events/recent?limit=10&type=room.phase.changed");
  const matching = (recent.events || []).find((event) => event.payload?.phase === nextPhase);
  assert(matching, `expected recent room.phase.changed event for ${nextPhase}`);

  await postAction("phase.set", { phase: originalPhase });
  const afterReset = await requestJson("GET", "/api/state");
  assert(afterReset.room.phase === originalPhase, `expected phase ${originalPhase}, got ${afterReset.room.phase}`);

  await postAction("focus.clear", {});
  await postAction("focus.set", { id: "focus-a", surface: "board", x: 0.2, y: 0.3, label: "Focus A" });
  await postAction("focus.set", { id: "focus-b", surface: "board", x: 0.7, y: 0.4, label: "Focus B" });
  const afterFocus = await requestJson("GET", "/api/state");
  assert(Array.isArray(afterFocus.room.focuses), "room should expose focus list");
  assert(afterFocus.room.focuses.length === 2, `expected 2 focus nodes, got ${afterFocus.room.focuses.length}`);
  assert(afterFocus.room.focus?.id === "focus-b", "legacy room.focus should point at latest focus");

  await postAction("focus.clear", { id: "focus-a" });
  const afterOneClear = await requestJson("GET", "/api/state");
  assert(afterOneClear.room.focuses.length === 1, "focus.clear by id should remove one focus node");

  await postAction("focus.clear", {});
  const afterFocusClear = await requestJson("GET", "/api/state");
  assert(afterFocusClear.room.focuses.length === 0, "focus.clear should remove all focus nodes");
  assert(afterFocusClear.room.focus === null, "focus.clear should clear legacy room.focus");

  await postAction("fiducial.detections.ingest", {
    surface: "board",
    sourceSpace: "surface",
    detections: [
      { tagId: 23, role: "focus", label: "Focus Beam", center: { x: 0.32, y: 0.28 }, confidence: 1 },
      { tagId: 4, role: "calibration", label: "Board Top Left", center: { x: 0.12, y: 0.12 }, confidence: 1 },
    ],
  });
  const beforeTagClear = await requestJson("GET", "/api/state");
  assert(
    beforeTagClear.fiducials.markers.some((marker) => String(marker.numericTagId ?? marker.tagId) === "23"),
    "test board focus tag should be present before clear",
  );
  const clearTags = await postAction("board.tags.clear", { keepCalibration: true });
  assert(clearTags.ok && clearTags.removed >= 1, "board.tags.clear should remove board semantic tags");
  const afterTagClear = await requestJson("GET", "/api/state");
  assert(
    !afterTagClear.fiducials.markers.some((marker) => String(marker.numericTagId ?? marker.tagId) === "23"),
    "board.tags.clear should remove the focus tag",
  );

  await postAction("character.presence.set", {
    present: true,
    characterId: "figurate",
    label: "Figurate",
    surface: "board",
    x: 0.42,
    y: 0.36,
    tagId: 40,
  });
  const askResult = await postAction("character.ask", { text: "Figurate room-aware response for the board." });
  const afterFigurate = await requestJson("GET", "/api/state");
  assert(afterFigurate.character.present === true, "Figurate presence should mark the character present");
  assert(afterFigurate.character.mode === "figurate", "Figurate presence should set character mode");
  assert(askResult.meta?.provider, "Figurate ask should report the adapter provider");
  assert(afterFigurate.character.lastUtterance.length > 0, "Figurate ask should produce a character response");
  await postAction("character.presence.set", { present: false });

  const vision = await postAction("phone.vision.capture", {
    prompt: "What does the phone see?",
    target: { id: "board", kind: "surface", label: "Board", surface: "board" },
  });
  assert(vision.ok && vision.capture?.id, "phone.vision.capture should return a capture");
  assert(vision.meta?.provider, "phone.vision.capture should report the adapter provider");
  const afterVision = await requestJson("GET", "/api/state");
  assert(afterVision.phone.lastCaptureId === vision.capture.id, "phone capture should update phone.lastCaptureId");
  assert(afterVision.character.vision.lastCapture.id === vision.capture.id, "phone capture should update character vision context");
  assert(afterVision.character.adapter?.provider, "state should expose Figurate adapter status");

  const live = await postAction("phone.conversation.start", {
    target: { id: "board", kind: "surface", label: "Board", surface: "board" },
  });
  assert(live.ok && live.conversation?.live === true, "phone.conversation.start should open live state");
  const stopped = await postAction("phone.conversation.stop", {});
  assert(stopped.ok && stopped.conversation?.live === false, "phone.conversation.stop should close live state");

  const slideCommand = await postAction("phone.command.run", {
    text: "next slide",
    target: { id: "board", kind: "surface", label: "Board", surface: "board" },
  });
  assert(slideCommand.command === "slide" && slideCommand.action === "next", "phone.command.run should advance slides");

  const focusCommand = await postAction("phone.command.run", {
    text: "focus on this",
    target: {
      id: "phone-point-test",
      kind: "point",
      label: "Phone Point",
      surface: "board",
      x: 0.25,
      y: 0.35,
    },
  });
  assert(focusCommand.command === "focus" && focusCommand.focus?.id, "phone.command.run should create a focus node");
  const afterPhoneFocus = await requestJson("GET", "/api/state");
  assert(
    afterPhoneFocus.room.focuses.some((focus) => focus.id === focusCommand.focus.id),
    "phone focus command should update room focus list",
  );
  await postAction("focus.clear", { id: focusCommand.focus.id });

  const poseCommand = await postAction("phone.command.run", {
    text: "turn on pose hand skeleton tracking",
  });
  assert(
    poseCommand.command?.eventType === "camera.mode.requested" && poseCommand.command.mode === "pose",
    "phone.command.run should request pose camera mode",
  );

  const dragState = await postAction("board.drag.set", {
    active: true,
    id: "action-send",
    tagId: 39,
    role: "action",
    surface: "board",
    x: 0.03,
    y: 0.04,
  });
  assert(
    dragState.activeDrag?.role === "action" && dragState.activeDrag.x === 0.03 && dragState.activeDrag.y === 0.04,
    "board.drag.set should preserve action drag coordinates for projected miss feedback",
  );
  await postAction("board.drag.set", { active: false });

  await postAction("fiducial.detections.ingest", {
    surface: "board",
    sourceSpace: "surface",
    detections: [
      { tagId: 39, role: "action", label: "Action / Send", center: { x: 0.42, y: 0.48 }, confidence: 0.42 },
    ],
  });
  const afterLowConfidence = await requestJson("GET", "/api/state");
  const lowAction = afterLowConfidence.fiducials.markers.find((marker) => String(marker.numericTagId ?? marker.tagId) === "39");
  assert(lowAction && lowAction.confidence === 0.42, "fiducial ingestion should preserve marker confidence for recovery UI");

  const beforeNote = afterFocusClear.board.objects.find((object) => object.id === "note-welcome");
  assert(beforeNote, "seed board note should exist");
  const boardSurface = afterFocusClear.surfaces.find((surface) => surface.id === "board") || { widthMm: 1, heightMm: 1 };
  const squareWidth = 0.11 * (boardSurface.heightMm / boardSurface.widthMm);
  assert(Math.abs(beforeNote.w - squareWidth) < 0.002 && beforeNote.h === 0.11, "seed board note should be physically square");

  await postAction("board.object.update", { id: "note-welcome", color: "#bfdbfe", h: 0.11 });
  await postAction("board.object.move", { id: "note-welcome", x: 0.98, y: 0.98 });
  const afterNote = await requestJson("GET", "/api/state");
  const movedNote = afterNote.board.objects.find((object) => object.id === "note-welcome");
  assert(movedNote.color === "#bfdbfe", "board note color should update");
  assert(Math.abs(movedNote.w - squareWidth) < 0.002 && movedNote.h === 0.11, "board note update should preserve physical square size");
  assert(movedNote.x <= 1 - movedNote.w / 2 && movedNote.y <= 1 - movedNote.h / 2, "board note move should clamp to visible board bounds");

  await postAction("board.object.update", {
    id: "note-welcome",
    color: beforeNote.color,
    w: beforeNote.w,
    h: beforeNote.h,
  });
  await postAction("board.object.move", { id: "note-welcome", x: beforeNote.x, y: beforeNote.y });

  const strokeResult = await postAction("board.stroke.add", {
    points: [{ x: 0.913, y: 0.117 }, { x: 0.943, y: 0.147 }],
    color: "#2563eb",
    size: 9,
  });
  assert(strokeResult.stroke?.id, "board.stroke.add should return a stroke id");
  await postAction("board.stroke.erase.near", { x: 0.913, y: 0.117, radius: 0.012 });
  const afterErase = await requestJson("GET", "/api/state");
  assert(
    !afterErase.board.strokes.some((stroke) => stroke.id === strokeResult.stroke.id),
    "board.stroke.erase.near should remove nearby writing",
  );

  console.log("room phase ok");
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
