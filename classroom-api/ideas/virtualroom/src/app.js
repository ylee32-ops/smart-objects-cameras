import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

import { TABLE, ROLE_LABELS } from "./conventions.js";
import { BOARD_SURFACE, BOARD_TARGET, DEFAULT_PROJECTOR_POLYGON, createRoomScene } from "./room-scene.js";
import { aimAt, createCameraRig, CameraSwitcher } from "./cameras.js";
import { MarkerManager } from "./markers.js";
import { DetectionPipeline } from "./detections.js";
import * as server from "./server-client.js";
import { View2D } from "./views/view2d.js";
import { View3D } from "./views/view3d.js";
import { computeCameraCoverage, coverageGrid } from "./coverage.js";
import { CalibrationPanel } from "./calibration.js";
import { ReplayEngine } from "./replay.js";
import { applyHomography, projectorMappingForPolygon } from "./projection-mapping.js";

const sceneEl = document.getElementById("scene");
const povCanvas = document.getElementById("povCanvas");
const physicalCameraVideo = document.getElementById("physicalCameraVideo");
const detectionOverlay = document.getElementById("detectionOverlay");
const detList = document.getElementById("detList");
const detCount = document.getElementById("detCount");
const streamRate = document.getElementById("streamRate");
const serverStatus = document.getElementById("serverStatus");
const calibrationStatus = document.getElementById("calibrationStatus");
const streamBtn = document.getElementById("streamBtn");
const rateBadge = document.getElementById("rateBadge");
const markerPad = document.getElementById("markerPad");
const camSelect = document.getElementById("camSelect");
const projectorSelect = document.getElementById("projectorSelect");
const projectorSpec = document.getElementById("projectorSpec");
const projectorMapStatus = document.getElementById("projectorMapStatus");
const inspector = document.getElementById("inspector");
const fpsEl = document.getElementById("fps");
const markerCountEl = document.getElementById("markerCount");
const view2dCanvas = document.getElementById("view2dCanvas");
const view2dBtn = document.getElementById("view2dBtn");
const view3dBtn = document.getElementById("view3dBtn");
const coverageBtn = document.getElementById("coverageBtn");
const orientationWidget = document.getElementById("orientationWidget");
const sourceSurfaceBtn = document.getElementById("sourceSurfaceBtn");
const sourceCameraBtn = document.getElementById("sourceCameraBtn");
const validatePixelsBtn = document.getElementById("validatePixelsBtn");
const calibrationPanelEl = document.getElementById("calibrationPanel");
const autoCalibrateBtn = document.getElementById("autoCalibrateBtn");
const cornerStatus = document.getElementById("cornerStatus");
const resetWarpBtn = document.getElementById("resetWarpBtn");
const loadReplayBtn = document.getElementById("loadReplayBtn");
const playReplayBtn = document.getElementById("playReplayBtn");
const pauseReplayBtn = document.getElementById("pauseReplayBtn");
const replayScrub = document.getElementById("replayScrub");
const replayTime = document.getElementById("replayTime");
const replayStatus = document.getElementById("replayStatus");
const replaySource = document.getElementById("replaySource");
const replayFile = document.getElementById("replayFile");
const replayPaste = document.getElementById("replayPaste");
const calibrationOverlay = document.getElementById("calibrationOverlay");
const sampleStickyBtn = document.getElementById("sampleStickyBtn");
const detectionCtx = detectionOverlay.getContext("2d");

let mode = "select";
let selected = null;
let frameCounter = 0;
let fpsClock = performance.now();
let postResults = [];
let postCountThisSecond = 0;
let lastRateTick = performance.now();
let coverageEnabled = false;
let coverageMeshes = [];
let gapMesh = null;
let cameraTween = null;
let activeViewMode = "3d";
let wasStreamingBeforeReplay = true;
let latestRoomState = null;
let pendingStroke = null;
let markerTrails = new Map();
let dragBoardObject = null;
let sampledStickyColor = "#facc15";
let stickyPaletteIndex = 0;
let lastZoneCaptureSignature = "";
let lastSlideControlSignature = "";
let lastVideoControlSignature = "";
let lastActionEraseSignature = "";
let lastFiguratePresenceSignature = "";
let lastFigurateAskSignature = "";
let lastActionDragSignature = "";
let lastActionDragSyncAt = 0;
let classroomSlideIndex = 0;
let classroomLog = ["Room ready"];
let projectorPolygon = cloneProjectorPolygon(loadProjectorPolygon());
let projectorMapping = projectorMappingForPolygon(projectorPolygon, DEFAULT_PROJECTOR_POLYGON);
let projectorCalibrationSyncTimer = null;
let videoPlayers = new Map();
let stickySampleArmed = false;
let lastHudRender = 0;
let lastProjectionRender = 0;
let lastOverlayRender = 0;
let lastPovRender = 0;
let lastDetectionTick = 0;
let lastDetectionSignature = "";
let lastOrientationMode = "";
let lastOrientationHeading = null;
let lastDetectorPost = {
  ok: false,
  count: 0,
  updated: [],
  skipped: [],
  calibration: null,
  ms: 0,
  error: "server idle",
};
let activeCameraSource = { type: "virtual", index: 0 };
let physicalCameraStream = null;
let physicalCameraBusy = false;
let physicalCameraDetections = [];
let physicalCameraFrameSize = { width: 1280, height: 960 };
let lastPhysicalCameraTick = 0;
let lastLiveMarkerSignature = "";

const STICKY_COLORS = ["#facc15", "#fde68a", "#fef3c7", "#bfdbfe", "#f9a8d4", "#a7f3d0", "#ffb360"];
const VIDEO_CARD_WIDTH = 420;
const VIDEO_CARD_HEIGHT = 236;
const FIGURATE_CARD_WIDTH = 360;
const FIGURATE_CARD_HEIGHT = 174;
const BOARD_CORNER_TAGS = [4, 5, 6, 7];
const MARKER_PAD_ROLES = ["sticky", "zone", "action", "figurate", "focus", "write", "tool", "slide", "video", "object3d", "vertex", "timer"];
const PHYSICAL_CAMERA_DETECT_INTERVAL_MS = 300;
const PHYSICAL_CAMERA_CAPTURE_MAX_WIDTH = 960;
const PHYSICAL_CAMERA_CAPTURE_JPEG_QUALITY = 0.72;
const SMOKE_MODE = new URLSearchParams(window.location.search).get("smoke") === "1";

let tagMapResult = await server.getTagMap();
let activeTagMap = tagMapResult.ok ? tagMapResult.data : fallbackTagMap();
if (!tagMapResult.ok) console.warn("No /api/tag-map; using local fallback");

const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: "high-performance" });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1));
renderer.outputColorSpace = THREE.SRGBColorSpace;
sceneEl.appendChild(renderer.domElement);

const mainCam = new THREE.PerspectiveCamera(38, 1, 0.05, 50);
mainCam.position.set(2.45, 1.72, 2.25);
mainCam.lookAt(BOARD_SURFACE.centerX, BOARD_SURFACE.centerY, BOARD_SURFACE.centerZ);

const orbit = new OrbitControls(mainCam, renderer.domElement);
orbit.target.set(BOARD_SURFACE.centerX, BOARD_SURFACE.centerY, BOARD_SURFACE.centerZ);
orbit.enableDamping = true;
orbit.dampingFactor = 0.08;
orbit.mouseButtons.LEFT = null;
orbit.mouseButtons.RIGHT = THREE.MOUSE.ROTATE;
orbit.mouseButtons.MIDDLE = THREE.MOUSE.DOLLY;

const povRenderer = new THREE.WebGLRenderer({ antialias: false, canvas: povCanvas, powerPreference: "high-performance" });
povRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 1));
povRenderer.outputColorSpace = THREE.SRGBColorSpace;

const room = createRoomScene({ tableConfig: null });

// Ceiling camera kept here for reference, but disabled for the current
// one-camera rehearsal.
// const overhead = createCameraRig({
//   name: "Camera · Overhead",
//   kind: "ceiling",
//   position: new THREE.Vector3(0.18, 2.72, 0.42),
//   lookAt: new THREE.Vector3(0, TABLE.surfaceY, 0),
//   fov: 68,
//   aspect: 4 / 3,
//   mountOnCeiling: true,
// });
const wall = createCameraRig({
  name: "Camera · Logitech C920",
  kind: "tripod",
  position: new THREE.Vector3(2.55, 1.62, 0),
  lookAt: new THREE.Vector3(BOARD_TARGET.x, BOARD_TARGET.y, BOARD_TARGET.z),
  fov: 43.3,
  aspect: 16 / 9,
  mountOnCeiling: false,
});
const kiyo = createCameraRig({
  name: "Camera · Razer Kiyo Pro (90)",
  kind: "tripod",
  position: new THREE.Vector3(2.55, 1.62, 0),
  lookAt: new THREE.Vector3(BOARD_TARGET.x, BOARD_TARGET.y, BOARD_TARGET.z),
  fov: 52.23,
  aspect: 16 / 9,
  mountOnCeiling: false,
});
[wall, kiyo].forEach((rig) => {
  room.scene.add(rig.rig);
  if (rig.helper && !rig.helper.parent) room.scene.add(rig.helper);
});
const switcher = new CameraSwitcher({ rigs: [wall, kiyo], povRenderer });

renderCameraSourceOptions();
camSelect.addEventListener("change", () => {
  setCameraSource(camSelect.value);
});
switcher.setActive(0);
camSelect.value = "virtual:0";

function renderCameraSourceOptions() {
  camSelect.innerHTML = "";
  const virtualGroup = document.createElement("optgroup");
  virtualGroup.label = "Virtual cameras";
  switcher.rigs.forEach((rig, index) => {
    const option = document.createElement("option");
    option.value = `virtual:${index}`;
    option.textContent = rig.rig.userData.label.replace("Camera · ", "");
    virtualGroup.appendChild(option);
  });
  camSelect.appendChild(virtualGroup);

  const physicalGroup = document.createElement("optgroup");
  physicalGroup.label = "Physical cameras";
  const c920Option = document.createElement("option");
  c920Option.value = "physical:c920";
  c920Option.textContent = "Browser camera / C920";
  physicalGroup.appendChild(c920Option);
  camSelect.appendChild(physicalGroup);
}

function setCameraSource(value) {
  const [type, rawId] = String(value || "virtual:0").split(":");
  if (type === "physical") {
    activeCameraSource = { type: "physical", id: rawId || "c920" };
    markerManager.setEnabled(false);
    syncLiveMarkersFromRoomState(latestRoomState, { force: true });
    switcher.rigs.forEach((rig) => {
      if (rig.helper) rig.helper.visible = false;
    });
    startPhysicalCamera().catch((error) => {
      lastDetectorPost = { ...lastDetectorPost, ok: false, error: error.message || String(error) };
      renderDetectorStatus();
      fallbackToVirtualCamera(error);
    });
    streamRate.textContent = "physical";
    return;
  }

  const index = Math.max(0, Math.min(switcher.rigs.length - 1, Number(rawId) || 0));
  activeCameraSource = { type: "virtual", index };
  stopPhysicalCamera();
  switcher.setActive(index);
  updateCameraHelperVisibility();
  markerManager.setEnabled(shouldEnableMarkerInteraction());
  streamRate.textContent = detections.sourceSpace;
}

function fallbackToVirtualCamera(error) {
  activeCameraSource = { type: "virtual", index: 0 };
  stopPhysicalCamera();
  switcher.setActive(0);
  camSelect.value = "virtual:0";
  updateCameraHelperVisibility();
  markerManager.setEnabled(shouldEnableMarkerInteraction());
  streamRate.textContent = detections.sourceSpace;
  if (serverStatus) serverStatus.textContent = `browser camera unavailable; using virtual camera (${error.message || error})`;
}

room.projectors.presets.forEach((preset) => {
  const option = document.createElement("option");
  option.value = preset.id;
  option.textContent = preset.label;
  projectorSelect.appendChild(option);
});
projectorSelect.addEventListener("change", () => {
  const preset = room.projectors.setActivePreset(projectorSelect.value);
  renderProjectorSpec(preset);
  selectObject(room.projectors.wall);
});
projectorSelect.value = room.projectors.getActivePreset().id;
renderProjectorSpec(room.projectors.getActivePreset());

const markerManager = new MarkerManager({
  scene: room.scene,
  table: room.table,
  tagMap: activeTagMap,
  onChange: () => {
    updateMarkerCount();
    syncActionDragAffordance();
  },
});
markerManager.orbit = orbit;
markerManager.attachInteraction({ domElement: renderer.domElement, camera: mainCam });
if (SMOKE_MODE) seedBoardMarkers();

const detections = new DetectionPipeline({
  markers: markerManager,
  cameras: switcher,
  onPost: (result) => {
    lastDetectorPost = result;
    postResults.push(result);
    postResults = postResults.slice(-5);
    if (result.ok) postCountThisSecond += 1;
    streamRate.textContent = result.ok ? `posted ${result.count}` : "failed";
    renderDetectorStatus();
    renderPostStatus();
  },
});
detections.setSurface("board");
detections.setSourceSpace("camera");
detections.start();
sourceSurfaceBtn.classList.remove("active");
sourceCameraBtn.classList.add("active");
sourceSurfaceBtn.textContent = "surface board";
sourceCameraBtn.textContent = "camera pixels";
streamRate.textContent = "camera";

const view3d = new View3D({ renderer, scene: room.scene, camera: mainCam, orbit });
const view2d = new View2D({
  canvas: view2dCanvas,
  markers: markerManager,
  cameras: switcher,
  projectors: room.projectors,
  table: room.table,
  whiteboard: room.whiteboard,
  getMode: () => mode,
  getProjectorPolygon: () => projectorPolygon,
  getSelected: () => selected,
  onSelect: selectObject,
  onChange: () => updateMarkerCount(),
  onProjectorPolygonChange: (nextPolygon) => {
    setProjectorPolygon(nextPolygon);
  },
  onAimCamera: (rig, point) => {
    const head = rig.rig.userData.head;
    if (!head) return;
    aimAt(head, new THREE.Vector3(
      point.x ?? BOARD_TARGET.x,
      point.y ?? BOARD_TARGET.y,
      point.z ?? BOARD_TARGET.z,
    ));
  },
});
setViewMode("3d");
room.whiteboard.setProjectionPolygon(projectorPolygon);
queueProjectorCalibrationSync();

const calibrationPanel = new CalibrationPanel({
  root: calibrationPanelEl,
  cameras: switcher,
  detections,
  overlay: calibrationOverlay,
  onCoverageRequest: () => {
    coverageEnabled = true;
    coverageBtn.classList.add("active");
    view2d.setCoverageEnabled(true);
    room.coverage.group.visible = true;
    updateCameraHelperVisibility();
  },
  onCameraSelect: (rig) => {
    const index = switcher.rigs.indexOf(rig);
    if (index >= 0) {
      camSelect.value = `virtual:${index}`;
      setCameraSource(camSelect.value);
    }
  },
});
if (SMOKE_MODE) await calibrationPanel.autoCalibrate(wall, "board");
queueProjectorCalibrationSync();
await calibrationPanel.refresh();
renderDetectorStatus();
coverageEnabled = false;
coverageBtn.classList.remove("active");
view2d.setCoverageEnabled(false);
room.coverage.group.visible = false;

const replay = new ReplayEngine({
  markers: markerManager,
  onChange: () => updateMarkerCount(),
  onStatus: updateReplayStatus,
});

const initialState = await server.getState();
if (initialState.ok) {
  latestRoomState = initialState.data;
  syncLiveMarkersFromRoomState(latestRoomState);
}
const disconnectRoomEvents = server.connectEvents({
  onState: (roomState) => {
    latestRoomState = roomState;
    syncLiveMarkersFromRoomState(roomState);
  },
});
window.addEventListener("beforeunload", () => disconnectRoomEvents());

camSelect.value = "physical:c920";
setCameraSource(camSelect.value);

for (const role of MARKER_PAD_ROLES) {
  const button = document.createElement("button");
  button.textContent = ROLE_LABELS[role] || role;
  button.dataset.role = role;
  if (role === "sticky") {
    button.classList.add("sticky-sample-button");
    button.style.setProperty("--sample-color", sampledStickyColor);
  }
  button.addEventListener("click", async () => {
    if (activeCameraSource.type === "physical") {
      announceRoom("Physical camera mode is read-only; move the real tags instead.");
      return;
    }
    if (role === "sticky") {
      await createSampledStickyNote();
      return;
    }
    markerManager.add({
      role,
      surface: "board",
      u: 0.16 + Math.random() * 0.68,
      v: 0.16 + Math.random() * 0.68,
      angle: Math.random() * Math.PI,
    });
    announceRoom(`${ROLE_LABELS[role] || role} tag added`);
  });
  markerPad.appendChild(button);
}

sampleStickyBtn?.addEventListener("click", () => {
  stickySampleArmed = true;
  sampleStickyBtn.classList.add("active");
  sampleStickyBtn.textContent = "click sticky";
  announceRoom("Click the sticky note in camera view to sample color");
});

calibrationOverlay?.addEventListener("pointerdown", (event) => {
  if (!stickySampleArmed) return;
  event.preventDefault();
  event.stopPropagation();
  finishStickyColorSample(event);
}, { capture: true });

povCanvas?.addEventListener("pointerdown", (event) => {
  if (!stickySampleArmed) return;
  event.preventDefault();
  event.stopPropagation();
  finishStickyColorSample(event);
}, { capture: true });

document.getElementById("resetBtn").addEventListener("click", resetMarkers);
resetWarpBtn.addEventListener("click", resetProjectorWarp);
view2dBtn.addEventListener("click", () => setViewMode("2d"));
view3dBtn.addEventListener("click", () => setViewMode("3d"));
coverageBtn.addEventListener("click", () => {
  coverageEnabled = !coverageEnabled;
  coverageBtn.classList.toggle("active", coverageEnabled);
  view2d.setCoverageEnabled(coverageEnabled);
  room.coverage.group.visible = coverageEnabled;
  updateCameraHelperVisibility();
});

orientationWidget.addEventListener("click", (event) => {
  const button = event.target.closest("[data-view]");
  if (!button) return;
  const view = button.dataset.view;
  if (getViewMode() === "2d") {
    view2d.pan.x = 0;
    view2d.pan.y = 0;
    view2d.zoom = 1;
    return;
  }
  setCameraView(view);
});
streamBtn.addEventListener("click", () => {
  const next = !streamBtn.classList.contains("active");
  setStreaming(next);
});

sourceSurfaceBtn.addEventListener("click", () => setSourceSpace("surface"));
sourceCameraBtn.addEventListener("click", () => setSourceSpace("camera"));
validatePixelsBtn.addEventListener("click", async () => {
  await calibrateVisibleBoardCorners();
  setSourceSpace("camera");
  setStreaming(true);
  streamRate.textContent = "camera";
});

autoCalibrateBtn.addEventListener("click", () => calibrateVisibleBoardCorners());
replaySource.addEventListener("change", () => {
  replayFile.hidden = replaySource.value !== "file";
  replayPaste.hidden = replaySource.value !== "paste";
});
loadReplayBtn.addEventListener("click", loadReplayFromSelectedSource);
playReplayBtn.addEventListener("click", () => {
  wasStreamingBeforeReplay = streamBtn.classList.contains("active");
  setStreaming(false);
  replayStatus.textContent = "replay";
  replay.play();
});
pauseReplayBtn.addEventListener("click", () => {
  replay.pause();
  if (wasStreamingBeforeReplay) setStreaming(true);
});
replayScrub.addEventListener("input", () => replay.seek(Number(replayScrub.value) / 1000));

document.querySelectorAll("[data-mode]").forEach((button) => {
  button.addEventListener("click", () => setMode(button.dataset.mode));
});

window.addEventListener("keydown", (event) => {
  if (event.key === "2") setViewMode("2d");
  if (event.key === "3") setViewMode("3d");
  if (event.key === "q" || event.key === "Q") setMode("select");
  if (event.key === "w" || event.key === "W") setMode("move");
  if (event.key === "e" || event.key === "E") setMode("rotate");
  if (event.key === "d" || event.key === "D") setMode("draw");
  if (event.key === "p" || event.key === "P") setMode("warp");
  if (event.key === "Escape") selectObject(null);
  if (event.key === "f" || event.key === "F") {
    if (selected) orbit.target.copy(selected.position || new THREE.Vector3());
  }
});

const raycaster = new THREE.Raycaster();
const ndc = new THREE.Vector2();
renderer.domElement.addEventListener("click", (event) => {
  const hit = pickSelectable(event);
  if (hit?.userData?.kind !== "marker") selectObject(hit);
});
renderer.domElement.addEventListener("pointerdown", (event) => {
  if (activeViewMode !== "3d" || event.button !== 0) return;
  const point = boardPointFromEvent(event);
  if (!point) return;
  const object = boardObjectAtPoint(point, latestRoomState);
  if (object && mode !== "draw" && mode !== "warp") {
    orbit.enabled = false;
    dragBoardObject = {
      id: object.id,
      colorEditing: false,
      lockedPoint: null,
      offset: {
        x: point.x - Number(object.x || 0.5),
        y: point.y - Number(object.y || 0.5),
      },
    };
    renderer.domElement.setPointerCapture?.(event.pointerId);
    event.preventDefault();
    return;
  }
  if (mode !== "draw") return;
  orbit.enabled = false;
  pendingStroke = [point];
  renderer.domElement.setPointerCapture?.(event.pointerId);
  event.preventDefault();
});
renderer.domElement.addEventListener("pointermove", (event) => {
  if (activeViewMode === "3d" && dragBoardObject) {
    if (dragBoardObject.colorEditing) return;
    const point = boardPointFromEvent(event);
    if (!point || !latestRoomState?.board?.objects) return;
    const object = latestRoomState.board.objects.find((item) => item.id === dragBoardObject.id);
    if (!object) return;
    const next = clampBoardObjectPoint({
      x: point.x - dragBoardObject.offset.x,
      y: point.y - dragBoardObject.offset.y,
    }, object);
    object.x = next.x;
    object.y = next.y;
    lastProjectionRender = 0;
    return;
  }
  if (activeViewMode !== "3d" || mode !== "draw" || !pendingStroke) return;
  const point = boardPointFromEvent(event);
  if (!point) return;
  pendingStroke.push(point);
});
renderer.domElement.addEventListener("pointerup", async (event) => {
  if (dragBoardObject) {
    const point = boardPointFromEvent(event);
    const object = latestRoomState?.board?.objects?.find((item) => item.id === dragBoardObject.id);
    const next = dragBoardObject.colorEditing && dragBoardObject.lockedPoint
      ? dragBoardObject.lockedPoint
      : clampBoardObjectPoint({
        x: (point?.x ?? object?.x ?? 0.5) - dragBoardObject.offset.x,
        y: (point?.y ?? object?.y ?? 0.5) - dragBoardObject.offset.y,
      }, object || {});
    const id = dragBoardObject.id;
    dragBoardObject = null;
    orbit.enabled = true;
    try {
      await server.postAction("board.object.move", { id, x: next.x, y: next.y });
      announceRoom("Board note moved");
    } catch (error) {
      console.warn("virtual-room board object move failed", error);
    }
    return;
  }
  if (!pendingStroke) return;
  const stroke = pendingStroke.slice();
  pendingStroke = null;
  orbit.enabled = true;
  if (stroke.length < 2) return;
  const zone = zoneForPoint(stroke[0]);
  const payload = {
    points: simplifyStroke(stroke),
    color: zone?.text || "#111827",
    size: zone ? 12 : 10,
  };
  if (zone) {
    payload.zone = {
      id: zone.id,
      x: zone.x,
      y: zone.y,
      w: zone.w,
      h: zone.h,
    };
    announceRoom(`Writing added to zone ${zone.index + 1}`);
  }
  try {
    await server.postAction("board.stroke.add", payload);
  } catch (error) {
    console.warn("virtual-room stroke post failed", error);
  }
});
renderer.domElement.addEventListener("pointercancel", () => {
  if (dragBoardObject) {
    dragBoardObject = null;
    orbit.enabled = true;
  }
  if (!pendingStroke) return;
  pendingStroke = null;
  orbit.enabled = true;
});

renderer.domElement.addEventListener("wheel", (event) => {
  if (activeViewMode !== "3d" || !dragBoardObject) return;
  const object = latestRoomState?.board?.objects?.find((item) => item.id === dragBoardObject.id);
  if (!isStickyObject(object)) return;
  event.preventDefault();
  event.stopPropagation();
  dragBoardObject.colorEditing = true;
  dragBoardObject.lockedPoint = { x: Number(object.x || 0.5), y: Number(object.y || 0.5) };
  const color = nextStickyColor(object.color, Math.sign(event.deltaY || 1));
  object.color = color;
  lastProjectionRender = 0;
  void server.postAction("board.object.update", { id: object.id, color }).then((result) => {
    if (!result.ok) console.warn("virtual-room sticky color update failed", result.error);
  });
  announceRoom(`Sticky color changed to ${color}`);
}, { passive: false });

function resetMarkers() {
  markerManager.list().forEach((marker) => markerManager.remove(marker));
  markerTrails.clear();
  if (activeCameraSource.type === "physical") {
    syncLiveMarkersFromRoomState(latestRoomState, { force: true });
    return;
  }
  seedBoardMarkers();
}

function resetProjectorWarp() {
  setProjectorPolygon(DEFAULT_PROJECTOR_POLYGON);
  announceRoom("Projector map reset");
}

function setMode(nextMode) {
  mode = nextMode;
  document.querySelectorAll("[data-mode]").forEach((button) => {
    button.classList.toggle("active", button.dataset.mode === mode);
  });
  markerManager.setEnabled(shouldEnableMarkerInteraction());
}

function setViewMode(nextMode) {
  activeViewMode = nextMode === "2d" ? "2d" : "3d";
  view3d.setEnabled(activeViewMode === "3d");
  view2d.setEnabled(activeViewMode === "2d");
  markerManager.setEnabled(shouldEnableMarkerInteraction());
  view2dBtn.classList.toggle("active", activeViewMode === "2d");
  view3dBtn.classList.toggle("active", activeViewMode === "3d");
  renderOrientationWidget(activeViewMode);
}

function shouldEnableMarkerInteraction() {
  return activeCameraSource.type !== "physical" && activeViewMode === "3d" && mode !== "draw" && mode !== "warp";
}

function getViewMode() {
  return activeViewMode;
}

function resizeViews(width, height) {
  view3d.resize(width, height);
  view2d.resize(width, height);
}

function renderViews() {
  if (activeViewMode === "2d") view2d.render();
  else view3d.render();
}

function pickSelectable(event) {
  const rect = renderer.domElement.getBoundingClientRect();
  ndc.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  ndc.y = -(((event.clientY - rect.top) / rect.height) * 2 - 1);
  raycaster.setFromCamera(ndc, mainCam);
  const hits = raycaster.intersectObjects(room.scene.children, true);
  for (const hit of hits) {
    const sel = selectableAncestor(hit.object);
    if (sel) return sel;
  }
  return null;
}

function boardPointFromEvent(event) {
  const rect = renderer.domElement.getBoundingClientRect();
  ndc.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  ndc.y = -(((event.clientY - rect.top) / rect.height) * 2 - 1);
  raycaster.setFromCamera(ndc, mainCam);
  const hits = raycaster.intersectObject(room.whiteboard.board, false);
  if (!hits.length) return null;
  const hit = hits[0].point;
  return {
    x: clamp01(((BOARD_SURFACE.centerZ + BOARD_SURFACE.widthZ / 2) - hit.z) / BOARD_SURFACE.widthZ),
    y: clamp01(((BOARD_SURFACE.centerY + BOARD_SURFACE.heightY / 2) - hit.y) / BOARD_SURFACE.heightY),
  };
}

function boardObjectAtPoint(point, state = latestRoomState) {
  if (!point || !state?.board?.objects) return null;
  return [...state.board.objects].reverse().find((object) => {
    const halfW = Number(object.w || 0.11) / 2;
    const halfH = Number(object.h || 0.11) / 2;
    return (
      point.x >= Number(object.x || 0.5) - halfW &&
      point.x <= Number(object.x || 0.5) + halfW &&
      point.y >= Number(object.y || 0.5) - halfH &&
      point.y <= Number(object.y || 0.5) + halfH
    );
  }) || null;
}

function clampBoardObjectPoint(point, object) {
  const halfW = Number(object?.w || 0.11) / 2;
  const halfH = Number(object?.h || 0.11) / 2;
  return {
    x: Math.max(halfW, Math.min(1 - halfW, Number(point.x || 0.5))),
    y: Math.max(halfH, Math.min(1 - halfH, Number(point.y || 0.5))),
  };
}

function selectableAncestor(object) {
  let current = object;
  while (current) {
    if (current.userData?.selectable) return current;
    if (current.userData?.parent) return current.userData.parent;
    current = current.parent;
  }
  return null;
}

function selectObject(object) {
  selected = object;
  markerManager.activeMarker = object?.userData?.kind === "marker" ? object : null;
  if (!object) {
    inspector.hidden = true;
    return;
  }
  inspector.hidden = false;
  const pos = object.position || new THREE.Vector3();
  const rot = object.rotation || new THREE.Euler();
  const cameraSurface = object.userData.sub === "tripod" ? "board" : "table";
  const cameraError = object.userData.kind === "camera" && calibrationPanel
    ? calibrationPanel.errorFor(cameraSurface, "camera")
    : null;
  inspector.innerHTML = `
    <h2>${object.userData.label || object.userData.kind || "Object"}</h2>
    <div class="row"><span>kind</span><span>${object.userData.kind || "unknown"}</span></div>
    <div class="row"><span>pos</span><span>${pos.x.toFixed(2)}, ${pos.y.toFixed(2)}, ${pos.z.toFixed(2)}</span></div>
    <div class="row"><span>rot</span><span>${rot.x.toFixed(2)}, ${rot.y.toFixed(2)}, ${rot.z.toFixed(2)}</span></div>
    ${cameraError ? `<div class="row"><span>${cameraSurface}</span><span class="${cameraError.className}">${cameraError.label}</span></div>` : ""}
  `;
}

function updateMarkerCount() {
  markerCountEl.textContent = `Tags ${String(markerManager.list().length).padStart(2, "0")}`;
}

function renderDetections(items) {
  detCount.textContent = `${String(items.length).padStart(2, "0")} detections`;
  renderCornerStatus(items);
  detList.innerHTML = "";
  items.forEach((item) => {
    const row = document.createElement("div");
    row.className = "det";
    row.innerHTML = `
      <span class="id">${String(item.tagId).padStart(2, "0")}</span>
      <span>${item.role}</span>
      <span class="pose">${item.center.x.toFixed(3)}, ${item.center.y.toFixed(3)} · ${Math.round(item.angle * 180 / Math.PI)}°</span>
    `;
    detList.appendChild(row);
  });
}

function renderCornerStatus(items) {
  if (!cornerStatus) return;
  const seen = new Set((items || []).map((item) => Number(item.tagId)));
  const missing = BOARD_CORNER_TAGS.filter((tagId) => !seen.has(tagId));
  const calibrated = Boolean(calibrationPanel?.status?.board?.cameraToSurfaceHomography);
  cornerStatus.classList.toggle("ready", !missing.length && !calibrated);
  cornerStatus.classList.toggle("calibrated", calibrated);
  if (missing.length) {
    cornerStatus.textContent = `Need corner tags ${missing.join(", ")}.`;
    return;
  }
  cornerStatus.textContent = calibrated
    ? "Corners visible. Board camera calibration is active."
    : "Corners visible. Click Calibrate Visible Corners.";
}

function renderDetectorStatus() {
  const activeCamera = activeCameraSource.type === "physical"
    ? "Physical C920"
    : switcher.getActive()?.rig?.userData?.label || "camera";
  const ms = Number(lastDetectorPost.ms || 0);
  const timing = ms > 0 ? ` in ${Math.round(ms)}ms` : "";
  if (serverStatus) {
    serverStatus.textContent = lastDetectorPost.ok
      ? `${activeCamera} - mapped ${lastDetectorPost.updated.length}/${lastDetectorPost.count}${timing}`
      : `${activeCamera} - ${lastDetectorPost.error || "post failed"}`;
  }
  if (calibrationStatus) {
    const board = calibrationPanel?.status?.board || lastDetectorPost.calibration || null;
    const error = board?.error?.camera?.avg;
    calibrationStatus.textContent = Number.isFinite(error)
      ? `board cal ${error.toFixed(2)} px`
      : `board cal ${board?.status || "pending"}`;
  }
}

function renderProjectorSpec(preset) {
  if (!projectorSpec || !preset) return;
  const lensDistance = room.projectors.wall.position.x - BOARD_SURFACE.centerX;
  const ratioRange = preset.throwRatioRange?.length
    ? preset.throwRatioRange.map((ratio) => ratio.toFixed(2)).join("-")
    : preset.throwRatio.toFixed(2);
  const brightness = preset.brightnessBatteryLumens
    ? `${preset.brightnessLumens} lm AC / ${preset.brightnessBatteryLumens} lm battery`
    : `${preset.brightnessLumens} lm`;
  projectorSpec.innerHTML = `
    <div>${preset.model}</div>
    <div>throw ${ratioRange}:1 / lens ${lensDistance.toFixed(2)} m</div>
    <div>${preset.nativeResolution.width}x${preset.nativeResolution.height} / ${brightness}</div>
  `;
  renderProjectorMapStatus();
}

function renderProjectorMapStatus(status = "local map active") {
  if (!projectorMapStatus) return;
  const points = projectorPolygon.map((point, index) => {
    return `${index + 1}:${point.x.toFixed(2)},${point.y.toFixed(2)}`;
  }).join("  ");
  projectorMapStatus.textContent = `${status} / ${projectorPolygon.length} pts / ${points}`;
}

function renderDetectionOverlay(items) {
  if (!detectionCtx || !detectionOverlay) return;
  const rect = detectionOverlay.getBoundingClientRect();
  const width = Math.max(1, Math.floor(rect.width));
  const height = Math.max(1, Math.floor(rect.height));
  if (detectionOverlay.width !== width || detectionOverlay.height !== height) {
    detectionOverlay.width = width;
    detectionOverlay.height = height;
  }
  detectionCtx.clearRect(0, 0, width, height);
  if (!items.length) return;

  const frame = activeCameraSource.type === "physical"
    ? physicalCameraFrameSize
    : { width: 1280, height: 960 };
  const transform = previewFrameTransform(width, height, frame.width, frame.height);
  detectionCtx.font = "10px IBM Plex Mono, monospace";
  detectionCtx.lineWidth = 1.5;

  items.forEach((item) => {
    const corners = Array.isArray(item.corners) ? item.corners : null;
    detectionCtx.strokeStyle = "rgba(127, 188, 210, 0.88)";
    detectionCtx.fillStyle = "rgba(127, 188, 210, 0.14)";
    if (corners && corners.length >= 4) {
      detectionCtx.beginPath();
      corners.forEach((corner, index) => {
        const point = mapFrameToPreview(corner, transform);
        const x = point.x;
        const y = point.y;
        if (index === 0) detectionCtx.moveTo(x, y);
        else detectionCtx.lineTo(x, y);
      });
      detectionCtx.closePath();
      detectionCtx.fill();
      detectionCtx.stroke();
    }
    const center = mapFrameToPreview(item.center, transform);
    const x = center.x;
    const y = center.y;
    detectionCtx.fillStyle = "rgba(255, 179, 96, 0.95)";
    detectionCtx.fillRect(x - 3, y - 3, 6, 6);
    detectionCtx.fillStyle = "#f5efe2";
    detectionCtx.fillText(`tag ${String(item.tagId).padStart(2, "0")}`, x + 8, y - 6);
  });
}

function previewFrameTransform(viewWidth, viewHeight, frameWidth, frameHeight) {
  const safeFrameWidth = Math.max(1, Number(frameWidth) || 1);
  const safeFrameHeight = Math.max(1, Number(frameHeight) || 1);
  const scale = Math.min(viewWidth / safeFrameWidth, viewHeight / safeFrameHeight);
  return {
    scale,
    x: (viewWidth - safeFrameWidth * scale) / 2,
    y: (viewHeight - safeFrameHeight * scale) / 2,
  };
}

function mapFrameToPreview(point, transform) {
  return {
    x: transform.x + Number(point?.x || 0) * transform.scale,
    y: transform.y + Number(point?.y || 0) * transform.scale,
  };
}

function renderBoardProjection(now = performance.now(), options = {}) {
  const interval = markerManager.drag || pendingStroke || options.smoothingActive ? 33 : 125;
  if (now - lastProjectionRender < interval) return;
  lastProjectionRender = now;

  const whiteboard = room.whiteboard;
  const canvas = whiteboard?.projectionCanvas;
  const texture = whiteboard?.projectionTexture;
  if (!canvas || !texture) return;

  const ctx = canvas.getContext("2d");
  const width = canvas.width;
  const height = canvas.height;
  ctx.clearRect(0, 0, width, height);

  const state = latestRoomState;
  if (!state) {
    texture.needsUpdate = true;
    return;
  }

  updateMarkerToolTrails();
  drawProjectionZones(ctx, width, height);
  drawProjectionStickyLights(ctx, width, height, state);
  drawProjectionObjects(ctx, width, height, state);
  drawProjectionStrokes(ctx, width, height, state);
  drawProjectionToolCursors(ctx, width, height);
  drawProjectionFocus(ctx, width, height, state);
  drawProjectionStickyDetections(ctx, width, height, state);
  drawProjectionSlides(ctx, width, height, state);
  updateVideoControls(width, height, now);
  drawProjectionVideo(ctx, width, height, now);
  drawProjectionModel(ctx, width, height);
  drawProjectionVertices(ctx, width, height);
  drawProjectionFigurate(ctx, width, height, state);
  drawProjectionTimer(ctx, width, height);
  texture.needsUpdate = true;
  updateSlideControls(state);
  updateZoneCaptureSummary(state);
  updateFigurateCharacterControls(state, width, height);
  updateActionEraseControls(state, width, height);
}

function drawProjectionZones(ctx, width, height) {
  buildZoneRects().forEach((zone, index) => {
    const rect = boardCanvasRect(zone, width, height);
    const quad = boardCanvasQuad(zone, width, height);
    ctx.strokeStyle = zone.stroke;
    ctx.lineWidth = 4;
    ctx.fillStyle = zone.fill;
    fillCanvasQuad(ctx, quad);
    strokeCanvasQuad(ctx, quad);
    ctx.fillStyle = zone.text;
    ctx.font = "16px IBM Plex Mono, monospace";
    ctx.fillText(`ZONE ${index + 1}`, rect.x + 10, rect.y + 22);
    ctx.fillStyle = zone.anchor;
    ctx.fillRect(rect.x - 5, rect.y - 5, 10, 10);
  });
}

function drawProjectionObjects(ctx, width, height, state) {
  (state.board.objects || []).forEach((object) => {
    const sticky = isStickyObject(object);
    const rect = boardObjectCanvasRect(object, width, height);
    const { x: left, y: top, w, h } = rect;
    ctx.fillStyle = object.color || "#d1fae5";
    ctx.strokeStyle = "rgba(15, 23, 42, 0.28)";
    ctx.lineWidth = 2;
    ctx.fillRect(left, top, w, h);
    ctx.strokeRect(left, top, w, h);
    const hasFiducial = hasObjectFiducial(object);
    const tagSize = hasFiducial ? Math.min(42, Math.max(30, Math.min(w, h) * 0.42)) : 0;
    if (hasFiducial) drawProjectedFiducial(ctx, object, left + 12, top + 12, tagSize);
    if (sticky) return;
    const textX = hasFiducial ? left + tagSize + 24 : left + 12;
    ctx.fillStyle = "#0f172a";
    ctx.font = "15px IBM Plex Sans, sans-serif";
    ctx.fillText(object.label || object.kind || "Object", textX, top + 24);
    if (object.text) {
      ctx.font = "13px IBM Plex Sans, sans-serif";
      ctx.fillText(String(object.text).slice(0, 34), textX, top + 44);
    }
  });
}

function drawProjectionStickyLights(ctx, width, height, state) {
  (state.board.objects || [])
    .filter((object) => isStickyColor(object.color))
    .forEach((object) => {
      const rect = boardObjectCanvasRect(object, width, height);
      const rgb = stickyRgb(object.color);
      const glow = expandRect(rect, 12, width, height);
      ctx.save();
      ctx.beginPath();
      roundedRectPath(ctx, glow.x, glow.y, glow.w, glow.h, 10);
      ctx.fillStyle = `rgba(${rgb}, 0.2)`;
      ctx.shadowColor = `rgba(${rgb}, 0.86)`;
      ctx.shadowBlur = 28;
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.beginPath();
      roundedRectPath(ctx, rect.x + 4, rect.y + 4, Math.max(1, rect.w - 8), Math.max(1, rect.h - 8), 6);
      ctx.fillStyle = `rgba(${rgb}, 0.34)`;
      ctx.fill();
      ctx.restore();
    });
}

function hasObjectFiducial(object) {
  return Boolean(object?.fiducial?.tagId || object?.tagId);
}

function drawProjectedFiducial(ctx, object, x, y, size) {
  const tagId = object.fiducial?.tagId || object.tagId;
  if (!tagId) return;
  ctx.save();
  ctx.fillStyle = "#111827";
  ctx.fillRect(x, y, size, size);
  ctx.fillStyle = "#f8fafc";
  ctx.fillRect(x + size * 0.18, y + size * 0.18, size * 0.64, size * 0.64);
  ctx.fillStyle = "#111827";
  ctx.font = `${Math.max(8, size * 0.22)}px IBM Plex Mono, monospace`;
  ctx.fillText(String(tagId).padStart(2, "0"), x + size * 0.27, y + size * 0.58);
  ctx.restore();
}

function drawProjectionStrokes(ctx, width, height, state) {
  const strokes = [
    ...(state.board.strokes || []),
    ...markerTrailStrokes(),
  ];
  if (pendingStroke?.length) {
    strokes.push({ points: pendingStroke, color: "#111827", size: 10 });
  }
  strokes.forEach((stroke) => drawStrokeHighlighter(ctx, width, height, stroke));
  strokes.forEach((stroke) => {
    if (!stroke.points || stroke.points.length < 2) return;
    ctx.beginPath();
    stroke.points.forEach((point, index) => {
      const canvasPoint = boardCanvasPoint(point, width, height);
      if (index === 0) ctx.moveTo(canvasPoint.x, canvasPoint.y);
      else ctx.lineTo(canvasPoint.x, canvasPoint.y);
    });
    ctx.strokeStyle = stroke.color || "#111827";
    ctx.lineWidth = Math.max(8, Number(stroke.size || 8));
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.stroke();
  });
  drawProjectionOcr(ctx, width, height, strokes);
}

function updateMarkerToolTrails() {
  const writerIds = new Set();
  markerManager.list()
    .filter((marker) => marker.userData.role === "write")
    .forEach((marker) => {
      const key = String(marker.userData.tagId);
      writerIds.add(key);
      const point = markerManager.surfacePointForMarker(marker);
      const trail = markerTrails.get(key) || [];
      const last = trail[trail.length - 1];
      if (!last || surfaceDistance(last, point) > 0.006) {
        trail.push({ x: point.x, y: point.y });
        markerTrails.set(key, trail.slice(-160));
      }
    });

  markerManager.list()
    .filter((marker) => marker.userData.role === "tool")
    .forEach((marker) => {
      const point = markerManager.surfacePointForMarker(marker);
      let erased = false;
      markerTrails.forEach((trail, key) => {
        const next = trail.filter((trailPoint) => surfaceDistance(trailPoint, point) > 0.045);
        if (next.length !== trail.length) erased = true;
        if (next.length < 2) markerTrails.delete(key);
        else markerTrails.set(key, next);
      });
      if (erased) markerManager.pulse(marker, { color: "#e5e7eb", duration: 420, intensity: 1.1 });
    });
}

function markerTrailStrokes() {
  return [...markerTrails.values()]
    .filter((points) => points.length >= 2)
    .map((points) => ({
      points,
      color: "#2563eb",
      size: 11,
    }));
}

function drawProjectionToolCursors(ctx, width, height) {
  markerManager.list()
    .filter((marker) => marker.userData.role === "write" || marker.userData.role === "tool")
    .forEach((marker) => {
      const point = boardCanvasPoint(markerManager.surfacePointForMarker(marker), width, height);
      const isEraser = marker.userData.role === "tool";
      ctx.save();
      ctx.strokeStyle = isEraser ? "rgba(229, 231, 235, 0.9)" : "rgba(37, 99, 235, 0.92)";
      ctx.fillStyle = isEraser ? "rgba(229, 231, 235, 0.12)" : "rgba(37, 99, 235, 0.16)";
      ctx.lineWidth = isEraser ? 5 : 3;
      ctx.shadowColor = isEraser ? "rgba(229, 231, 235, 0.6)" : "rgba(37, 99, 235, 0.6)";
      ctx.shadowBlur = isEraser ? 18 : 12;
      ctx.beginPath();
      ctx.arc(point.x, point.y, isEraser ? 34 : 15, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.font = "12px IBM Plex Mono, monospace";
      ctx.fillStyle = isEraser ? "rgba(229, 231, 235, 0.96)" : "rgba(191, 219, 254, 0.96)";
      ctx.fillText(isEraser ? "ERASE" : "WRITE", point.x + 20, point.y - 18);
      ctx.restore();
    });
}

function drawStrokeHighlighter(ctx, width, height, stroke) {
  if (!stroke.points || stroke.points.length < 2) return;
  const rgb = markerRgb(stroke.color || "#111827");
  ctx.save();
  ctx.beginPath();
  stroke.points.forEach((point, index) => {
    const canvasPoint = boardCanvasPoint(point, width, height);
    if (index === 0) ctx.moveTo(canvasPoint.x, canvasPoint.y);
    else ctx.lineTo(canvasPoint.x, canvasPoint.y);
  });
  ctx.strokeStyle = `rgba(${rgb}, 0.28)`;
  ctx.lineWidth = Math.max(22, Number(stroke.size || 8) * 3.4);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.shadowColor = `rgba(${rgb}, 0.7)`;
  ctx.shadowBlur = 18;
  ctx.stroke();
  ctx.restore();
}

function drawProjectionOcr(ctx, width, height, strokes) {
  strokes
    .filter((stroke) => stroke.points?.length >= 2)
    .slice(-8)
    .forEach((stroke, index) => {
      const bounds = strokeBounds(stroke.points, width, height);
      if (!bounds) return;
      const rgb = markerRgb(stroke.color || "#111827");
      ctx.save();
      ctx.strokeStyle = `rgba(${rgb}, 0.32)`;
      ctx.lineWidth = 2;
      ctx.setLineDash([8, 7]);
      ctx.strokeRect(bounds.x - 8, bounds.y - 8, bounds.w + 16, bounds.h + 16);
      ctx.setLineDash([]);
      ctx.fillStyle = "rgba(255, 255, 255, 0.92)";
      ctx.font = "12px IBM Plex Mono, monospace";
      ctx.fillText(`OCR LINE ${index + 1}`, bounds.x, Math.max(14, bounds.y - 13));
      ctx.restore();
    });
}

function drawProjectionFocus(ctx, width, height, state) {
  const serverFocuses = Array.isArray(state.room?.focuses)
    ? state.room.focuses.filter((focus) => focus?.surface === "board")
    : state.room?.focus?.surface === "board"
      ? [state.room.focus]
      : [];
  const focusMarkers = markerManager.list().filter((marker) => marker.userData.role === "focus");
  const targets = [
    ...focusMarkers.map((marker) => ({
      ...markerManager.surfacePointForMarker(marker),
      label: `focus ${marker.userData.tagId}`,
      direction: focusDirectionFromMarkerAngle(markerManager.markerAngle(marker)),
      radius: focusRadiusFromAngle(markerManager.markerAngle(marker)),
    })),
    ...serverFocuses,
  ];
  targets.forEach((target, index) => {
    const point = boardCanvasPoint(target, width, height);
    const radius = Number(target.radius || 72 + (index % 3) * 12);
    const glow = ctx.createRadialGradient(point.x, point.y, radius * 0.18, point.x, point.y, radius * 1.85);
    glow.addColorStop(0, "rgba(255, 255, 255, 0.42)");
    glow.addColorStop(0.36, "rgba(255, 255, 255, 0.2)");
    glow.addColorStop(1, "rgba(255, 255, 255, 0)");
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(point.x, point.y, radius * 1.85, 0, Math.PI * 2);
    ctx.fill();
    if (Number.isFinite(Number(target.direction))) {
      const direction = Number(target.direction);
      const tip = {
        x: point.x + Math.cos(direction) * radius * 1.34,
        y: point.y + Math.sin(direction) * radius * 1.34,
      };
      const left = {
        x: point.x + Math.cos(direction - 0.32) * radius * 0.58,
        y: point.y + Math.sin(direction - 0.32) * radius * 0.58,
      };
      const right = {
        x: point.x + Math.cos(direction + 0.32) * radius * 0.58,
        y: point.y + Math.sin(direction + 0.32) * radius * 0.58,
      };
      ctx.fillStyle = "rgba(255, 255, 255, 0.18)";
      ctx.strokeStyle = "rgba(250, 204, 21, 0.72)";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(left.x, left.y);
      ctx.lineTo(tip.x, tip.y);
      ctx.lineTo(right.x, right.y);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
    ctx.strokeStyle = "rgba(255, 255, 255, 0.96)";
    ctx.lineWidth = 8;
    ctx.shadowColor = "rgba(255, 255, 255, 0.85)";
    ctx.shadowBlur = 28;
    ctx.beginPath();
    ctx.arc(point.x, point.y, radius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = "rgba(250, 204, 21, 0.55)";
    ctx.lineWidth = 14;
    ctx.beginPath();
    ctx.arc(point.x, point.y, radius * 0.72, 0, Math.PI * 2);
    ctx.stroke();
    const label = `${target.label || `focus ${index + 1}`} / ${Math.round(radius)}px`;
    const labelWidth = Math.min(230, Math.max(118, label.length * 8));
    const labelRect = focusLabelRect(point, radius, labelWidth, width, height);
    const leaderStart = nearestRectPoint(labelRect, point);
    ctx.strokeStyle = "rgba(255, 255, 255, 0.7)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(leaderStart.x, leaderStart.y);
    ctx.lineTo(point.x - radius * 0.72, point.y - radius * 0.72);
    ctx.stroke();
    ctx.fillStyle = "rgba(7, 9, 12, 0.76)";
    ctx.fillRect(labelRect.x, labelRect.y, labelRect.w, labelRect.h);
    ctx.strokeStyle = "rgba(255, 255, 255, 0.72)";
    ctx.strokeRect(labelRect.x, labelRect.y, labelRect.w, labelRect.h);
    ctx.fillStyle = "rgba(255, 255, 255, 0.96)";
    ctx.font = "13px IBM Plex Mono, monospace";
    ctx.fillText(label, labelRect.x + 8, labelRect.y + 20);
  });
}

function focusLabelRect(point, radius, labelWidth, width, height) {
  const card = { w: labelWidth, h: 30 };
  const topY = clamp(point.y - radius - card.h - 16, 44, Math.max(44, height - card.h - 10));
  const leftX = point.x - radius - card.w - 20;
  if (leftX >= 10) return { x: leftX, y: topY, ...card };
  const rightX = point.x + radius + 20;
  if (rightX + card.w <= width - 10) return { x: rightX, y: topY, ...card };
  return {
    x: clamp(point.x - card.w / 2, 10, Math.max(10, width - card.w - 10)),
    y: topY,
    ...card,
  };
}

function nearestRectPoint(rect, point) {
  return {
    x: clamp(point.x, rect.x, rect.x + rect.w),
    y: clamp(point.y, rect.y, rect.y + rect.h),
  };
}

function focusRadiusFromAngle(angle) {
  const turn = (((angle % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)) / (Math.PI * 2);
  return 42 + turn * 150;
}

function focusDirectionFromMarkerAngle(angle) {
  const base = Number(angle || 0);
  return activeCameraSource.type === "physical"
    ? base + Math.PI / 2
    : base - Math.PI / 2;
}

function drawProjectionStickyDetections(ctx, width, height, state) {
  (state.board.objects || [])
    .filter((object) => isStickyColor(object.color))
    .forEach((object) => {
      const rect = boardObjectCanvasRect(object, width, height);
      const outer = expandRect(rect, 9, width, height);
      const rgb = stickyRgb(object.color);
      ctx.strokeStyle = `rgba(${rgb}, 0.98)`;
      ctx.lineWidth = 5;
      ctx.shadowColor = `rgba(${rgb}, 0.72)`;
      ctx.shadowBlur = 24;
      ctx.strokeRect(outer.x, outer.y, outer.w, outer.h);
      ctx.shadowBlur = 0;
      ctx.fillStyle = `rgba(${rgb}, 0.94)`;
      ctx.font = "14px IBM Plex Mono, monospace";
      const labelX = clamp(rect.x, 10, Math.max(10, width - 132));
      const labelY = rect.y > 28 ? rect.y - 14 : rect.y + 24;
      ctx.fillText("COLOR SAMPLE", labelX, labelY);
    });
}

function drawProjectionSlides(ctx, width, height, state) {
  const deck = buildClassroomSlides(state);
  markerManager.list()
    .filter((marker) => marker.userData.role === "slide")
    .forEach((marker, index) => {
      const point = boardCanvasPoint(markerManager.surfacePointForMarker(marker), width, height);
      const cardW = 360;
      const cardH = 220;
      const anchor = anchoredRect(point, cardW, cardH, width, height);
      const current = deck[classroomSlideIndex % deck.length];
      drawProjectionAnchorLeader(ctx, point, anchor, cardW, cardH, "rgba(147, 197, 253, 0.82)");
      ctx.fillStyle = "rgba(147, 197, 253, 0.95)";
      ctx.fillRect(anchor.x, anchor.y, cardW, cardH);
      ctx.fillStyle = "rgba(15, 23, 42, 0.08)";
      ctx.fillRect(anchor.x, anchor.y + cardH - 44, cardW / 2, 44);
      ctx.fillStyle = "rgba(15, 23, 42, 0.16)";
      ctx.fillRect(anchor.x + cardW / 2, anchor.y + cardH - 44, cardW / 2, 44);
      ctx.strokeStyle = "rgba(15, 23, 42, 0.28)";
      ctx.lineWidth = 2;
      ctx.strokeRect(anchor.x, anchor.y, cardW, cardH);
      ctx.fillStyle = "#0f172a";
      ctx.font = "24px IBM Plex Sans, sans-serif";
      ctx.fillText(`SLIDE CONTROL ${index + 1}`, anchor.x + 18, anchor.y + 32);
      ctx.font = "16px IBM Plex Sans, sans-serif";
      ctx.fillText(`now showing ${classroomSlideIndex + 1}/${deck.length}`, anchor.x + 18, anchor.y + 66);
      ctx.fillText(String(current.title).slice(0, 30), anchor.x + 18, anchor.y + 92);
      const summary = (state.board.objects || []).slice(0, 3).map((object) => object.label || object.kind || "Object");
      summary.forEach((line, lineIndex) => {
        ctx.fillText(`- ${String(line).slice(0, 28)}`, anchor.x + 18, anchor.y + 122 + lineIndex * 22);
      });
      ctx.font = "14px IBM Plex Mono, monospace";
      ctx.fillText("ACTION LEFT = PREV", anchor.x + 18, anchor.y + cardH - 17);
      ctx.fillText("ACTION RIGHT = NEXT", anchor.x + cardW / 2 + 18, anchor.y + cardH - 17);
    });
}

function drawProjectionFigurate(ctx, width, height, state) {
  markerManager.list()
    .filter((marker) => marker.userData.role === "figurate")
    .forEach((marker) => {
      const layout = figurateProjectionLayout(marker, width, height);
      const { point, anchor, w, h } = layout;
      const utterance = state.character?.lastUtterance || "I am quiet until asked.";
      const listening = state.character?.present ? "LISTENING" : "PLACE TAG TO WAKE";
      drawProjectionAnchorLeader(ctx, point, anchor, w, h, "rgba(199, 210, 254, 0.82)");
      ctx.save();
      ctx.shadowColor = "rgba(129, 140, 248, 0.62)";
      ctx.shadowBlur = 24;
      ctx.fillStyle = "rgba(224, 231, 255, 0.96)";
      ctx.fillRect(anchor.x, anchor.y, w, h);
      ctx.shadowBlur = 0;
      ctx.strokeStyle = "rgba(67, 56, 202, 0.44)";
      ctx.lineWidth = 3;
      ctx.strokeRect(anchor.x, anchor.y, w, h);
      ctx.fillStyle = "rgba(67, 56, 202, 0.16)";
      ctx.fillRect(anchor.x, anchor.y, w, 38);
      ctx.fillStyle = "#1e1b4b";
      ctx.font = "18px IBM Plex Mono, monospace";
      ctx.fillText("FIGURATE", anchor.x + 16, anchor.y + 26);
      ctx.font = "13px IBM Plex Mono, monospace";
      ctx.fillText(listening, anchor.x + w - 136, anchor.y + 25);
      ctx.font = "15px IBM Plex Sans, sans-serif";
      fitTextLines(utterance, 42, 3).forEach((line, lineIndex) => {
        ctx.fillText(line, anchor.x + 16, anchor.y + 68 + lineIndex * 22);
      });
      ctx.font = "13px IBM Plex Mono, monospace";
      ctx.fillStyle = "rgba(30, 27, 75, 0.78)";
      ctx.fillText("ACTION IN CARD = ASK ROOM", anchor.x + 16, anchor.y + h - 18);
      ctx.restore();
    });
}

function figurateProjectionLayout(marker, width, height) {
  const point = boardCanvasPoint(markerManager.surfacePointForMarker(marker), width, height);
  const w = Math.min(FIGURATE_CARD_WIDTH, width - 24);
  const h = Math.min(FIGURATE_CARD_HEIGHT, height - 24);
  return {
    point,
    w,
    h,
    anchor: anchoredRect(point, w, h, width, height),
  };
}

function fitTextLines(text, maxChars, maxLines) {
  const words = String(text || "").split(/\s+/).filter(Boolean);
  const lines = [];
  let current = "";
  words.forEach((word) => {
    const next = current ? `${current} ${word}` : word;
    if (next.length <= maxChars) {
      current = next;
      return;
    }
    if (current) lines.push(current);
    current = word;
  });
  if (current) lines.push(current);
  if (lines.length > maxLines) {
    lines.length = maxLines;
    lines[maxLines - 1] = `${lines[maxLines - 1].slice(0, Math.max(0, maxChars - 3))}...`;
  }
  return lines.length ? lines : ["Ask me about the board."];
}

function drawProjectionVideo(ctx, width, height, now = performance.now()) {
  markerManager.list()
    .filter((marker) => marker.userData.role === "video")
    .forEach((marker) => {
      const video = videoStateForMarker(marker, now);
      const layout = videoProjectionLayout(marker, width, height);
      const { point, anchor, w, h } = layout;
      const hue = 350 + Math.sin(video.currentTime * 0.65) * 18;
      drawProjectionAnchorLeader(ctx, point, anchor, w, h, video.scrubbing ? "rgba(255, 255, 255, 0.88)" : "rgba(252, 165, 165, 0.78)");
      ctx.fillStyle = "#111827";
      ctx.fillRect(anchor.x, anchor.y, w, h);
      const frame = ctx.createLinearGradient(anchor.x, anchor.y, anchor.x + w, anchor.y + h);
      frame.addColorStop(0, `hsla(${hue}, 92%, 78%, 0.26)`);
      frame.addColorStop(0.5, `hsla(${hue + 45}, 92%, 66%, 0.1)`);
      frame.addColorStop(1, `hsla(${hue + 90}, 92%, 74%, 0.22)`);
      ctx.fillStyle = frame;
      ctx.fillRect(anchor.x + 8, anchor.y + 42, w - 16, h - 88);
      ctx.strokeStyle = video.scrubbing ? "#ffffff" : "#fca5a5";
      ctx.lineWidth = video.scrubbing ? 7 : 3;
      ctx.shadowColor = video.scrubbing ? "rgba(255,255,255,0.8)" : "rgba(252,165,165,0.4)";
      ctx.shadowBlur = video.scrubbing ? 26 : 10;
      ctx.strokeRect(anchor.x, anchor.y, w, h);
      ctx.shadowBlur = 0;
      ctx.fillStyle = "rgba(252, 165, 165, 0.22)";
      for (let stripe = 0; stripe < 6; stripe += 1) {
        const stripeHeight = 46 + Math.abs(Math.sin(video.currentTime * 0.8 + stripe)) * 86;
        ctx.fillRect(anchor.x + 18 + stripe * 62, anchor.y + 66, 36, stripeHeight);
      }
      ctx.fillStyle = "#f5efe2";
      ctx.font = "18px IBM Plex Mono, monospace";
      ctx.fillText(video.scrubbing ? "SCRUBBING VIDEO" : video.paused ? "VIDEO PAUSED" : "VIDEO PLAYING", anchor.x + 18, anchor.y + 28);
      drawVideoActionArea(ctx, layout, video);
      ctx.font = "14px IBM Plex Mono, monospace";
      ctx.fillText(`TAG ${marker.userData.tagId}  ${formatVideoTime(video.currentTime)} / ${formatVideoTime(video.duration)}`, anchor.x + 18, anchor.y + h - 42);
      ctx.fillStyle = "rgba(255, 255, 255, 0.28)";
      ctx.fillRect(anchor.x + 18, anchor.y + h - 28, w - 36, 8);
      ctx.fillStyle = video.scrubbing ? "#ffffff" : "#fca5a5";
      ctx.fillRect(anchor.x + 18, anchor.y + h - 28, (w - 36) * video.progress, 8);
      ctx.beginPath();
      ctx.arc(anchor.x + 18 + (w - 36) * video.progress, anchor.y + h - 24, video.scrubbing ? 10 : 7, 0, Math.PI * 2);
      ctx.fill();
    });
}

function videoStateForMarker(marker, now) {
  const key = String(marker.userData.tagId);
  const duration = 90;
  const angle = markerManager.markerAngle(marker);
  const scrubTime = angleToUnit(angle) * duration;
  const existing = videoPlayers.get(key) || {
    lastAngle: angle,
    lastInteractionAt: now,
    playStartedAt: now + 650,
    playAnchorTime: scrubTime,
    paused: false,
  };
  if (Math.abs(angle - existing.lastAngle) > 0.003) {
    existing.lastAngle = angle;
    existing.lastInteractionAt = now;
    existing.playAnchorTime = scrubTime;
    existing.playStartedAt = now + 650;
  }
  const scrubbing = now - existing.lastInteractionAt < 650;
  const currentTime = scrubbing
    ? scrubTime
    : existing.paused
      ? existing.playAnchorTime
    : (existing.playAnchorTime + Math.max(0, now - existing.playStartedAt) / 1000) % duration;
  videoPlayers.set(key, existing);
  return {
    duration,
    currentTime,
    scrubbing,
    paused: Boolean(existing.paused),
    progress: currentTime / duration,
  };
}

function videoProjectionLayout(marker, width, height) {
  const point = boardCanvasPoint(markerManager.surfacePointForMarker(marker), width, height);
  const w = Math.min(VIDEO_CARD_WIDTH, width - 24);
  const h = Math.min(VIDEO_CARD_HEIGHT, height - 24);
  return {
    point,
    w,
    h,
    anchor: anchoredRect(point, w, h, width, height),
  };
}

function videoActionRectForLayout(layout, width, height) {
  return {
    x: (layout.anchor.x + 18) / width,
    y: (layout.anchor.y + layout.h - 84) / height,
    w: (layout.w - 36) / width,
    h: 36 / height,
  };
}

function drawVideoActionArea(ctx, layout, video) {
  const x = layout.anchor.x + 18;
  const y = layout.anchor.y + layout.h - 84;
  const w = layout.w - 36;
  ctx.save();
  ctx.fillStyle = video.paused ? "rgba(134, 239, 172, 0.22)" : "rgba(255, 179, 96, 0.2)";
  ctx.strokeStyle = video.paused ? "rgba(134, 239, 172, 0.9)" : "rgba(255, 179, 96, 0.9)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  roundedRectPath(ctx, x, y, w, 36, 8);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "#f5efe2";
  ctx.font = "12px IBM Plex Mono, monospace";
  ctx.fillText(video.paused ? "ACTION TAG AREA: PLAY" : "ACTION TAG AREA: PAUSE", x + 12, y + 23);
  ctx.restore();
}

function angleToUnit(angle) {
  return (((angle % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)) / (Math.PI * 2);
}

function formatVideoTime(value) {
  const total = Math.max(0, Math.floor(Number(value || 0)));
  const minutes = Math.floor(total / 60);
  const seconds = String(total % 60).padStart(2, "0");
  return `${minutes}:${seconds}`;
}

function drawProjectionModel(ctx, width, height) {
  markerManager.list()
    .filter((marker) => marker.userData.role === "object3d")
    .forEach((marker) => {
      const point = boardCanvasPoint(markerManager.surfacePointForMarker(marker), width, height);
      const angle = markerManager.markerAngle(marker);
      const halfW = 48 + Math.abs(Math.cos(angle)) * 38;
      const halfH = 58 + Math.abs(Math.sin(angle * 0.7)) * 24;
      const depth = 22 + Math.abs(Math.sin(angle)) * 68;
      const direction = Math.sin(angle) < 0 ? -1 : 1;
      const skewX = direction * depth;
      const skewY = -depth * 0.58;
      ctx.strokeStyle = "#bfdbfe";
      ctx.lineWidth = 3;
      const front = [
        [point.x - halfW, point.y - halfH],
        [point.x + halfW, point.y - halfH],
        [point.x + halfW, point.y + halfH],
        [point.x - halfW, point.y + halfH],
      ];
      const back = front.map(([px, py]) => [px + skewX, py + skewY]);
      drawPath(ctx, front, true);
      drawPath(ctx, back, true);
      for (let i = 0; i < 4; i += 1) {
        ctx.beginPath();
        ctx.moveTo(front[i][0], front[i][1]);
        ctx.lineTo(back[i][0], back[i][1]);
        ctx.stroke();
      }
      ctx.fillStyle = "#bfdbfe";
      ctx.font = "16px IBM Plex Mono, monospace";
      ctx.fillText("3D MODEL", point.x - 50, point.y + halfH + 32);
    });
}

function drawProjectionVertices(ctx, width, height) {
  const vertices = markerManager.list().filter((marker) => marker.userData.role === "vertex");
  if (!vertices.length) return;
  const points = vertices.map((marker) => {
    return boardCanvasPoint(markerManager.surfacePointForMarker(marker), width, height);
  });
  const closed = points.length >= 3;
  if (closed) {
    ctx.fillStyle = "rgba(134, 239, 172, 0.14)";
    ctx.beginPath();
    points.forEach((point, index) => {
      if (index === 0) ctx.moveTo(point.x, point.y);
      else ctx.lineTo(point.x, point.y);
    });
    ctx.closePath();
    ctx.fill();
  }
  ctx.strokeStyle = "#86efac";
  ctx.lineWidth = 4;
  drawPath(ctx, points.map((point) => [point.x, point.y]), closed);
  points.forEach((point, index) => {
    ctx.fillStyle = "#86efac";
    ctx.beginPath();
    ctx.arc(point.x, point.y, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#0f172a";
    ctx.font = "14px IBM Plex Mono, monospace";
    ctx.fillText(String(index + 1), point.x + 12, point.y - 10);
  });
}

function drawProjectionTimer(ctx, width, height) {
  markerManager.list()
    .filter((marker) => marker.userData.role === "timer")
    .forEach((marker) => {
      const point = boardCanvasPoint(markerManager.surfacePointForMarker(marker), width, height);
      const x = point.x;
      const y = point.y;
      ctx.strokeStyle = "#c4b5fd";
      ctx.lineWidth = 8;
      ctx.beginPath();
      ctx.arc(x, y, 52, -Math.PI / 2, Math.PI * 1.2);
      ctx.stroke();
      ctx.fillStyle = "#f5efe2";
      ctx.font = "28px IBM Plex Mono, monospace";
      ctx.fillText("02:00", x - 44, y + 10);
    });
}

function boardCanvasPoint(point, width, height) {
  const mapped = surfaceToProjectorPoint(point);
  return {
    x: mapped.x * width,
    y: mapped.y * height,
  };
}

function boardCanvasRect(rect, width, height) {
  return boundingCanvasRect(boardCanvasQuad(rect, width, height), width, height);
}

function boardObjectCanvasRect(object, width, height) {
  const w = Math.max(0.001, Number(object?.w || 0.18));
  const h = Math.max(0.001, Number(object?.h || 0.12));
  return boardCanvasRect({
    x: Number(object?.x ?? 0.5) - w / 2,
    y: Number(object?.y ?? 0.5) - h / 2,
    w,
    h,
  }, width, height);
}

function boardCanvasQuad(rect, width, height) {
  const x = clamp01(rect?.x ?? 0);
  const y = clamp01(rect?.y ?? 0);
  const w = Math.max(0, Math.min(clamp01(rect?.w ?? 0), 1 - x));
  const h = Math.max(0, Math.min(clamp01(rect?.h ?? 0), 1 - y));
  return [
    boardCanvasPoint({ x, y }, width, height),
    boardCanvasPoint({ x: x + w, y }, width, height),
    boardCanvasPoint({ x: x + w, y: y + h }, width, height),
    boardCanvasPoint({ x, y: y + h }, width, height),
  ];
}

function fillCanvasQuad(ctx, points) {
  if (!points.length) return;
  ctx.beginPath();
  points.forEach((point, index) => {
    if (index === 0) ctx.moveTo(point.x, point.y);
    else ctx.lineTo(point.x, point.y);
  });
  ctx.closePath();
  ctx.fill();
}

function strokeCanvasQuad(ctx, points) {
  if (!points.length) return;
  ctx.beginPath();
  points.forEach((point, index) => {
    if (index === 0) ctx.moveTo(point.x, point.y);
    else ctx.lineTo(point.x, point.y);
  });
  ctx.closePath();
  ctx.stroke();
}

function boundingCanvasRect(points, width, height) {
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const left = clamp(Math.min(...xs), 0, width);
  const top = clamp(Math.min(...ys), 0, height);
  const right = clamp(Math.max(...xs), 0, width);
  const bottom = clamp(Math.max(...ys), 0, height);
  return {
    x: left,
    y: top,
    w: Math.max(1, right - left),
    h: Math.max(1, bottom - top),
  };
}

function surfaceToProjectorPoint(point) {
  const surfacePoint = {
    x: clamp01(point?.x ?? 0.5),
    y: clamp01(point?.y ?? 0.5),
  };
  try {
    return applyHomography(projectorMapping.surfaceToProjector, surfacePoint);
  } catch {
    return surfacePoint;
  }
}

function expandRect(rect, amount, width, height) {
  const x = clamp(rect.x - amount, 0, width);
  const y = clamp(rect.y - amount, 0, height);
  const right = clamp(rect.x + rect.w + amount, 0, width);
  const bottom = clamp(rect.y + rect.h + amount, 0, height);
  return {
    x,
    y,
    w: Math.max(1, right - x),
    h: Math.max(1, bottom - y),
  };
}

function roundedRectPath(ctx, x, y, w, h, radius) {
  const r = Math.max(0, Math.min(radius, w / 2, h / 2));
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
}

function anchoredRect(point, rectWidth, rectHeight, canvasWidth, canvasHeight) {
  const gutter = 56;
  const x = point.x + gutter + rectWidth <= canvasWidth
    ? point.x + gutter
    : point.x - gutter - rectWidth >= 0
      ? point.x - gutter - rectWidth
      : clamp(point.x - rectWidth / 2, 0, canvasWidth - rectWidth);
  const y = point.y + gutter + rectHeight <= canvasHeight
    ? point.y + gutter
    : point.y - gutter - rectHeight >= 0
      ? point.y - gutter - rectHeight
      : clamp(point.y - rectHeight / 2, 0, canvasHeight - rectHeight);
  return {
    x,
    y,
  };
}

function drawProjectionAnchorLeader(ctx, point, rect, rectWidth, rectHeight, color) {
  const target = {
    x: clamp(point.x, rect.x, rect.x + rectWidth),
    y: clamp(point.y, rect.y, rect.y + rectHeight),
  };
  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 3;
  ctx.setLineDash([10, 8]);
  ctx.beginPath();
  ctx.moveTo(point.x, point.y);
  ctx.lineTo(target.x, target.y);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.beginPath();
  ctx.arc(point.x, point.y, 9, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function anchoredBoardRect(point, rectWidth = 360 / 1536, rectHeight = 220 / 800) {
  return {
    x: Math.min(clamp01(point?.x ?? 0.5), 1 - rectWidth),
    y: Math.min(clamp01(point?.y ?? 0.5), 1 - rectHeight),
    w: rectWidth,
    h: rectHeight,
  };
}

function zoneForPoint(point) {
  return buildZoneRects().find((zone) => (
    point.x >= zone.x &&
    point.x <= zone.x + zone.w &&
    point.y >= zone.y &&
    point.y <= zone.y + zone.h
  )) || null;
}

function buildZoneRects() {
  const markers = markerManager.list().filter((marker) => marker.userData.role === "zone");
  const zones = [];
  for (let index = 0; index < markers.length; index += 2) {
    const firstMarker = markers[index];
    const first = markerManager.surfacePointForMarker(firstMarker);
    const secondMarker = markers[index + 1];
    const colorMarker = secondMarker || firstMarker;
    const colors = zoneColorsFromAngle(markerManager.markerAngle(colorMarker));
    if (!secondMarker) {
      zones.push({
        id: `zone-${index / 2 + 1}`,
        index: index / 2,
        x: clamp01(first.x),
        y: clamp01(first.y),
        w: clamp01(0.16),
        h: clamp01(0.18),
        ...colors,
      });
      continue;
    }
    const second = markerManager.surfacePointForMarker(secondMarker);
    zones.push({
      id: `zone-${index / 2 + 1}`,
      index: index / 2,
      x: clamp01(Math.min(first.x, second.x)),
      y: clamp01(Math.min(first.y, second.y)),
      w: clamp01(Math.abs(second.x - first.x)),
      h: clamp01(Math.abs(second.y - first.y)),
      ...colors,
    });
  }
  return zones.filter((zone) => zone.w > 0.02 && zone.h > 0.02);
}

function zoneColorsFromAngle(angle) {
  const hue = Math.round((((angle % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)) / (Math.PI * 2) * 360);
  return {
    stroke: `hsla(${hue}, 78%, 68%, 0.95)`,
    fill: `hsla(${hue}, 78%, 58%, 0.15)`,
    text: `hsl(${hue}, 78%, 72%)`,
    anchor: `hsl(${hue}, 92%, 62%)`,
  };
}

function updateZoneCaptureSummary(state) {
  const actionMarkers = markerManager.list().filter((marker) => marker.userData.role === "action");
  const zones = buildZoneRects();
  const activeZone = zones.find((zone) => actionMarkers.some((marker) => {
    const point = markerManager.surfacePointForMarker(marker);
    return point.x >= zone.x && point.x <= zone.x + zone.w && point.y >= zone.y && point.y <= zone.y + zone.h;
  }));
  if (!activeZone) return;
  const activeActionMarkers = actionMarkers.filter((marker) => {
    const point = markerManager.surfacePointForMarker(marker);
    return point.x >= activeZone.x && point.x <= activeZone.x + activeZone.w && point.y >= activeZone.y && point.y <= activeZone.y + activeZone.h;
  });

  const capturedMarkers = markerManager.list().filter((marker) => {
    if (["zone", "action"].includes(marker.userData.role)) return false;
    const point = markerManager.surfacePointForMarker(marker);
    return point.x >= activeZone.x && point.x <= activeZone.x + activeZone.w && point.y >= activeZone.y && point.y <= activeZone.y + activeZone.h;
  });
  const capturedStrokes = (state.board?.strokes || []).filter((stroke) => (
    (stroke.points || []).some((point) => point.x >= activeZone.x && point.x <= activeZone.x + activeZone.w && point.y >= activeZone.y && point.y <= activeZone.y + activeZone.h)
  ));
  const signature = `${activeZone.id}:${capturedMarkers.map((marker) => marker.userData.tagId).join(",")}:${capturedStrokes.length}`;
  if (signature === lastZoneCaptureSignature) return;
  lastZoneCaptureSignature = signature;
  activeActionMarkers.forEach((marker) => markerManager.pulse(marker, { color: "#ffb360", duration: 980, intensity: 1.4 }));
  capturedMarkers.forEach((marker) => markerManager.pulse(marker, { duration: 720, intensity: 0.9 }));

  const lines = [
    `${capturedMarkers.length} tags captured`,
    `${capturedStrokes.length} writing strokes`,
    ...capturedMarkers.slice(0, 5).map((marker) => `${marker.userData.label} tag ${marker.userData.tagId}`),
  ];
  projectToClassroom({
    eyebrow: "WHITEBOARD CAPTURE",
    title: `ZONE ${activeZone.index + 1} CAPTURE`,
    status: `Zone ${activeZone.index + 1} sent from board`,
    lines,
  });
}

function updateSlideControls(state) {
  const slideMarkers = markerManager.list().filter((marker) => marker.userData.role === "slide");
  const actionMarkers = markerManager.list().filter((marker) => marker.userData.role === "action");
  if (!slideMarkers.length || !actionMarkers.length) {
    lastSlideControlSignature = "";
    return;
  }

  for (const slideMarker of slideMarkers) {
    const slidePoint = markerManager.surfacePointForMarker(slideMarker);
    const rect = anchoredBoardRect(surfaceToProjectorPoint(slidePoint));
    for (const actionMarker of actionMarkers) {
      const actionPoint = surfaceToProjectorPoint(markerManager.surfacePointForMarker(actionMarker));
      if (!pointInRect(actionPoint, rect)) continue;
      const direction = actionPoint.x < rect.x + rect.w / 2 ? -1 : 1;
      const signature = `${actionMarker.userData.tagId}:${slideMarker.userData.tagId}:${direction}`;
      if (signature === lastSlideControlSignature) return;
      lastSlideControlSignature = signature;
      markerManager.pulse(actionMarker, { color: "#ffb360", duration: 980, intensity: 1.45 });
      markerManager.pulse(slideMarker, { color: "#93c5fd", duration: 760, intensity: 1 });
      advanceClassroomSlide(direction, state);
      return;
    }
  }
  lastSlideControlSignature = "";
}

function updateVideoControls(width, height, now = performance.now()) {
  const videoMarkers = markerManager.list().filter((marker) => marker.userData.role === "video");
  const actionMarkers = markerManager.list().filter((marker) => marker.userData.role === "action");
  if (!videoMarkers.length || !actionMarkers.length) {
    lastVideoControlSignature = "";
    return;
  }

  for (const videoMarker of videoMarkers) {
    const layout = videoProjectionLayout(videoMarker, width, height);
    const actionRect = videoActionRectForLayout(layout, width, height);
    for (const actionMarker of actionMarkers) {
      const actionPoint = surfaceToProjectorPoint(markerManager.surfacePointForMarker(actionMarker));
      if (!pointInRect(actionPoint, actionRect)) continue;
      const signature = `${actionMarker.userData.tagId}:${videoMarker.userData.tagId}`;
      if (signature === lastVideoControlSignature) return;
      lastVideoControlSignature = signature;
      const paused = toggleVideoPlayback(videoMarker, now);
      markerManager.pulse(actionMarker, { color: "#ffb360", duration: 980, intensity: 1.45 });
      markerManager.pulse(videoMarker, { color: paused ? "#86efac" : "#fca5a5", duration: 760, intensity: 1 });
      announceRoom(paused ? "Video paused from action tag" : "Video resumed from action tag");
      return;
    }
  }
  lastVideoControlSignature = "";
}

function updateFigurateCharacterControls(state, width, height) {
  const figurateMarkers = markerManager.list().filter((marker) => marker.userData.role === "figurate");
  updateFiguratePresence(state, figurateMarkers);
  const actionMarkers = markerManager.list().filter((marker) => marker.userData.role === "action");
  if (!figurateMarkers.length || !actionMarkers.length) {
    lastFigurateAskSignature = "";
    return;
  }

  for (const figurateMarker of figurateMarkers) {
    const layout = figurateProjectionLayout(figurateMarker, width, height);
    const actionRect = figurateActionRectForLayout(layout, width, height);
    for (const actionMarker of actionMarkers) {
      const actionPoint = surfaceToProjectorPoint(markerManager.surfacePointForMarker(actionMarker));
      if (!pointInRect(actionPoint, actionRect)) continue;
      const signature = `${actionMarker.userData.tagId}:${figurateMarker.userData.tagId}`;
      if (signature === lastFigurateAskSignature) return;
      lastFigurateAskSignature = signature;
      markerManager.pulse(actionMarker, { color: "#ffb360", duration: 980, intensity: 1.45 });
      markerManager.pulse(figurateMarker, { color: "#c7d2fe", duration: 980, intensity: 1.35 });
      void server.postAction("character.ask", {
        text: buildFiguratePrompt(state, figurateMarker),
      }).then((result) => {
        if (!result.ok) {
          console.warn("virtual-room figurate ask failed", result.error);
          return;
        }
        const utterance = result.data?.utterance || "Figurate responded.";
        projectToClassroom({
          eyebrow: "FIGURATE",
          title: "Room Character",
          status: "Figurate responded",
          lines: [utterance],
        });
      });
      announceRoom("Figurate is thinking");
      return;
    }
  }
  lastFigurateAskSignature = "";
}

function updateFiguratePresence(state, figurateMarkers) {
  if (!figurateMarkers.length) {
    if (state.character?.present && lastFiguratePresenceSignature !== "absent") {
      lastFiguratePresenceSignature = "absent";
      void server.postAction("character.presence.set", { present: false });
    }
    return;
  }
  const primary = figurateMarkers[0];
  const point = markerManager.surfacePointForMarker(primary);
  const signature = `${primary.userData.tagId}:${Math.round(point.x * 20)}:${Math.round(point.y * 20)}`;
  if (signature === lastFiguratePresenceSignature) return;
  lastFiguratePresenceSignature = signature;
  void server.postAction("character.presence.set", {
    present: true,
    characterId: "figurate",
    label: "Figurate",
    surface: "board",
    x: point.x,
    y: point.y,
    tagId: primary.userData.tagId,
  }).then((result) => {
    if (!result.ok) console.warn("virtual-room figurate presence failed", result.error);
  });
}

function figurateActionRectForLayout(layout, width, height) {
  return {
    x: layout.anchor.x / width,
    y: layout.anchor.y / height,
    w: layout.w / width,
    h: layout.h / height,
  };
}

function buildFiguratePrompt(state, marker) {
  const point = markerManager.surfacePointForMarker(marker);
  const objects = state.board?.objects?.length || 0;
  const strokes = state.board?.strokes?.length || 0;
  const focuses = state.room?.focuses?.length || 0;
  return `Figurate room-aware response. Board has ${objects} objects, ${strokes} writing strokes, ${focuses} focus nodes. Tag is at ${point.x.toFixed(2)}, ${point.y.toFixed(2)}. Give one short useful response for students.`;
}

function updateActionEraseControls(state, width, height) {
  const actionMarkers = markerManager.list().filter((marker) => marker.userData.role === "action");
  if (!actionMarkers.length) {
    lastActionEraseSignature = "";
    return;
  }
  for (const actionMarker of actionMarkers) {
    const point = markerManager.surfacePointForMarker(actionMarker);
    if (isActionReservedForContext(point, width, height)) continue;
    const serverHit = nearestStrokeDistance(state.board?.strokes || [], point) <= 0.045;
    const trailHit = nearestStrokeDistance(markerTrailStrokes(), point) <= 0.052;
    if (!serverHit && !trailHit) continue;
    const signature = `${actionMarker.userData.tagId}:${Math.round(point.x * 80)}:${Math.round(point.y * 80)}:${state.board?.strokes?.length || 0}:${markerTrails.size}`;
    if (signature === lastActionEraseSignature) return;
    lastActionEraseSignature = signature;
    eraseMarkerTrailsNear(point, 0.055);
    if (serverHit) {
      void server.postAction("board.stroke.erase.near", {
        x: point.x,
        y: point.y,
        radius: 0.055,
      }).then((result) => {
        if (!result.ok) console.warn("virtual-room action erase failed", result.error);
      });
    }
    markerManager.pulse(actionMarker, { color: "#e5e7eb", duration: 820, intensity: 1.35 });
    announceRoom("Action tag erased nearby writing");
    return;
  }
  lastActionEraseSignature = "";
}

function isActionReservedForContext(actionPoint, width, height) {
  if (buildZoneRects().some((zone) => pointInRect(actionPoint, zone))) return true;
  const projectorPoint = surfaceToProjectorPoint(actionPoint);
  const activeSlideRect = markerManager.list()
    .filter((marker) => marker.userData.role === "slide")
    .map((marker) => anchoredBoardRect(surfaceToProjectorPoint(markerManager.surfacePointForMarker(marker))))
    .find((rect) => pointInRect(projectorPoint, rect));
  if (activeSlideRect) return true;
  const activeFigurateRect = markerManager.list()
    .filter((marker) => marker.userData.role === "figurate")
    .some((marker) => pointInRect(projectorPoint, figurateActionRectForLayout(figurateProjectionLayout(marker, width, height), width, height)));
  if (activeFigurateRect) return true;
  return markerManager.list()
    .filter((marker) => marker.userData.role === "video")
    .some((marker) => pointInRect(projectorPoint, videoActionRectForLayout(videoProjectionLayout(marker, width, height), width, height)));
}

function nearestStrokeDistance(strokes, point) {
  let best = Number.POSITIVE_INFINITY;
  strokes.forEach((stroke) => {
    const points = stroke.points || [];
    if (!points.length) return;
    if (points.length === 1) {
      best = Math.min(best, surfaceDistance(points[0], point));
      return;
    }
    for (let index = 0; index < points.length - 1; index += 1) {
      best = Math.min(best, distanceToSurfaceSegment(point, points[index], points[index + 1]));
    }
  });
  return best;
}

function eraseMarkerTrailsNear(point, radius) {
  markerTrails.forEach((trail, key) => {
    const next = trail.filter((trailPoint) => surfaceDistance(trailPoint, point) > radius);
    if (next.length < 2) markerTrails.delete(key);
    else markerTrails.set(key, next);
  });
}

function toggleVideoPlayback(marker, now = performance.now()) {
  const key = String(marker.userData.tagId);
  const current = videoStateForMarker(marker, now);
  const state = videoPlayers.get(key);
  state.paused = !state.paused;
  state.playAnchorTime = current.currentTime;
  state.playStartedAt = now;
  state.lastInteractionAt = now - 700;
  videoPlayers.set(key, state);
  return state.paused;
}

function pointInRect(point, rect) {
  return (
    point.x >= rect.x &&
    point.x <= rect.x + rect.w &&
    point.y >= rect.y &&
    point.y <= rect.y + rect.h
  );
}

function surfaceDistance(a, b) {
  return Math.hypot(Number(a?.x || 0) - Number(b?.x || 0), Number(a?.y || 0) - Number(b?.y || 0));
}

function distanceToSurfaceSegment(point, a, b) {
  const abx = Number(b?.x || 0) - Number(a?.x || 0);
  const aby = Number(b?.y || 0) - Number(a?.y || 0);
  const apx = Number(point?.x || 0) - Number(a?.x || 0);
  const apy = Number(point?.y || 0) - Number(a?.y || 0);
  const mag = abx * abx + aby * aby || 1;
  const t = clamp((apx * abx + apy * aby) / mag, 0, 1);
  return Math.hypot(
    Number(point?.x || 0) - (Number(a?.x || 0) + abx * t),
    Number(point?.y || 0) - (Number(a?.y || 0) + aby * t),
  );
}

function advanceClassroomSlide(direction, state) {
  const deck = buildClassroomSlides(state);
  classroomSlideIndex = (classroomSlideIndex + direction + deck.length) % deck.length;
  const slide = deck[classroomSlideIndex];
  emitSlideControl(direction, slide, deck.length);
  projectToClassroom({
    ...slide,
    eyebrow: "WHITEBOARD SLIDE CONTROL",
    status: direction > 0 ? "Action tag advanced the slide" : "Action tag went back one slide",
    slideIndex: classroomSlideIndex,
    slideCount: deck.length,
  });
}

function emitSlideControl(direction, slide, slideCount) {
  void server.postAction("event.manual", {
    event_type: "slide.control.requested",
    payload: {
      action: direction > 0 ? "next" : "previous",
      direction,
      target: "slide.current",
      sourceSurface: "board",
      controller: "virtual-room-slide-tag",
      slideIndex: classroomSlideIndex,
      slideCount,
      title: slide?.title || "Classroom slide",
    },
  }).then((result) => {
    if (!result.ok) console.warn("virtual-room slide control event failed", result.error);
  });
}

function buildClassroomSlides(state = latestRoomState) {
  const objects = state?.board?.objects || [];
  const strokes = state?.board?.strokes || [];
  const recentEvents = (state?.events || []).slice(0, 5).map((event) => event.event_type || event.type || "event");
  return [
    {
      title: "Board Summary",
      lines: [
        `${objects.length} board objects`,
        `${strokes.length} writing strokes`,
        `mode: ${state?.room?.boardMode || "stage"}`,
        ...objects.slice(0, 4).map((object) => object.label || object.kind || "Object"),
      ],
    },
    {
      title: "Captured Notes",
      lines: objects.length
        ? objects.slice(0, 6).map((object) => `${object.label || object.kind}: ${object.text || object.color || "on board"}`)
        : ["No board notes captured yet."],
    },
    {
      title: "Room Signals",
      lines: recentEvents.length ? recentEvents : classroomLog.slice(0, 5),
    },
  ];
}

async function createSampledStickyNote() {
  const x = 0.18 + Math.random() * 0.56;
  const y = 0.18 + Math.random() * 0.56;
  const stickyHeight = 0.11;
  try {
    await server.postAction("board.object.create", {
      kind: "sticky",
      label: "Sticky Note",
      text: "",
      x,
      y,
      w: stickyHeight * (BOARD_SURFACE.heightY / BOARD_SURFACE.widthZ),
      h: stickyHeight,
      color: sampledStickyColor,
    });
    announceRoom(`Detected sticky note ${sampledStickyColor}`);
  } catch (error) {
    console.warn("virtual-room sticky create failed", error);
  }
}

function finishStickyColorSample(event) {
  sampledStickyColor = sampleColorFromCameraView(event);
  stickySampleArmed = false;
  sampleStickyBtn?.classList.remove("active");
  if (sampleStickyBtn) {
    sampleStickyBtn.textContent = "sample";
    sampleStickyBtn.style.setProperty("--sample-color", sampledStickyColor);
  }
  markerPad.querySelector(".sticky-sample-button")?.style.setProperty("--sample-color", sampledStickyColor);
  announceRoom(`Sticky-note detector sampled ${sampledStickyColor}`);
}

function sampleColorFromCameraView(event = null) {
  if (activeCameraSource.type === "physical" && physicalCameraVideo?.readyState >= 2) {
    try {
      const rect = physicalCameraVideo.getBoundingClientRect();
      const canvas = document.createElement("canvas");
      const size = 18;
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext("2d");
      const x = event
        ? ((event.clientX - rect.left) / Math.max(1, rect.width)) * physicalCameraVideo.videoWidth
        : physicalCameraVideo.videoWidth * 0.5;
      const y = event
        ? ((event.clientY - rect.top) / Math.max(1, rect.height)) * physicalCameraVideo.videoHeight
        : physicalCameraVideo.videoHeight * 0.5;
      ctx.drawImage(
        physicalCameraVideo,
        Math.max(0, Math.min(physicalCameraVideo.videoWidth - size, x - size / 2)),
        Math.max(0, Math.min(physicalCameraVideo.videoHeight - size, y - size / 2)),
        size,
        size,
        0,
        0,
        size,
        size,
      );
      const pixels = ctx.getImageData(0, 0, size, size).data;
      let rSum = 0;
      let gSum = 0;
      let bSum = 0;
      for (let index = 0; index < pixels.length; index += 4) {
        rSum += pixels[index];
        gSum += pixels[index + 1];
        bSum += pixels[index + 2];
      }
      const count = pixels.length / 4;
      return nearestStickyColor(rSum / count, gSum / count, bSum / count);
    } catch {
      // Fall through to simulated camera sampling/fallback below.
    }
  }
  try {
    const gl = povRenderer.getContext();
    const width = gl.drawingBufferWidth;
    const height = gl.drawingBufferHeight;
    const rect = povCanvas.getBoundingClientRect();
    const cx = event
      ? Math.floor(((event.clientX - rect.left) / Math.max(1, rect.width)) * width)
      : Math.floor(width * 0.5);
    const cy = event
      ? Math.floor((1 - ((event.clientY - rect.top) / Math.max(1, rect.height))) * height)
      : Math.floor(height * 0.5);
    const pixel = new Uint8Array(4);
    let rSum = 0;
    let gSum = 0;
    let bSum = 0;
    let count = 0;
    for (let dy = -4; dy <= 4; dy += 2) {
      for (let dx = -4; dx <= 4; dx += 2) {
        gl.readPixels(
          Math.max(0, Math.min(width - 1, cx + dx)),
          Math.max(0, Math.min(height - 1, cy + dy)),
          1,
          1,
          gl.RGBA,
          gl.UNSIGNED_BYTE,
          pixel,
        );
        const [r, g, b] = pixel;
        if (r + g + b < 80) continue;
        rSum += r;
        gSum += g;
        bSum += b;
        count += 1;
      }
    }
    if (count) return nearestStickyColor(rSum / count, gSum / count, bSum / count);
  } catch {
    // Fall back to known sticky colors if the browser blocks framebuffer reads.
  }
  stickyPaletteIndex = (stickyPaletteIndex + 1) % STICKY_COLORS.length;
  return STICKY_COLORS[stickyPaletteIndex];
}

function announceRoom(message) {
  projectToClassroom({
    eyebrow: "WHITEBOARD STATUS",
    title: "Room Thinking",
    status: message,
    lines: classroomLog.slice(0, 5),
  });
}

function projectToClassroom(summary) {
  const status = String(summary.status || summary.title || "Room updated");
  classroomLog = [status, ...classroomLog.filter((line) => line !== status)].slice(0, 6);
  room.classroomScreen?.render({
    accent: "#ffb360",
    ...summary,
  });
  void server.postAction("projection.classroom.update", {
    sourceSurface: "board",
    title: summary.title || "Classroom Screen",
    status,
    lines: Array.isArray(summary.lines) ? summary.lines : [],
    slideIndex: summary.slideIndex,
    slideCount: summary.slideCount,
  }).then((result) => {
    if (!result.ok) console.warn("virtual-room classroom projection update failed", result.error);
  });
}

function drawPath(ctx, points, closed) {
  if (!points.length) return;
  ctx.beginPath();
  points.forEach(([x, y], index) => {
    if (index === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  if (closed) ctx.closePath();
  ctx.stroke();
}

function isStickyColor(color) {
  return STICKY_COLORS.includes(String(color || "").toLowerCase());
}

function isStickyObject(object) {
  return Boolean(object) && ((object.kind || "sticky") === "sticky" || isStickyColor(object.color));
}

function nextStickyColor(currentColor, direction = 1) {
  const normalized = String(currentColor || "").toLowerCase();
  const currentIndex = STICKY_COLORS.findIndex((color) => color.toLowerCase() === normalized);
  const index = currentIndex >= 0 ? currentIndex : stickyPaletteIndex;
  const next = (index + (direction >= 0 ? 1 : -1) + STICKY_COLORS.length) % STICKY_COLORS.length;
  stickyPaletteIndex = next;
  return STICKY_COLORS[next];
}

function stickyRgb(color) {
  const hex = String(color || "#facc15").toLowerCase().replace("#", "");
  const value = Number.parseInt(hex, 16);
  if (!Number.isFinite(value)) return "250, 204, 21";
  return `${(value >> 16) & 255}, ${(value >> 8) & 255}, ${value & 255}`;
}

function markerRgb(color) {
  const hex = String(color || "#111827").toLowerCase().replace("#", "");
  const value = Number.parseInt(hex, 16);
  if (!Number.isFinite(value)) return "17, 24, 39";
  return `${(value >> 16) & 255}, ${(value >> 8) & 255}, ${value & 255}`;
}

function strokeBounds(points, width, height) {
  if (!points?.length) return null;
  const canvasPoints = points.map((point) => boardCanvasPoint(point, width, height));
  const xs = canvasPoints.map((point) => point.x);
  const ys = canvasPoints.map((point) => point.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  return {
    x: minX,
    y: minY,
    w: Math.max(8, maxX - minX),
    h: Math.max(8, maxY - minY),
  };
}

function nearestStickyColor(r, g, b) {
  let best = STICKY_COLORS[0];
  let bestDistance = Number.POSITIVE_INFINITY;
  STICKY_COLORS.forEach((color) => {
    const [cr, cg, cb] = colorToRgbArray(color);
    const distance = (r - cr) ** 2 + (g - cg) ** 2 + (b - cb) ** 2;
    if (distance < bestDistance) {
      best = color;
      bestDistance = distance;
    }
  });
  return best;
}

function colorToRgbArray(color) {
  const hex = String(color || "#facc15").replace("#", "");
  const value = Number.parseInt(hex, 16);
  if (!Number.isFinite(value)) return [250, 204, 21];
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

function setStreaming(enabled) {
  streamBtn.classList.toggle("active", enabled);
  if (enabled) detections.start();
  else detections.stop();
  streamRate.textContent = enabled ? detections.sourceSpace : "paused";
}

function setSourceSpace(sourceSpace) {
  detections.setSourceSpace(sourceSpace);
  sourceSurfaceBtn.classList.toggle("active", sourceSpace === "surface");
  sourceCameraBtn.classList.toggle("active", sourceSpace === "camera");
  streamRate.textContent = sourceSpace;
}

function syncLiveMarkersFromRoomState(roomState, options = {}) {
  if (!roomState || activeCameraSource.type !== "physical") return;
  const tokens = liveBoardMarkers(roomState);
  const signature = tokens
    .map((token) => [
      token.numericTagId ?? token.tagId ?? token.id,
      Number(token.x || 0).toFixed(4),
      Number(token.y || 0).toFixed(4),
      Number(token.angle || 0).toFixed(4),
      token.updatedAt || "",
    ].join(":"))
    .join("|");
  if (!options.force && signature === lastLiveMarkerSignature) return;
  lastLiveMarkerSignature = signature;
  markerManager.syncTokens(tokens, { replace: true, locked: true });
  updateMarkerCount();
}

function liveBoardMarkers(roomState) {
  const markers = roomState?.markers?.items || roomState?.fiducials?.markers || roomState?.table?.tokens || [];
  const boardMarkers = markers.filter((marker) => (marker.surface || "board") === "board");
  if (activeCameraSource.type !== "physical") return boardMarkers;
  const visibleTagIds = new Set(
    physicalCameraDetections
      .map((detection) => Number(detection.tagId))
      .filter(Number.isFinite)
      .map(String),
  );
  if (!visibleTagIds.size) return [];
  return boardMarkers.filter((marker) => {
    const tagId = Number(marker.numericTagId ?? marker.tagId);
    return Number.isFinite(tagId) && visibleTagIds.has(String(tagId));
  });
}

async function calibrateVisibleBoardCorners() {
  const visible = latestVisibleDetections();
  const byTag = new Map(visible.map((detection) => [Number(detection.tagId), detection]));
  const missing = BOARD_CORNER_TAGS.filter((tagId) => !byTag.has(tagId));
  if (missing.length) {
    const message = `Need visible corner tags ${missing.join(", ")}.`;
    if (cornerStatus) cornerStatus.textContent = message;
    if (serverStatus) serverStatus.textContent = message;
    return;
  }

  autoCalibrateBtn.disabled = true;
  if (cornerStatus) {
    cornerStatus.classList.add("ready");
    cornerStatus.classList.remove("calibrated");
    cornerStatus.textContent = "Solving board camera calibration...";
  }
  try {
    const cornerDetections = BOARD_CORNER_TAGS.map((tagId) => normalizeDetectionForPost(byTag.get(tagId)));
    await server.postAction("calibration.clear", { surface: "board" });
    const solve = await server.postAction("fiducial.detections.ingest", {
      surface: "board",
      sourceSpace: "camera",
      autoCalibration: true,
      autoSolve: true,
      detections: cornerDetections,
    });
    if (!solve.ok || !solve.data?.calibration?.cameraToSurfaceHomography) {
      throw new Error(solve.error || "visible-corner calibration did not produce a camera map");
    }
    const update = await server.postAction("fiducial.detections.ingest", {
      surface: "board",
      sourceSpace: "camera",
      detections: visible.map(normalizeDetectionForPost),
    });
    await calibrationPanel.refresh();
    const stateResult = await server.getState();
    if (stateResult.ok) {
      latestRoomState = stateResult.data;
      syncLiveMarkersFromRoomState(latestRoomState, { force: true });
    }
    lastDetectorPost = {
      ok: update.ok,
      count: visible.length,
      error: update.error,
      ms: 0,
      updated: update.data?.updated || [],
      skipped: update.data?.skipped || [],
      sampled: solve.data?.sampled || [],
      calibration: update.data?.calibration || solve.data?.calibration || null,
    };
    renderDetectorStatus();
    renderCornerStatus(visible);
  } catch (error) {
    if (serverStatus) serverStatus.textContent = error.message || String(error);
    if (cornerStatus) cornerStatus.textContent = error.message || String(error);
    console.warn("visible corner calibration failed", error);
  } finally {
    autoCalibrateBtn.disabled = false;
  }
}

function latestVisibleDetections() {
  return activeCameraSource.type === "physical"
    ? physicalCameraDetections
    : detections.latest || [];
}

function normalizeDetectionForPost(detection) {
  return {
    tagId: detection.tagId,
    role: detection.role,
    center: detection.center,
    corners: detection.corners,
    angle: detection.angle,
    confidence: detection.confidence,
  };
}

async function startPhysicalCamera() {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error("browser camera unavailable; use localhost or HTTPS");
  }
  if (!physicalCameraStream) {
    physicalCameraStream = await navigator.mediaDevices.getUserMedia({
      video: {
        width: { ideal: 1280 },
        height: { ideal: 720 },
      },
      audio: false,
    });
    physicalCameraVideo.srcObject = physicalCameraStream;
  }
  await physicalCameraVideo.play();
  povCanvas.parentElement.classList.add("physical-active");
  detections.stop();
  lastDetectorPost = { ...lastDetectorPost, ok: false, error: "physical camera warming up" };
  renderDetectorStatus();
}

function stopPhysicalCamera() {
  povCanvas.parentElement.classList.remove("physical-active");
  physicalCameraDetections = [];
  if (physicalCameraStream) {
    physicalCameraStream.getTracks().forEach((track) => track.stop());
    physicalCameraStream = null;
  }
  if (physicalCameraVideo) physicalCameraVideo.srcObject = null;
  if (streamBtn.classList.contains("active")) detections.start();
}

function tickPhysicalCamera(now) {
  if (activeCameraSource.type !== "physical") return physicalCameraDetections;
  if (!physicalCameraStream || physicalCameraBusy || physicalCameraVideo.readyState < 2) return physicalCameraDetections;
  if (now - lastPhysicalCameraTick < PHYSICAL_CAMERA_DETECT_INTERVAL_MS) return physicalCameraDetections;
  lastPhysicalCameraTick = now;
  detectPhysicalCameraFrame().catch((error) => {
    lastDetectorPost = { ...lastDetectorPost, ok: false, error: error.message || String(error) };
    renderDetectorStatus();
  });
  return physicalCameraDetections;
}

async function detectPhysicalCameraFrame() {
  physicalCameraBusy = true;
  const start = performance.now();
  try {
    const frame = capturePhysicalCameraFrame();
    physicalCameraFrameSize = { width: frame.width, height: frame.height };
    const response = await fetch("/api/tag-debugger/detect", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ imageDataUrl: frame.imageDataUrl }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result.ok) throw new Error(result.error || `physical detect HTTP ${response.status}`);
    physicalCameraDetections = (result.detections || []).map((detection) => ({
      tagId: detection.tag?.tagId ?? detection.tagId,
      role: detection.tag?.role || "tag",
      center: detection.center,
      corners: detection.corners,
      angle: Number(detection.angle || 0),
      confidence: Number(detection.confidence || 0),
    }));
    const post = await server.ingestDetections({
      surface: "board",
      sourceSpace: "camera",
      detections: physicalCameraDetections,
    });
    if (post.ok) postCountThisSecond += 1;
    lastDetectorPost = {
      ok: post.ok,
      count: physicalCameraDetections.length,
      error: post.error,
      ms: performance.now() - start,
      updated: post.data?.updated || [],
      skipped: post.data?.skipped || [],
      sampled: post.data?.sampled || [],
      calibration: post.data?.calibration || null,
    };
    streamRate.textContent = post.ok ? `posted ${physicalCameraDetections.length}` : "failed";
    renderDetectorStatus();
    renderPostStatus();
  } finally {
    physicalCameraBusy = false;
  }
}

function capturePhysicalCameraFrame() {
  const maxWidth = PHYSICAL_CAMERA_CAPTURE_MAX_WIDTH;
  const scale = Math.min(1, maxWidth / Math.max(1, physicalCameraVideo.videoWidth));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(physicalCameraVideo.videoWidth * scale));
  canvas.height = Math.max(1, Math.round(physicalCameraVideo.videoHeight * scale));
  const captureCtx = canvas.getContext("2d");
  captureCtx.drawImage(physicalCameraVideo, 0, 0, canvas.width, canvas.height);
  return {
    width: canvas.width,
    height: canvas.height,
    imageDataUrl: canvas.toDataURL("image/jpeg", PHYSICAL_CAMERA_CAPTURE_JPEG_QUALITY),
  };
}

function updateReplayStatus(status) {
  replayStatus.textContent = status.status || "idle";
  if (Number.isFinite(status.progress)) replayScrub.value = String(Math.round(status.progress * 1000));
  const duration = replay.duration();
  const current = duration && Number.isFinite(status.progress) ? duration * status.progress : 0;
  replayTime.textContent = `${formatMs(current)} / ${formatMs(duration)}`;
  if (status.restoreStream && wasStreamingBeforeReplay) setStreaming(true);
}

function formatMs(ms) {
  const sec = Math.max(0, Math.round(ms / 1000));
  const mm = String(Math.floor(sec / 60)).padStart(2, "0");
  const ss = String(sec % 60).padStart(2, "0");
  return `${mm}:${ss}`;
}

async function loadReplayFromSelectedSource() {
  try {
    if (replaySource.value === "live") {
      await replay.loadLive();
      return;
    }
    if (replaySource.value === "paste") {
      replay.loadJsonl(replayPaste.value, "paste");
      return;
    }
    if (replaySource.value === "file") {
      const file = replayFile.files?.[0];
      if (!file) {
        replayStatus.textContent = "choose file";
        return;
      }
      const text = await file.text();
      replay.loadJsonl(text, file.name);
      return;
    }
  } catch (error) {
    replayStatus.textContent = "parse failed";
    console.warn("Replay load failed", error);
  }
}

function resize() {
  const rect = sceneEl.getBoundingClientRect();
  resizeViews(rect.width, rect.height);

  const povRect = povCanvas.parentElement.getBoundingClientRect();
  povRenderer.setSize(povRect.width, povRect.height, false);
  detectionOverlay.width = Math.max(1, Math.floor(povRect.width));
  detectionOverlay.height = Math.max(1, Math.floor(povRect.height));
  calibrationOverlay.width = Math.max(1, Math.floor(povRect.width));
  calibrationOverlay.height = Math.max(1, Math.floor(povRect.height));
  switcher.rigs.forEach((rig) => {
    rig.cam.aspect = povRect.width / povRect.height;
    rig.cam.updateProjectionMatrix();
  });
}

function animate(now) {
  frameCounter += 1;
  if (now - fpsClock >= 500) {
    const fps = frameCounter * 1000 / (now - fpsClock);
    fpsEl.textContent = `FPS ${fps.toFixed(0)}`;
    frameCounter = 0;
    fpsClock = now;
  }
  if (now - lastRateTick >= 1000) {
    rateBadge.textContent = `${postCountThisSecond}/s`;
    postCountThisSecond = 0;
    lastRateTick = now;
    renderPostStatus();
  }

  updateCameraTween(now);
  const smoothingActive = markerManager.updateMotion(now);
  markerManager.updatePulses(now);
  renderViews();
  renderBoardProjection(now, { smoothingActive });
  renderOrientationWidget(getViewMode());
  const active = switcher.getActive();
  updateCoverage();
  if (activeCameraSource.type !== "physical" && (now - lastPovRender >= 66 || markerManager.drag)) {
    const restorePovVisibility = hidePovSelf(active);
    povRenderer.render(room.scene, active.cam);
    restorePovVisibility();
    calibrationPanel.drawOverlay();
    lastPovRender = now;
  }
  let detected = activeCameraSource.type === "physical" ? physicalCameraDetections : detections.latest || [];
  if (activeCameraSource.type === "physical") {
    detected = tickPhysicalCamera(now);
  } else if (now - lastDetectionTick >= 33 || markerManager.drag) {
    detected = detections.tick();
    lastDetectionTick = now;
  }
  const detectionSignature = signatureForDetections(detected);
  if (detectionSignature !== lastDetectionSignature || now - lastHudRender >= 250) {
    renderDetections(detected);
    lastDetectionSignature = detectionSignature;
    lastHudRender = now;
  }
  if (now - lastOverlayRender >= 66 || markerManager.drag) {
    renderDetectionOverlay(detected);
    lastOverlayRender = now;
  }
  requestAnimationFrame(animate);
}

function fallbackTagMap() {
  return {
    objectTags: {
      10: { role: "emitter" },
      11: { role: "mirror" },
      12: { role: "filter" },
      13: { role: "splitter" },
      14: { role: "blocker" },
      15: { role: "target" },
    },
  };
}

function renderPostStatus() {
  const recentFailures = postResults.slice(-3).length === 3 && postResults.slice(-3).every((item) => !item.ok);
  rateBadge.classList.toggle("fail", recentFailures);
}

function syncActionDragAffordance() {
  const marker = markerManager.drag?.marker;
  const active = marker?.userData?.role === "action" && marker.userData.surface === "board";
  const signature = active ? `action:${marker.userData.tagId}` : "none";
  const now = performance.now();
  if (signature === lastActionDragSignature && now - lastActionDragSyncAt < 650) return;
  lastActionDragSignature = signature;
  lastActionDragSyncAt = now;
  void server.postAction("board.drag.set", active
    ? {
        active: true,
        id: `tag-${marker.userData.tagId}`,
        tagId: marker.userData.tagId,
        role: "action",
        surface: "board",
        x: marker.userData.surfacePoint?.x ?? 0.5,
        y: marker.userData.surfacePoint?.y ?? 0.5,
      }
    : { active: false });
}

function signatureForDetections(items) {
  return items.map((item) => `${item.tagId}:${item.center.x}:${item.center.y}:${Math.round(item.angle * 100)}`).join("|");
}

function updateCoverage() {
  if (markerManager.list()[0]?.userData?.surface === "board") {
    room.coverage.group.visible = false;
    return;
  }
  if (!coverageEnabled) {
    room.coverage.group.visible = false;
    return;
  }
  const coverages = switcher.rigs.map((rig, index) => {
    const polygon = computeCameraCoverage(rig.cam);
    rig.coveragePolygon = polygon;
    return { polygon, color: index === 0 ? 0xd9b45f : 0x7fbcd2 };
  });
  while (coverageMeshes.length < coverages.length) {
    const mesh = new THREE.Mesh(
      new THREE.BufferGeometry(),
      new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.18,
        depthWrite: false,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
      }),
    );
    room.coverage.group.add(mesh);
    coverageMeshes.push(mesh);
  }
  coverages.forEach((coverage, index) => {
    const mesh = coverageMeshes[index];
    mesh.material.color.setHex(coverage.color);
    mesh.geometry.dispose();
    mesh.geometry = coverageGeometry(coverage.polygon);
    mesh.visible = coverage.polygon.length >= 3;
  });
  if (!gapMesh) {
    gapMesh = new THREE.Mesh(
      new THREE.BufferGeometry(),
      new THREE.MeshBasicMaterial({
        color: 0xff7a6b,
        transparent: true,
        opacity: 0.12,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    );
    room.coverage.group.add(gapMesh);
  }
  gapMesh.geometry.dispose();
  gapMesh.geometry = gapGeometry(coverages);
  gapMesh.visible = true;
  updateCameraHelperVisibility();
}

function coverageGeometry(polygon) {
  const geometry = new THREE.BufferGeometry();
  if (!polygon || polygon.length < 3) return geometry;
  const coverageY = TABLE.coverageY;
  const vertices = [];
  for (let i = 1; i < polygon.length - 1; i += 1) {
    [polygon[0], polygon[i], polygon[i + 1]].forEach((point) => {
      vertices.push(point.x, coverageY, point.z);
    });
  }
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
  geometry.computeVertexNormals();
  return geometry;
}

function gapGeometry(coverages) {
  const geometry = new THREE.BufferGeometry();
  const vertices = [];
  const y = TABLE.coverageY + 0.002;
  coverageGrid(coverages, 28, 28).filter((cell) => cell.count === 0).forEach((cell) => {
    const x1 = cell.x - cell.w / 2;
    const x2 = cell.x + cell.w / 2;
    const z1 = cell.z - cell.h / 2;
    const z2 = cell.z + cell.h / 2;
    vertices.push(
      x1, y, z1, x2, y, z1, x2, y, z2,
      x1, y, z1, x2, y, z2, x1, y, z2,
    );
  });
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
  geometry.computeVertexNormals();
  return geometry;
}

function renderOrientationWidget(viewMode = "3d") {
  const modeLabel = viewMode === "2d" ? "2D" : "3D";
  const heading = mainCam ? Math.atan2(mainCam.position.x - orbit.target.x, mainCam.position.z - orbit.target.z) : 0;
  const roundedHeading = Math.round(heading * 100) / 100;
  if (lastOrientationMode === modeLabel && lastOrientationHeading === roundedHeading) return;
  lastOrientationMode = modeLabel;
  lastOrientationHeading = roundedHeading;
  orientationWidget.classList.toggle("is-2d", viewMode === "2d");
  orientationWidget.innerHTML = `
    <span class="mode">${modeLabel}</span>
    <button class="n" data-view="front">N</button>
    <button class="s" data-view="back">S</button>
    <button class="e" data-view="right">E</button>
    <button class="w" data-view="left">W</button>
    <button class="top-face" data-view="top">TOP</button>
    <button class="home-face" data-view="home">HOME</button>
    <span class="needle" style="transform: rotate(${roundedHeading}rad)"></span>
  `;
}

function setCameraView(view) {
  const target = orbit.target.clone();
  const distance = Math.max(2.5, mainCam.position.distanceTo(target));
  const positions = {
    top: new THREE.Vector3(target.x, target.y + distance, target.z + 0.001),
    front: new THREE.Vector3(target.x, target.y + 1.1, target.z + distance),
    back: new THREE.Vector3(target.x, target.y + 1.1, target.z - distance),
    left: new THREE.Vector3(target.x - distance, target.y + 1.1, target.z),
    right: new THREE.Vector3(target.x + distance, target.y + 1.1, target.z),
    home: new THREE.Vector3(2.45, 1.72, 2.25),
  };
  const next = positions[view] || positions.home;
  cameraTween = {
    from: mainCam.position.clone(),
    to: next,
    start: performance.now(),
    duration: 420,
  };
}

function updateCameraTween(now) {
  if (!cameraTween) return;
  const t = Math.min(1, (now - cameraTween.start) / cameraTween.duration);
  const eased = 1 - Math.pow(1 - t, 3);
  mainCam.position.lerpVectors(cameraTween.from, cameraTween.to, eased);
  mainCam.lookAt(orbit.target);
  if (t >= 1) cameraTween = null;
}

function updateCameraHelperVisibility() {
  switcher.rigs.forEach((rig, index) => {
    rig.rig.visible = activeCameraSource.type !== "physical" && index === switcher.activeIndex;
    if (!rig.helper) return;
    rig.helper.visible = activeCameraSource.type !== "physical" && (coverageEnabled || index === switcher.activeIndex);
    rig.helper.update();
  });
}

function seedBoardMarkers() {
  markerManager.add({ role: "zone", surface: "board", u: 0.18, v: 0.52, angle: 0 });
  markerManager.add({ role: "zone", surface: "board", u: 0.44, v: 0.72, angle: 0 });
  markerManager.add({ role: "focus", surface: "board", u: 0.68, v: 0.22, angle: 0 });
  markerManager.add({ role: "slide", surface: "board", u: 0.72, v: 0.48, angle: 0 });
  markerManager.add({ role: "object3d", surface: "board", u: 0.78, v: 0.72, angle: 0 });
}

function loadProjectorPolygon() {
  try {
    const raw = localStorage.getItem("smart-room-projector-polygon");
    if (!raw) return DEFAULT_PROJECTOR_POLYGON;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.length >= 4 ? parsed : DEFAULT_PROJECTOR_POLYGON;
  } catch {
    return DEFAULT_PROJECTOR_POLYGON;
  }
}

function saveProjectorPolygon(polygon) {
  try {
    localStorage.setItem("smart-room-projector-polygon", JSON.stringify(polygon));
  } catch {
    // best-effort local persistence
  }
}

function setProjectorPolygon(nextPolygon, { syncCalibration = true } = {}) {
  projectorPolygon = cloneProjectorPolygon(nextPolygon);
  projectorMapping = projectorMappingForPolygon(projectorPolygon, DEFAULT_PROJECTOR_POLYGON);
  saveProjectorPolygon(projectorPolygon);
  room.whiteboard.setProjectionPolygon(projectorPolygon);
  renderProjectorMapStatus(syncCalibration ? "syncing projector map" : "local map active");
  lastProjectionRender = 0;
  if (syncCalibration) queueProjectorCalibrationSync();
}

function queueProjectorCalibrationSync() {
  window.clearTimeout(projectorCalibrationSyncTimer);
  projectorCalibrationSyncTimer = window.setTimeout(syncProjectorCalibration, 220);
}

function syncProjectorCalibration() {
  const matrix = projectorMapping?.projectorToSurface;
  if (!matrix) return;
  void server.postAction("calibration.set", {
    surface: "board",
    projectorToSurfaceHomography: matrix,
    status: "calibrated",
    error: {
      projector: {
        avg: 0,
        max: 0,
        samples: 4,
      },
    },
  }).then((result) => {
    if (!result.ok) console.warn("virtual-room projector calibration sync failed", result.error);
    renderProjectorMapStatus(result.ok ? "projector calibration synced" : "projector sync failed");
  });
}

function cloneProjectorPolygon(polygon) {
  return (polygon || DEFAULT_PROJECTOR_POLYGON).map((point) => ({ x: Number(point.x), y: Number(point.y) }));
}

function hidePovSelf(activeRig) {
  const changed = [];
  if (!activeRig?.rig) return () => {};
  activeRig.rig.traverse((object) => {
    if (object.isCamera) return;
    if (!object.isMesh) return;
    changed.push([object, object.visible]);
    object.visible = false;
  });
  return () => {
    changed.forEach(([object, visible]) => {
      object.visible = visible;
    });
  };
}

function simplifyStroke(points) {
  return points.filter((_, index) => index === 0 || index === points.length - 1 || index % 2 === 0);
}

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, Number(value) || 0));
}

function installSmokeHooks() {
  window.__virtualRoomSmoke = {
    status: () => ({
      mode,
      viewMode: activeViewMode,
      markerCount: markerManager.list().length,
      markerPadRoles: [...MARKER_PAD_ROLES],
      markerRoleCounts: markerRoleCounts(),
      projectorPoints: cloneProjectorPolygon(projectorPolygon),
      calibrationText: calibrationStatus?.textContent || "",
      mapText: projectorMapStatus?.textContent || "",
    }),
    addMarker: (role = "action") => {
      const marker = markerManager.add({
        role,
        surface: "board",
        u: 0.2 + Math.random() * 0.5,
        v: 0.2 + Math.random() * 0.5,
        angle: Math.random() * Math.PI,
      });
      announceRoom(`${ROLE_LABELS[role] || role} smoke tag added`);
      return markerSummary(marker);
    },
    moveFirstMarker: (dx = 0.04, dy = 0.03) => {
      const marker = markerManager.list().find((item) => !item.userData.locked);
      if (!marker) return null;
      const point = markerManager.surfacePointForMarker(marker);
      const next = { x: clamp01(point.x + dx), y: clamp01(point.y + dy) };
      markerManager.applySurfacePoint(marker, next, markerManager.markerAngle(marker));
      markerManager.pulse(marker, { duration: 520, intensity: 0.9 });
      updateMarkerCount();
      return markerSummary(marker);
    },
    setViewMode: (nextMode) => {
      setViewMode(nextMode);
      return activeViewMode;
    },
    setMode: (nextMode) => {
      setMode(nextMode);
      return mode;
    },
    warpFirstCorner: (dx = 0.02, dy = 0.01) => {
      const next = cloneProjectorPolygon(projectorPolygon);
      next[0] = {
        x: clamp01(next[0].x + dx),
        y: clamp01(next[0].y + dy),
      };
      setProjectorPolygon(next);
      return cloneProjectorPolygon(projectorPolygon);
    },
    resetWarp: () => {
      resetProjectorWarp();
      return cloneProjectorPolygon(projectorPolygon);
    },
  };
}

function markerSummary(marker) {
  const point = markerManager.surfacePointForMarker(marker);
  return {
    tagId: marker.userData.tagId,
    role: marker.userData.role,
    x: point.x,
    y: point.y,
  };
}

function markerRoleCounts() {
  return markerManager.list().reduce((counts, marker) => {
    const role = marker.userData.role || "unknown";
    counts[role] = (counts[role] || 0) + 1;
    return counts;
  }, {});
}

installSmokeHooks();
resize();
updateMarkerCount();
updateCameraHelperVisibility();
window.addEventListener("resize", resize);
requestAnimationFrame(animate);
