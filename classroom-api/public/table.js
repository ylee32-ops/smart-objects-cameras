"use strict";

const surface = document.getElementById("tableSurface");
const tokenLayer = document.getElementById("tokenLayer");
const wireLayer = document.getElementById("wireLayer");
let localTokens = [];
let selectedId = null;
let dragging = null;
let lastMoveSent = 0;

Room.connect();
Room.initIdentity("table");

document.getElementById("copyOutput").addEventListener("click", () => {
  Room.action("clipboard.copy", { objectId: selectedId || "target" }).catch(alertError);
});

document.getElementById("sendToBoard").addEventListener("click", () => {
  Room.action("clipboard.send", { targetSurface: "board" }).catch(alertError);
});

document.getElementById("askHint").addEventListener("click", () => {
  Room.action("character.ask", { text: "Give me one hint for the light beam." }).catch(alertError);
});

document.getElementById("debugToggle").addEventListener("click", () => {
  Room.action("debug.toggle").catch(alertError);
});

const resetButton = document.getElementById("resetRoom");
if (resetButton) {
  resetButton.addEventListener("click", () => {
    Room.action("room.reset").catch(alertError);
  });
}

Room.onState((state) => {
  localTokens = state.table.tokens.map((token) => ({ ...token }));
  renderTokens(state);
  renderWires(state);
  renderStatus(state);
  renderDebug(state);
});

function renderTokens(state) {
  tokenLayer.innerHTML = "";
  state.table.tokens.forEach((token) => {
    const el = document.createElement("div");
    el.className = `token ${selectedId === token.id ? "selected" : ""}`;
    el.style.left = `${token.x * 100}%`;
    el.style.top = `${token.y * 100}%`;
    el.style.background = token.color;
    const value = token.kind === "target" && token.hit
      ? "HIT"
      : token.angle !== undefined
        ? `${Math.round((token.angle * 180) / Math.PI)} deg`
        : token.beamColor || token.functionName || token.kind;
    el.innerHTML = `
      <div>
        ${token.label}
        <span class="meta">${token.tagId} ${value}</span>
      </div>
    `;
    el.addEventListener("pointerdown", (event) => beginDrag(event, token));
    el.addEventListener("click", (event) => {
      event.stopPropagation();
      selectedId = token.id;
      if (!dragging && ["mirror", "splitter", "emitter"].includes(token.kind)) {
        Room.action("marker.rotate", { id: token.id, delta: Math.PI / 12 }).catch(alertError);
      }
      renderTokens(Room.state);
    });
    tokenLayer.appendChild(el);
  });
}

function beginDrag(event, token) {
  event.preventDefault();
  selectedId = token.id;
  dragging = {
    id: token.id,
    pointerId: event.pointerId,
  };
  event.currentTarget.setPointerCapture(event.pointerId);
}

surface.addEventListener("pointermove", (event) => {
  if (!dragging) return;
  const pt = Room.normalizedPoint(event, surface);
  const token = localTokens.find((item) => item.id === dragging.id);
  if (!token) return;
  token.x = pt.x;
  token.y = pt.y;
  const el = [...tokenLayer.children].find((child) => child.textContent.includes(token.label));
  if (el) {
    el.style.left = `${pt.x * 100}%`;
    el.style.top = `${pt.y * 100}%`;
  }
  const now = Date.now();
  if (now - lastMoveSent > 120) {
    lastMoveSent = now;
    Room.action("token.move", { id: dragging.id, x: pt.x, y: pt.y }).catch(console.error);
  }
});

surface.addEventListener("pointerup", (event) => {
  if (!dragging) return;
  const pt = Room.normalizedPoint(event, surface);
  Room.action("token.move", { id: dragging.id, x: pt.x, y: pt.y }).catch(alertError);
  dragging = null;
});

function renderWires(state) {
  const rect = surface.getBoundingClientRect();
  wireLayer.setAttribute("viewBox", `0 0 ${rect.width} ${rect.height}`);
  wireLayer.innerHTML = "";
  state.light.rays.forEach((ray) => {
    const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
    line.setAttribute("class", "wire");
    line.setAttribute("x1", ray.x1 * rect.width);
    line.setAttribute("y1", ray.y1 * rect.height);
    line.setAttribute("x2", ray.x2 * rect.width);
    line.setAttribute("y2", ray.y2 * rect.height);
    line.setAttribute("stroke", ray.color || "#fde68a");
    line.setAttribute("filter", "drop-shadow(0 0 9px rgba(255,255,255,.5))");
    wireLayer.appendChild(line);
  });
}

function renderStatus(state) {
  document.getElementById("puzzleStatus").innerHTML = `
    <div><strong>Light Lab</strong></div>
    <div class="small">Target: ${state.light.targetHit ? "hit" : "miss"}</div>
    <div class="small">Rays: ${state.light.rays.length}</div>
    <div class="small">Collisions: ${state.light.collisions.length}</div>
    <div class="small">Solved: ${state.light.solved ? "yes" : "no"}</div>
    <div class="small">Selected: ${selectedId || "none"}</div>
  `;
}

function renderDebug(state) {
  const root = document.getElementById("tableDebug");
  root.innerHTML = "";
  if (!state.room.debug) return;
  const overlay = document.createElement("div");
  overlay.className = "debug-overlay";
  state.table.tokens.forEach((token) => {
    const label = document.createElement("div");
    label.className = "debug-label";
    label.style.left = `${token.x * 100}%`;
    label.style.top = `${token.y * 100}%`;
    label.textContent = `${token.id} conf=.99`;
    overlay.appendChild(label);
  });
  root.appendChild(overlay);
}

function alertError(error) {
  alert(error.message || String(error));
}
