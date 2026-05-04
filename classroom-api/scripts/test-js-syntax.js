"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const SCAN_DIRS = ["public", "ideas/virtualroom/src", "scripts", "lib", "server"];
const SKIP_DIRS = new Set(["node_modules", ".git", ".local", ".venv-detector", "generated-tags"]);

function walk(dir, files = []) {
  const absDir = path.join(ROOT, dir);
  if (!fs.existsSync(absDir)) return files;
  for (const entry of fs.readdirSync(absDir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) walk(path.join(dir, entry.name), files);
      continue;
    }
    if (/\.(?:js|mjs)$/.test(entry.name)) files.push(path.join(dir, entry.name));
  }
  return files;
}

const files = SCAN_DIRS.flatMap((dir) => walk(dir)).sort();
const failures = [];

for (const file of files) {
  const absolutePath = path.join(ROOT, file);
  try {
    // Avoid child_process here: some local/sandbox runs block nested node spawns.
    // This is a syntax smoke, not module resolution or runtime execution.
    new Function(toParseableScript(fs.readFileSync(absolutePath, "utf8")));
  } catch (error) {
    failures.push({
      file,
      output: error.stack || error.message,
    });
  }
}

if (failures.length) {
  failures.forEach((failure) => {
    console.error(`Syntax failed: ${failure.file}`);
    console.error(failure.output);
  });
  process.exit(1);
}

console.log(`js syntax ok (${files.length} files)`);

function toParseableScript(source) {
  const text = String(source)
    .replace(/^#!.*(?:\r?\n|$)/, "")
    .replace(/^\s*import\s+[\s\S]*?;\s*$/gm, "")
    .replace(/\bimport\.meta\.\w+\b/g, "\".\"")
    .replace(/^\s*export\s+\{[\s\S]*?\};?\s*$/gm, "")
    .replace(/^\s*export\s+default\s+/gm, "const __default_export__ = ")
    .replace(/^\s*export\s+(?=(?:async\s+)?(?:class|function)|const|let|var)\s*/gm, "");
  return `"use strict";\n(async () => {\n${text}\n});`;
}
