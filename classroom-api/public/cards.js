"use strict";

function pseudoPattern(id) {
  const bits = [];
  let seed = (Number(id) * 2654435761) >>> 0;
  for (let i = 0; i < 36; i += 1) {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    bits.push(seed % 3 === 0 ? 0 : 1);
  }
  return bits;
}

function mockTag(id) {
  const tag = document.createElement("div");
  tag.className = "mock-tag";
  pseudoPattern(id).forEach((bit) => {
    const cell = document.createElement("span");
    if (bit) cell.className = "black";
    tag.appendChild(cell);
  });
  return tag;
}

async function loadCards() {
  const [config, tagMap] = await Promise.all([
    fetch("/api/config").then((res) => res.json()),
    fetch("/api/tag-map").then((res) => res.json()),
  ]);
  const markerByTag = new Map((config.markers || []).map((marker) => [String(marker.tagId), marker]));
  const rows = [];

  Object.entries(tagMap?.calibrationTags || {}).forEach(([tagId, data]) => {
    rows.push({
      tagId,
      label: `${data.surface} ${data.corner}`.replaceAll("-", " "),
      kind: "calibration",
      surface: data.surface,
      color: "#e5e7eb",
      description: `${data.surface} calibration ${data.corner}`.replaceAll("-", " "),
    });
  });

  Object.entries(tagMap?.objectTags || {}).forEach(([tagId, data]) => {
    const marker = markerByTag.get(tagId) || {};
    rows.push({
      tagId,
      label: data.label || marker.label || `Tag ${tagId}`,
      kind: data.role || marker.kind || "object",
      surface: data.surface || marker.surface || "table",
      color: data.color || marker.color || "#e5e7eb",
      description: data.description || "",
    });
  });

  const root = document.getElementById("cards");
  rows.sort((a, b) => Number(a.tagId) - Number(b.tagId)).forEach((row) => {
    const card = document.createElement("article");
    card.className = "print-card";
    card.style.setProperty("--card-color", row.color);
    const tag = mockTag(row.tagId);
    const meta = document.createElement("div");
    meta.innerHTML = `
      <div class="tag-id">#${row.tagId}</div>
      <h2>${escapeHtml(row.label)}</h2>
      <p>${escapeHtml(row.kind)} / ${escapeHtml(row.surface)}</p>
      <div class="small" style="margin-top:8px">${escapeHtml(row.description || "")}</div>
    `;
    card.append(tag, meta);
    root.appendChild(card);
  });
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

loadCards().catch((error) => {
  document.getElementById("cards").textContent = error.message;
});
