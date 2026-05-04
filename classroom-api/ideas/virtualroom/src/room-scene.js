import * as THREE from "three";
import { ROOM, TABLE } from "./conventions.js";
import { aimMinusZAt } from "./orientation.js";
import { applyHomography, projectorMappingForPolygon, normalizedProjectionPolygon } from "./projection-mapping.js";

export const BOARD_TARGET = Object.freeze({
  x: -ROOM.halfX + 0.02,
  y: 1.3,
  z: 0,
});

export const BOARD_SURFACE = Object.freeze({
  centerX: -ROOM.halfX + 0.014,
  centerY: 1.2,
  centerZ: 0,
  widthZ: 4.6,
  heightY: 2.4,
});

export const CLASSROOM_SCREEN = Object.freeze({
  centerX: 0,
  centerY: 1.58,
  centerZ: -ROOM.depthZ + 0.018,
  widthX: 2.55,
  heightY: 1.44,
});

export const DEFAULT_PROJECTOR_POLYGON = Object.freeze([
  { x: 0.04, y: 0.06 },
  { x: 0.96, y: 0.06 },
  { x: 0.96, y: 0.94 },
  { x: 0.04, y: 0.94 },
]);

const PROJECTOR_LENS_Y = 1.18;
const PROJECTOR_LENS_Z = 0;

export const PROJECTOR_PRESETS = Object.freeze([
  {
    id: "epson-co-fh02",
    label: "Epson CO-FH02",
    model: "EpiqVision Flex CO-FH02",
    nativeResolution: { width: 1920, height: 1080 },
    brightnessLumens: 3000,
    aspect: 16 / 9,
    throwRatio: 1.19,
    throwRatioRange: [1.19, 1.61],
    source: "Epson official specs: 3000 lumens, 1080p, throw ratio 1.19-1.61:1",
  },
  {
    id: "aaxa-p6",
    label: "AAXA P6 Ultimate",
    model: "HP-P6U-01 1100 Lumen WXGA DLP",
    nativeResolution: { width: 1280, height: 800 },
    brightnessLumens: 1100,
    brightnessBatteryLumens: 500,
    batteryMah: 20000,
    batteryRuntimeHours: 6,
    aspect: 16 / 10,
    throwRatio: 1.2,
    throwRatioRange: [1.2, 1.2],
    source: "AAXA official specs: 600 lumens, WXGA, throw ratio 1.2:1",
  },
]);

export function createRoomScene({ tableConfig } = {}) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x050608);
  scene.fog = new THREE.Fog(0x050608, 6, 18);

  const lights = createLights();
  Object.values(lights).forEach((light) => scene.add(light));

  const floor = createFloor();
  const walls = createWalls();
  const windows = createWindows();
  const table = createTables();
  const whiteboard = createWhiteboard();
  const classroomScreen = createClassroomScreen();
  const projectors = createProjectors();
  const coverage = createCoverageLayer();

  scene.add(floor);
  walls.forEach((wall) => scene.add(wall));
  scene.add(windows);
  // Table kept in the scene model for reference, but disabled for the
  // current board-only demo.
  // scene.add(table.group);
  scene.add(whiteboard.group);
  scene.add(classroomScreen.group);
  scene.add(projectors.group);
  scene.add(coverage.group);

  return { scene, lights, table, whiteboard, classroomScreen, projectors, coverage, floor, walls, windows, tableConfig };
}

function createLights() {
  const ambient = new THREE.AmbientLight(0x60606a, 0.55);
  const key = new THREE.DirectionalLight(0xffd8a6, 0.7);
  key.position.set(1.8, 2.7, 2.0);
  const fill = new THREE.DirectionalLight(0x9fb9d8, 0.28);
  fill.position.set(-2.5, 1.8, -1.8);
  const clerestory = new THREE.DirectionalLight(0xffffff, 0.25);
  clerestory.position.set(-2.8, 2.9, -0.8);
  return { ambient, key, fill, clerestory };
}

function createFloor() {
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(ROOM.halfX * 2, ROOM.depthZ * 2),
    new THREE.MeshStandardMaterial({ color: 0x17191d, roughness: 0.82 }),
  );
  mesh.rotation.x = -Math.PI / 2;
  mesh.userData = { selectable: true, kind: "floor", label: "Floor" };
  return mesh;
}

function createWalls() {
  const material = new THREE.MeshStandardMaterial({ color: 0x101218, roughness: 0.9, side: THREE.DoubleSide });
  const back = new THREE.Mesh(new THREE.PlaneGeometry(ROOM.halfX * 2, ROOM.height), material);
  back.position.set(0, ROOM.height / 2, -ROOM.depthZ);

  const left = new THREE.Mesh(new THREE.PlaneGeometry(ROOM.depthZ * 2, ROOM.height), material);
  left.rotation.y = Math.PI / 2;
  left.position.set(-ROOM.halfX, ROOM.height / 2, 0);

  const right = new THREE.Mesh(new THREE.PlaneGeometry(ROOM.depthZ * 2, ROOM.height), material);
  right.rotation.y = -Math.PI / 2;
  right.position.set(ROOM.halfX, ROOM.height / 2, 0);

  return [back, left, right];
}

function createTables() {
  const group = new THREE.Group();
  group.userData = { selectable: true, kind: "table", label: "Legacy Marker Sandbox" };
  const mat = new THREE.MeshStandardMaterial({ color: 0x20252c, roughness: 0.72 });
  const edgeMat = new THREE.MeshStandardMaterial({ color: 0x0f1216, roughness: 0.78 });
  const halfDepth = TABLE.depthZ / 2;
  for (const z of [-halfDepth / 2, halfDepth / 2]) {
    const top = new THREE.Mesh(new THREE.BoxGeometry(TABLE.widthX, 0.035, halfDepth - 0.025), mat);
    top.position.set(0, TABLE.surfaceY, z);
    top.userData = { selectable: true, kind: "table", label: "Legacy Marker Sandbox", parent: group };
    group.add(top);
    const base = new THREE.Mesh(new THREE.BoxGeometry(TABLE.widthX, 0.035, 0.025), edgeMat);
    base.position.set(0, TABLE.surfaceY - 0.04, z);
    group.add(base);
  }
  return { group, surfaceY: TABLE.surfaceY, widthX: TABLE.widthX, depthZ: TABLE.depthZ };
}

function createWhiteboard() {
  const group = new THREE.Group();
  const x = BOARD_SURFACE.centerX;
  const boardWidth = BOARD_SURFACE.widthZ;
  const boardHeight = BOARD_SURFACE.heightY;
  const boardCenterY = BOARD_SURFACE.centerY;
  const board = new THREE.Mesh(
    new THREE.PlaneGeometry(boardWidth, boardHeight),
    new THREE.MeshStandardMaterial({ color: 0xe9edf0, roughness: 0.48 }),
  );
  board.rotation.y = Math.PI / 2;
  board.position.set(x, boardCenterY, 0);
  board.userData = { selectable: true, kind: "whiteboard", label: "Whiteboard", parent: group };
  group.add(board);

  const captureMaterial = new THREE.MeshBasicMaterial({ color: 0x93c5fd, transparent: true, opacity: 0.08, side: THREE.DoubleSide });
  const capture = new THREE.Mesh(new THREE.PlaneGeometry(boardWidth - 0.36, boardHeight - 0.28), captureMaterial);
  capture.rotation.y = Math.PI / 2;
  capture.position.set(x + 0.004, boardCenterY, 0);
  capture.userData = { kind: "capture-area", label: "Whiteboard Capture Area", parent: group };
  group.add(capture);

  const projectionCanvas = document.createElement("canvas");
  projectionCanvas.width = 1536;
  projectionCanvas.height = 800;
  const projectionTexture = new THREE.CanvasTexture(projectionCanvas);
  projectionTexture.colorSpace = THREE.SRGBColorSpace;
  const projectionGeometry = createProjectionPolygonGeometry(boardWidth, boardHeight, DEFAULT_PROJECTOR_POLYGON);
  const projection = new THREE.Mesh(
    projectionGeometry,
    new THREE.MeshBasicMaterial({
      map: projectionTexture,
      transparent: true,
      opacity: 0.98,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
  );
  projection.rotation.y = Math.PI / 2;
  projection.position.set(x + 0.01, boardCenterY, 0);
  projection.renderOrder = 7;
  projection.userData = { kind: "board-projection", label: "Board Projection Layer", parent: group };
  group.add(projection);

  const calibrationTags = [
    { tagId: 4, x: 0.12, y: 0.12 },
    { tagId: 5, x: 0.88, y: 0.12 },
    { tagId: 6, x: 0.88, y: 0.88 },
    { tagId: 7, x: 0.12, y: 0.88 },
  ];
  calibrationTags.forEach((tag) => {
    const marker = new THREE.Mesh(
      new THREE.PlaneGeometry(0.16, 0.16),
      new THREE.MeshBasicMaterial({
        map: makeCalibrationTagTexture(tag.tagId),
        side: THREE.DoubleSide,
        depthTest: false,
        depthWrite: false,
      }),
    );
    marker.rotation.y = Math.PI / 2;
    marker.position.set(
      x + 0.024,
      boardCenterY + boardHeight / 2 - tag.y * boardHeight,
      BOARD_SURFACE.centerZ + boardWidth / 2 - tag.x * boardWidth,
    );
    marker.renderOrder = 40;
    marker.userData = { parent: group, kind: "calibration-tag", label: `Board tag ${tag.tagId}` };
    group.add(marker);
  });

  group.userData = { selectable: true, kind: "whiteboard", label: "Whiteboard" };
  return {
    group,
    board,
    capture,
    projection,
    projectionCanvas,
    projectionTexture,
    setProjectionPolygon: (polygon) => updateProjectionPolygon(projectionGeometry, polygon, boardWidth, boardHeight),
  };
}

function createClassroomScreen() {
  const group = new THREE.Group();
  const canvas = document.createElement("canvas");
  canvas.width = 768;
  canvas.height = 480;
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const screen = new THREE.Mesh(
    new THREE.PlaneGeometry(CLASSROOM_SCREEN.widthX, CLASSROOM_SCREEN.heightY),
    new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide }),
  );
  screen.position.set(CLASSROOM_SCREEN.centerX, CLASSROOM_SCREEN.centerY, CLASSROOM_SCREEN.centerZ);
  screen.userData = { selectable: true, kind: "classroom-screen", label: "Classroom Projector Screen", parent: group };
  group.add(screen);

  const frame = new THREE.Mesh(
    new THREE.PlaneGeometry(CLASSROOM_SCREEN.widthX + 0.06, CLASSROOM_SCREEN.heightY + 0.05),
    new THREE.MeshBasicMaterial({ color: 0x0b0d11, side: THREE.DoubleSide }),
  );
  frame.position.set(CLASSROOM_SCREEN.centerX, CLASSROOM_SCREEN.centerY, CLASSROOM_SCREEN.centerZ - 0.004);
  frame.renderOrder = -1;
  group.add(frame);

  group.userData = { selectable: true, kind: "classroom-screen", label: "Classroom Projector Screen" };
  renderClassroomScreen(canvas, texture, {
    eyebrow: "WHITEBOARD STATUS",
    title: "ROOM READY",
    status: "Waiting for board actions.",
    lines: ["Add a Slide tag, then place Action on left/right to change slides."],
  });
  return {
    group,
    screen,
    canvas,
    texture,
    render: (summary) => renderClassroomScreen(canvas, texture, summary),
  };
}

function renderClassroomScreen(canvas, texture, summary = {}) {
  const ctx = canvas.getContext("2d");
  const lines = Array.isArray(summary.lines) ? summary.lines : [];
  ctx.fillStyle = summary.background || "#f4f0e6";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = summary.accent || "#7fbcd2";
  ctx.fillRect(0, 0, canvas.width, 14);
  ctx.fillStyle = "#40515e";
  ctx.font = "16px IBM Plex Mono, monospace";
  ctx.fillText(String(summary.eyebrow || "CLASSROOM PROJECTOR").toUpperCase().slice(0, 54), 38, 48);

  ctx.fillStyle = "#101218";
  ctx.font = "38px IBM Plex Sans, sans-serif";
  ctx.fillText(String(summary.title || "CLASSROOM SCREEN").slice(0, 34), 36, 94);

  if (summary.slideCount) {
    ctx.fillStyle = "#101218";
    ctx.font = "16px IBM Plex Mono, monospace";
    ctx.fillText(`SLIDE ${Number(summary.slideIndex || 0) + 1}/${summary.slideCount}`, canvas.width - 164, 48);
  }

  if (summary.status) {
    ctx.fillStyle = "#101218";
    ctx.font = "22px IBM Plex Sans, sans-serif";
    ctx.fillText(String(summary.status).slice(0, 48), 38, 136);
  }

  ctx.fillStyle = "#40515e";
  ctx.font = "19px IBM Plex Mono, monospace";
  lines.slice(0, 7).forEach((line, index) => {
    ctx.fillText(String(line).slice(0, 58), 40, 188 + index * 36);
  });
  texture.needsUpdate = true;
}

function makeCalibrationTagTexture(tagId) {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, 256, 256);
  drawTagPattern(ctx, tagId, 28, 28, 200);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function drawTagPattern(ctx, tagId, x, y, size) {
  ctx.fillStyle = "#050505";
  ctx.fillRect(x - 14, y - 14, size + 28, size + 28);
  ctx.fillStyle = "#ffffff";
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

function createProjectionPolygonGeometry(boardWidth, boardHeight, polygon) {
  const geometry = new THREE.BufferGeometry();
  updateProjectionPolygon(geometry, polygon, boardWidth, boardHeight);
  return geometry;
}

function updateProjectionPolygon(geometry, polygon = DEFAULT_PROJECTOR_POLYGON, boardWidth, boardHeight) {
  const points = normalizedProjectionPolygon(polygon, DEFAULT_PROJECTOR_POLYGON);
  const mapping = projectorMappingForPolygon(points, DEFAULT_PROJECTOR_POLYGON);
  const positions = [];
  const uvs = [];
  const indices = [];
  points.forEach((point) => {
    const x = clamp01(point.x);
    const y = clamp01(point.y);
    positions.push(
      -boardWidth / 2 + x * boardWidth,
      boardHeight / 2 - y * boardHeight,
      0,
    );
    let projector = { x, y };
    try {
      projector = applyHomography(mapping.projectorToSurface, { x, y });
    } catch {
      projector = { x, y };
    }
    uvs.push(clamp01(projector.x), 1 - clamp01(projector.y));
  });
  for (let index = 1; index < points.length - 1; index += 1) {
    indices.push(0, index, index + 1);
  }
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
}

function clamp01(value) {
  return Math.max(0, Math.min(1, Number(value) || 0));
}

function disposeObject(object) {
  object.traverse((child) => {
    child.geometry?.dispose?.();
    const materials = Array.isArray(child.material) ? child.material : [child.material];
    materials.filter(Boolean).forEach((material) => {
      material.map?.dispose?.();
      material.dispose?.();
    });
  });
}

function createWindows() {
  const group = new THREE.Group();
  const frameMat = new THREE.MeshBasicMaterial({ color: 0x25313b, side: THREE.DoubleSide });
  const glassMat = new THREE.MeshBasicMaterial({ color: 0x7fbcd2, transparent: true, opacity: 0.24, side: THREE.DoubleSide });
  const x = -ROOM.halfX + 0.02;
  const y = 2.78;
  const width = ROOM.depthZ * 2;
  const height = 0.28;
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(width, height), glassMat);
  glass.rotation.y = Math.PI / 2;
  glass.position.set(x, y, 0);
  group.add(glass);

  for (const z of [-ROOM.depthZ, -1.5, 0, 1.5, ROOM.depthZ]) {
    const mullion = new THREE.Mesh(new THREE.PlaneGeometry(0.018, height + 0.06), frameMat);
    mullion.rotation.y = Math.PI / 2;
    mullion.position.set(x + 0.004, y, z);
    group.add(mullion);
  }
  for (const yy of [y - height / 2, y + height / 2]) {
    const rail = new THREE.Mesh(new THREE.PlaneGeometry(width, 0.018), frameMat);
    rail.rotation.y = Math.PI / 2;
    rail.position.set(x + 0.005, yy, 0);
    group.add(rail);
  }
  group.userData = { kind: "windows", label: "Clerestory Windows" };
  return group;
}


function createProjectors() {
  const group = new THREE.Group();
  const material = new THREE.MeshStandardMaterial({ color: 0x11161d, roughness: 0.48, metalness: 0.2 });
  const wall = createProjectorMesh("Projector", material);
  const classroom = createProjectorMesh("Projector - Classroom Christie", material);
  classroom.position.set(0, 2.72, 1.35);
  aimMinusZAt(classroom, new THREE.Vector3(CLASSROOM_SCREEN.centerX, CLASSROOM_SCREEN.centerY, CLASSROOM_SCREEN.centerZ));
  const classroomEffect = createProjectionEffect({
    label: "Classroom Screen Projection",
    color: 0xf4f0e6,
    origin: classroom.position.clone(),
    target: new THREE.Vector3(CLASSROOM_SCREEN.centerX, CLASSROOM_SCREEN.centerY, CLASSROOM_SCREEN.centerZ + 0.01),
    spread: 1.05,
    opacity: 0.08,
  });
  let activePreset = null;
  let activeEffect = null;
  const api = {
    group,
    wall,
    classroom,
    effects: [],
    presets: PROJECTOR_PRESETS,
    getActivePreset: () => activePreset,
    setActivePreset,
  };

  group.add(wall, classroom, classroomEffect.group);
  setActivePreset(PROJECTOR_PRESETS[0].id);
  return api;

  function setActivePreset(id) {
    const preset = PROJECTOR_PRESETS.find((candidate) => candidate.id === id) || PROJECTOR_PRESETS[0];
    activePreset = preset;
    wall.userData.label = `Projector - ${preset.label}`;
    wall.userData.projectorPreset = preset;
    wall.position.copy(projectorPositionForPreset(preset));
    aimMinusZAt(wall, new THREE.Vector3(BOARD_TARGET.x, BOARD_TARGET.y, BOARD_TARGET.z));

    if (activeEffect) {
      group.remove(activeEffect.group);
      disposeObject(activeEffect.group);
    }
    activeEffect = createProjectionEffect(projectorEffectConfig(preset, wall.position));
    api.effects.splice(0, api.effects.length, activeEffect);
    group.add(activeEffect.group);
    return activePreset;
  }
}

function projectorPositionForPreset(preset) {
  const distance = BOARD_SURFACE.widthZ * preset.throwRatio;
  return new THREE.Vector3(
    Math.min(ROOM.halfX - 0.14, BOARD_SURFACE.centerX + distance),
    PROJECTOR_LENS_Y,
    PROJECTOR_LENS_Z,
  );
}

function projectorEffectConfig(preset, origin) {
  const target = new THREE.Vector3(BOARD_TARGET.x + 0.01, BOARD_TARGET.y, BOARD_TARGET.z);
  const opticalWidth = Math.min(BOARD_SURFACE.widthZ, origin.distanceTo(target) / preset.throwRatio);
  const opticalHeight = opticalWidth / preset.aspect;
  return {
    label: `${preset.label} Board Projection`,
    color: preset.id === "aaxa-p6" ? 0xffb360 : 0x7fbcd2,
    origin: origin.clone(),
    target,
    spread: Math.hypot(opticalWidth, opticalHeight) / 2,
    opacity: preset.id === "aaxa-p6" ? 0.11 : 0.14,
  };
}

function createProjectorMesh(label, material) {
  const group = new THREE.Group();
  group.userData = { selectable: true, kind: "projector", label };
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.09, 0.16), material);
  body.position.z = 0.025;
  body.userData.parent = group;
  group.add(body);
  const lens = new THREE.Mesh(
    new THREE.CylinderGeometry(0.035, 0.045, 0.055, 24),
    new THREE.MeshStandardMaterial({ color: 0x05070a, roughness: 0.3, metalness: 0.7 }),
  );
  lens.rotation.x = Math.PI / 2;
  lens.position.z = -0.07;
  lens.userData.parent = group;
  group.add(lens);
  return group;
}

function createCoverageLayer() {
  const group = new THREE.Group();
  group.visible = false;
  group.userData = { kind: "coverage", label: "Camera Coverage" };
  return { group };
}

function createProjectionEffect({ label, color, origin, target, spread, opacity }) {
  const group = new THREE.Group();
  group.userData = { kind: "projection", label };

  const beamRoot = new THREE.Group();
  beamRoot.position.copy(origin);
  aimMinusZAt(beamRoot, target.clone());
  const length = origin.distanceTo(target);

  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(0.028, spread, length, 28, 1, true),
    new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  );
  beam.rotation.x = Math.PI / 2;
  beam.position.z = -length / 2;
  beam.renderOrder = 6;
  beamRoot.add(beam);

  group.add(beamRoot);

  return { group, beam };
}
