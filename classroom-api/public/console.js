"use strict";

Room.connect();
Room.initIdentity("control");

document.getElementById("resetRoom").addEventListener("click", () => {
  Room.action("room.reset").catch(alertError);
});

document.getElementById("toggleDebug").addEventListener("click", () => {
  Room.action("debug.toggle").catch(alertError);
});

document.getElementById("askRoom").addEventListener("click", () => {
  Room.action("character.ask", { text: document.getElementById("askText").value }).catch(alertError);
});

document.getElementById("askHint").addEventListener("click", () => {
  Room.action("character.ask", { text: "Give me one hint for this room state." }).catch(alertError);
});

document.querySelectorAll("[data-scene]").forEach((button) => {
  button.addEventListener("click", () => runScene(button.dataset.scene).catch(alertError));
});

document.querySelectorAll("[data-mode]").forEach((button) => {
  button.addEventListener("click", () => {
    Room.action("mode.set", { mode: button.dataset.mode }).catch(alertError);
  });
});

document.querySelectorAll("[data-board-mode]").forEach((button) => {
  button.addEventListener("click", () => {
    Room.action("board-mode.set", { mode: button.dataset.boardMode }).catch(alertError);
  });
});

Room.onState((state) => {
  document.getElementById("roomLine").innerHTML = `
    <div class="row">
      <span class="pill">${state.room.phase}</span>
      <span class="pill">board ${state.room.boardMode || "stage"}</span>
      <span class="pill">${state.room.debug ? "reveal on" : "reveal off"}</span>
      <span class="pill">${state.light.activeMode}</span>
      <span class="pill">target ${state.light.targetHit ? "hit" : "miss"}</span>
    </div>
    <div class="small" style="margin-top:8px">${state.clipboard ? `Clipboard: ${state.clipboard.label}` : "Clipboard empty"} / board calibration ${state.calibration.board?.status || "unknown"}</div>
  `;
  document.querySelectorAll("[data-mode]").forEach((button) => {
    button.classList.toggle("primary", button.dataset.mode === state.light.activeMode);
  });
  document.querySelectorAll("[data-board-mode]").forEach((button) => {
    button.classList.toggle("primary", button.dataset.boardMode === (state.room.boardMode || "stage"));
  });
  document.getElementById("characterLine").textContent = state.character.lastUtterance;
  document.getElementById("recentEvents").innerHTML = state.events.slice(0, 5).map((event) => `
    <div class="small">
      <span class="event-type">${event.event_type}</span>
      <span class="pill">${event.salience}</span>
    </div>
  `).join("") || `<div class="small">No events yet.</div>`;
});

async function runScene(scene) {
  if (scene === "place") {
    await Room.action("board-mode.set", { mode: "stage" });
    await Room.action("token.move", { id: "emitter", x: 0.14, y: 0.5 });
    await Room.action("token.move", { id: "mirror-a", x: 0.42, y: 0.5 });
    await Room.action("marker.rotate", { id: "mirror-a", delta: Math.PI / 20 });
    await Room.action("token.move", { id: "target", x: 0.86, y: 0.35 });
  }
  if (scene === "pass") {
    await Room.action("board-mode.set", { mode: "stage" });
    await Room.action("clipboard.copy", { objectId: "target" });
    await Room.action("clipboard.send", { targetSurface: "board", x: 0.48, y: 0.36 });
  }
  if (scene === "point") {
    await Room.action("board-mode.set", { mode: "focus" });
    await Room.action("focus.set", { surface: "board", x: 0.5, y: 0.38, label: "Shared attention" });
  }
  if (scene === "ask") {
    await Room.action("board-mode.set", { mode: "character" });
    await Room.action("character.ask", { text: "What did we just build?" });
  }
  if (scene === "reveal") {
    await Room.action("debug.toggle", { enabled: true });
  }
  if (scene === "bind") {
    await Room.action("board-mode.set", { mode: "focus" });
    await Room.action("clipboard.copy", { objectId: "mirror-a" });
    await Room.action("bind.create", { objectId: "mirror-a", target: "slide.light.reflection", relation: "explains" });
  }
  if (scene === "collaborate") {
    await Room.action("board-mode.set", { mode: "character" });
    await Room.action("phone.target", { mode: "collaborate", target: { id: "board", kind: "surface", label: "Semantic Board", surface: "board" } });
  }
  if (scene === "sticky") {
    await Room.action("board-mode.set", { mode: "write" });
    await Room.action("board.object.create", { kind: "sticky", text: "A sticky note can become a fiducial note.", x: 0.24, y: 0.24 });
  }
  if (scene === "camera") {
    await Room.action("board-mode.set", { mode: "check-understanding" });
    await Room.action("token.move", { id: "mirror-a", x: 0.5, y: 0.44 });
  }
}

function alertError(error) {
  alert(error.message || String(error));
}
