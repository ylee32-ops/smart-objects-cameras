"use strict";

const fs = require("fs");
const { execFile } = require("child_process");

function createImageTagDetector(options = {}) {
  const {
    pythonPath,
    scriptPath,
    rootDir,
    timeoutMs = 3500,
  } = options;

  async function detect(payload = {}) {
    const imageDataUrl = String(payload.imageDataUrl || "");
    validateImageDataUrl(imageDataUrl);

    if (!fs.existsSync(pythonPath)) {
      return {
        ok: false,
        error: `detector python not found at ${pythonPath}`,
        detections: [],
      };
    }
    if (!fs.existsSync(scriptPath)) {
      return {
        ok: false,
        error: `detector script not found at ${scriptPath}`,
        detections: [],
      };
    }

    return new Promise((resolve) => {
      const child = execFile(
        pythonPath,
        [scriptPath],
        {
          cwd: rootDir,
          timeout: timeoutMs,
          maxBuffer: 1024 * 1024,
        },
        (error, stdout, stderr) => {
          if (error) {
            resolve({
              ok: false,
              error: stderr.trim() || error.message,
              detections: [],
            });
            return;
          }
          try {
            const parsed = JSON.parse(stdout || "{}");
            resolve({
              ok: Boolean(parsed.ok),
              error: parsed.error || "",
              width: parsed.width || null,
              height: parsed.height || null,
              detections: Array.isArray(parsed.detections) ? parsed.detections : [],
            });
          } catch (parseError) {
            resolve({
              ok: false,
              error: parseError.message,
              detections: [],
            });
          }
        },
      );

      child.stdin.end(JSON.stringify({
        imageDataUrl,
        family: payload.family || "tag36h11",
      }));
    });
  }

  return { detect };
}

function validateImageDataUrl(imageDataUrl) {
  const match = imageDataUrl.match(/^data:image\/(?:jpeg|jpg|png|webp);base64,([\s\S]+)$/i);
  if (!match) throw new Error("imageDataUrl must be a base64 image data URL");
  const bytes = Buffer.byteLength(match[1].replace(/\s/g, ""), "base64");
  if (!bytes) throw new Error("imageDataUrl is empty");
  if (bytes > 6_000_000) throw new Error("imageDataUrl is too large");
}

module.exports = {
  createImageTagDetector,
};
