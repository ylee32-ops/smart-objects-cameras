import * as THREE from "three";
import { ROLE_COLORS, ROLE_LABELS, ROLE_START_TAGS, TABLE } from "./conventions.js";
import { BOARD_SURFACE } from "./room-scene.js";

const BOARD_MARKER_OFFSET = 0.018;
const LIVE_MARKER_SMOOTHING_MS = 115;
const LIVE_MARKER_POSITION_EPSILON = 0.000001;
const LIVE_MARKER_ANGLE_EPSILON = 0.002;

export class MarkerManager {
  constructor({ scene, table, tagMap, onChange }) {
    this.scene = scene;
    this.table = table;
    this.tagMap = tagMap;
    this.onChange = onChange || (() => {});
    this.markers = [];
    this.usedTagIds = new Set();
    this.drag = null;
    this.enabled = true;
    this.raycaster = new THREE.Raycaster();
    this.ndc = new THREE.Vector2();
    this.defaultSurface = "board";
    this.lastMotionUpdateAt = now();
  }

  add({ role, surface = this.defaultSurface, u = null, v = null, x = 0, z = 0, rotY = 0, angle = null, locked = false, tagId = null, label = null, color = null }) {
    const markerTagId = tagId === null || tagId === undefined ? this.nextTagId(role) : this.reserveTagId(tagId);
    const group = new THREE.Group();
    group.userData = {
      tagId: markerTagId,
      role,
      kind: "marker",
      label: label || ROLE_LABELS[role] || role,
      card: null,
      bounds: { w: 0.14, h: 0.14 },
      selectable: true,
      surface,
      angle: Number.isFinite(Number(angle)) ? Number(angle) : rotY,
      locked: Boolean(locked),
      color: color || ROLE_COLORS[role] || "#ffffff",
    };

    const mount = new THREE.Group();
    if (surface === "board") mount.rotation.y = Math.PI / 2;
    else mount.rotation.x = -Math.PI / 2;
    mount.userData.parent = group;
    group.userData.mount = mount;
    group.add(mount);

    const card = new THREE.Mesh(
      new THREE.PlaneGeometry(group.userData.bounds.w, group.userData.bounds.h),
      new THREE.MeshStandardMaterial({
        map: makeCardTexture(markerTagId, role),
        roughness: 0.82,
        side: THREE.DoubleSide,
        polygonOffset: true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -2,
      }),
    );
    card.renderOrder = 20;
    card.rotation.z = group.userData.angle;
    card.userData.parent = group;
    card.userData.kind = "marker-card";
    group.userData.card = card;

    const pulsePlate = new THREE.Mesh(
      new THREE.PlaneGeometry(group.userData.bounds.w * 1.34, group.userData.bounds.h * 1.34),
      new THREE.MeshBasicMaterial({
        color: ROLE_COLORS[role] || "#ffffff",
        transparent: true,
        opacity: 0,
        depthWrite: false,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
      }),
    );
    pulsePlate.position.z = -0.004;
    pulsePlate.renderOrder = 18;
    pulsePlate.userData.parent = group;
    pulsePlate.userData.kind = "marker-pulse";
    pulsePlate.raycast = () => {};
    group.userData.pulsePlate = pulsePlate;
    mount.add(pulsePlate);

    const pulseBorder = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.PlaneGeometry(group.userData.bounds.w * 1.12, group.userData.bounds.h * 1.12)),
      new THREE.LineBasicMaterial({
        color: ROLE_COLORS[role] || "#ffffff",
        transparent: true,
        opacity: 0,
      }),
    );
    pulseBorder.position.z = 0.006;
    pulseBorder.renderOrder = 24;
    pulseBorder.userData.parent = group;
    pulseBorder.userData.kind = "marker-pulse-border";
    pulseBorder.raycast = () => {};
    group.userData.pulseBorder = pulseBorder;
    mount.add(pulseBorder);

    mount.add(card);

    const point = surface === "board"
      ? normalizedBoardPoint({ u, v })
      : normalizedTablePoint({ x, z });
    this.applySurfacePoint(group, point, group.userData.angle);

    this.scene.add(group);
    this.markers.push(group);
    this.pulse(group, { duration: 650, intensity: 0.85 });
    this.onChange();
    return group;
  }

  remove(marker) {
    const i = this.markers.indexOf(marker);
    if (i >= 0) this.markers.splice(i, 1);
    this.usedTagIds.delete(marker.userData.tagId);
    this.scene.remove(marker);
    marker.traverse((object) => {
      object.geometry?.dispose?.();
      if (object.material?.map) object.material.map.dispose();
      object.material?.dispose?.();
    });
    this.onChange();
  }

  list() {
    return [...this.markers];
  }

  attachInteraction({ domElement, camera }) {
    this.domElement = domElement;
    this.camera = camera;

    domElement.addEventListener("pointerdown", (event) => {
      if (event.button !== 0) return;
      if (!this.enabled) return;
      const marker = this.pickMarker(event);
      if (!marker) return;
      claimPointerEvent(event);
      if (marker.userData.locked) {
        this.activeMarker = marker;
        this.setOrbitEnabled(false);
        this.drag = { marker: null, locked: true };
        return;
      }
      this.startDrag(marker, event);
      this.domElement.setPointerCapture?.(event.pointerId);
    }, { capture: true });

    domElement.addEventListener("pointermove", (event) => {
      if (!this.enabled || !this.drag) return;
      if (this.drag.locked) return;
      claimPointerEvent(event);
      const point = this.pointerToSurface(event, this.drag.marker);
      if (!point) return;
      const marker = this.drag.marker;
      this.applyDragPoint(marker, point, this.drag.offset);
      this.pulseMove(marker);
      this.onChange();
    });

    domElement.addEventListener("pointerup", (event) => {
      if (this.drag) {
        claimPointerEvent(event);
        if (this.drag.marker) {
          this.drag.marker.userData.dragging = false;
          this.pulse(this.drag.marker, { duration: 520, intensity: 0.75 });
        }
        this.setOrbitEnabled(true);
        this.drag = null;
        this.onChange();
      }
    });

    domElement.addEventListener("pointercancel", (event) => {
      if (this.drag) {
        claimPointerEvent(event);
        if (this.drag.marker) this.drag.marker.userData.dragging = false;
        this.setOrbitEnabled(true);
        this.drag = null;
        this.onChange();
      }
    });

    domElement.addEventListener("wheel", (event) => {
      const marker = this.pickMarker(event);
      if (!this.enabled) return;
      if (!marker) return;
      if (this.activeMarker !== marker) return;
      if (marker.userData.locked) return;
      event.preventDefault();
      marker.userData.angle += (event.shiftKey ? 0.05 : 0.12) * Math.sign(event.deltaY);
      if (marker.userData.card) marker.userData.card.rotation.z = marker.userData.angle;
      if (marker.userData.pulsePlate) marker.userData.pulsePlate.rotation.z = marker.userData.angle;
      if (marker.userData.pulseBorder) marker.userData.pulseBorder.rotation.z = marker.userData.angle;
      this.pulse(marker, { duration: 520, intensity: 0.9 });
      this.onChange();
    }, { passive: false });

    domElement.addEventListener("dblclick", (event) => {
      const marker = this.pickMarker(event);
      if (!this.enabled) return;
      if (marker?.userData?.locked) return;
      if (marker) this.remove(marker);
    });
  }

  nextTagId(role) {
    const start = roleStartFromMap(this.tagMap, role) ?? ROLE_START_TAGS[role] ?? 90;
    let id = start;
    if (this.usedTagIds.has(id)) {
      id = Math.max(40, start + 1);
      const reserved = reservedTagIds(this.tagMap);
      while (this.usedTagIds.has(id) || reserved.has(id)) id += 1;
    }
    this.usedTagIds.add(id);
    return id;
  }

  reserveTagId(tagId) {
    const numeric = Number(tagId);
    const id = Number.isFinite(numeric) ? numeric : String(tagId);
    this.usedTagIds.add(id);
    return id;
  }

  pickMarker(event) {
    if (!this.camera || !this.domElement) return null;
    this.updateNdc(event);
    this.raycaster.setFromCamera(this.ndc, this.camera);
    const hits = this.raycaster.intersectObjects(this.markers, true);
    for (const hit of hits) {
      if (hit.object.userData?.kind !== "marker-card") continue;
      const marker = findMarkerAncestor(hit.object);
      if (marker) return marker;
    }
    return null;
  }

  pointerToSurface(event, marker) {
    this.updateNdc(event);
    this.raycaster.setFromCamera(this.ndc, this.camera);
    const plane = planeForSurface(marker?.userData?.surface || this.defaultSurface);
    const target = new THREE.Vector3();
    if (this.raycaster.ray.intersectPlane(plane, target)) return target;
    return null;
  }

  updateNdc(event) {
    const rect = this.domElement.getBoundingClientRect();
    this.ndc.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.ndc.y = -(((event.clientY - rect.top) / rect.height) * 2 - 1);
  }

  startDrag(marker, event) {
    // Markers use direct drag, not TransformControls; see anti-patterns.md #8.
    this.activeMarker = marker;
    this.setOrbitEnabled(false);
    marker.userData.dragging = true;
    this.pulse(marker, { duration: 520, intensity: 0.8 });
    const point = this.pointerToSurface(event, marker);
    const offset = point
      ? {
        x: point.x - marker.position.x,
        y: point.y - marker.position.y,
        z: point.z - marker.position.z,
      }
      : { x: 0, y: 0, z: 0 };
    this.drag = { marker, offset };
  }

  setOrbitEnabled(enabled) {
    if (this.orbit) this.orbit.enabled = enabled;
  }

  setEnabled(enabled) {
    this.enabled = enabled;
    if (!enabled && this.drag) {
      this.setOrbitEnabled(true);
      this.drag = null;
    }
  }

  pulse(marker, options = {}) {
    if (!marker?.userData?.pulsePlate) return;
    const nowMs = now();
    const color = options.color || ROLE_COLORS[marker.userData.role] || "#ffffff";
    marker.userData.pulseStartedAt = nowMs;
    marker.userData.pulseUntil = nowMs + Number(options.duration || 520);
    marker.userData.pulseIntensity = Number(options.intensity || 1);
    marker.userData.pulsePlate.material.color.set(color);
    marker.userData.pulseBorder?.material?.color?.set(color);
  }

  pulseRole(role, options = {}) {
    this.markers
      .filter((marker) => marker.userData.role === role)
      .forEach((marker) => this.pulse(marker, options));
  }

  pulseMove(marker) {
    const nowMs = now();
    if (nowMs - Number(marker.userData.lastMovePulseAt || 0) < 110) return;
    marker.userData.lastMovePulseAt = nowMs;
    this.pulse(marker, { duration: 430, intensity: 0.65 });
  }

  updatePulses(time = now()) {
    this.markers.forEach((marker) => {
      const plate = marker.userData.pulsePlate;
      const border = marker.userData.pulseBorder;
      if (!plate || !border) return;
      if (marker.userData.dragging) {
        plate.material.opacity = 0.22;
        border.material.opacity = 0.9;
        plate.scale.setScalar(1.12);
        border.scale.setScalar(1.06);
        return;
      }
      const started = Number(marker.userData.pulseStartedAt || 0);
      const until = Number(marker.userData.pulseUntil || 0);
      if (!until || time >= until) {
        plate.material.opacity = 0;
        border.material.opacity = 0;
        plate.scale.setScalar(1);
        border.scale.setScalar(1);
        return;
      }
      const duration = Math.max(1, until - started);
      const progress = clamp((time - started) / duration, 0, 1);
      const wave = Math.sin(progress * Math.PI);
      const intensity = Number(marker.userData.pulseIntensity || 1);
      plate.material.opacity = wave * 0.28 * intensity;
      border.material.opacity = wave * 0.95 * intensity;
      const scale = 1 + wave * 0.26 * intensity;
      plate.scale.setScalar(scale);
      border.scale.setScalar(1 + wave * 0.14 * intensity);
    });
  }

  markerByTagId(tagId) {
    const asString = String(tagId);
    return this.markers.find((marker) => String(marker.userData.tagId) === asString) || null;
  }

  markerAngle(marker) {
    return Number(marker?.userData?.angle || 0);
  }

  surfacePointForMarker(marker) {
    return worldToSurfacePoint(marker.userData.surface || "table", marker.position);
  }

  markerWorldCorners(marker) {
    const bounds = marker.userData.bounds || { w: 0.14, h: 0.14 };
    const card = marker.userData.card;
    if (!card) return [];
    const corners = [
      new THREE.Vector3(-bounds.w / 2, bounds.h / 2, 0),
      new THREE.Vector3(bounds.w / 2, bounds.h / 2, 0),
      new THREE.Vector3(bounds.w / 2, -bounds.h / 2, 0),
      new THREE.Vector3(-bounds.w / 2, -bounds.h / 2, 0),
    ];
    return corners.map((corner) => card.localToWorld(corner.clone()));
  }

  applySurfacePoint(marker, point, angle = marker.userData.angle) {
    const normalized = {
      x: clamp(point.x, 0, 1),
      y: clamp(point.y, 0, 1),
    };
    const world = surfacePointToWorld(marker.userData.surface || "table", normalized);
    marker.position.copy(world);
    marker.userData.surfacePoint = normalized;
    marker.userData.smoothTarget = null;
    this.applyMarkerAngle(marker, angle);
  }

  applyMarkerAngle(marker, angle = marker.userData.angle) {
    marker.userData.angle = Number.isFinite(Number(angle)) ? Number(angle) : 0;
    if (marker.userData.card) marker.userData.card.rotation.z = marker.userData.angle;
    if (marker.userData.pulsePlate) marker.userData.pulsePlate.rotation.z = marker.userData.angle;
    if (marker.userData.pulseBorder) marker.userData.pulseBorder.rotation.z = marker.userData.angle;
  }

  smoothSurfacePoint(marker, point, angle = marker.userData.angle) {
    const normalized = {
      x: clamp(point.x, 0, 1),
      y: clamp(point.y, 0, 1),
    };
    marker.userData.smoothTarget = {
      point: normalized,
      world: surfacePointToWorld(marker.userData.surface || "table", normalized),
      angle: Number.isFinite(Number(angle)) ? Number(angle) : this.markerAngle(marker),
    };
  }

  updateMotion(time = now()) {
    const dt = clamp(time - this.lastMotionUpdateAt, 0, 80);
    this.lastMotionUpdateAt = time;
    const alpha = dt <= 0 ? 1 : 1 - Math.exp(-dt / LIVE_MARKER_SMOOTHING_MS);
    let active = false;

    this.markers.forEach((marker) => {
      const target = marker.userData.smoothTarget;
      if (!target?.world) return;
      marker.position.lerp(target.world, alpha);
      marker.userData.surfacePoint = worldToSurfacePoint(marker.userData.surface || "table", marker.position);

      const currentAngle = this.markerAngle(marker);
      const angle = currentAngle + shortestAngleDelta(currentAngle, target.angle) * alpha;
      this.applyMarkerAngle(marker, angle);

      const positionDone = marker.position.distanceToSquared(target.world) <= LIVE_MARKER_POSITION_EPSILON;
      const angleDone = Math.abs(shortestAngleDelta(this.markerAngle(marker), target.angle)) <= LIVE_MARKER_ANGLE_EPSILON;
      if (positionDone && angleDone) {
        marker.position.copy(target.world);
        marker.userData.surfacePoint = target.point;
        this.applyMarkerAngle(marker, target.angle);
        marker.userData.smoothTarget = null;
        return;
      }
      active = true;
    });

    return active;
  }

  syncTokens(tokens = [], options = {}) {
    const replace = options.replace === true;
    const incomingTagIds = new Set();
    let changed = false;
    tokens.forEach((token) => {
      const tagId = token.numericTagId ?? token.tagId ?? token.id;
      if (tagId === undefined || tagId === null || tagId === "") return;
      incomingTagIds.add(String(tagId));
      let marker = this.markerByTagId(tagId);
      if (!marker) {
        marker = this.add({
          tagId,
          role: token.role || token.kind || "tag",
          label: token.label || token.id || `Tag ${tagId}`,
          color: token.color,
          surface: token.surface || this.defaultSurface,
          u: Number(token.x || 0.5),
          v: Number(token.y || 0.5),
          angle: Number.isFinite(Number(token.angle)) ? Number(token.angle) : 0,
          locked: options.locked === true,
        });
        changed = true;
      }
      if (!marker) return;
      marker.userData.surface = token.surface || marker.userData.surface || this.defaultSurface;
      marker.userData.role = token.role || token.kind || marker.userData.role || "tag";
      marker.userData.label = token.label || marker.userData.label || `Tag ${tagId}`;
      marker.userData.color = token.color || marker.userData.color;
      const nextPoint = {
        x: Number(token.x || 0),
        y: Number(token.y || 0),
      };
      const next = surfacePointToWorld(marker.userData.surface || this.defaultSurface, nextPoint);
      const nextAngle = Number.isFinite(Number(token.angle)) ? Number(token.angle) : this.markerAngle(marker);
      const currentTarget = marker.userData.smoothTarget?.world || marker.position;
      const currentTargetAngle = marker.userData.smoothTarget
        ? marker.userData.smoothTarget.angle
        : this.markerAngle(marker);
      if (
        currentTarget.distanceToSquared(next) < 1e-8 &&
        Math.abs(shortestAngleDelta(currentTargetAngle, nextAngle)) < 1e-8
      ) {
        return;
      }
      if (options.smooth === false || marker.userData.dragging) {
        this.applySurfacePoint(marker, nextPoint, nextAngle);
      } else {
        this.smoothSurfacePoint(marker, nextPoint, nextAngle);
      }
      this.pulse(marker, { duration: 520, intensity: 0.75 });
      changed = true;
    });
    if (replace) {
      this.list().forEach((marker) => {
        if (incomingTagIds.has(String(marker.userData.tagId))) return;
        this.remove(marker);
        changed = true;
      });
    }
    if (changed) this.onChange();
  }

  applyDragPoint(marker, point, offset) {
    if ((marker.userData.surface || "table") === "board") {
      const z = clamp(
        point.z - offset.z,
        BOARD_SURFACE.centerZ - BOARD_SURFACE.widthZ / 2 + 0.08,
        BOARD_SURFACE.centerZ + BOARD_SURFACE.widthZ / 2 - 0.08,
      );
      const y = clamp(
        point.y - offset.y,
        BOARD_SURFACE.centerY - BOARD_SURFACE.heightY / 2 + 0.1,
        BOARD_SURFACE.centerY + BOARD_SURFACE.heightY / 2 - 0.1,
      );
      marker.position.set(BOARD_SURFACE.centerX + BOARD_MARKER_OFFSET, y, z);
      marker.userData.surfacePoint = worldToSurfacePoint("board", marker.position);
      return;
    }

    marker.position.x = clamp(point.x - offset.x, -TABLE.widthX / 2 + 0.06, TABLE.widthX / 2 - 0.06);
    marker.position.z = clamp(point.z - offset.z, -TABLE.depthZ / 2 + 0.06, TABLE.depthZ / 2 - 0.06);
    marker.position.y = TABLE.markerY;
    marker.userData.surfacePoint = worldToSurfacePoint("table", marker.position);
  }
}

export function surfacePointToWorld(surface, point) {
  if (surface === "board") {
    return new THREE.Vector3(
      BOARD_SURFACE.centerX + BOARD_MARKER_OFFSET,
      BOARD_SURFACE.centerY + BOARD_SURFACE.heightY / 2 - clamp(point.y, 0, 1) * BOARD_SURFACE.heightY,
      BOARD_SURFACE.centerZ + BOARD_SURFACE.widthZ / 2 - clamp(point.x, 0, 1) * BOARD_SURFACE.widthZ,
    );
  }

  return new THREE.Vector3(
    clamp(point.x, 0, 1) * TABLE.widthX - TABLE.widthX / 2,
    TABLE.markerY,
    clamp(point.y, 0, 1) * TABLE.depthZ - TABLE.depthZ / 2,
  );
}

export function worldToSurfacePoint(surface, world) {
  if (surface === "board") {
    return {
      x: clamp(((BOARD_SURFACE.centerZ + BOARD_SURFACE.widthZ / 2) - world.z) / BOARD_SURFACE.widthZ, 0, 1),
      y: clamp(((BOARD_SURFACE.centerY + BOARD_SURFACE.heightY / 2) - world.y) / BOARD_SURFACE.heightY, 0, 1),
    };
  }

  return {
    x: clamp((world.x + TABLE.widthX / 2) / TABLE.widthX, 0, 1),
    y: clamp((world.z + TABLE.depthZ / 2) / TABLE.depthZ, 0, 1),
  };
}

function normalizedTablePoint({ x = 0, z = 0 }) {
  return {
    x: clamp((x + TABLE.widthX / 2) / TABLE.widthX, 0, 1),
    y: clamp((z + TABLE.depthZ / 2) / TABLE.depthZ, 0, 1),
  };
}

function normalizedBoardPoint({ u = null, v = null }) {
  return {
    x: clamp(Number.isFinite(Number(u)) ? Number(u) : 0.5, 0, 1),
    y: clamp(Number.isFinite(Number(v)) ? Number(v) : 0.5, 0, 1),
  };
}

function planeForSurface(surface) {
  if (surface === "board") {
    return new THREE.Plane(new THREE.Vector3(1, 0, 0), -(BOARD_SURFACE.centerX + BOARD_MARKER_OFFSET));
  }
  return new THREE.Plane(new THREE.Vector3(0, 1, 0), -TABLE.dragY);
}

function roleStartFromMap(tagMap, role) {
  const objectTags = tagMap?.objectTags || {};
  const hit = Object.entries(objectTags).find(([, value]) => value.role === role);
  return hit ? Number(hit[0]) : null;
}

function reservedTagIds(tagMap) {
  return new Set([
    ...Object.keys(tagMap?.calibrationTags || {}),
    ...Object.keys(tagMap?.objectTags || {}),
  ].map((id) => Number(id)).filter(Number.isFinite));
}

function makeCardTexture(tagId, role) {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext("2d");
  drawSimulatedFiducial(ctx, tagId, 48, 48, 416);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function drawSimulatedFiducial(ctx, tagId, x, y, size) {
  ctx.fillStyle = "#050505";
  ctx.fillRect(x - 18, y - 18, size + 36, size + 36);
  ctx.fillStyle = "#fff";
  ctx.fillRect(x, y, size, size);
  const cells = 6;
  const cell = size / cells;
  let seed = tagId * 9301 + 17;
  for (let row = 0; row < cells; row += 1) {
    for (let col = 0; col < cells; col += 1) {
      seed = (seed * 1103515245 + 12345) >>> 0;
      if (row === 0 || col === 0 || row === cells - 1 || col === cells - 1 || seed % 3 === 0) {
        ctx.fillStyle = "#050505";
        ctx.fillRect(x + col * cell, y + row * cell, cell, cell);
      }
    }
  }
}

function findMarkerAncestor(object) {
  let current = object;
  while (current) {
    if (current.userData?.kind === "marker") return current;
    if (current.userData?.parent) return current.userData.parent;
    current = current.parent;
  }
  return null;
}

function claimPointerEvent(event) {
  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation?.();
}

function now() {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

function shortestAngleDelta(from, to) {
  return Math.atan2(Math.sin(to - from), Math.cos(to - from));
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}
