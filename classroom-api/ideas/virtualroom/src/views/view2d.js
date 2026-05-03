import * as THREE from "three";
import { ROOM, TABLE, ROLE_COLORS } from "../conventions.js";
import { headingForObject } from "../orientation.js";
import { coverageGrid, tableBounds } from "../coverage.js";
import { BOARD_SURFACE, BOARD_TARGET } from "../room-scene.js";

const SCALE = 138;

export class View2D {
  constructor({ canvas, markers, cameras, projectors, table, whiteboard, getMode, getProjectorPolygon, getSelected, onSelect, onChange, onProjectorPolygonChange, onAimCamera }) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.markers = markers;
    this.cameras = cameras;
    this.projectors = projectors;
    this.table = table;
    this.whiteboard = whiteboard;
    this.getMode = getMode || (() => "select");
    this.getProjectorPolygon = getProjectorPolygon || (() => null);
    this.getSelected = getSelected || (() => null);
    this.onSelect = onSelect || (() => {});
    this.onChange = onChange || (() => {});
    this.onProjectorPolygonChange = onProjectorPolygonChange || (() => {});
    this.onAimCamera = onAimCamera || (() => {});
    this.enabled = false;
    this.pan = { x: 0, y: 0 };
    this.zoom = 1;
    this.drag = null;
    this.hover = null;
    this.coverageEnabled = false;
    this.installEvents();
  }

  setCoverageEnabled(enabled) {
    this.coverageEnabled = enabled;
  }

  setEnabled(enabled) {
    this.enabled = enabled;
    this.canvas.hidden = !enabled;
  }

  surfaceMode() {
    return surfaceModeFromMarkers(this.markers);
  }

  resize(width, height) {
    this.canvas.width = Math.max(1, Math.floor(width));
    this.canvas.height = Math.max(1, Math.floor(height));
  }

  render() {
    if (!this.enabled) return;
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.fillStyle = "#07090d";
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    this.drawGrid();
    this.drawRoom();
    this.drawWhiteboard();
    this.drawTable();
    if (this.coverageEnabled) this.drawCoverage();
    this.drawProjectors();
    this.drawProjectorWarp();
    this.drawCameras();
    this.drawMarkers();
    this.drawCompass();
  }

  installEvents() {
    this.canvas.addEventListener("pointerdown", (event) => {
      if (!this.enabled) return;
      const hit = this.pick(event);
      const boardMode = this.surfaceMode() === "board";
      if (hit?.type === "projector-warp-point") {
        this.drag = { type: "projector-warp-point", index: hit.index };
        this.canvas.setPointerCapture(event.pointerId);
        return;
      }
      if (hit?.type === "projector-warp-segment") {
        const next = cloneProjectorPolygon(this.getProjectorPolygon());
        next.splice(hit.insertAt, 0, hit.point);
        this.onProjectorPolygonChange(next);
        this.drag = { type: "projector-warp-point", index: hit.insertAt };
        this.canvas.setPointerCapture(event.pointerId);
        return;
      }
      if (hit?.type === "marker") {
        this.onSelect(hit.marker);
        if (hit.marker.userData.locked) return;
        const world = this.screenToWorld(event.offsetX, event.offsetY);
        this.drag = {
          type: "marker",
          marker: hit.marker,
          offset: boardMode
            ? {
              x: 0,
              y: world.y - hit.marker.position.y,
              z: world.z - hit.marker.position.z,
            }
            : {
              x: world.x - hit.marker.position.x,
              y: 0,
              z: world.z - hit.marker.position.z,
            },
        };
        this.canvas.setPointerCapture(event.pointerId);
        return;
      }
      if (hit?.type === "camera") {
        const world = this.screenToWorld(event.offsetX, event.offsetY);
        const p = hit.rig.rig.position;
        this.drag = {
          type: "camera",
          rig: hit.rig,
          offset: boardMode
            ? { x: 0, y: world.y - p.y, z: world.z - p.z }
            : { x: world.x - p.x, y: 0, z: world.z - p.z },
        };
        this.canvas.setPointerCapture(event.pointerId);
        this.onSelect(hit.rig.rig);
        return;
      }
      if (hit?.type === "camera-aim") {
        this.drag = {
          type: "camera-aim",
          rig: hit.rig,
        };
        this.canvas.setPointerCapture(event.pointerId);
        this.onSelect(hit.rig.rig);
        return;
      }
      this.onSelect(hit?.object || null);
    });

    this.canvas.addEventListener("pointermove", (event) => {
      if (!this.enabled || !this.drag) return;
      const boardMode = this.surfaceMode() === "board";
      const world = this.screenToWorld(event.offsetX, event.offsetY);
      if (this.drag.type === "projector-warp-point") {
        const point = boardMode ? boardNormalizedPoint(world) : null;
        if (!point) return;
        const next = cloneProjectorPolygon(this.getProjectorPolygon());
        next[this.drag.index] = point;
        this.onProjectorPolygonChange(next);
        this.onChange();
      }
      if (this.drag.type === "marker") {
        this.markers.applyDragPoint(this.drag.marker, world, this.drag.offset);
        this.onChange();
      }
      if (this.drag.type === "camera") {
        const rig = this.drag.rig.rig;
        if (this.surfaceMode() === "board") {
          rig.position.y = clamp(world.y - this.drag.offset.y, 0.4, ROOM.height - 0.18);
          rig.position.z = clamp(world.z - this.drag.offset.z, -ROOM.depthZ + 0.12, ROOM.depthZ - 0.12);
        } else {
          rig.position.x = clamp(world.x - this.drag.offset.x, -ROOM.halfX + 0.12, ROOM.halfX - 0.12);
          rig.position.z = clamp(world.z - this.drag.offset.z, -ROOM.depthZ + 0.12, ROOM.depthZ - 0.12);
        }
        this.onChange();
      }
      if (this.drag.type === "camera-aim") {
        this.onAimCamera(this.drag.rig, this.surfaceMode() === "board"
          ? { x: BOARD_TARGET.x, y: world.y, z: world.z }
          : { x: world.x, z: world.z });
        this.onChange();
      }
      if (this.drag.type === "pan") {
        this.pan.x += event.movementX;
        this.pan.y += event.movementY;
      }
    });

    this.canvas.addEventListener("pointerup", () => {
      if (!this.enabled) return;
      this.drag = null;
      this.onChange();
    });

    this.canvas.addEventListener("contextmenu", (event) => {
      event.preventDefault();
      if (!this.enabled || this.surfaceMode() !== "board" || this.getMode() !== "warp") return;
      const hit = this.pick(event);
      if (hit?.type !== "projector-warp-point") return;
      const polygon = this.getProjectorPolygon();
      if (!polygon || polygon.length <= 4) return;
      const next = cloneProjectorPolygon(polygon);
      next.splice(hit.index, 1);
      this.onProjectorPolygonChange(next);
      this.onChange();
    });
    this.canvas.addEventListener("pointerdown", (event) => {
      if (!this.enabled || event.button !== 2) return;
      this.drag = { type: "pan" };
    });

    this.canvas.addEventListener("wheel", (event) => {
      if (!this.enabled) return;
      const hit = this.pick(event);
      if (hit?.type === "marker" && this.getSelected() === hit.marker) {
        if (hit.marker.userData.locked) return;
        event.preventDefault();
        hit.marker.userData.angle += (event.shiftKey ? 0.05 : 0.12) * Math.sign(event.deltaY);
        if (hit.marker.userData.card) hit.marker.userData.card.rotation.z = hit.marker.userData.angle;
        this.onChange();
        return;
      }
      event.preventDefault();
      const factor = event.deltaY > 0 ? 0.92 : 1.08;
      this.zoom = clamp(this.zoom * factor, 0.45, 2.5);
    }, { passive: false });

    this.canvas.addEventListener("dblclick", (event) => {
      if (!this.enabled) return;
      const hit = this.pick(event);
      if (hit?.type === "marker") {
        if (hit.marker.userData.locked) return;
        this.markers.remove(hit.marker);
        this.onChange();
      }
    });
  }

  worldToScreen(x, z) {
    if (this.surfaceMode() === "board") {
      return {
        x: this.canvas.width / 2 + this.pan.x + (BOARD_SURFACE.centerZ - z) * SCALE * this.zoom,
        y: this.canvas.height / 2 + this.pan.y + (BOARD_SURFACE.centerY - x) * SCALE * this.zoom,
      };
    }
    return {
      x: this.canvas.width / 2 + this.pan.x + x * SCALE * this.zoom,
      y: this.canvas.height / 2 + this.pan.y + z * SCALE * this.zoom,
    };
  }

  screenToWorld(x, y) {
    if (this.surfaceMode() === "board") {
      return {
        x: BOARD_SURFACE.centerX,
        y: BOARD_SURFACE.centerY - ((y - this.canvas.height / 2 - this.pan.y) / (SCALE * this.zoom)),
        z: BOARD_SURFACE.centerZ - ((x - this.canvas.width / 2 - this.pan.x) / (SCALE * this.zoom)),
      };
    }
    return {
      x: (x - this.canvas.width / 2 - this.pan.x) / (SCALE * this.zoom),
      z: (y - this.canvas.height / 2 - this.pan.y) / (SCALE * this.zoom),
    };
  }

  pick(event) {
    const world = this.screenToWorld(event.offsetX, event.offsetY);
    const boardMode = this.surfaceMode() === "board";
    if (boardMode) {
      const polygon = this.getProjectorPolygon();
      if (polygon?.length) {
        for (let index = 0; index < polygon.length; index += 1) {
          const point = projectorPointScreenPoint(this, polygon[index]);
          if (Math.hypot(event.offsetX - point.x, event.offsetY - point.y) < 16) {
            return { type: "projector-warp-point", index };
          }
        }
        if (this.getMode() === "warp") {
          for (let index = 0; index < polygon.length; index += 1) {
            const a = projectorPointScreenPoint(this, polygon[index]);
            const b = projectorPointScreenPoint(this, polygon[(index + 1) % polygon.length]);
            if (distanceToSegment({ x: event.offsetX, y: event.offsetY }, a, b) < 10) {
              const point = boardNormalizedPoint(world);
              return { type: "projector-warp-segment", insertAt: index + 1, point };
            }
          }
        }
      }
    }
    for (const marker of [...this.markers.list()].reverse()) {
      const dx = boardMode ? world.z - marker.position.z : world.x - marker.position.x;
      const dz = boardMode ? world.y - marker.position.y : world.z - marker.position.z;
      if (Math.hypot(dx, dz) < 0.105) return { type: "marker", marker, object: marker };
    }
    for (const rig of this.cameras.rigs) {
      if (boardMode) {
        const p = rig.rig.position;
        if (Math.hypot(world.z - p.z, world.y - p.y) < 0.14) return { type: "camera", rig, object: rig.rig };
        continue;
      }
      const heading = headingForObject(rig.cam);
      const p = rig.rig.position;
      const tip = { x: p.x + Math.sin(heading) * 0.55, z: p.z - Math.cos(heading) * 0.55 };
      if (Math.hypot(world.x - tip.x, world.z - tip.z) < 0.12) return { type: "camera-aim", rig, object: rig.rig };
      if (Math.hypot(world.x - p.x, world.z - p.z) < 0.14) return { type: "camera", rig, object: rig.rig };
    }
    return null;
  }

  drawGrid() {
    const ctx = this.ctx;
    ctx.strokeStyle = "rgba(245,239,226,.055)";
    ctx.lineWidth = 1;
    const step = 0.5 * SCALE * this.zoom;
    const ox = (this.canvas.width / 2 + this.pan.x) % step;
    const oy = (this.canvas.height / 2 + this.pan.y) % step;
    for (let x = ox; x < this.canvas.width; x += step) line(ctx, x, 0, x, this.canvas.height);
    for (let y = oy; y < this.canvas.height; y += step) line(ctx, 0, y, this.canvas.width, y);
  }

  drawRoom() {
    const ctx = this.ctx;
    if (this.surfaceMode() === "board") {
      const a = this.worldToScreen(BOARD_SURFACE.centerY + BOARD_SURFACE.heightY / 2, BOARD_SURFACE.centerZ - BOARD_SURFACE.widthZ / 2);
      const b = this.worldToScreen(BOARD_SURFACE.centerY - BOARD_SURFACE.heightY / 2, BOARD_SURFACE.centerZ + BOARD_SURFACE.widthZ / 2);
      const rect = rectFromPoints(a, b);
      ctx.strokeStyle = "rgba(245,239,226,.18)";
      ctx.lineWidth = 1;
      ctx.strokeRect(rect.x, rect.y, rect.w, rect.h);
      return;
    }
    const a = this.worldToScreen(-ROOM.halfX, -ROOM.depthZ);
    const b = this.worldToScreen(ROOM.halfX, ROOM.depthZ);
    ctx.strokeStyle = "rgba(245,239,226,.24)";
    ctx.lineWidth = 1;
    ctx.strokeRect(a.x, a.y, b.x - a.x, b.y - a.y);
  }

  drawTable() {
    if (this.surfaceMode() === "board") return;
    const ctx = this.ctx;
    const a = this.worldToScreen(-TABLE.widthX / 2, -TABLE.depthZ / 2);
    const b = this.worldToScreen(TABLE.widthX / 2, TABLE.depthZ / 2);
    ctx.fillStyle = "rgba(245,239,226,.045)";
    ctx.strokeStyle = "rgba(245,239,226,.48)";
    ctx.lineWidth = 1;
    ctx.fillRect(a.x, a.y, b.x - a.x, b.y - a.y);
    ctx.strokeRect(a.x, a.y, b.x - a.x, b.y - a.y);
    label(ctx, "TABLE", a.x + 8, a.y + 16);
  }

  drawCoverage() {
    if (this.surfaceMode() === "board") return;
    const coverages = this.cameras.rigs.map((rig, index) => ({
      polygon: rig.coveragePolygon || [],
      color: index === 0 ? "rgba(217,180,95,.22)" : "rgba(127,188,210,.22)",
    }));
    const ctx = this.ctx;
    coverages.forEach((coverage) => {
      if (coverage.polygon.length < 3) return;
      ctx.fillStyle = coverage.color;
      ctx.beginPath();
      coverage.polygon.forEach((point, index) => {
        const p = this.worldToScreen(point.x, point.z);
        if (index === 0) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
      });
      ctx.closePath();
      ctx.fill();
    });
    ctx.fillStyle = "rgba(255,122,107,.13)";
    coverageGrid(coverages, 24, 24).filter((cell) => cell.count === 0).forEach((cell) => {
      const a = this.worldToScreen(cell.x - cell.w / 2, cell.z - cell.h / 2);
      const b = this.worldToScreen(cell.x + cell.w / 2, cell.z + cell.h / 2);
      ctx.fillRect(a.x, a.y, b.x - a.x, b.y - a.y);
    });
    const bounds = tableBounds();
    const p = this.worldToScreen((bounds.minX + bounds.maxX) / 2, bounds.maxZ + 0.18);
    label(ctx, "COVERAGE / GAP", p.x - 42, p.y);
  }

  drawWhiteboard() {
    const ctx = this.ctx;
    if (this.surfaceMode() === "board") {
      const a = this.worldToScreen(BOARD_SURFACE.centerY + BOARD_SURFACE.heightY / 2, BOARD_SURFACE.centerZ - BOARD_SURFACE.widthZ / 2);
      const b = this.worldToScreen(BOARD_SURFACE.centerY - BOARD_SURFACE.heightY / 2, BOARD_SURFACE.centerZ + BOARD_SURFACE.widthZ / 2);
      const rect = rectFromPoints(a, b);
      ctx.fillStyle = "rgba(233,237,240,.08)";
      ctx.strokeStyle = "rgba(233,237,240,.82)";
      ctx.lineWidth = 2;
      ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
      ctx.strokeRect(rect.x, rect.y, rect.w, rect.h);
      label(ctx, "WHITEBOARD", rect.x + 12, rect.y + 16);
      return;
    }
    const x = -ROOM.halfX;
    const a = this.worldToScreen(x, -2.3);
    const b = this.worldToScreen(x, 2.3);
    ctx.strokeStyle = "rgba(233,237,240,.82)";
    ctx.lineWidth = 8;
    line(ctx, a.x, a.y, b.x, b.y);
    label(ctx, "WHITEBOARD", a.x + 12, a.y + 16);
  }

  drawProjectors() {
    const group = this.projectors?.group;
    if (!group) return;
    if (this.surfaceMode() === "board") {
      group.children
        .filter((object) => object.userData?.kind === "projector")
        .forEach((object) => {
          const p = this.worldToScreen(object.position.y, object.position.z);
          this.ctx.fillStyle = "#d9b45f";
          this.ctx.fillRect(p.x - 6, p.y - 6, 12, 12);
          const target = this.worldToScreen(BOARD_TARGET.y, BOARD_TARGET.z);
          this.ctx.strokeStyle = "rgba(217,180,95,.28)";
          this.ctx.lineWidth = 1;
          line(this.ctx, p.x, p.y, target.x, target.y);
          label(this.ctx, object.userData?.label || "PROJECTOR", p.x + 10, p.y - 10);
        });
      return;
    }
    group.children.forEach((object) => {
      const p = this.worldToScreen(object.position.x, object.position.z);
      triangle(this.ctx, p.x, p.y, headingForObject(object), "#d9b45f");
      label(this.ctx, object.userData?.label || "PROJECTOR", p.x + 10, p.y - 10);
    });
  }

  drawProjectorWarp() {
    if (this.surfaceMode() !== "board") return;
    const polygon = this.getProjectorPolygon();
    if (!polygon?.length) return;
    const ctx = this.ctx;
    const corners = polygon.map((point) => projectorPointScreenPoint(this, point));
    const isWarpMode = this.getMode() === "warp";
    const center = centroid(corners);
    ctx.save();
    ctx.fillStyle = isWarpMode ? "rgba(255,179,96,.16)" : "rgba(255,179,96,.08)";
    ctx.strokeStyle = "rgba(255,179,96,.98)";
    ctx.lineWidth = isWarpMode ? 4 : 3;
    ctx.shadowColor = "rgba(255,179,96,.42)";
    ctx.shadowBlur = isWarpMode ? 14 : 8;
    ctx.beginPath();
    corners.forEach((point, index) => {
      if (index === 0) ctx.moveTo(point.x, point.y);
      else ctx.lineTo(point.x, point.y);
    });
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = "rgba(255,255,255,.62)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    corners.forEach((point, index) => {
      if (index === 0) ctx.moveTo(point.x, point.y);
      else ctx.lineTo(point.x, point.y);
    });
    ctx.closePath();
    ctx.stroke();
    if (isWarpMode) {
      corners.forEach((point, index) => {
        const next = corners[(index + 1) % corners.length];
        const mid = { x: (point.x + next.x) / 2, y: (point.y + next.y) / 2 };
        ctx.fillStyle = "rgba(255,255,255,.78)";
        ctx.fillRect(mid.x - 3, mid.y - 3, 6, 6);
      });
    }
    corners.forEach((point, index) => {
      const active = this.drag?.type === "projector-warp-point" && this.drag.index === index;
      ctx.fillStyle = active ? "#fff8e7" : "#ffb360";
      ctx.strokeStyle = "#07090d";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(point.x, point.y, active ? 10 : 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      label(ctx, `${index + 1}`, point.x + 10, point.y - 8);
    });
    label(ctx, isWarpMode ? "PROJECTOR MAP - DRAG CORNERS / CLICK EDGE" : "PROJECTOR MAP", center.x - 74, center.y);
    ctx.restore();
  }

  drawCameras() {
    if (this.surfaceMode() === "board") {
      this.cameras.rigs.forEach((rig) => {
        const p = this.worldToScreen(rig.rig.position.y, rig.rig.position.z);
        this.ctx.fillStyle = "#7fbcd2";
        this.ctx.fillRect(p.x - 6, p.y - 6, 12, 12);
        const target = this.worldToScreen(BOARD_TARGET.y, BOARD_TARGET.z);
        this.ctx.strokeStyle = "rgba(127,188,210,.24)";
        this.ctx.lineWidth = 1;
        line(this.ctx, p.x, p.y, target.x, target.y);
        label(this.ctx, rig.rig.userData.label, p.x + 10, p.y + 14);
      });
      return;
    }
    this.cameras.rigs.forEach((rig) => {
      const p = this.worldToScreen(rig.rig.position.x, rig.rig.position.z);
      const heading = headingForObject(rig.cam);
      triangle(this.ctx, p.x, p.y, heading, "#7fbcd2");
      this.ctx.strokeStyle = "rgba(127,188,210,.24)";
      this.ctx.lineWidth = 1;
      const p2 = this.worldToScreen(rig.rig.position.x + Math.sin(heading) * 0.9, rig.rig.position.z - Math.cos(heading) * 0.9);
      line(this.ctx, p.x, p.y, p2.x, p2.y);
      this.ctx.fillStyle = "rgba(127,188,210,.9)";
      this.ctx.fillRect(p2.x - 3, p2.y - 3, 6, 6);
      label(this.ctx, rig.rig.userData.label, p.x + 10, p.y + 14);
    });
  }

  drawMarkers() {
    const ctx = this.ctx;
    const boardMode = this.surfaceMode() === "board";
    this.markers.list().forEach((marker) => {
      const p = boardMode
        ? this.worldToScreen(marker.position.y, marker.position.z)
        : this.worldToScreen(marker.position.x, marker.position.z);
      const color = ROLE_COLORS[marker.userData.role] || "#999";
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(marker.userData.angle || marker.rotation.y);
      ctx.fillStyle = "#f5efe2";
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.fillRect(-14, -14, 28, 28);
      ctx.strokeRect(-14, -14, 28, 28);
      ctx.restore();
      label(ctx, String(marker.userData.tagId).padStart(2, "0"), p.x + 14, p.y + 4);
    });
  }

  drawCompass() {
    if (this.surfaceMode() === "board") {
      const x = this.canvas.width - 92;
      const y = 52;
      this.ctx.strokeStyle = "rgba(245,239,226,.22)";
      this.ctx.strokeRect(x - 36, y - 24, 72, 48);
      label(this.ctx, "UP", x - 8, y - 8);
      label(this.ctx, "BOARD", x - 18, y + 14);
      return;
    }
    const ctx = this.ctx;
    const x = this.canvas.width - 58;
    const y = 44;
    ctx.strokeStyle = "rgba(245,239,226,.22)";
    ctx.strokeRect(x - 28, y - 28, 56, 56);
    label(ctx, "N", x - 4, y - 18);
    label(ctx, "S", x - 4, y + 25);
    label(ctx, "E", x + 17, y + 4);
    label(ctx, "W", x - 25, y + 4);
  }
}

function surfaceModeFromMarkers(markers) {
  return markers.list()[0]?.userData?.surface === "board" ? "board" : "table";
}

function boardNormalizedPoint(world) {
  return {
    x: clamp(((BOARD_SURFACE.centerZ + BOARD_SURFACE.widthZ / 2) - world.z) / BOARD_SURFACE.widthZ, 0, 1),
    y: clamp(((BOARD_SURFACE.centerY + BOARD_SURFACE.heightY / 2) - world.y) / BOARD_SURFACE.heightY, 0, 1),
  };
}

function projectorPointScreenPoint(view, point) {
  const worldY = BOARD_SURFACE.centerY + BOARD_SURFACE.heightY / 2 - point.y * BOARD_SURFACE.heightY;
  const worldZ = BOARD_SURFACE.centerZ + BOARD_SURFACE.widthZ / 2 - point.x * BOARD_SURFACE.widthZ;
  return view.worldToScreen(worldY, worldZ);
}

function cloneProjectorPolygon(polygon) {
  return (polygon || []).map((point) => ({ x: point.x, y: point.y }));
}

function distanceToSegment(point, a, b) {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const apx = point.x - a.x;
  const apy = point.y - a.y;
  const mag = abx * abx + aby * aby || 1;
  const t = clamp((apx * abx + apy * aby) / mag, 0, 1);
  const closest = {
    x: a.x + abx * t,
    y: a.y + aby * t,
  };
  return Math.hypot(point.x - closest.x, point.y - closest.y);
}

function rectFromPoints(a, b) {
  return {
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    w: Math.abs(b.x - a.x),
    h: Math.abs(b.y - a.y),
  };
}

function centroid(points) {
  if (!points.length) return { x: 0, y: 0 };
  const total = points.reduce((sum, point) => ({
    x: sum.x + point.x,
    y: sum.y + point.y,
  }), { x: 0, y: 0 });
  return { x: total.x / points.length, y: total.y / points.length };
}

function triangle(ctx, x, y, angle, color) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(0, -12);
  ctx.lineTo(8, 10);
  ctx.lineTo(-8, 10);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function label(ctx, text, x, y) {
  ctx.fillStyle = "rgba(245,239,226,.58)";
  ctx.font = "9px IBM Plex Mono, monospace";
  ctx.fillText(String(text).toUpperCase(), x, y);
}

function line(ctx, x1, y1, x2, y2) {
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}
