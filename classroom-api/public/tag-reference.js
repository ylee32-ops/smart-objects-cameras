"use strict";

async function initTagReference() {
  const tagMap = await fetch("/api/tag-map").then((res) => res.json());
  const calibration = Object.entries(tagMap.calibrationTags || {})
    .filter(([, tag]) => tag.surface === "board")
    .map(([tagId, tag]) => ({
      tagId,
      label: `Board ${tag.corner}`.replaceAll("-", " "),
      role: "calibration",
      surface: tag.surface,
      color: "#e5e7eb",
      description: `Place at board point ${tag.surfacePoint.x.toFixed(2)}, ${tag.surfacePoint.y.toFixed(2)}.`,
    }));
  const boardTags = Object.entries(tagMap.objectTags || {})
    .filter(([, tag]) => tag.surface === "board")
    .map(([tagId, tag]) => ({
      tagId,
      label: tag.label || `Tag ${tagId}`,
      role: tag.role || "object",
      surface: tag.surface,
      color: tag.color || "#e5e7eb",
      description: tag.description || "",
    }));

  renderTagGrid(document.getElementById("calibrationTags"), calibration);
  renderTagGrid(document.getElementById("boardTags"), boardTags);
  renderGrammarMatrix(document.getElementById("tagGrammarMatrix"));
}

function renderTagGrid(root, rows) {
  root.innerHTML = "";
  rows.sort((a, b) => Number(a.tagId) - Number(b.tagId)).forEach((row) => {
    const card = document.createElement("article");
    const grammar = Room.tagGrammar(row.role);
    card.className = "tag-card";
    card.style.setProperty("--tag-color", row.color);
    card.innerHTML = `
      <img src="/generated-tags/tag-${row.tagId}.png" alt="AprilTag ${row.tagId}">
      <div>
        <div class="tag-id">#${escapeHtml(row.tagId)} / ${escapeHtml(row.role)}</div>
        <h3>${escapeHtml(row.label)}</h3>
        <div class="tag-meta">${escapeHtml(row.description || row.surface)}</div>
        ${grammar ? `
          <div class="tag-grammar">
            <div><strong>Do:</strong> ${escapeHtml(grammar.primaryAction)}</div>
            <div><strong>See:</strong> ${escapeHtml(grammar.signifier)}</div>
            <div><strong>Result:</strong> ${escapeHtml(grammar.feedback)}</div>
          </div>
        ` : ""}
      </div>
    `;
    root.appendChild(card);
  });
}

function renderGrammarMatrix(root) {
  if (!root) return;
  const rows = Room.tagGrammarRows({ includeCompatibility: true });
  root.innerHTML = rows.map((row) => `
    <tr>
      <td><strong>${escapeHtml(row.label)}</strong><div class="tag-meta">${escapeHtml(row.role)}</div></td>
      <td>${escapeHtml(row.primaryAction)}<br><span class="small">${escapeHtml(row.contextAction)}</span></td>
      <td>${escapeHtml(row.signifier)}</td>
      <td>${escapeHtml(row.feedback)}<br><span class="small">${escapeHtml(row.failure)}</span></td>
      <td>${escapeHtml(row.reason)}</td>
    </tr>
  `).join("");
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

initTagReference().catch((error) => {
  document.body.insertAdjacentHTML("beforeend", `<pre>${escapeHtml(error.message)}</pre>`);
});
