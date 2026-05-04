import { postAction, getCalibration } from "./server-client.js";
import { TABLE } from "./conventions.js";
import { BOARD_SURFACE } from "./room-scene.js";

const SURFACE_TAGS = Object.freeze({
  table: [
    { tagId: 0, surfacePoint: { x: 0, y: 0 } },
    { tagId: 1, surfacePoint: { x: 1, y: 0 } },
    { tagId: 2, surfacePoint: { x: 1, y: 1 } },
    { tagId: 3, surfacePoint: { x: 0, y: 1 } },
  ],
  board: [
    { tagId: 4, surfacePoint: { x: 0.12, y: 0.12 } },
    { tagId: 5, surfacePoint: { x: 0.88, y: 0.12 } },
    { tagId: 6, surfacePoint: { x: 0.88, y: 0.88 } },
    { tagId: 7, surfacePoint: { x: 0.12, y: 0.88 } },
  ],
});

export class CalibrationPanel {
  constructor({ root, cameras, detections, overlay, onCoverageRequest, onCameraSelect }) {
    this.root = root;
    this.cameras = cameras;
    this.detections = detections;
    this.overlay = overlay;
    this.ctx = overlay?.getContext("2d");
    this.onCoverageRequest = onCoverageRequest || (() => {});
    this.onCameraSelect = onCameraSelect || (() => {});
    this.status = {};
    this.session = null;
    this.installOverlayEvents();
  }

  async refresh() {
    const result = await getCalibration();
    this.status = result.ok ? result.data : {};
    this.render();
  }

  render() {
    this.root.innerHTML = "";
    for (const rig of this.cameras.rigs) {
      for (const surface of this.surfacesForRig(rig)) {
        const row = document.createElement("div");
        row.className = "cal-row";
        const error = this.errorFor(surface, "camera");
        row.innerHTML = `
          <div>
            <strong>${rig.rig.userData.label.replace("Camera · ", "")} · ${surface}</strong>
            <div class="error ${error.className}">${error.label}</div>
          </div>
          <div class="cal-actions">
            <button class="ctrl" data-action="sample">Sample</button>
            <button class="ctrl" data-action="auto">Auto</button>
          </div>
        `;
        row.querySelector('[data-action="sample"]').addEventListener("click", () => this.startSampling(rig, surface));
        row.querySelector('[data-action="auto"]').addEventListener("click", () => this.autoCalibrate(rig, surface));
        this.root.appendChild(row);
      }
    }
    this.drawOverlay();
  }

  startSampling(rig, surface) {
    this.onCoverageRequest();
    this.onCameraSelect(rig);
    this.session = {
      rig,
      surface,
      index: 0,
      samples: [],
      corners: this.projectSurfaceCorners(rig, surface),
    };
    postAction("calibration.clear", { surface });
    this.drawOverlay();
  }

  async autoCalibrate(rig, surface) {
    // Sim-only shortcut: use projected ground-truth corner points. Real cameras should auto-detect AprilTags first,
    // then fall back to assisted clicks only when tags are missing or ambiguous.
    // Contract shape mirrors contract-map.md calibration examples.
    this.onCoverageRequest();
    await postAction("calibration.clear", { surface });
    const samples = this.projectSurfaceCorners(rig, surface);
    for (const sample of samples) {
      await postAction("calibration.sample.add", {
        surface,
        tagId: sample.tagId,
        camera: sample.camera,
        surfacePoint: sample.surfacePoint,
      });
    }
    await postAction("calibration.solve", { surface, sourceSpace: "camera" });
    await this.refresh();
  }

  async autoCalibrateAll() {
    for (const rig of this.cameras.rigs) {
      for (const surface of this.surfacesForRig(rig)) {
        await this.autoCalibrate(rig, surface);
      }
    }
  }

  projectSurfaceCorners(rig, surface) {
    const markers = SURFACE_TAGS[surface] || [];
    return markers.map((marker) => {
      const camera = this.projectSurfacePoint(rig, marker.surfacePoint, surface);
      return {
        ...marker,
        camera,
      };
    });
  }

  projectSurfacePoint(rig, point, surface) {
    const width = 1280;
    const height = 960;
    const marker = { position: this.surfacePointToWorld(point, surface) };
    const projected = this.detections.projectWorldPoint(marker.position, rig.cam, { width, height });
    return { x: projected.x, y: projected.y };
  }

  surfacePointToWorld(point, surface) {
    if (surface === "board") {
      return {
        x: BOARD_SURFACE.centerX,
        y: BOARD_SURFACE.centerY + BOARD_SURFACE.heightY / 2 - point.y * BOARD_SURFACE.heightY,
        z: BOARD_SURFACE.centerZ + BOARD_SURFACE.widthZ / 2 - point.x * BOARD_SURFACE.widthZ,
      };
    }
    return {
      x: point.x * TABLE.widthX - TABLE.widthX / 2,
      z: point.y * TABLE.depthZ - TABLE.depthZ / 2,
      y: TABLE.surfaceY,
    };
  }

  errorFor(surface, sourceSpace) {
    const error = this.status?.[surface]?.error?.[sourceSpace];
    if (!error) return { label: this.status?.[surface]?.status || "not solved", className: "warn" };
    const avg = Number(error.avg);
    if (!Number.isFinite(avg)) return { label: "error", className: "bad" };
    return {
      label: `${avg.toFixed(2)} px rms`,
      className: avg < 1 ? "good" : avg <= 3 ? "warn" : "bad",
    };
  }

  surfacesForRig(rig) {
    const kind = rig?.rig?.userData?.sub;
    if (kind === "ceiling") return ["table"];
    if (kind === "tripod") return ["board"];
    return ["table"];
  }

  installOverlayEvents() {
    if (!this.overlay) return;
    this.overlay.addEventListener("click", async (event) => {
      if (!this.session) return;
      const rect = this.overlay.getBoundingClientRect();
      const x = ((event.clientX - rect.left) / rect.width) * 1280;
      const y = ((event.clientY - rect.top) / rect.height) * 960;
      const corner = this.session.corners[this.session.index];
      if (!corner) return;
      await postAction("calibration.sample.add", {
        surface: this.session.surface,
        tagId: corner.tagId,
        camera: { x, y },
        surfacePoint: corner.surfacePoint,
      });
      this.session.samples.push({ ...corner, camera: { x, y } });
      this.session.index += 1;
      if (this.session.index >= this.session.corners.length) {
        await postAction("calibration.solve", { surface: this.session.surface, sourceSpace: "camera" });
        this.session = null;
        await this.refresh();
      } else {
        this.drawOverlay();
      }
    });
  }

  drawOverlay() {
    if (!this.overlay || !this.ctx) return;
    const rect = this.overlay.getBoundingClientRect();
    const width = Math.max(1, Math.floor(rect.width));
    const height = Math.max(1, Math.floor(rect.height));
    if (this.overlay.width !== width || this.overlay.height !== height) {
      this.overlay.width = width;
      this.overlay.height = height;
    }
    this.ctx.clearRect(0, 0, width, height);
    if (!this.session) return;
    const scaleX = width / 1280;
    const scaleY = height / 960;
    this.session.corners.forEach((corner, index) => {
      const p = corner.camera;
      const x = p.x * scaleX;
      const y = p.y * scaleY;
      const done = index < this.session.index;
      const active = index === this.session.index;
      this.ctx.strokeStyle = active ? "#ffb360" : done ? "rgba(245,239,226,.72)" : "rgba(245,239,226,.28)";
      this.ctx.fillStyle = done ? "rgba(255,179,96,.65)" : "rgba(6,7,9,.74)";
      this.ctx.lineWidth = active ? 2 : 1;
      this.ctx.fillRect(x - 8, y - 8, 16, 16);
      this.ctx.strokeRect(x - 8, y - 8, 16, 16);
      this.ctx.font = "10px IBM Plex Mono, monospace";
      this.ctx.fillStyle = "#f5efe2";
      this.ctx.fillText(String(corner.tagId), x + 11, y + 4);
    });
  }
}
