"use strict";

const fs = require("fs");
const path = require("path");

const MIME_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".cer": "application/pkix-cert",
  ".crt": "application/x-x509-ca-cert",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".webp": "image/webp",
};

function createStaticFileHandler({ publicDir, ideasDir, threeDir }) {
  function sendStatic(req, res) {
    const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
    let pathname = decodeURIComponent(url.pathname);
    if (pathname === "/") pathname = "/index.html";
    const filePath = resolveStaticPath(pathname);

    if (!filePath) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Not found");
      return;
    }

    fs.readFile(filePath, (error, content) => {
      if (error) {
        res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
        res.end("Not found");
        return;
      }
      const ext = path.extname(filePath).toLowerCase();
      res.writeHead(200, {
        "Content-Type": MIME_TYPES[ext] || "application/octet-stream",
        "Cache-Control": "no-store",
      });
      res.end(content);
    });
  }

  function resolveStaticPath(pathname) {
    // Keep the static allowlist narrow: public/, ideas/, and the Three.js runtime used by virtual room.
    const normalizedPath = pathname.endsWith("/") ? `${pathname}index.html` : pathname;

    if (normalizedPath.startsWith("/vendor/three/")) {
      const rel = normalizedPath.slice("/vendor/three/".length);
      const candidate = path.normalize(path.join(threeDir, rel));
      if (candidate === threeDir || candidate.startsWith(`${threeDir}${path.sep}`)) {
        return candidate;
      }
      return null;
    }

    if (normalizedPath.startsWith("/ideas/")) {
      const rel = normalizedPath.slice("/ideas/".length);
      const candidate = path.normalize(path.join(ideasDir, rel));
      if (candidate === ideasDir || candidate.startsWith(`${ideasDir}${path.sep}`)) {
        return candidate;
      }
      return null;
    }

    const rel = normalizedPath.startsWith("/") ? normalizedPath.slice(1) : normalizedPath;
    const candidate = path.normalize(path.join(publicDir, rel));
    if (candidate === publicDir || candidate.startsWith(`${publicDir}${path.sep}`)) {
      return candidate;
    }
    return null;
  }

  return {
    resolveStaticPath,
    sendStatic,
  };
}

module.exports = {
  createStaticFileHandler,
};
