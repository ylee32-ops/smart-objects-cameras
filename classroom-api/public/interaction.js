"use strict";

const matrix = document.getElementById("interactionGrammarMatrix");

if (matrix) {
  matrix.innerHTML = Room.tagGrammarRows().map((row) => `
    <tr>
      <td><span class="role-chip">${escapeHtml(row.label)}</span></td>
      <td>${escapeHtml(row.primaryAction)}<br><span class="small">${escapeHtml(row.contextAction)}</span></td>
      <td>${escapeHtml(row.signifier)}</td>
      <td>${escapeHtml(row.feedback)}</td>
      <td>${escapeHtml(row.failure)}</td>
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
