"use strict";

const http = require("http");
const https = require("https");
const fs = require("fs");
const os = require("os");
const path = require("path");
const {
  applyHomography,
  computeHomography,
  invertHomography,
  reprojectionError,
} = require("../lib/homography");
const {
  filterEvents,
  normalizeEvent,
  parseEventLine,
  routeSalience: routeEventSalience,
  validateEvent,
} = require("../lib/events");
const { readBody, sendJson, sendText } = require("./http-utils");
const { createRequestHandler } = require("./routes");
const { createStaticFileHandler } = require("./static-files");
const { createImageTagDetector } = require("./tag-detector");

const PORT = Number(process.env.PORT || 4177);
const HTTPS_PORT = Number(process.env.HTTPS_PORT || 0);
const HTTPS_PFX_PATH = process.env.HTTPS_PFX_PATH || "";
const HTTPS_PFX_PASSPHRASE = process.env.HTTPS_PFX_PASSPHRASE || "";
const ROOT_DIR = path.resolve(__dirname, "..");
const PUBLIC_DIR = path.join(ROOT_DIR, "public");
const IDEAS_DIR = path.join(ROOT_DIR, "ideas");
const THREE_DIR = path.join(ROOT_DIR, "node_modules", "three");
const DATA_DIR = path.join(ROOT_DIR, "data");
const LOCAL_DIR = path.join(ROOT_DIR, ".local");
const CAPTURE_DIR = path.join(PUBLIC_DIR, "captures", "vision");
const TAG_IMAGE_DETECTOR_SCRIPT = path.join(ROOT_DIR, "scripts", "detect-apriltags-image.py");
const DETECTOR_PYTHON = process.env.DETECTOR_PYTHON ||
  path.join(ROOT_DIR, ".venv-detector", "Scripts", "python.exe");
const ROOM_CONFIG_PATH = path.join(DATA_DIR, "room-config.json");
const TAG_MAP_PATH = path.join(DATA_DIR, "tag-map.json");
const DEVICE_SPECS_PATH = path.join(DATA_DIR, "device-specs.json");
const CLASS_OBJECTS_PATH = path.join(PUBLIC_DIR, "class-objects.json");
const PROJECT_PACKETS_PATH = path.join(PUBLIC_DIR, "project-packets.json");
const PROJECT_TAGS_PATH = path.join(DATA_DIR, "project-tags.json");
const CALIBRATION_PATH = path.join(LOCAL_DIR, "calibration.json");
const SNAPSHOT_PATH = path.join(LOCAL_DIR, "room-snapshot.json");
const REPLAY_PATH = path.join(LOCAL_DIR, "event-log.jsonl");
const bootTime = Date.now();
const DEFAULT_FIGURATE_TEXT_ENDPOINT = "/api/voice/pipeline/text";
const DEFAULT_FIGURATE_VISION_ENDPOINT = "/api/vision/analyze";
const DEFAULT_FIGURATE_TIMEOUT_MS = 8000;
const EVENT_TYPE_RE = /^[a-z][a-z0-9-]*(\.[a-z][a-z0-9-]*)+$/;
const LEGACY_EVENT_TYPE_ALIASES = {
  anomaly_change: "safety.anomaly.changed",
  fatigue_change: "attention.fatigue.changed",
  phase_change: "room.phase.changed",
  person_change: "class.presence.changed",
  probe_classification: "classifier.probe.changed",
  room_mode_change: "session.mode.changed",
  whiteboard_change: "whiteboard.changed",
};
const LEGACY_PROJECT_PACKETS = {
  "assignment-tracker": {
    id: "assignment-tracker",
    title: "Assignment Progress Tracking",
    owner: "Shuyang Tian",
    surface: "board",
    kind: "legacy-student",
    fallbackObjectId: "ocr-board-reader",
    submittedProject: true,
    source: "smart-objects-cameras classroom-api compatibility",
    description: "Assignment scanning and reminder agent from the old classroom-api roster.",
    modes: ["write", "check-understanding"],
    reads: ["whiteboard changes", "session phase"],
    writes: ["assignment suggestions", "assignment reminders"],
    canonicalSubscribes: ["whiteboard.changed", "room.phase.changed", "assignment.request"],
    canonicalEmits: ["assignment.suggested", "assignment.created", "assignment.reminder"],
    subscribes: ["whiteboard.changed", "room.phase.changed", "assignment.request"],
    emits: ["assignment.suggested", "assignment.created", "assignment.reminder"],
    eventType: "assignment.suggested",
    acceptance: {
      setup: "Run the legacy assignment tracker mock or heartbeat.",
      trigger: "Publish assignment.suggested.",
      expectEvents: ["assignment.suggested"],
      visibleResult: "The room event stream records the assignment suggestion.",
    },
    state: { status: "compatibility" },
    controls: [],
  },
  calmball: {
    id: "calmball",
    title: "CalmBall",
    owner: "Ramon Naula",
    surface: "room",
    kind: "legacy-student",
    fallbackObjectId: "gesture-response",
    submittedProject: true,
    source: "smart-objects-cameras classroom-api compatibility",
    description: "Stress regulation squeeze ball and calming sound object from the old classroom-api roster.",
    modes: ["safety-control", "character"],
    reads: ["room mode", "presence"],
    writes: ["calm activation state"],
    canonicalSubscribes: ["session.mode.changed", "class.presence.changed"],
    canonicalEmits: ["calm.activated", "calm.deactivated"],
    subscribes: ["session.mode.changed", "class.presence.changed"],
    emits: ["calm.activated", "calm.deactivated"],
    eventType: "calm.activated",
    acceptance: {
      setup: "Run the legacy CalmBall mock or heartbeat.",
      trigger: "Publish calm.activated.",
      expectEvents: ["calm.activated"],
      visibleResult: "The room event stream records the calm activation.",
    },
    state: { status: "compatibility" },
    controls: [],
  },
  echodesk: {
    id: "echodesk",
    title: "EchoDesk",
    owner: "Kathy Choi",
    surface: "board",
    kind: "legacy-student",
    fallbackObjectId: "room-character",
    submittedProject: true,
    source: "smart-objects-cameras classroom-api compatibility",
    description: "Shared question board and conversational desk object from the old classroom-api roster.",
    modes: ["character", "check-understanding"],
    reads: ["room mode", "agent messages"],
    writes: ["questions", "displayed prompts"],
    canonicalSubscribes: ["session.mode.changed", "character.message"],
    canonicalEmits: ["question.submitted", "question.displayed"],
    subscribes: ["session.mode.changed", "character.message"],
    emits: ["question.submitted", "question.displayed"],
    eventType: "question.displayed",
    acceptance: {
      setup: "Run the legacy EchoDesk mock or heartbeat.",
      trigger: "Publish question.displayed.",
      expectEvents: ["question.displayed"],
      visibleResult: "The room event stream records the displayed question.",
    },
    state: { status: "compatibility" },
    controls: [],
  },
  gravity: {
    id: "gravity",
    title: "Gravity Fiducial Camera",
    owner: "System",
    surface: "camera",
    kind: "legacy-camera",
    fallbackObjectId: "apriltag-detector",
    submittedProject: false,
    source: "smart-objects-cameras classroom-api compatibility",
    description: "Legacy OAK/camera agent for depth, object, and fiducial positioning.",
    modes: ["camera", "fiducial"],
    reads: ["camera commands", "fiducial requests"],
    writes: ["fiducial detections", "depth observations"],
    canonicalSubscribes: ["fiducial.request", "capability.request"],
    canonicalEmits: ["fiducial.detected", "fiducial.zone-entered", "fiducial.lost", "depth.observed", "capability.available"],
    subscribes: ["fiducial.request", "capability.request"],
    emits: ["fiducial.detected", "fiducial.zone-entered", "fiducial.lost", "depth.observed", "capability.available"],
    eventType: "fiducial.detected",
    acceptance: {
      setup: "Run the legacy Gravity camera worker or simulator.",
      trigger: "Publish fiducial.detected.",
      expectEvents: ["fiducial.detected"],
      visibleResult: "The room event stream records the camera detection.",
    },
    state: { status: "compatibility" },
    controls: [],
  },
  horizon: {
    id: "horizon",
    title: "Horizon Fiducial Camera",
    owner: "System",
    surface: "camera",
    kind: "legacy-camera",
    fallbackObjectId: "apriltag-detector",
    submittedProject: false,
    source: "smart-objects-cameras classroom-api compatibility",
    description: "Legacy OAK/camera agent for tagged classroom object detection.",
    modes: ["camera", "fiducial"],
    reads: ["camera commands", "fiducial requests"],
    writes: ["fiducial detections"],
    canonicalSubscribes: ["fiducial.request", "capability.request"],
    canonicalEmits: ["fiducial.detected", "fiducial.zone-entered", "fiducial.lost", "capability.available"],
    subscribes: ["fiducial.request", "capability.request"],
    emits: ["fiducial.detected", "fiducial.zone-entered", "fiducial.lost", "capability.available"],
    eventType: "fiducial.detected",
    acceptance: {
      setup: "Run the legacy Horizon camera worker or simulator.",
      trigger: "Publish fiducial.detected.",
      expectEvents: ["fiducial.detected"],
      visibleResult: "The room event stream records the camera detection.",
    },
    state: { status: "compatibility" },
    controls: [],
  },
  "prof-dm": {
    id: "prof-dm",
    title: "Professor Direct Channel",
    owner: "Instructor",
    surface: "room",
    kind: "legacy-route",
    fallbackObjectId: "room-character",
    submittedProject: false,
    source: "smart-objects-cameras classroom-api compatibility",
    description: "Private directed route for sensitive alerts and confirmations.",
    modes: ["safety-control", "character"],
    reads: ["attention", "safety", "timer events", "agent messages"],
    writes: ["phase commands", "agent confirmations"],
    canonicalSubscribes: ["attention.fatigue.changed", "safety.anomaly.changed", "timer.done", "character.message"],
    canonicalEmits: ["room.phase.requested", "character.confirmed"],
    subscribes: ["attention.fatigue.changed", "safety.anomaly.changed", "timer.done", "character.message"],
    emits: ["room.phase.requested", "character.confirmed"],
    eventType: "character.confirmed",
    acceptance: {
      setup: "Subscribe as prof-dm.",
      trigger: "Publish a directed event to prof-dm.",
      expectEvents: ["character.confirmed"],
      visibleResult: "Directed events reach the prof-dm subscriber.",
    },
    state: { status: "compatibility" },
    controls: [],
  },
};

const { sendStatic } = createStaticFileHandler({
  publicDir: PUBLIC_DIR,
  ideasDir: IDEAS_DIR,
  threeDir: THREE_DIR,
});
const imageTagDetector = createImageTagDetector({
  rootDir: ROOT_DIR,
  pythonPath: DETECTOR_PYTHON,
  scriptPath: TAG_IMAGE_DETECTOR_SCRIPT,
});

let sseClients = new Set();
let legacyStateClients = new Set();
let legacyEventClients = new Set();
let eventCounter = 0;
let roomConfig = loadRoomConfig();
let tagMap = loadTagMap();
let deviceSpecs = loadDeviceSpecs();
let classObjectConfig = loadClassObjectConfig();
let projectPacketConfig = loadProjectPacketConfig();
let projectTags = loadProjectTags();
let persistedCalibration = loadCalibrationState();
let state = createInitialState();
let figurateRuntime = {
  lastError: null,
  lastLatencyMs: null,
  lastOk: null,
  lastProvider: "local-mock",
  lastStatus: null,
  lastVisionAt: null,
};

function loadRoomConfig() {
  try {
    return JSON.parse(fs.readFileSync(ROOM_CONFIG_PATH, "utf8"));
  } catch (error) {
    console.warn(`Could not load ${ROOM_CONFIG_PATH}: ${error.message}`);
    return {
      calibration: {},
      markerModes: {},
      markers: [],
      surfaces: [],
    };
  }
}

function loadTagMap() {
  try {
    return JSON.parse(fs.readFileSync(TAG_MAP_PATH, "utf8"));
  } catch {
    return {
      calibrationTags: {},
      objectTags: {},
    };
  }
}

function loadDeviceSpecs() {
  try {
    return JSON.parse(fs.readFileSync(DEVICE_SPECS_PATH, "utf8"));
  } catch {
    return {
      cameras: {},
      projectors: {},
    };
  }
}

function loadClassObjectConfig() {
  try {
    return JSON.parse(fs.readFileSync(CLASS_OBJECTS_PATH, "utf8"));
  } catch {
    return { objects: [], zones: [] };
  }
}

function loadProjectPacketConfig() {
  try {
    return JSON.parse(fs.readFileSync(PROJECT_PACKETS_PATH, "utf8"));
  } catch {
    return { projects: [] };
  }
}

function loadProjectTags() {
  try {
    return JSON.parse(fs.readFileSync(PROJECT_TAGS_PATH, "utf8"));
  } catch {
    return { tagFamily: "tag36h11", range: [100, 199], assignments: {} };
  }
}

function lanHosts() {
  const ifaces = os.networkInterfaces();
  const hosts = [];
  for (const name of Object.keys(ifaces)) {
    for (const iface of ifaces[name] || []) {
      if (iface.family === "IPv4" && !iface.internal) {
        hosts.push(`${iface.address}:${PORT}`);
      }
    }
  }
  return hosts;
}

function loadCalibrationState() {
  try {
    return JSON.parse(fs.readFileSync(CALIBRATION_PATH, "utf8"));
  } catch {
    return {};
  }
}

function envText(names) {
  const list = Array.isArray(names) ? names : [names];
  for (const name of list) {
    const value = process.env[name];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

function envBoolean(names, fallback = false) {
  const raw = envText(names).toLowerCase();
  if (!raw) return fallback;
  if (["1", "true", "yes", "on"].includes(raw)) return true;
  if (["0", "false", "no", "off"].includes(raw)) return false;
  return fallback;
}

function envInteger(names, fallback, min, max) {
  const number = Number(envText(names));
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(number)));
}

function stripBearer(value) {
  return String(value || "").replace(/^Bearer\s+/i, "").trim();
}

function stripTrailingSlash(value) {
  return String(value || "").replace(/\/+$/, "");
}

function isCanonicalEventType(eventType) {
  return EVENT_TYPE_RE.test(String(eventType || ""));
}

function canonicalEventType(eventType) {
  const raw = String(eventType || "").trim();
  if (!raw) return "legacy.event";
  if (LEGACY_EVENT_TYPE_ALIASES[raw]) return LEGACY_EVENT_TYPE_ALIASES[raw];
  const hyphenated = raw.toLowerCase().replace(/_/g, "-");
  if (isCanonicalEventType(hyphenated)) return hyphenated;
  const slug = hyphenated
    .replace(/[^a-z0-9.]+/g, "-")
    .replace(/^-+/, "")
    .replace(/-+$/, "")
    .replace(/\.+/g, ".")
    .replace(/^\.+/, "")
    .replace(/\.+$/, "");
  if (isCanonicalEventType(slug)) return slug;
  return `legacy.${slug || "event"}`;
}

function endpointUrl(baseUrl, endpoint) {
  try {
    return new URL(endpoint || "/", `${stripTrailingSlash(baseUrl)}/`).toString();
  } catch {
    return "";
  }
}

function maskSecret(value) {
  const text = stripBearer(value);
  if (!text) return "";
  if (text.length <= 10) return `${text.slice(0, 2)}...`;
  return `${text.slice(0, 8)}...${text.slice(-4)}`;
}

function readFigurateConfig() {
  const mode = envText(["FIGURATE_MODE", "FLOWSTATE_MODE"]) || "auto";
  const disabled = ["mock", "off", "disabled", "local"].includes(mode.toLowerCase()) ||
    envBoolean(["FIGURATE_DISABLED", "FIGURATE_DISABLE", "FLOWSTATE_DISABLED"], false);
  const baseUrl = stripTrailingSlash(envText(["FIGURATE_BASE_URL", "FLOWSTATE_BASE_URL"]));
  const apiKey = envText([
    "FIGURATE_API_KEY",
    "FLOWSTATE_API_KEY",
    "FIGURATE_AUTH_TOKEN",
    "FLOWSTATE_AUTH_TOKEN",
  ]);
  const visionApiKey = envText([
    "FIGURATE_VISION_API_KEY",
    "FLOWSTATE_VISION_API_KEY",
    "VISION_API_KEY",
  ]) || apiKey;
  const characterId = envText([
    "FIGURATE_CHARACTER_ID",
    "FLOWSTATE_CHARACTER_ID",
    "FIGURATE_DEFAULT_CHARACTER_ID",
    "FLOWSTATE_DEFAULT_CHARACTER_ID",
  ]);
  const textEndpoint = envText(["FIGURATE_TEXT_ENDPOINT", "FLOWSTATE_TEXT_ENDPOINT"]) ||
    DEFAULT_FIGURATE_TEXT_ENDPOINT;
  const visionEndpoint = envText(["FIGURATE_VISION_ENDPOINT", "FLOWSTATE_VISION_ENDPOINT"]) ||
    DEFAULT_FIGURATE_VISION_ENDPOINT;
  const timeoutMs = envInteger(
    ["FIGURATE_TIMEOUT_MS", "FLOWSTATE_TIMEOUT_MS"],
    DEFAULT_FIGURATE_TIMEOUT_MS,
    1000,
    30000,
  );
  const visionTimeoutMs = envInteger(
    ["FIGURATE_VISION_TIMEOUT_MS", "FLOWSTATE_VISION_TIMEOUT_MS"],
    timeoutMs,
    1000,
    30000,
  );
  const missing = [];
  if (!baseUrl) missing.push("FIGURATE_BASE_URL");
  if (!apiKey) missing.push("FIGURATE_API_KEY");
  if (!characterId) missing.push("FIGURATE_CHARACTER_ID");
  const configured = !disabled && missing.length === 0;
  const visionConfigured = !disabled && Boolean(baseUrl && visionApiKey);

  return {
    apiKey,
    baseUrl,
    characterId,
    configured,
    disabled,
    enableTools: envBoolean(["FIGURATE_ENABLE_TOOLS", "FLOWSTATE_ENABLE_TOOLS"], false),
    llmModel: envText(["FIGURATE_LLM_MODEL", "FLOWSTATE_LLM_MODEL"]),
    missing,
    mode,
    provider: configured ? "figurate-flowstate" : "local-mock",
    runtimeMode: envText(["FIGURATE_RUNTIME_MODE", "FLOWSTATE_RUNTIME_MODE"]),
    skipTts: envBoolean(["FIGURATE_SKIP_TTS", "FLOWSTATE_SKIP_TTS"], true),
    textEndpoint,
    textUrl: baseUrl ? endpointUrl(baseUrl, textEndpoint) : "",
    timeoutMs,
    useVision: envBoolean(["FIGURATE_USE_VISION", "FLOWSTATE_USE_VISION"], true),
    visionApiKey,
    visionConfigured,
    visionEndpoint,
    visionTimeoutMs,
    visionUrl: baseUrl ? endpointUrl(baseUrl, visionEndpoint) : "",
  };
}

function figuratePublicStatus() {
  const config = readFigurateConfig();
  return {
    provider: config.provider,
    configured: config.configured,
    visionConfigured: config.visionConfigured && config.useVision,
    mode: config.mode,
    baseUrl: config.baseUrl || null,
    textEndpoint: config.textEndpoint,
    visionEndpoint: config.visionEndpoint,
    characterId: config.characterId || null,
    apiKey: config.apiKey ? maskSecret(config.apiKey) : null,
    missing: config.configured ? [] : config.missing,
    lastOk: figurateRuntime.lastOk,
    lastError: figurateRuntime.lastError,
    lastLatencyMs: figurateRuntime.lastLatencyMs,
    lastProvider: figurateRuntime.lastProvider,
    lastStatus: figurateRuntime.lastStatus,
    lastVisionAt: figurateRuntime.lastVisionAt,
  };
}

function createInitialState() {
  const createdAt = new Date().toISOString();
  const markers = createMarkers();
  return {
    room: {
      activePrototype: "light-lab",
      boardMode: "stage",
      debug: false,
      focus: null,
      focuses: [],
      mode: "mocked-room",
      phase: "activity",
      speakingPolicy: "quiet",
      startedAt: createdAt,
    },
    config: {
      markerModes: roomConfig.markerModes || {},
      schema: roomConfig.schema || "smart-classroom-room-config/v0.1",
    },
    participants: {},
    surfaces: createSurfaces(),
    calibration: createCalibration(),
    fiducials: {
      markers,
      primarySurface: "board",
      detectorCamera: "back-wall",
      sourceSpace: "camera",
    },
    table: {
      tokens: markers,
    },
    board: createInitialBoardState(),
    projection: {
      classroom: createInitialClassroomProjection(createdAt),
    },
    light: {
      rays: [],
      collisions: [],
      solved: false,
      targetHit: false,
      activeMode: "light-lab",
    },
    // Legacy alias kept during the UI transition.
    puzzle: {
      connections: [],
      output: null,
      solved: false,
      target: true,
    },
    clipboard: null,
    phone: {
      target: null,
      mode: "collaborate",
      lastCaptureId: null,
      liveConversationId: null,
    },
    bindings: [],
    perception: {
      rawDetections: {},
      cameraStates: {},
      cameraCommands: [],
      cameraTagObservations: {},
      fusedTags: {},
      cameraRoom: {
        room_mode: "unknown",
        total_persons: 0,
        whiteboard_active: false,
        probe_classes: [],
      },
    },
    character: createInitialCharacterState(createdAt),
    classObjects: createClassObjects(),
    projectPackets: createProjectPackets(),
    projectHeartbeats: {},
    events: [],
  };
}

function replaceState(nextState) {
  for (const key of Object.keys(state)) delete state[key];
  Object.assign(state, nextState);
}

function resetRoomState(source = "server", resetBy = source) {
  replaceState(createInitialState());
  pushEvent("room.reset", { resetBy }, { source });
  evaluatePuzzle(source);
  return { ok: true, phase: state.room.phase, room: buildRoomContext() };
}

function createClassObjects() {
  return (classObjectConfig.objects || []).map((object, index) => {
    const fallback = defaultClassObjectPosition(index, classObjectConfig.objects.length || 1);
    const state = { ...(object.state || {}) };
    if (state.x === undefined) state.x = fallback.x;
    if (state.y === undefined) state.y = fallback.y;
    return {
      id: object.id,
      label: object.label,
      kind: object.kind,
      surface: object.surface,
      eventType: object.eventType,
      description: object.description || "",
      controls: object.controls || [],
      state,
    };
  });
}

function createProjectPackets() {
  return (projectPacketConfig.projects || []).map((project) => ({
    ...project,
    state: { ...(project.state || {}) },
    controls: Array.isArray(project.controls) ? project.controls.slice() : [],
    modes: Array.isArray(project.modes) ? project.modes.slice() : [],
    reads: Array.isArray(project.reads) ? project.reads.slice() : [],
    writes: Array.isArray(project.writes) ? project.writes.slice() : [],
    explicitInteractions: Array.isArray(project.explicitInteractions)
      ? project.explicitInteractions.slice()
      : [],
    implicitInteractions: Array.isArray(project.implicitInteractions)
      ? project.implicitInteractions.slice()
      : [],
    combos: Array.isArray(project.combos) ? project.combos.slice() : [],
  }));
}

function defaultClassObjectPosition(index, total) {
  const cols = 5;
  const col = index % cols;
  const row = Math.floor(index / cols);
  const rows = Math.max(1, Math.ceil(total / cols));
  return {
    x: Number(((col + 1) / (cols + 1)).toFixed(3)),
    y: Number(((row + 1) / (rows + 1)).toFixed(3)),
  };
}

function createSurfaces() {
  const configured = Array.isArray(roomConfig.surfaces) ? roomConfig.surfaces : [];
  if (!configured.length) {
    return [
      { id: "table", label: "Marker Sandbox (legacy)", type: "projected-surface", coordinateSpace: "markers.normalized", online: true },
      { id: "board", label: "Semantic Board", type: "projected-surface", coordinateSpace: "board.normalized", online: true },
      { id: "phone", label: "Phone Companion", type: "client", coordinateSpace: "phone.screen", online: false },
    ];
  }
  return configured.map((surface) => ({
    ...surface,
    label: surface.id === "table" ? "Marker Sandbox (legacy)" : surface.label,
    online: surface.id === "phone" ? false : true,
  }));
}

function createCalibration() {
  const calibration = roomConfig.calibration || {};
  const result = {};
  for (const surface of createSurfaces()) {
    if (surface.type !== "projected-surface") continue;
    const persisted = persistedCalibration[surface.id] || {};
    result[surface.id] = {
      calibrationTags: surface.calibrationTags || [],
      status: persisted.status || calibration[surface.id]?.status || "uncalibrated",
      cameraToSurfaceHomography: persisted.cameraToSurfaceHomography || calibration[surface.id]?.cameraToSurfaceHomography || null,
      surfaceToCameraHomography: persisted.surfaceToCameraHomography || null,
      projectorToSurfaceHomography: persisted.projectorToSurfaceHomography || calibration[surface.id]?.projectorToSurfaceHomography || null,
      surfaceToProjectorHomography: persisted.surfaceToProjectorHomography || null,
      samples: Array.isArray(persisted.samples) ? persisted.samples : [],
      error: persisted.error || null,
      updatedAt: persisted.updatedAt || null,
    };
  }
  return result;
}

function createMarkers() {
  const configured = Array.isArray(roomConfig.markers) ? roomConfig.markers : [];
  return configured.map((marker) => ({
    ...marker,
    tagId: marker.shortCode || String(marker.tagId ?? marker.id),
    numericTagId: marker.tagId,
    surface: marker.surface || "board",
  }));
}

function publicState() {
  const markers = markerTokens();
  return {
    ...state,
    character: {
      ...state.character,
      adapter: figuratePublicStatus(),
    },
    markers: {
      items: markers,
      primarySurface: "board",
      detectorCamera: "back-wall",
      sourceSpace: "camera",
    },
    fiducials: {
      ...(state.fiducials || {}),
      markers,
      primarySurface: "board",
      detectorCamera: "back-wall",
      sourceSpace: "camera",
      calibration: state.calibration.board || null,
      observations: state.perception.cameraTagObservations || {},
      fusedTags: state.perception.fusedTags || {},
    },
  };
}

function now() {
  return new Date().toISOString();
}

function makeId(prefix) {
  eventCounter += 1;
  return `${prefix}-${Date.now().toString(36)}-${eventCounter.toString(36)}`;
}

function pushEvent(eventType, payload = {}, options = {}) {
  const event = normalizeEvent(
    {
      id: makeId("evt"),
      event_type: eventType,
      source: options.source || "server",
      target: options.target || null,
      salience: options.salience || routeSalience(eventType),
      created_at: now(),
      payload,
    },
  );
  const validation = validateEvent(event);
  if (!validation.ok) throw new Error(`invalid event: ${validation.errors.join(", ")}`);

  state.events.unshift(event);
  state.events = state.events.slice(0, 160);
  appendReplayEvent(event);
  broadcast("room-event", event);
  broadcast("state", publicState());
  persistSnapshotSoon();
  return event;
}

function rememberRawDetection(surfaceId, sourceSpace, tagId, detection, source) {
  const key = `${surfaceId}:${sourceSpace}`;
  if (!state.perception.rawDetections[key]) state.perception.rawDetections[key] = {};
  state.perception.rawDetections[key][String(tagId)] = {
    tagId,
    detection,
    source,
    surface: surfaceId,
    sourceSpace,
    updatedAt: now(),
  };
}

function appendReplayEvent(event) {
  try {
    fs.mkdirSync(LOCAL_DIR, { recursive: true });
    fs.appendFileSync(REPLAY_PATH, `${JSON.stringify(event)}\n`);
  } catch {
    // Replay logging is best-effort.
  }
}

function eventFiltersFromUrl(url) {
  const type = url.searchParams.get("type") || url.searchParams.get("event_type") || "";
  return {
    type: type ? canonicalEventType(type) : "",
    category: url.searchParams.get("category") || "",
    source: url.searchParams.get("source") || "",
  };
}

function eventLimitFromUrl(url, fallback = 160) {
  return Math.max(1, Math.min(500, Number(url.searchParams.get("limit") || fallback)));
}

function readReplayEvents(limit, filters = {}) {
  const lines = fs.existsSync(REPLAY_PATH)
    ? fs.readFileSync(REPLAY_PATH, "utf8").trim().split(/\r?\n/).filter(Boolean)
    : [];
  return filterEvents(lines.map(parseEventLine).filter(Boolean), filters).slice(-limit);
}

let persistTimer = null;
function persistSnapshotSoon() {
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    try {
      fs.mkdirSync(LOCAL_DIR, { recursive: true });
      fs.writeFileSync(SNAPSHOT_PATH, JSON.stringify(publicState(), null, 2));
    } catch {
      // Snapshot persistence is best-effort.
    }
  }, 120);
}

function persistCalibrationState() {
  try {
    fs.mkdirSync(LOCAL_DIR, { recursive: true });
    fs.writeFileSync(CALIBRATION_PATH, JSON.stringify(state.calibration, null, 2));
    persistedCalibration = state.calibration;
  } catch {
    // Calibration persistence is best-effort in local prototype mode.
  }
}

function routeSalience(eventType) {
  return routeEventSalience(eventType, state.room.debug);
}

function writeSse(res, eventName, data) {
  res.write(`event: ${eventName}\ndata: ${JSON.stringify(data)}\n\n`);
}

function broadcast(eventName, data) {
  for (const client of Array.from(sseClients)) {
    try {
      writeSse(client, eventName, data);
    } catch {
      sseClients.delete(client);
    }
  }
  if (eventName === "state") broadcastLegacyState(buildRoomContext());
  if (eventName === "room-event") broadcastLegacyEvent(data);
}

function broadcastLegacyState(data) {
  for (const client of Array.from(legacyStateClients)) {
    try {
      writeSse(client, "state", data);
    } catch {
      legacyStateClients.delete(client);
    }
  }
}

function broadcastLegacyEvent(event) {
  for (const client of Array.from(legacyEventClients)) {
    try {
      if (!legacyEventVisible(event, client)) continue;
      writeSse(client.res, "classroom_event", event);
    } catch {
      legacyEventClients.delete(client);
    }
  }
}

function legacyEventVisible(event, client) {
  if (client.eventType && event.event_type !== client.eventType) return false;
  const targets = normalizeTargets(event.target || event.payload?.target || event.payload?.targets);
  if (!targets.length) return true;
  return targets.includes(client.subscriberId);
}

function normalizeTargets(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.map(String).filter(Boolean);
  return [String(value)];
}

function distance(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

function markerTokens() {
  return state.fiducials?.markers || state.table.tokens;
}

function markerTagKeys(marker) {
  return [
    marker?.numericTagId,
    marker?.tagId,
    marker?.shortCode,
    marker?.id,
  ]
    .filter((value) => value !== undefined && value !== null && value !== "")
    .flatMap((value) => {
      const raw = String(value);
      const numeric = Number(raw);
      return Number.isFinite(numeric) ? [raw, String(numeric)] : [raw];
    });
}

function boardCalibrationTagIds() {
  const ids = new Set((state.calibration.board?.calibrationTags || []).map(String));
  for (const [tagId, data] of Object.entries(tagMap?.calibrationTags || {})) {
    if (data?.surface === "board") ids.add(String(tagId));
  }
  return ids;
}

function isBoardCalibrationMarker(marker) {
  const ids = boardCalibrationTagIds();
  return markerTagKeys(marker).some((key) => ids.has(key));
}

function clearBoardTags(options = {}) {
  const keepCalibration = options.keepCalibration !== false;
  const markers = markerTokens();
  const before = markers.length;
  const nextMarkers = markers.filter((marker) => {
    if ((marker.surface || "board") !== "board") return true;
    return keepCalibration && isBoardCalibrationMarker(marker);
  });
  state.fiducials.markers = nextMarkers;
  state.table.tokens = nextMarkers;
  const removed = before - nextMarkers.length;
  return { before, after: nextMarkers.length, removed, keptCalibration: keepCalibration };
}

function getToken(id) {
  return markerTokens().find((token) => token.id === normalizeObjectId(id));
}

function getBoardObject(id) {
  return state.board.objects.find((object) => object.id === id);
}

function getRoomObject(id) {
  return getToken(id) || getBoardObject(id);
}

function getClassObject(id) {
  return state.classObjects.find((object) => object.id === id);
}

function getProjectPacket(id) {
  const projectId = String(id || "");
  return state.projectPackets.find((project) => project.id === projectId) || LEGACY_PROJECT_PACKETS[projectId] || null;
}

function projectEvents(projectId, options = {}) {
  const includeSystem = Boolean(options.includeSystem);
  return state.events.filter((event) => {
    if (!includeSystem && String(event.event_type || "").startsWith("project.")) return false;
    const payload = event.payload || {};
    return (
      event.source === projectId ||
      event.project_id === projectId ||
      payload.projectId === projectId ||
      payload.sourceProject === projectId
    );
  });
}

function projectAcceptanceStats(project, events = projectEvents(project.id)) {
  const expected = Array.isArray(project.acceptance?.expectEvents) ? project.acceptance.expectEvents : [];
  const matched = new Set(events.map((event) => event.event_type).filter((type) => expected.includes(type)));
  return {
    expected,
    passed: matched.size,
    total: expected.length,
    missing: expected.filter((type) => !matched.has(type)),
  };
}

function createInitialBoardState() {
  return {
    activeDrag: null,
    objects: [
      {
        id: "note-welcome",
        kind: "sticky",
        label: "Sticky Note",
        text: "",
        x: 0.18,
        y: 0.2,
        w: boardSquareWidth(0.11),
        h: 0.11,
        color: "#facc15",
        surface: "board",
        tagId: 20,
        fiducial: { tagId: 20, anchor: "top-left" },
      },
    ],
    strokes: [],
  };
}

function createInitialClassroomProjection(createdAt = now()) {
  return {
    surface: "classroom-screen",
    sourceSurface: "board",
    title: "Room Ready",
    status: "Waiting for board actions.",
    lines: [],
    slideIndex: null,
    slideCount: null,
    updatedAt: createdAt,
  };
}

function createInitialCharacterState(createdAt = now()) {
  return {
    mode: "stub",
    present: false,
    surface: null,
    x: null,
    y: null,
    label: "Room Character",
    lastQuestion: "",
    lastUtterance:
      "I am quiet until asked. I can explain room state from the event log.",
    vision: {
      lastCapture: null,
      captures: [],
      pendingContext: [],
    },
    conversation: {
      live: false,
      id: null,
      status: "idle",
      source: null,
      target: null,
      startedAt: null,
      endedAt: null,
      lastContextAt: null,
    },
    updatedAt: createdAt,
  };
}

function projectHasContract(project) {
  return Boolean(
    project &&
    Array.isArray(project.canonicalSubscribes) &&
    project.canonicalSubscribes.length &&
    Array.isArray(project.canonicalEmits) &&
    project.canonicalEmits.length,
  );
}

function projectHeartbeat(projectId) {
  return state.projectHeartbeats[projectId] || null;
}

function projectReadiness(project) {
  const heartbeat = projectHeartbeat(project.id);
  const eventList = projectEvents(project.id);
  const hasHeartbeat = Boolean(heartbeat?.lastSeen);
  const ageMs = hasHeartbeat ? Date.now() - Date.parse(heartbeat.lastSeen) : null;
  const live = hasHeartbeat && ageMs <= 2 * 60 * 1000;
  const hasContract = projectHasContract(project);
  const hasEvent = eventList.length > 0;
  const acceptance = projectAcceptanceStats(project, eventList);
  let score = 1;
  if (hasContract) score = 2;
  if (hasHeartbeat && hasEvent) score = 3;
  if (hasContract && hasHeartbeat && hasEvent) score = 4;
  if (hasContract && live && hasEvent) score = 5;

  return {
    projectId: project.id,
    title: project.title,
    owner: project.owner,
    surface: project.surface,
    kind: project.kind,
    modes: Array.isArray(project.modes) ? project.modes : [],
    reads: Array.isArray(project.reads) ? project.reads : [],
    writes: Array.isArray(project.writes) ? project.writes : [],
    source: project.source || "",
    eventType: project.eventType || "",
    submittedProject: project.submittedProject !== false,
    status: live ? "live" : hasHeartbeat ? "stale" : "needs-heartbeat",
    score,
    hasContract,
    hasHeartbeat,
    live,
    lastSeen: heartbeat?.lastSeen || null,
    eventCount: eventList.length,
    lastEvent: eventList[0]?.event_type || null,
    acceptance,
    consumes: project.canonicalSubscribes || [],
    emits: project.canonicalEmits || [],
    capabilities: heartbeat?.capabilities || project.canonicalEmits || [],
    message: heartbeat?.message || "",
  };
}

function projectReadinessSnapshot() {
  const rosterProjects = state.projectPackets.filter((project) => project.submittedProject !== false);
  const projects = rosterProjects.map(projectReadiness);
  return {
    generatedAt: now(),
    sourceOfTruth: {
      projects: "public/project-packets.json",
      tags: "data/project-tags.json",
    },
    summary: {
      total: projects.length,
      submitted: projects.filter((project) => project.submittedProject).length,
      reference: state.projectPackets.length - rosterProjects.length,
      allPackets: state.projectPackets.length,
      live: projects.filter((project) => project.live).length,
      stale: projects.filter((project) => project.hasHeartbeat && !project.live).length,
      needsHeartbeat: projects.filter((project) => !project.hasHeartbeat).length,
      withEvents: projects.filter((project) => project.eventCount > 0).length,
      fullCredit: projects.filter((project) => project.score >= 5).length,
    },
    projects,
  };
}

function projectContract(project) {
  return {
    project_id: project.id,
    title: project.title,
    owner: project.owner,
    description: project.description || project.success || "",
    surface: project.surface,
    kind: project.kind,
    modes: project.modes || [],
    reads: project.reads || [],
    writes: project.writes || [],
    consumes: project.canonicalSubscribes || [],
    emits: project.canonicalEmits || [],
    alsoListens: project.subscribes || [],
    alsoSends: project.emits || [],
    acceptance: project.acceptance || {},
    initialState: project.state || {},
    prompt: projectContractPrompt(project),
  };
}

function projectContractPrompt(project) {
  return [
    `I am finishing the student project "${project.title}" for the Smart Classroom room server.`,
    `Project ID: ${project.id}`,
    `API base: http://localhost:${PORT}`,
    "",
    "Build the smallest mock-first integration that proves the contract before hardware works.",
    `It should listen for: ${(project.canonicalSubscribes || []).join(", ") || "none"}.`,
    `It should emit: ${(project.canonicalEmits || []).join(", ") || "none"}.`,
    `It reads: ${(project.reads || []).join(", ") || "none"}.`,
    `It writes: ${(project.writes || []).join(", ") || "none"}.`,
    "",
    "Requirements:",
    "1. Send a heartbeat to POST /api/projects/{project_id}/heartbeat.",
    "2. Subscribe to GET /subscribe/events?subscriber_id={project_id}.",
    "3. Publish at least one event to POST /api/projects/{project_id}/events.",
    "4. Print every received and emitted event.",
    "5. Keep the hardware path replaceable by a mock path using the same event names.",
    "",
    `Acceptance setup: ${project.acceptance?.setup || "Run the project in mock mode."}`,
    `Acceptance trigger: ${project.acceptance?.trigger || "Publish a contract event."}`,
    `Expected events: ${(project.acceptance?.expectEvents || project.canonicalEmits || []).join(", ") || "none"}.`,
    `Visible result: ${project.acceptance?.visibleResult || project.success || "The event appears in the room event stream."}`,
  ].join("\n");
}

function projectContractMarkdown(project) {
  const contract = projectContract(project);
  return `# ${contract.title} Contract

Project ID: \`${contract.project_id}\`  
Owner: ${contract.owner}  
Surface: \`${contract.surface}\`  
Kind: \`${contract.kind}\`

${contract.description}

## Contract

Listens for:
${markdownList(contract.consumes)}

Sends:
${markdownList(contract.emits)}

Reads:
${markdownList(contract.reads)}

Writes:
${markdownList(contract.writes)}

Also accepts legacy/student names:
${markdownList(contract.alsoListens)}

Also may send:
${markdownList(contract.alsoSends)}

## Acceptance

- Setup: ${contract.acceptance.setup || "Run the project in mock mode."}
- Trigger: ${contract.acceptance.trigger || "Publish a contract event."}
- Expected events: ${(contract.acceptance.expectEvents || contract.emits).join(", ") || "none"}
- Visible result: ${contract.acceptance.visibleResult || "The room event stream shows the output."}
- Real input later: ${contract.acceptance.realInput || "Replace mock input with hardware."}
- Real output later: ${contract.acceptance.realOutput || "Replace mock output with the real actuator/UI."}

## Prompt Against This Contract

\`\`\`text
${contract.prompt}
\`\`\`

## Minimal API Calls

Heartbeat:

\`\`\`json
POST /api/projects/${contract.project_id}/heartbeat
{
  "status": "online",
  "capabilities": ${JSON.stringify(contract.emits)},
  "consumes": ${JSON.stringify(contract.consumes)},
  "emits": ${JSON.stringify(contract.emits)},
  "message": "mock path running"
}
\`\`\`

Publish evidence:

\`\`\`json
POST /api/projects/${contract.project_id}/events
{
  "event_type": "${contract.emits[0] || "project.event"}",
  "payload": {
    "mock": true,
    "message": "contract event from ${contract.project_id}"
  }
}
\`\`\`

Listen:

\`\`\`text
GET /subscribe/events?subscriber_id=${contract.project_id}
\`\`\`
`;
}

function markdownList(values) {
  return Array.isArray(values) && values.length ? values.map((value) => `- \`${value}\``).join("\n") : "- none";
}

function updateProjectHeartbeat(projectId, body = {}) {
  const project = getProjectPacket(projectId);
  if (!project) return { ok: false, error: "unknown project" };
  const heartbeat = {
    projectId,
    status: body.status || "online",
    capabilities: uniqueStrings(body.capabilities || project.canonicalEmits || []),
    consumes: uniqueStrings(body.consumes || project.canonicalSubscribes || []),
    emits: uniqueStrings(body.emits || project.canonicalEmits || []),
    message: String(body.message || "").slice(0, 240),
    meta: body.meta && typeof body.meta === "object" ? body.meta : {},
    lastSeen: now(),
  };
  state.projectHeartbeats[projectId] = heartbeat;
  pushEvent("project.heartbeat", {
    projectId,
    title: project.title,
    status: heartbeat.status,
    capabilities: heartbeat.capabilities,
    consumes: heartbeat.consumes,
    emits: heartbeat.emits,
    message: heartbeat.message,
  }, { source: projectId, salience: "ambient" });
  const readiness = projectReadiness(project);
  return {
    ok: true,
    heartbeat,
    readiness,
    status: {
      project_id: projectId,
      projectId,
      status: heartbeat.status,
      is_live: readiness.live,
      live: readiness.live,
      age_sec: 0,
      last_seen: heartbeat.lastSeen,
      lastSeen: heartbeat.lastSeen,
      capabilities: heartbeat.capabilities,
      consumes: heartbeat.consumes,
      emits: heartbeat.emits,
    },
  };
}

function publishProjectEvent(projectId, body = {}) {
  const project = getProjectPacket(projectId);
  if (!project) return { ok: false, error: "unknown project" };
  const requestedEventType = String(body.event_type || body.eventType || project.eventType || "project.event");
  const eventType = canonicalEventType(requestedEventType);
  const payload = body.payload && typeof body.payload === "object" ? body.payload : {};
  const event = pushEvent(eventType, {
    ...payload,
    legacyEventType: eventType === requestedEventType ? null : requestedEventType,
    projectId,
    sourceProject: projectId,
    title: project.title,
    owner: project.owner,
    kind: project.kind,
    surface: project.surface,
  }, {
    source: projectId,
    target: body.target || null,
  });
  return {
    ok: true,
    event,
    readiness: projectReadiness(project),
    routing: event.target ? { directed: 1, broadcast: 0, ambient: 0 } : { directed: 0, broadcast: 1, ambient: 0 },
  };
}

function uniqueStrings(values) {
  const list = Array.isArray(values)
    ? values
    : typeof values === "string"
      ? values.split(",")
      : [];
  return Array.from(new Set(list.map((value) => String(value).trim()).filter(Boolean))).sort();
}

function weightedAverage(items, key) {
  const values = items
    .map((item) => ({ value: Number(item[key]), weight: Number(item.confidence || 1) }))
    .filter((item) => Number.isFinite(item.value) && Number.isFinite(item.weight) && item.weight > 0);
  if (!values.length) return null;
  const totalWeight = values.reduce((sum, item) => sum + item.weight, 0);
  return values.reduce((sum, item) => sum + item.value * item.weight, 0) / totalWeight;
}

function weightedAngle(items, key = "yaw") {
  const values = items
    .map((item) => ({ value: Number(item[key]), weight: Number(item.confidence || 1) }))
    .filter((item) => Number.isFinite(item.value) && Number.isFinite(item.weight) && item.weight > 0);
  if (!values.length) return null;
  const x = values.reduce((sum, item) => sum + Math.cos(item.value) * item.weight, 0);
  const y = values.reduce((sum, item) => sum + Math.sin(item.value) * item.weight, 0);
  if (!x && !y) return null;
  return Math.atan2(y, x);
}

function capabilityIndex() {
  const index = {};
  const projects = [
    ...state.projectPackets,
    ...Object.values(LEGACY_PROJECT_PACKETS).filter((legacy) => !state.projectPackets.some((project) => project.id === legacy.id)),
  ];
  for (const project of projects) {
    const heartbeat = projectHeartbeat(project.id);
    const capabilities = uniqueStrings([
      project.kind,
      ...(project.canonicalEmits || []),
      ...(project.emits || []),
      ...(heartbeat?.capabilities || []),
    ]);
    for (const capability of capabilities) {
      if (!index[capability]) index[capability] = [];
      index[capability].push({
        projectId: project.id,
        title: project.title,
        live: Boolean(heartbeat && Date.now() - Date.parse(heartbeat.lastSeen) <= 2 * 60 * 1000),
        lastSeen: heartbeat?.lastSeen || null,
      });
    }
  }
  return index;
}

function computeCameraRoom(cameraStates) {
  const activeStates = Object.values(cameraStates || {}).filter((camera) => camera.running !== false);
  const totalPersons = activeStates.reduce((sum, camera) => sum + Number(camera.person_count || 0), 0);
  const whiteboardActive = activeStates.some((camera) => Boolean(camera.whiteboard_text_detected));
  const probeClasses = activeStates
    .filter((camera) => camera.predicted_class && Number(camera.prediction_confidence ?? camera.confidence ?? 0) > 0.5)
    .map((camera) => String(camera.predicted_class));
  let roomMode = "unknown";
  if (probeClasses.includes("presentation")) roomMode = "presentation";
  else if (whiteboardActive) roomMode = "focus";
  else if (!activeStates.length) roomMode = "unknown";
  else if (totalPersons === 0) roomMode = "empty";
  else if (totalPersons === 1) roomMode = "solo";
  else if (totalPersons === 2) roomMode = "duo";
  else roomMode = "group";
  return {
    room_mode: roomMode,
    total_persons: totalPersons,
    whiteboard_active: whiteboardActive,
    probe_classes: probeClasses,
  };
}

function ingestCameraState(payload = {}, source = "camera-worker") {
  const cameraId = String(payload.camera_id || payload.cameraId || payload.id || source || "camera").slice(0, 80);
  const previous = state.perception.cameraStates[cameraId] || {};
  const oldRoom = computeCameraRoom(state.perception.cameraStates);
  const merged = {
    ...previous,
    ...payload,
    camera_id: cameraId,
    running: payload.running !== false,
    updatedAt: now(),
  };
  state.perception.cameraStates[cameraId] = merged;
  const nextRoom = computeCameraRoom(state.perception.cameraStates);
  state.perception.cameraRoom = nextRoom;
  if (nextRoom.room_mode !== "unknown") state.room.mode = nextRoom.room_mode;

  const emitted = [];
  emitted.push(pushEvent("camera.state.updated", {
    cameraId,
    running: merged.running,
    detectorHost: merged.detector_host || merged.detectorHost || null,
    detectorUser: merged.detector_user || merged.detectorUser || null,
  }, { source, salience: "ambient" }));

  if (previous.person_count !== merged.person_count || previous.person_detected !== merged.person_detected) {
    emitted.push(pushEvent("class.presence.changed", {
      cameraId,
      oldCount: Number(previous.person_count || 0),
      newCount: Number(merged.person_count || 0),
      detected: Boolean(merged.person_detected ?? Number(merged.person_count || 0) > 0),
    }, { source }));
  }

  if (previous.predicted_class !== merged.predicted_class) {
    emitted.push(pushEvent("classifier.probe.changed", {
      cameraId,
      oldClass: previous.predicted_class || null,
      newClass: merged.predicted_class || null,
      confidence: Number(merged.prediction_confidence ?? merged.confidence ?? 0),
      class_probs: merged.class_probs || {},
    }, { source }));
  }

  if (oldRoom.room_mode !== nextRoom.room_mode) {
    emitted.push(pushEvent("session.mode.changed", {
      oldMode: oldRoom.room_mode,
      newMode: nextRoom.room_mode,
      totalPersons: nextRoom.total_persons,
      trigger: "camera.state.push",
    }, { source }));
  }

  if (previous.fatigue_detected !== merged.fatigue_detected) {
    emitted.push(pushEvent("attention.fatigue.changed", {
      cameraId,
      fatigueDetected: Boolean(merged.fatigue_detected),
      fatiguePercent: Number(merged.fatigue_percent || 0),
    }, { source }));
  }

  if (previous.whiteboard_text_detected !== merged.whiteboard_text_detected) {
    emitted.push(pushEvent("whiteboard.changed", {
      cameraId,
      textDetected: Boolean(merged.whiteboard_text_detected),
      text: Array.isArray(merged.whiteboard_text) ? merged.whiteboard_text : [],
    }, { source }));
  }

  if (previous.gaze_direction !== merged.gaze_direction) {
    emitted.push(pushEvent("attention.direction.changed", {
      cameraId,
      direction: merged.gaze_direction || "unknown",
      vector: {
        x: Number(merged.gaze_x || 0),
        y: Number(merged.gaze_y || 0),
        z: Number(merged.gaze_z || 0),
      },
    }, { source }));
  }

  if (previous.anomaly_level !== merged.anomaly_level) {
    emitted.push(pushEvent("safety.anomaly.changed", {
      cameraId,
      oldLevel: previous.anomaly_level || null,
      newLevel: merged.anomaly_level || null,
      score: Number(merged.anomaly_score || 0),
    }, { source }));
  }

  if (payload.pose || payload.poses || payload.skeletons || payload.keypoints) {
    emitted.push(pushEvent("gesture.pose.changed", {
      cameraId,
      pose: payload.pose || null,
      poses: payload.poses || payload.skeletons || null,
      keypoints: payload.keypoints || null,
      confidence: Number(payload.pose_confidence || payload.confidence || 0),
    }, { source }));
  }

  return {
    ok: true,
    cameraId,
    room_mode: nextRoom.room_mode,
    phase: state.room.phase,
    total_persons: nextRoom.total_persons,
    whiteboard_active: nextRoom.whiteboard_active,
    routing: { broadcast: emitted.filter((event) => event.salience === "broadcast").length, ambient: emitted.filter((event) => event.salience === "ambient").length, directed: emitted.filter((event) => event.salience === "directed").length },
    room: nextRoom,
    camera: merged,
    events: emitted.map((event) => event.event_type),
  };
}

function cameraSnapshot() {
  const known = new Set(["orbit", "gravity", "horizon"]);
  Object.keys(state.perception.cameraStates || {}).forEach((id) => known.add(id));
  const cameras = Array.from(known).sort().map((cameraId) => ({
    cameraId,
    state: state.perception.cameraStates[cameraId] || null,
    online: Boolean(state.perception.cameraStates[cameraId]?.updatedAt),
    lastSeen: state.perception.cameraStates[cameraId]?.updatedAt || null,
    commands: state.perception.cameraCommands.filter((command) => command.cameraId === cameraId).slice(0, 10),
  }));
  return {
    generatedAt: now(),
    room: state.perception.cameraRoom,
    cameras,
    recentCommands: state.perception.cameraCommands.slice(0, 40),
  };
}

function sendCameraCommand(cameraId, body = {}, source = "room-console") {
  const normalizedId = String(cameraId || body.camera_id || body.cameraId || "all-cameras").slice(0, 80);
  const command = String(body.command || body.type || (body.mode ? "set-mode" : "request")).slice(0, 80);
  const mode = body.mode ? String(body.mode).slice(0, 80) : null;
  const projectId = body.projectId || body.project_id || null;
  const requestId = makeId("cmd");
  const payload = {
    requestId,
    cameraId: normalizedId,
    command,
    mode,
    projectId,
    reason: String(body.reason || "").slice(0, 240),
    params: body.params && typeof body.params === "object" ? body.params : {},
  };
  const eventType = command === "set-mode"
    ? "camera.mode.requested"
    : command === "capture"
      ? "camera.capture.requested"
      : command === "fiducial"
        ? "fiducial.request"
        : "camera.command.requested";
  const event = pushEvent(eventType, payload, {
    source,
    target: normalizedId,
  });
  const record = {
    ...payload,
    eventType,
    createdAt: event.created_at,
    source,
  };
  state.perception.cameraCommands.unshift(record);
  state.perception.cameraCommands = state.perception.cameraCommands.slice(0, 80);
  return { ok: true, command: record, event };
}

function buildRoomContext() {
  const readiness = projectReadinessSnapshot();
  const cameraRoom = state.perception.cameraRoom || {};
  return {
    phase: state.room.phase,
    room_mode: cameraRoom.room_mode && cameraRoom.room_mode !== "unknown"
      ? cameraRoom.room_mode
      : state.room.boardMode || state.room.activePrototype,
    activePrototype: state.room.activePrototype,
    boardMode: state.room.boardMode,
    cameraRoom,
    cameras: state.perception.cameraStates || {},
    total_persons: cameraRoom.total_persons ?? Object.keys(state.participants || {}).length,
    whiteboard_active: Boolean(cameraRoom.whiteboard_active || state.board.objects.length || state.board.strokes.length),
    timestamp: now(),
    feeling: state.room.debug ? "debug" : "working",
    temporal: {
      phase: state.room.phase,
      startedAt: state.room.startedAt,
      uptime_ms: Date.now() - bootTime,
    },
    social: {
      total_persons: cameraRoom.total_persons ?? Object.keys(state.participants || {}).length,
      participants: Object.values(state.participants || {}),
    },
    task: {
      whiteboard_active: Boolean(cameraRoom.whiteboard_active || state.board.objects.length || state.board.strokes.length),
      focus: state.room.focus,
      focuses: state.room.focuses || [],
      recent_events: state.events.slice(0, 8).map((event) => event.event_type),
    },
    phone: {
      target: state.phone.target,
      mode: state.phone.mode,
      lastCaptureId: state.phone.lastCaptureId,
      liveConversationId: state.phone.liveConversationId,
    },
    character: {
      present: state.character.present,
      mode: state.character.mode,
      label: state.character.label,
      lastQuestion: state.character.lastQuestion,
      lastUtterance: state.character.lastUtterance,
      vision: state.character.vision,
      conversation: state.character.conversation,
      adapter: figuratePublicStatus(),
    },
    active_capabilities: Object.keys(capabilityIndex()).sort(),
    readiness: readiness.summary,
  };
}

function getTokenByTag(tagId) {
  const asString = String(tagId);
  return markerTokens().find((token) =>
    String(token.numericTagId ?? token.tagId) === asString ||
    String(token.tagId) === asString ||
    String(token.shortCode) === asString ||
    token.id === asString
  );
}

function getOrCreateTokenByTag(tagId, surfaceId, meta = {}) {
  const existing = getTokenByTag(tagId);
  if (existing) return existing;

  const mapped = tagMap?.objectTags?.[String(tagId)];
  const role = mapped?.role || meta.role || meta.kind;
  if (!mapped && !role) return null;

  const numericTagId = Number(tagId);
  const baseId = String(mapped?.id || `${role}-tag-${tagId}`).slice(0, 80);
  const markers = markerTokens();
  const id = markers.some((marker) => marker.id === baseId) ? `${baseId}-${tagId}` : baseId;
  const token = {
    id,
    tagId: String(tagId),
    numericTagId: Number.isFinite(numericTagId) ? numericTagId : null,
    kind: String(role || "tag").slice(0, 40),
    role: String(role || "tag").slice(0, 40),
    label: String(mapped?.label || meta.label || `${role || "Tag"} ${tagId}`).slice(0, 80),
    color: mapped?.color || meta.color || "#e5e7eb",
    x: 0.5,
    y: 0.5,
    angle: 0,
    surface: surfaceId || mapped?.surface || "board",
    dynamic: true,
    confidence: Number.isFinite(Number(meta.confidence)) ? clamp01(meta.confidence) : 1,
    updatedAt: now(),
  };
  markers.push(token);
  return token;
}

function normalizeObjectId(id) {
  const aliases = {
    "input-a": "emitter",
    "input-b": "filter-blue",
    "xor-gate": "mirror-a",
    output: "target",
  };
  return aliases[id] || id;
}

function serializeObject(id) {
  const object = getRoomObject(id);
  if (!object) return null;
  const valueText =
    object.value === true ? "true" : object.value === false ? "false" : object.hit ? "hit" : "";
  return {
    id: makeId("clip"),
    sourceObjectId: id,
    kind: object.kind || "object",
    label: object.label || object.id,
    text: object.text || `${object.label || object.id} ${valueText}`.trim(),
    value: object.value ?? null,
    createdAt: now(),
  };
}

function evaluatePuzzle(source = "light-engine") {
  simulateLight(source);
}

function simulateLight(source = "light-engine") {
  const previous = JSON.stringify(state.light);
  const markers = markerTokens();
  const emitter = markers.find((marker) => marker.kind === "emitter");
  const target = markers.find((marker) => marker.kind === "target");
  if (!emitter || !target) return;

  target.hit = false;
  const rays = [];
  const collisions = [];
  const queue = [
    {
      x: emitter.x,
      y: emitter.y,
      dx: Math.cos(emitter.angle || 0),
      dy: Math.sin(emitter.angle || 0),
      color: "#fde68a",
      depth: 0,
      ignore: emitter.id,
    },
  ];

  while (queue.length && rays.length < 16) {
    const ray = queue.shift();
    const hit = findNearestLightHit(ray, markers);
    rays.push({
      x1: ray.x,
      y1: ray.y,
      x2: hit.x,
      y2: hit.y,
      color: ray.color,
      depth: ray.depth,
      hitId: hit.marker?.id || null,
    });

    if (!hit.marker) continue;
    const marker = hit.marker;
    collisions.push({
      markerId: marker.id,
      kind: marker.kind,
      x: hit.x,
      y: hit.y,
      color: ray.color,
    });

    if (marker.kind === "target") {
      marker.hit = true;
      continue;
    }
    if (marker.kind === "blocker") continue;

    if (marker.kind === "filter") {
      queue.push({
        x: hit.x,
        y: hit.y,
        dx: ray.dx,
        dy: ray.dy,
        color: marker.beamColor || marker.color || ray.color,
        depth: ray.depth + 1,
        ignore: marker.id,
      });
      continue;
    }

    if (marker.kind === "mirror" || marker.kind === "splitter") {
      const reflected = reflectDirection(ray.dx, ray.dy, marker.angle || 0);
      queue.push({
        x: hit.x,
        y: hit.y,
        dx: reflected.dx,
        dy: reflected.dy,
        color: ray.color,
        depth: ray.depth + 1,
        ignore: marker.id,
      });
      if (marker.kind === "splitter") {
        const passAngle = Math.atan2(ray.dy, ray.dx);
        queue.push({
          x: hit.x,
          y: hit.y,
          dx: Math.cos(passAngle + Math.PI * 0.18),
          dy: Math.sin(passAngle + Math.PI * 0.18),
          color: ray.color,
          depth: ray.depth + 1,
          ignore: marker.id,
        });
      }
    }
  }

  state.light = {
    rays,
    collisions,
    solved: Boolean(target.hit),
    targetHit: Boolean(target.hit),
    activeMode: state.room.activePrototype || "light-lab",
  };
  state.puzzle = {
    connections: rays.map((ray) => [ray.hitId || "edge", "ray"]),
    output: state.light.targetHit,
    solved: state.light.solved,
    target: true,
  };

  if (JSON.stringify(state.light) !== previous) {
    pushEvent(
      "light.ray.updated",
      {
        rayCount: state.light.rays.length,
        collisionCount: state.light.collisions.length,
        targetHit: state.light.targetHit,
      },
      { source },
    );
    if (state.light.targetHit) {
      pushEvent(
        "light.target.hit",
        { targetId: target.id, mode: "light-lab" },
        { source },
      );
      pushEvent(
        "light.puzzle.solved",
        { targetId: target.id, mode: "light-lab" },
        { source },
      );
    }
  }
}

function findNearestLightHit(ray, markers) {
  const markerHits = markers
    .filter((marker) => marker.id !== ray.ignore && marker.kind !== "function")
    .map((marker) => {
      const t = rayCircleIntersection(ray, marker, marker.kind === "target" ? 0.075 : 0.062);
      return t === null ? null : { t, marker };
    })
    .filter(Boolean)
    .sort((a, b) => a.t - b.t);

  const edgeT = rayBoundsIntersection(ray);
  const first = markerHits.find((hit) => hit.t > 0.015);
  if (first && first.t < edgeT) {
    return {
      x: ray.x + ray.dx * first.t,
      y: ray.y + ray.dy * first.t,
      marker: first.marker,
    };
  }
  return {
    x: ray.x + ray.dx * edgeT,
    y: ray.y + ray.dy * edgeT,
    marker: null,
  };
}

function rayCircleIntersection(ray, marker, radius) {
  const ox = ray.x - marker.x;
  const oy = ray.y - marker.y;
  const b = 2 * (ray.dx * ox + ray.dy * oy);
  const c = ox * ox + oy * oy - radius * radius;
  const disc = b * b - 4 * c;
  if (disc < 0) return null;
  const sqrt = Math.sqrt(disc);
  const t1 = (-b - sqrt) / 2;
  const t2 = (-b + sqrt) / 2;
  const t = [t1, t2].filter((value) => value > 0.015).sort((a, b) => a - b)[0];
  return Number.isFinite(t) ? t : null;
}

function rayBoundsIntersection(ray) {
  const ts = [];
  if (ray.dx > 0) ts.push((1 - ray.x) / ray.dx);
  if (ray.dx < 0) ts.push((0 - ray.x) / ray.dx);
  if (ray.dy > 0) ts.push((1 - ray.y) / ray.dy);
  if (ray.dy < 0) ts.push((0 - ray.y) / ray.dy);
  return Math.max(0.02, Math.min(...ts.filter((value) => value > 0.015)));
}

function reflectDirection(dx, dy, mirrorAngle) {
  const ux = Math.cos(mirrorAngle);
  const uy = Math.sin(mirrorAngle);
  const dot = dx * ux + dy * uy;
  const rx = 2 * dot * ux - dx;
  const ry = 2 * dot * uy - dy;
  const len = Math.sqrt(rx * rx + ry * ry) || 1;
  return { dx: rx / len, dy: ry / len };
}

function decodeVisionImage(imageDataUrl) {
  const raw = String(imageDataUrl || "").trim();
  if (!raw) return null;
  const match = raw.match(/^data:(image\/(?:jpeg|jpg|png|webp));base64,([\s\S]+)$/i);
  if (!match) return null;
  const mimeType = match[1].toLowerCase().replace("image/jpg", "image/jpeg");
  const base64 = match[2].replace(/\s/g, "");
  const buffer = Buffer.from(base64, "base64");
  if (!buffer.length) return null;
  if (buffer.length > 6_000_000) throw new Error("vision capture too large");
  const extension = mimeType === "image/png" ? "png" : mimeType === "image/webp" ? "webp" : "jpg";
  return { buffer, mimeType, extension };
}

function saveVisionImage(imageDataUrl) {
  const decoded = decodeVisionImage(imageDataUrl);
  const captureId = makeId("vision");
  if (!decoded) {
    return {
      id: captureId,
      imagePath: null,
      bytes: 0,
      mimeType: null,
      saved: false,
    };
  }
  fs.mkdirSync(CAPTURE_DIR, { recursive: true });
  const filename = `${captureId}.${decoded.extension}`;
  const filePath = path.join(CAPTURE_DIR, filename);
  fs.writeFileSync(filePath, decoded.buffer);
  return {
    id: captureId,
    imagePath: `/captures/vision/${filename}`,
    bytes: decoded.buffer.length,
    mimeType: decoded.mimeType,
    saved: true,
  };
}

function summarizePhoneTarget(target) {
  if (!target) return "the board";
  const label = target.label || target.id || "target";
  const kind = target.kind || "object";
  const surface = target.surface || target.id || "board";
  return `${label} (${kind} on ${surface})`;
}

async function detectTagDebugFrame(payload = {}) {
  const result = await imageTagDetector.detect({
    imageDataUrl: payload.imageDataUrl,
    family: tagMap.family || "tag36h11",
  });
  if (!result.ok) return result;

  const detections = result.detections.map((detection) => ({
    ...detection,
    tag: describeTagDetection(detection, result),
    size: detectionSize(detection, result),
  }));

  return {
    ok: true,
    family: tagMap.family || "tag36h11",
    width: result.width,
    height: result.height,
    detections,
  };
}

function describeTagDetection(detection, frame = {}) {
  const tagId = String(detection?.tagId ?? detection?.tag_id ?? detection?.id ?? "");
  const objectTag = tagMap.objectTags?.[tagId];
  const calibrationTag = tagMap.calibrationTags?.[tagId];
  const mapped = objectTag || calibrationTag || {};
  return {
    id: mapped.id || `tag-${tagId}`,
    label: mapped.label || (calibrationTag ? `Calibration ${tagId}` : `Tag ${tagId}`),
    role: mapped.role || mapped.corner || "tag",
    surface: mapped.surface || "board",
    tagId: Number.isFinite(Number(tagId)) ? Number(tagId) : tagId,
    x: frame.width ? clamp01(Number(detection.center?.x) / Number(frame.width)) : null,
    y: frame.height ? clamp01(Number(detection.center?.y) / Number(frame.height)) : null,
  };
}

function detectionSize(detection, frame = {}) {
  const corners = Array.isArray(detection.corners) ? detection.corners : [];
  if (corners.length < 4) return { pixelWidth: 0, pixelHeight: 0, frameWidthPercent: 0 };
  const top = distance(corners[0], corners[1]);
  const right = distance(corners[1], corners[2]);
  const bottom = distance(corners[2], corners[3]);
  const left = distance(corners[3], corners[0]);
  const pixelWidth = (top + bottom) / 2;
  const pixelHeight = (left + right) / 2;
  const frameWidthPercent = frame.width ? (pixelWidth / Number(frame.width)) * 100 : 0;
  return {
    pixelWidth,
    pixelHeight,
    frameWidthPercent,
  };
}

function buildVisionContextText(payload = {}, capture = {}) {
  const roomContext = buildRoomContext();
  const target = payload.target || state.phone.target;
  const prompt = String(payload.prompt || payload.text || "Describe what the phone sees.").slice(0, 500);
  const recentEvents = state.events.slice(0, 5).map((event) => event.event_type).join(", ") || "none";
  const lines = [
    `Phone lens capture ${capture.id || "unsaved"}.`,
    `Question: ${prompt}`,
    `Target: ${summarizePhoneTarget(target)}.`,
    `Room: phase ${roomContext.phase}, mode ${roomContext.room_mode}.`,
    `Board: ${state.board.objects.length} objects, ${state.board.strokes.length} strokes, ${state.room.focuses?.length || 0} focus regions.`,
    `Recent events: ${recentEvents}.`,
  ];
  if (capture.imagePath) lines.push(`Saved image: ${capture.imagePath}.`);
  return lines.join(" ");
}

function buildFigurateRoomSnapshot() {
  return {
    phase: state.room.phase,
    boardMode: state.room.boardMode,
    activePrototype: state.room.activePrototype,
    focus: state.room.focus,
    focusCount: state.room.focuses?.length || 0,
    board: {
      objectCount: state.board.objects.length,
      strokeCount: state.board.strokes.length,
      objects: state.board.objects.slice(0, 8).map((object) => ({
        id: object.id,
        kind: object.kind,
        label: object.label || object.text || object.id,
        x: object.x,
        y: object.y,
      })),
    },
    classroomProjection: state.projection.classroom,
    phone: {
      target: state.phone.target,
      lastCaptureId: state.phone.lastCaptureId,
      liveConversationId: state.phone.liveConversationId,
    },
    perception: {
      cameraCount: Object.keys(state.perception.cameraStates || {}).length,
      roomMode: state.perception.cameraRoom?.room_mode || "unknown",
      visiblePersons: state.perception.cameraRoom?.total_persons || 0,
    },
    recentEvents: state.events.slice(0, 10).map((event) => ({
      type: event.event_type,
      source: event.source,
      createdAt: event.created_at,
    })),
  };
}

function extractTextFromValue(value) {
  if (!value) return "";
  if (typeof value === "string") return value.trim();
  if (Array.isArray(value)) {
    for (const item of value) {
      const text = extractTextFromValue(item);
      if (text) return text;
    }
    return "";
  }
  if (typeof value !== "object") return "";
  const directKeys = ["text", "response", "message", "content", "output", "answer", "description"];
  for (const key of directKeys) {
    const text = extractTextFromValue(value[key]);
    if (text) return text;
  }
  const nestedKeys = ["data", "result", "payload", "responseText", "assistantMessage", "error"];
  for (const key of nestedKeys) {
    const text = extractTextFromValue(value[key]);
    if (text) return text;
  }
  return "";
}

function extractConversationId(value) {
  if (!value || typeof value !== "object") return "";
  if (typeof value.conversationId === "string" && value.conversationId.trim()) {
    return value.conversationId.trim();
  }
  for (const key of ["data", "response", "payload", "result", "meta"]) {
    const nested = extractConversationId(value[key]);
    if (nested) return nested;
  }
  return "";
}

function parseSseEvents(rawText) {
  const events = [];
  let eventName = "message";
  let dataLines = [];
  const flush = () => {
    if (!dataLines.length) return;
    const rawData = dataLines.join("\n");
    let data = rawData;
    try {
      data = JSON.parse(rawData);
    } catch {
      // Leave non-JSON data as text.
    }
    events.push({ event: eventName, data });
    eventName = "message";
    dataLines = [];
  };

  for (const line of String(rawText || "").split(/\r?\n/)) {
    if (!line.trim()) {
      flush();
      continue;
    }
    if (line.startsWith("event:")) {
      eventName = line.slice(6).trim() || "message";
    } else if (line.startsWith("data:")) {
      dataLines.push(line.slice(5).trimStart());
    }
  }
  flush();
  return events;
}

function parseFiguratePipelineResponse(rawText, contentType = "") {
  const raw = String(rawText || "").trim();
  if (!raw) return { text: "", conversationId: "", events: [] };

  if (contentType.includes("application/json") || raw.startsWith("{") || raw.startsWith("[")) {
    try {
      const json = JSON.parse(raw);
      return {
        text: extractTextFromValue(json),
        conversationId: extractConversationId(json),
        events: [],
        json,
      };
    } catch {
      // Fall through to SSE/text parsing.
    }
  }

  const events = parseSseEvents(raw);
  for (const event of events.slice().reverse()) {
    if (event.event === "text") {
      const text = extractTextFromValue(event.data);
      if (text) {
        return {
          text,
          conversationId: extractConversationId(event.data),
          events,
        };
      }
    }
  }
  for (const event of events.slice().reverse()) {
    const text = extractTextFromValue(event.data);
    if (text) {
      return {
        text,
        conversationId: extractConversationId(event.data),
        events,
      };
    }
  }

  return { text: raw.slice(0, 2000), conversationId: "", events };
}

function figurateHeaders(apiKey, options = {}) {
  const rawKey = stripBearer(apiKey);
  const headers = {
    Accept: options.accept || "application/json, text/event-stream",
    "Content-Type": "application/json",
  };
  if (!rawKey) return headers;
  headers.Authorization = /^Bearer\s+/i.test(apiKey) ? apiKey : `Bearer ${rawKey}`;
  headers["X-Device-API-Key"] = rawKey;
  headers["X-API-Key"] = rawKey;
  if (options.vision) headers["X-Vision-API-Key"] = rawKey;
  return headers;
}

async function postJsonWithTimeout(url, body, headers, timeoutMs, label) {
  if (typeof fetch !== "function") {
    throw new Error("Node fetch is unavailable; use Node 18+ to call Figurate.");
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const started = Date.now();
  try {
    const response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const text = await response.text();
    const latencyMs = Date.now() - started;
    if (!response.ok) {
      const parsed = parseFiguratePipelineResponse(text, response.headers.get("content-type") || "");
      const error = new Error(parsed.text || `${label} returned HTTP ${response.status}`);
      error.status = response.status;
      error.body = text.slice(0, 1000);
      error.latencyMs = latencyMs;
      throw error;
    }
    return {
      status: response.status,
      contentType: response.headers.get("content-type") || "",
      text,
      latencyMs,
    };
  } catch (error) {
    if (error.name === "AbortError") {
      const timeoutError = new Error(`${label} timed out after ${timeoutMs}ms`);
      timeoutError.latencyMs = Date.now() - started;
      throw timeoutError;
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function rememberFigurateSuccess(provider, response) {
  figurateRuntime = {
    ...figurateRuntime,
    lastError: null,
    lastLatencyMs: response.latencyMs,
    lastOk: now(),
    lastProvider: provider,
    lastStatus: response.status,
  };
}

function rememberFigurateError(provider, error) {
  figurateRuntime = {
    ...figurateRuntime,
    lastError: error.message || String(error),
    lastLatencyMs: Number.isFinite(Number(error.latencyMs)) ? Number(error.latencyMs) : null,
    lastProvider: provider,
    lastStatus: error.status || null,
  };
}

function currentFigurateConversationId() {
  const conversation = state.character.conversation || {};
  return conversation.flowstateId || conversation.externalId || "";
}

function storeFigurateConversationId(conversationId) {
  if (!conversationId) return;
  state.character.conversation = {
    ...(state.character.conversation || {}),
    flowstateId: conversationId,
  };
}

async function callFigurateVisionAnalyze(payload = {}, capture = {}, contextText = "", source = "phone") {
  const config = readFigurateConfig();
  const image = payload.imageDataUrl || payload.image || "";
  if (!image || !config.useVision || !config.visionConfigured) {
    return {
      ok: false,
      skipped: true,
      reason: !image ? "no-image" : "vision-not-configured",
    };
  }

  const body = {
    image,
    prompt: String(payload.prompt || payload.text || "Describe what the phone sees for the room character.").slice(0, 700),
    systemPrompt: [
      "You are the vision service for an interactive classroom prototype.",
      "Describe only visible evidence from the image, especially whiteboard writing, sticky notes, fiducials, projected regions, and classroom objects.",
      "Be concise and useful for a room character that will answer the teacher or student.",
    ].join(" "),
    maxTokens: 260,
    characterId: config.characterId || undefined,
    conversationId: currentFigurateConversationId() || undefined,
    captureKind: capture.captureKind || payload.captureKind || "phone-lens",
    label: summarizePhoneTarget(payload.target || state.phone.target),
    source,
    sceneDescription: contextText.slice(0, 2000),
    cameraDescription: `Phone lens target: ${summarizePhoneTarget(payload.target || state.phone.target)}.`,
    persistCapture: payload.persistCapture !== false,
  };

  try {
    const response = await postJsonWithTimeout(
      config.visionUrl,
      body,
      figurateHeaders(config.visionApiKey, { vision: true }),
      config.visionTimeoutMs,
      "Figurate vision",
    );
    const parsed = parseFiguratePipelineResponse(response.text, response.contentType);
    rememberFigurateSuccess("figurate-vision", response);
    figurateRuntime.lastVisionAt = now();
    return {
      ok: true,
      text: parsed.text,
      meta: parsed.json?.data?.meta || parsed.json?.meta || {},
      provider: "figurate-vision",
    };
  } catch (error) {
    rememberFigurateError("figurate-vision", error);
    return {
      ok: false,
      error: error.message || String(error),
      provider: "figurate-vision",
    };
  }
}

async function callFigurateTextPipeline(params = {}) {
  const config = readFigurateConfig();
  if (!config.configured) {
    return {
      ok: false,
      skipped: true,
      reason: config.disabled ? "disabled" : `missing ${config.missing.join(", ")}`,
      provider: "local-mock",
    };
  }

  const body = {
    audioFormat: "pcm",
    characterId: config.characterId,
    text: String(params.text || "What should the room say?").slice(0, 2000),
    context: String(params.contextText || "").slice(0, 8000),
    conversationId: currentFigurateConversationId() || undefined,
    enableTools: config.enableTools,
    llmModel: config.llmModel || undefined,
    runtimeMode: config.runtimeMode || undefined,
    saveData: {
      source: "interactive-smart-classroom",
      sourceClient: params.source || "room-server",
      target: params.target || null,
      capture: params.capture ? {
        id: params.capture.id,
        captureKind: params.capture.captureKind,
        imagePath: params.capture.imagePath || null,
      } : null,
      vision: params.vision || null,
      room: buildFigurateRoomSnapshot(),
    },
    skipTts: config.skipTts,
  };

  try {
    const response = await postJsonWithTimeout(
      config.textUrl,
      body,
      figurateHeaders(config.apiKey, { accept: "text/event-stream, application/json" }),
      config.timeoutMs,
      "Figurate text pipeline",
    );
    const parsed = parseFiguratePipelineResponse(response.text, response.contentType);
    if (parsed.conversationId) storeFigurateConversationId(parsed.conversationId);
    rememberFigurateSuccess("figurate-flowstate", response);
    return {
      ok: true,
      text: parsed.text,
      conversationId: parsed.conversationId || currentFigurateConversationId(),
      events: parsed.events,
      provider: "figurate-flowstate",
      latencyMs: response.latencyMs,
      status: response.status,
    };
  } catch (error) {
    rememberFigurateError("figurate-flowstate", error);
    return {
      ok: false,
      error: error.message || String(error),
      provider: "figurate-flowstate",
    };
  }
}

function describeVisionCapture(payload = {}, capture = {}) {
  const prompt = String(payload.prompt || payload.text || "").trim();
  const target = payload.target || state.phone.target;
  const targetLabel = summarizePhoneTarget(target);
  const boardObjects = state.board.objects.length;
  const strokes = state.board.strokes.length;
  const saved = capture.imagePath ? ` I saved the frame at ${capture.imagePath}.` : "";

  if (/question|explain|what|see|looking|screenshot|image/i.test(prompt)) {
    return `I am looking at ${targetLabel}. From room context, the board currently has ${boardObjects} objects and ${strokes} writing strokes.${saved} I can use this frame as visual context for the next Figurate turn.`;
  }

  if (/slide|summary|send/i.test(prompt)) {
    return `I captured ${targetLabel} for a board-to-slide summary. The current board state has ${boardObjects} objects and ${strokes} strokes.${saved}`;
  }

  return `Phone lens captured ${targetLabel}. ${boardObjects} board objects and ${strokes} strokes are available as context.${saved}`;
}

function queueCharacterContext(contextText, meta = {}) {
  const item = {
    id: makeId("ctx"),
    text: String(contextText || "").slice(0, 4000),
    source: meta.source || "phone",
    captureId: meta.captureId || null,
    createdAt: now(),
  };
  state.character.vision.pendingContext.unshift(item);
  state.character.vision.pendingContext = state.character.vision.pendingContext.slice(0, 8);
  state.character.conversation.lastContextAt = item.createdAt;
  pushEvent("character.context.injected", item, { source: item.source });
  return item;
}

async function handlePhoneVisionCapture(payload = {}, source = "phone") {
  const captureImage = saveVisionImage(payload.imageDataUrl || payload.image || "");
  const target = payload.target || state.phone.target || null;
  const prompt = String(payload.prompt || payload.text || "What do you see?").slice(0, 500);
  const capture = {
    ...captureImage,
    prompt,
    target,
    captureKind: String(payload.captureKind || "phone-lens").slice(0, 80),
    description: "",
    createdAt: now(),
  };
  const localDescription = describeVisionCapture(payload, capture);
  let contextText = buildVisionContextText(payload, capture);
  const vision = await callFigurateVisionAnalyze(payload, capture, contextText, source);
  if (vision.ok && vision.text) {
    contextText = `${contextText} Vision analysis: ${vision.text}`;
  }
  const figurate = await callFigurateTextPipeline({
    text: [
      `A phone lens request came from ${source}.`,
      `Question: ${prompt}`,
      "Answer as the quiet Figurate room character. Be concise and actionable.",
    ].join(" "),
    contextText,
    capture,
    source,
    target,
    vision: vision.ok ? { text: vision.text, meta: vision.meta || {} } : null,
  });
  const provider = figurate.ok && figurate.text
    ? figurate.provider
    : vision.ok && vision.text
      ? vision.provider
      : "local-mock";
  capture.description = figurate.ok && figurate.text
    ? figurate.text
    : vision.ok && vision.text
      ? vision.text
      : localDescription;
  capture.meta = {
    provider,
    mock: provider === "local-mock",
    textPipeline: figurate.ok ? "ok" : figurate.skipped ? "skipped" : "error",
    visionPipeline: vision.ok ? "ok" : vision.skipped ? "skipped" : "error",
    textError: figurate.error || null,
    visionError: vision.error || null,
  };

  state.phone.target = target;
  state.phone.lastCaptureId = capture.id;
  state.character.present = true;
  state.character.mode = state.character.mode === "stub" ? "figurate" : state.character.mode;
  state.character.label = state.character.label === "Room Character" ? "Figurate" : state.character.label;
  state.character.lastQuestion = prompt;
  state.character.lastUtterance = capture.description;
  state.character.updatedAt = capture.createdAt;
  state.character.vision.lastCapture = capture;
  state.character.vision.captures.unshift(capture);
  state.character.vision.captures = state.character.vision.captures.slice(0, 12);

  queueCharacterContext(contextText, { source, captureId: capture.id });
  pushEvent("phone.vision.captured", capture, { source });
  pushEvent("character.utterance.completed", {
    text: capture.description,
    mode: state.character.mode,
    captureId: capture.id,
    provider,
  }, { source: "room-character", target: source });

  return {
    ok: true,
    response: capture.description,
    capture,
    contextText,
    meta: {
      capturePersisted: Boolean(capture.imagePath),
      imagePath: capture.imagePath,
      mock: provider === "local-mock",
      provider,
      textPipeline: capture.meta.textPipeline,
      visionPipeline: capture.meta.visionPipeline,
      textError: capture.meta.textError,
      visionError: capture.meta.visionError,
    },
  };
}

function handlePhoneConversationStart(payload = {}, source = "phone") {
  const startedAt = now();
  const conversationId = makeId("live");
  const target = payload.target || state.phone.target || null;
  const adapter = figuratePublicStatus();
  state.phone.target = target;
  state.phone.liveConversationId = conversationId;
  state.character.present = true;
  state.character.mode = String(payload.characterId || state.character.mode || "figurate").slice(0, 80);
  if (state.character.mode === "stub") state.character.mode = "figurate";
  state.character.label = String(payload.label || state.character.label || "Figurate").slice(0, 80);
  state.character.conversation = {
    live: true,
    id: conversationId,
    status: adapter.configured ? "ready-flowstate" : "connected-local",
    source,
    target,
    startedAt,
    endedAt: null,
    lastContextAt: state.character.conversation?.lastContextAt || null,
    flowstateId: state.character.conversation?.flowstateId || null,
  };
  state.character.lastUtterance = `Live conversation is open from the phone lens. I am scoped to ${summarizePhoneTarget(target)}.`;
  state.character.updatedAt = startedAt;
  pushEvent("phone.conversation.requested", { conversationId, target }, { source });
  pushEvent("character.live.started", state.character.conversation, { source: "room-character", target: source });
  return { ok: true, conversation: state.character.conversation };
}

function handlePhoneConversationStop(payload = {}, source = "phone") {
  const endedAt = now();
  const conversation = {
    ...(state.character.conversation || {}),
    live: false,
    status: "ended",
    endedAt,
  };
  state.character.conversation = conversation;
  state.phone.liveConversationId = null;
  state.character.updatedAt = endedAt;
  pushEvent("character.live.ended", conversation, { source });
  return { ok: true, conversation };
}

function roomTargetPoint(target) {
  const fallback = { surface: "board", x: 0.5, y: 0.5, label: "board" };
  if (!target) return fallback;
  if (Number.isFinite(Number(target.x)) && Number.isFinite(Number(target.y))) {
    return {
      surface: target.surface || "board",
      x: clamp01(target.x),
      y: clamp01(target.y),
      label: target.label || target.id || "point",
    };
  }
  const object = target.id ? getBoardObject(target.id) || getToken(target.id) : null;
  if (object) {
    return {
      surface: object.surface || target.surface || "board",
      x: clamp01(object.x ?? 0.5),
      y: clamp01(object.y ?? 0.5),
      label: object.label || target.label || object.id,
    };
  }
  return {
    ...fallback,
    surface: target.surface || target.id || "board",
    label: target.label || target.id || "board",
  };
}

function applyPhoneFocusCommand(target, source) {
  const point = roomTargetPoint(target);
  const focus = normalizeFocusPayload({
    id: `phone-focus-${Date.now()}`,
    surface: point.surface,
    x: point.x,
    y: point.y,
    label: `Phone focus: ${point.label}`,
    append: true,
  });
  state.room.focuses = [
    ...(Array.isArray(state.room.focuses) ? state.room.focuses : []).filter((item) => item.id !== focus.id),
    focus,
  ].slice(-12);
  state.room.focus = focus;
  const payload = { ...focus, focus, focuses: state.room.focuses, via: "phone-command" };
  pushEvent("surface.focus.requested", payload, { source });
  pushEvent("surface.focus.started", payload, { source });
  return { ok: true, command: "focus", focus, focuses: state.room.focuses };
}

function applyPhoneSlideCommand(delta, target, source) {
  const slideCount = Math.max(1, Number(state.projection.classroom?.slideCount || 3));
  const current = Number.isFinite(Number(state.projection.classroom?.slideIndex))
    ? Number(state.projection.classroom.slideIndex)
    : 0;
  const slideIndex = ((Math.trunc(current + delta) % slideCount) + slideCount) % slideCount;
  state.projection.classroom = {
    ...state.projection.classroom,
    slideIndex,
    slideCount,
    status: delta > 0 ? "Phone requested next slide" : "Phone requested previous slide",
    updatedAt: now(),
  };
  const action = delta > 0 ? "next" : "previous";
  pushEvent("slide.control.requested", {
    action,
    target: target || state.phone.target || null,
    controller: "phone-lens",
    slideIndex,
    slideCount,
  }, { source, target: "slide.current" });
  pushEvent("projection.classroom.updated", state.projection.classroom, { source });
  return { ok: true, command: "slide", action, slideIndex, slideCount };
}

function applyPhoneModeCommand(mode, source) {
  state.room.boardMode = mode;
  pushEvent("board.mode.changed", { mode, via: "phone-command" }, { source });
  return { ok: true, command: "board-mode", mode };
}

function applyPhoneCameraModeCommand(mode, source) {
  return sendCameraCommand("all-cameras", {
    command: "set-mode",
    mode,
    reason: `phone command requested ${mode}`,
  }, source);
}

async function applyPhoneTextCommand(payload = {}, source = "phone") {
  const text = String(payload.text || payload.prompt || "").trim();
  const lower = text.toLowerCase();
  const target = payload.target || state.phone.target || null;
  if (target) state.phone.target = target;

  if (/\b(next|forward|advance)\b/.test(lower) && /\b(slide|deck|screen|presentation)\b/.test(lower)) {
    return applyPhoneSlideCommand(1, target, source);
  }
  if (/\b(back|previous|prev|rewind)\b/.test(lower) && /\b(slide|deck|screen|presentation)\b/.test(lower)) {
    return applyPhoneSlideCommand(-1, target, source);
  }
  if (/\b(focus|spotlight|highlight|zoom in)\b/.test(lower)) {
    return applyPhoneFocusCommand(target, source);
  }
  if (/\b(write|annotation|annotate|drawing)\b/.test(lower)) {
    return applyPhoneModeCommand("write", source);
  }
  if (/\b(stage|presentation|present)\b/.test(lower)) {
    return applyPhoneModeCommand("stage", source);
  }
  if (/\b(pose|skeleton|body|hand|arm|gesture)\b/.test(lower)) {
    return applyPhoneCameraModeCommand("pose", source);
  }
  if (/\b(tag|tags|fiducial|apriltag|april tag)\b/.test(lower)) {
    return applyPhoneCameraModeCommand("fiducial", source);
  }
  if (/\b(vjepa|classify|classification|room mode)\b/.test(lower)) {
    return applyPhoneCameraModeCommand("vjepa", source);
  }
  if (/\b(start|open)\b.*\b(live|conversation|figurate)\b/.test(lower)) {
    return handlePhoneConversationStart({ target, characterId: "figurate", label: "Figurate" }, source);
  }
  if (/\b(stop|end|close)\b.*\b(live|conversation|figurate)\b/.test(lower)) {
    return handlePhoneConversationStop(payload, source);
  }

  return handlePhoneVisionCapture({
    ...payload,
    target,
    prompt: text || "What does the phone see?",
  }, source);
}

function buildCharacterAnswer(question) {
  const lower = String(question || "").toLowerCase();
  const latest = state.events.slice(0, 5).map((event) => event.event_type);
  const output = state.puzzle.output;
  const target = state.puzzle.target;
  const latestVision = state.character.vision?.lastCapture;

  if (latestVision && (lower.includes("see") || lower.includes("image") || lower.includes("screenshot") || lower.includes("phone"))) {
    return `${latestVision.description} Ask a follow-up or tap Look again to refresh the visual context.`;
  }

  if (lower.includes("wrong") || lower.includes("hint") || lower.includes("beam") || lower.includes("target")) {
    if (state.light.targetHit) return "The beam is hitting the target. Try moving the mirror and watch the reflection angle change.";
    return "Short hint: rotate or move the mirror until the beam leaves it toward the green target.";
  }

  if (lower.includes("what") || lower.includes("build")) {
    return `You built Light Lab: ${state.light.rays.length} light segments, ${state.light.collisions.length} object interactions, target ${state.light.targetHit ? "hit" : "not hit"}.`;
  }

  if (lower.includes("lost") || lower.includes("debug")) {
    return "Reveal mode can show object IDs, routes, confidence, and last known positions. Turn on debugger mode first.";
  }

  if (lower.includes("figurate") || lower.includes("character") || lower.includes("room-aware")) {
    return `Figurate is listening. I see ${state.board.objects.length} board objects, ${state.board.strokes.length} writing strokes, and mode ${state.room.boardMode || "stage"}.`;
  }

  if (lower.includes("sticky") || lower.includes("whiteboard") || lower.includes("board")) {
    return `The board has ${state.board.objects.length} movable objects and ${state.board.strokes.length} drawing strokes. Sticky notes can become fiducial notes later.`;
  }

  return `I see phase ${state.room.phase}, mode ${state.light.activeMode}, and recent events: ${latest.join(", ") || "none yet"}.`;
}

async function handleCharacterAsk(payload = {}, source = "unknown-client") {
  const question = String(payload.text || payload.prompt || "").slice(0, 1000);
  const target = payload.target || state.phone.target || null;
  const latestVision = state.character.vision?.lastCapture || null;
  const pendingContext = (state.character.vision?.pendingContext || [])
    .slice(0, 3)
    .map((item) => item.text)
    .join("\n");
  const contextText = [
    "The user is asking the Figurate room character.",
    `Question: ${question || "What should the room say now?"}`,
    `Target: ${summarizePhoneTarget(target)}.`,
    latestVision ? `Latest phone vision: ${latestVision.description}` : "",
    pendingContext ? `Recent injected context:\n${pendingContext}` : "",
    `Room snapshot: ${JSON.stringify(buildFigurateRoomSnapshot())}`,
  ].filter(Boolean).join("\n");
  const figurate = await callFigurateTextPipeline({
    text: question || "Explain the current room state.",
    contextText,
    source,
    target,
    vision: latestVision ? {
      captureId: latestVision.id,
      description: latestVision.description,
      imagePath: latestVision.imagePath || null,
    } : null,
  });
  const provider = figurate.ok && figurate.text ? figurate.provider : "local-mock";
  const utterance = figurate.ok && figurate.text ? figurate.text : buildCharacterAnswer(question);

  state.character.lastQuestion = question;
  state.character.lastUtterance = utterance;
  state.character.updatedAt = now();
  if (target) state.phone.target = target;
  pushEvent("user.voice.turn", { text: question, target }, { source });
  pushEvent("character.utterance.completed", {
    text: utterance,
    mode: state.character.mode,
    provider,
  }, { source: "room-character", target: source });
  return {
    ok: true,
    utterance,
    meta: {
      provider,
      mock: provider === "local-mock",
      error: figurate.error || null,
    },
  };
}

async function handleAction(action, req) {
  const type = action.type;
  const payload = action.payload || {};
  const source = action.source || "unknown-client";
  const user = action.user || {};

  if (type === "participant.join") {
    const name = String(payload.name || user.name || "local guest").slice(0, 40);
    state.participants[name] = {
      name,
      role: payload.role || "viewer",
      page: payload.page || source,
      updatedAt: now(),
    };
    if (payload.page === "phone") state.surfaces.find((s) => s.id === "phone").online = true;
    pushEvent("participant.joined", state.participants[name], { source });
    return { ok: true };
  }

  if (type === "room.reset") {
    return resetRoomState(source, user.name || source);
  }

  if (type === "phase.set") {
    state.room.phase = String(payload.phase || "unknown");
    pushEvent("room.phase.changed", { phase: state.room.phase }, { source });
    return { ok: true };
  }

  if (type === "debug.toggle") {
    state.room.debug = typeof payload.enabled === "boolean" ? payload.enabled : !state.room.debug;
    pushEvent("debug.mode.changed", { enabled: state.room.debug }, { source });
    return { ok: true };
  }

  if (type === "mode.set") {
    const mode = String(payload.mode || "light-lab");
    if (!state.config.markerModes[mode]) return { ok: false, error: "unknown marker mode" };
    state.light.activeMode = mode;
    state.room.activePrototype = mode;
    pushEvent("mode.changed", { mode, label: state.config.markerModes[mode].label }, { source });
    evaluatePuzzle(source);
    return { ok: true };
  }

  if (type === "board-mode.set") {
    const mode = String(payload.mode || "stage");
    const allowed = new Set(["stage", "focus", "write", "explore", "character", "check-understanding", "safety-control"]);
    if (!allowed.has(mode)) return { ok: false, error: "unknown board mode" };
    state.room.boardMode = mode;
    pushEvent("board.mode.changed", { mode }, { source });
    return { ok: true };
  }

  if (type === "token.move" || type === "marker.move") {
    const token = getToken(payload.id);
    if (!token) return { ok: false, error: "unknown token" };
    token.x = clamp01(payload.x);
    token.y = clamp01(payload.y);
    token.confidence = 0.99;
    token.updatedAt = now();
    pushEvent(
      "fiducial.detected",
      {
        id: token.id,
        tag_id: token.tagId,
        name: token.label,
        x: token.x,
        y: token.y,
        surface: token.surface || payload.surface || "board",
        zone: token.surface || payload.surface || "board",
        confidence: 0.99,
      },
      { source },
    );
    evaluatePuzzle(source);
    return { ok: true };
  }

  if (type === "token.toggle") {
    const token = getToken(payload.id);
    if (!token || token.kind !== "input") return { ok: false, error: "not an input token" };
    token.value = typeof payload.value === "boolean" ? payload.value : !token.value;
    pushEvent("logic.input.changed", { id: token.id, value: token.value }, { source });
    evaluatePuzzle(source);
    return { ok: true };
  }

  if (type === "marker.rotate") {
    const token = getToken(payload.id);
    if (!token) return { ok: false, error: "unknown marker" };
    const delta = Number(payload.delta ?? Math.PI / 12);
    token.angle = Number(token.angle || 0) + delta;
    pushEvent(
      "light.marker.rotated",
      { id: token.id, angle: token.angle, degrees: Math.round((token.angle * 180) / Math.PI) },
      { source },
    );
    evaluatePuzzle(source);
    return { ok: true };
  }

  if (type === "marker.role") {
    const token = getToken(payload.id);
    if (!token) return { ok: false, error: "unknown marker" };
    const allowed = new Set(["emitter", "mirror", "splitter", "filter", "blocker", "target", "function"]);
    const kind = String(payload.kind || token.kind);
    if (!allowed.has(kind)) return { ok: false, error: "unsupported marker kind" };
    token.kind = kind;
    token.label = payload.label || token.label || kind;
    if (payload.beamColor) token.beamColor = payload.beamColor;
    pushEvent("light.marker.role.changed", { id: token.id, kind: token.kind }, { source });
    evaluatePuzzle(source);
    return { ok: true };
  }

  if (type === "calibration.sample.add") {
    const surfaceId = String(payload.surface || "table");
    const calibration = state.calibration[surfaceId];
    if (!calibration) return { ok: false, error: "unknown calibrated surface" };
    const surfacePoint = parseCalibrationPoint(
      payload.surfacePoint || payload.surface_coord || payload.normalized || calibrationPointForTag(surfaceId, payload.tagId),
      { clamp: true },
    );
    const sample = {
      camera: parseCalibrationPoint(payload.camera || payload.cameraPoint, { clamp: false }),
      projector: payload.projector ? parseCalibrationPoint(payload.projector || payload.projectorPoint, { clamp: false }) : null,
      surface: surfacePoint,
      tagId: payload.tagId ?? null,
      createdAt: now(),
    };
    calibration.samples.push(sample);
    calibration.updatedAt = now();
    calibration.status = calibration.samples.length >= 4 ? "sampled" : "sampling";
    persistCalibrationState();
    pushEvent("calibration.sample.added", { surface: surfaceId, sampleCount: calibration.samples.length }, { source });
    return { ok: true, calibration };
  }

  if (type === "calibration.solve") {
    const surfaceId = String(payload.surface || "table");
    const sourceSpace = String(payload.sourceSpace || "camera");
    const result = solveSurfaceCalibration(surfaceId, sourceSpace);
    if (!result.ok) return result;
    pushEvent("calibration.solved", {
      surface: surfaceId,
      sourceSpace,
      error: result.calibration.error,
      status: result.calibration.status,
    }, { source });
    return result;
  }

  if (type === "calibration.set") {
    const surfaceId = String(payload.surface || "table");
    const calibration = state.calibration[surfaceId];
    if (!calibration) return { ok: false, error: "unknown calibrated surface" };
    if (Array.isArray(payload.cameraToSurfaceHomography)) {
      calibration.cameraToSurfaceHomography = payload.cameraToSurfaceHomography;
      try {
        calibration.surfaceToCameraHomography = invertHomography(payload.cameraToSurfaceHomography);
      } catch {
        calibration.surfaceToCameraHomography = null;
      }
    }
    if (Array.isArray(payload.projectorToSurfaceHomography)) {
      calibration.projectorToSurfaceHomography = payload.projectorToSurfaceHomography;
      try {
        calibration.surfaceToProjectorHomography = invertHomography(payload.projectorToSurfaceHomography);
      } catch {
        calibration.surfaceToProjectorHomography = null;
      }
    }
    calibration.status = payload.status || "calibrated";
    calibration.updatedAt = now();
    calibration.error = payload.error ? { ...(calibration.error || {}), ...payload.error } : calibration.error || null;
    persistCalibrationState();
    pushEvent("calibration.updated", { surface: surfaceId, status: calibration.status }, { source });
    return { ok: true, calibration };
  }

  if (type === "calibration.clear") {
    const surfaceId = String(payload.surface || "table");
    if (!state.calibration[surfaceId]) return { ok: false, error: "unknown calibrated surface" };
    state.calibration[surfaceId] = {
      ...state.calibration[surfaceId],
      cameraToSurfaceHomography: null,
      projectorToSurfaceHomography: null,
      samples: [],
      status: "uncalibrated",
      updatedAt: now(),
    };
    persistCalibrationState();
    pushEvent("calibration.cleared", { surface: surfaceId }, { source });
    return { ok: true };
  }

  if (type === "fiducial.detections.ingest") {
    const result = ingestFiducialDetections(payload, source);
    if (!result.ok) return result;
    return result;
  }

  if (type === "board.tags.clear") {
    const result = clearBoardTags({ keepCalibration: payload.keepCalibration !== false });
    pushEvent("board.tags.cleared", result, { source });
    evaluatePuzzle(source);
    return { ok: true, ...result };
  }

  if (type === "board.drag.set") {
    const active = payload.active !== false && payload.role;
    state.board.activeDrag = active
      ? {
          id: String(payload.id || "").slice(0, 80),
          tagId: payload.tagId ?? null,
          role: String(payload.role || "").slice(0, 40),
          surface: String(payload.surface || "board").slice(0, 40),
          x: Number.isFinite(Number(payload.x)) ? clamp01(payload.x) : null,
          y: Number.isFinite(Number(payload.y)) ? clamp01(payload.y) : null,
          updatedAt: now(),
        }
      : null;
    pushEvent("board.drag.changed", { activeDrag: state.board.activeDrag }, { source });
    return { ok: true, activeDrag: state.board.activeDrag };
  }

  if (type === "phone.vision.capture") {
    return await handlePhoneVisionCapture(payload, source);
  }

  if (type === "phone.conversation.start") {
    return handlePhoneConversationStart(payload, source);
  }

  if (type === "phone.conversation.stop") {
    return handlePhoneConversationStop(payload, source);
  }

  if (type === "phone.command.run") {
    return await applyPhoneTextCommand(payload, source);
  }

  if (type === "character.context.inject") {
    const context = queueCharacterContext(payload.text || payload.context || "", {
      source,
      captureId: payload.captureId || null,
    });
    return { ok: true, context };
  }

  if (type === "camera.state.push") {
    return ingestCameraState(payload, source);
  }

  if (type === "clipboard.copy") {
    const item = serializeObject(payload.objectId);
    if (!item) return { ok: false, error: "unknown object" };
    state.clipboard = item;
    pushEvent("clipboard.object.copied", item, { source });
    return { ok: true };
  }

  if (type === "clipboard.send") {
    if (!state.clipboard) return { ok: false, error: "clipboard empty" };
    const targetSurface = payload.targetSurface || "board";
    if (targetSurface === "board") {
      const card = {
        id: makeId("board-card"),
        kind: "card",
        label: state.clipboard.label,
        text: state.clipboard.text,
        sourceObjectId: state.clipboard.sourceObjectId,
        x: clamp01(payload.x ?? 0.44),
        y: clamp01(payload.y ?? 0.36),
        w: 0.24,
        h: 0.16,
        color: "#bfdbfe",
        surface: "board",
      };
      state.board.objects.push(card);
      pushEvent(
        "surface.object.spawned",
        { object: card, targetSurface: "board", clipboard: state.clipboard },
        { source },
      );
      pushEvent("clipboard.object.sent", { targetSurface: "board", objectId: card.id }, { source });
      return { ok: true, object: card };
    }
    return { ok: false, error: "unsupported target surface" };
  }

  if (type === "focus.set") {
    const focus = normalizeFocusPayload(payload);
    const replace = payload.replace === true || payload.multi === false || payload.append === false;
    const existing = replace ? [] : Array.isArray(state.room.focuses) ? state.room.focuses : [];
    state.room.focuses = [
      ...existing.filter((item) => item.id !== focus.id),
      focus,
    ].slice(-12);
    state.room.focus = focus;
    const focusEventPayload = { ...focus, focus, focuses: state.room.focuses };
    pushEvent("surface.focus.requested", focusEventPayload, { source });
    pushEvent("surface.focus.started", focusEventPayload, { source });
    return { ok: true, focus, focuses: state.room.focuses };
  }

  if (type === "focus.clear") {
    const focusId = payload.id || payload.focusId;
    if (focusId && Array.isArray(state.room.focuses)) {
      state.room.focuses = state.room.focuses.filter((item) => item.id !== String(focusId));
      state.room.focus = state.room.focuses[state.room.focuses.length - 1] || null;
      pushEvent("surface.focus.cleared", { id: String(focusId), focuses: state.room.focuses }, { source });
      return { ok: true, focuses: state.room.focuses };
    }
    state.room.focus = null;
    state.room.focuses = [];
    pushEvent("surface.focus.cleared", { focuses: [] }, { source });
    return { ok: true, focuses: [] };
  }

  if (type === "character.presence.set") {
    const present = payload.present !== false;
    state.character.present = present;
    state.character.mode = present ? String(payload.characterId || "figurate").slice(0, 80) : "stub";
    state.character.surface = present ? String(payload.surface || "board").slice(0, 80) : null;
    state.character.x = present ? clamp01(payload.x ?? 0.5) : null;
    state.character.y = present ? clamp01(payload.y ?? 0.5) : null;
    state.character.label = present
      ? String(payload.label || "Figurate").slice(0, 80)
      : "Room Character";
    state.character.updatedAt = now();
    pushEvent("character.state.changed", {
      present,
      characterId: state.character.mode,
      characterState: present ? "ready" : "away",
      state: present ? "ready" : "away",
      energy: present ? "listening" : "quiet",
      label: state.character.label,
      surface: state.character.surface,
      x: state.character.x,
      y: state.character.y,
      tagId: Number.isFinite(Number(payload.tagId)) ? Number(payload.tagId) : null,
    }, { source });
    return { ok: true, character: state.character };
  }

  if (type === "character.ask") {
    return await handleCharacterAsk(payload, source);
  }

  if (type === "board.object.create") {
    const isSticky = (payload.kind || "sticky") === "sticky";
    const defaultHeight = isSticky ? 0.11 : 0.14;
    const defaultWidth = isSticky ? boardSquareWidth(defaultHeight) : 0.2;
    const objectText = payload.text !== undefined
      ? String(payload.text)
      : isSticky
        ? ""
        : "New note";
    const object = {
      id: makeId(payload.kind === "shape" ? "shape" : "note"),
      kind: payload.kind || "sticky",
      label: payload.label || (payload.kind === "shape" ? "Shape" : "Sticky Note"),
      text: objectText.slice(0, 240),
      shape: payload.shape || "note",
      x: clamp01(payload.x ?? 0.16),
      y: clamp01(payload.y ?? 0.18),
      w: normalizedBoardObjectSize(payload.w, defaultWidth),
      h: normalizedBoardObjectSize(payload.h, defaultHeight),
      color: payload.color || "#facc15",
      surface: "board",
    };
    if (payload.tagId || payload.fiducial?.tagId) {
      object.tagId = Number(payload.tagId || payload.fiducial.tagId);
      object.fiducial = {
        tagId: object.tagId,
        anchor: String(payload.fiducial?.anchor || "top-left").slice(0, 40),
      };
    }
    clampBoardObjectToSurface(object);
    state.board.objects.push(object);
    pushEvent(object.kind === "shape" ? "whiteboard.shape.created" : "whiteboard.sticky.created", object, { source });
    return { ok: true, object };
  }

  if (type === "board.object.move") {
    const object = getBoardObject(payload.id);
    if (!object) return { ok: false, error: "unknown board object" };
    object.x = clamp01(payload.x);
    object.y = clamp01(payload.y);
    clampBoardObjectToSurface(object);
    pushEvent("whiteboard.object.moved", { id: object.id, x: object.x, y: object.y }, { source });
    return { ok: true };
  }

  if (type === "board.object.update") {
    const object = getBoardObject(payload.id);
    if (!object) return { ok: false, error: "unknown board object" };
    if (payload.text !== undefined) object.text = String(payload.text).slice(0, 240);
    if (payload.label !== undefined) object.label = String(payload.label).slice(0, 80);
    if (payload.color !== undefined) object.color = String(payload.color);
    if (payload.w !== undefined) object.w = normalizedBoardObjectSize(payload.w, object.w || boardSquareWidth(object.h || 0.11));
    if (payload.h !== undefined) object.h = normalizedBoardObjectSize(payload.h, object.h || object.w || 0.11);
    if (object.kind === "sticky" && payload.w === undefined && payload.h !== undefined) object.w = boardSquareWidth(object.h);
    clampBoardObjectToSurface(object);
    pushEvent("whiteboard.object.updated", object, { source });
    return { ok: true };
  }

  if (type === "board.stroke.add") {
    const stroke = {
      id: makeId("stroke"),
      color: payload.color || "#111827",
      points: Array.isArray(payload.points) ? payload.points.slice(0, 400) : [],
      size: Number(payload.size || 3),
      surface: "board",
    };
    if (payload.zone && typeof payload.zone === "object") {
      stroke.zone = {
        id: String(payload.zone.id || "zone").slice(0, 60),
        x: clamp01(payload.zone.x),
        y: clamp01(payload.zone.y),
        w: clamp01(payload.zone.w),
        h: clamp01(payload.zone.h),
      };
    }
    state.board.strokes.push(stroke);
    state.board.strokes = state.board.strokes.slice(-80);
    pushEvent("whiteboard.stroke.added", { id: stroke.id, pointCount: stroke.points.length, zone: stroke.zone || null }, { source });
    return { ok: true, stroke };
  }

  if (type === "board.stroke.erase.near") {
    const point = {
      x: clamp01(payload.x),
      y: clamp01(payload.y),
    };
    const radius = Math.max(0.01, Math.min(0.25, Number(payload.radius || 0.045)));
    const before = state.board.strokes.length;
    const nextStrokes = [];
    let erased = 0;
    for (const stroke of state.board.strokes) {
      const segments = splitStrokeOutsideRadius(stroke, point, radius);
      if (segments.length !== 1 || segments[0].points.length !== stroke.points.length) erased += 1;
      nextStrokes.push(...segments);
    }
    state.board.strokes = nextStrokes.slice(-80);
    pushEvent("whiteboard.stroke.erased", {
      x: point.x,
      y: point.y,
      radius,
      changed: erased,
      before,
      after: state.board.strokes.length,
    }, { source });
    return { ok: true, changed: erased, strokes: state.board.strokes.length };
  }

  if (type === "projection.classroom.update") {
    const projection = {
      surface: "classroom-screen",
      sourceSurface: String(payload.sourceSurface || "board").slice(0, 80),
      title: String(payload.title || "Classroom Screen").slice(0, 120),
      status: String(payload.status || "").slice(0, 180),
      lines: Array.isArray(payload.lines) ? payload.lines.slice(0, 8).map((line) => String(line).slice(0, 180)) : [],
      slideIndex: Number.isFinite(Number(payload.slideIndex)) ? Number(payload.slideIndex) : null,
      slideCount: Number.isFinite(Number(payload.slideCount)) ? Number(payload.slideCount) : null,
      updatedAt: now(),
    };
    state.projection.classroom = projection;
    pushEvent("projection.classroom.updated", projection, { source });
    return { ok: true, projection };
  }

  if (type === "board.clear") {
    state.board.strokes = [];
    pushEvent("whiteboard.strokes.cleared", {}, { source });
    return { ok: true };
  }

  if (type === "board.objects.clear") {
    const before = state.board.objects.length;
    state.board.objects = [];
    pushEvent("whiteboard.objects.cleared", { before, after: 0 }, { source });
    return { ok: true, before, after: 0 };
  }

  if (type === "phone.target") {
    state.phone.target = payload.target || null;
    state.phone.mode = payload.mode || state.phone.mode;
    pushEvent("phone.target.selected", state.phone, { source });
    return { ok: true };
  }

  if (type === "bind.create") {
    const binding = {
      id: makeId("bind"),
      objectId: payload.objectId || state.clipboard?.sourceObjectId || "unknown",
      target: payload.target || "slide.current",
      relation: payload.relation || "controls",
      createdAt: now(),
    };
    state.bindings.unshift(binding);
    state.bindings = state.bindings.slice(0, 40);
    pushEvent("slide.element.bound", binding, { source });
    pushEvent("object.capability.changed", { objectId: binding.objectId, capability: binding.relation }, { source });
    return { ok: true, binding };
  }

  if (type === "event.manual") {
    pushEvent(payload.event_type || "manual.event", payload.payload || {}, { source });
    return { ok: true };
  }

  if (type === "class-object.set") {
    const object = getClassObject(payload.id);
    if (!object) return { ok: false, error: "unknown class object" };
    const nextState = payload.state && typeof payload.state === "object" ? payload.state : {};
    object.state = {
      ...object.state,
      ...nextState,
    };
    pushEvent("class-object.updated", {
      id: object.id,
      label: object.label,
      kind: object.kind,
      surface: object.surface,
      state: object.state,
    }, { source });
    return { ok: true, object };
  }

  if (type === "class-object.reset") {
    if (payload.id) {
      const object = getClassObject(payload.id);
      if (!object) return { ok: false, error: "unknown class object" };
      const baseline = createClassObjects().find((item) => item.id === object.id);
      object.state = { ...(baseline?.state || {}) };
      pushEvent("class-object.updated", {
        id: object.id,
        label: object.label,
        kind: object.kind,
        surface: object.surface,
        state: object.state,
      }, { source });
      return { ok: true, object };
    }
    state.classObjects = createClassObjects();
    pushEvent("class-object.reset", { count: state.classObjects.length }, { source });
    return { ok: true, classObjects: state.classObjects };
  }

  if (type === "project.set") {
    const project = getProjectPacket(payload.id);
    if (!project) return { ok: false, error: "unknown project packet" };
    const nextState = payload.state && typeof payload.state === "object" ? payload.state : {};
    project.state = {
      ...project.state,
      ...nextState,
    };
    pushEvent("project.updated", {
      projectId: project.id,
      title: project.title,
      owner: project.owner,
      kind: project.kind,
      surface: project.surface,
      state: project.state,
    }, { source });
    return { ok: true, project };
  }

  if (type === "project.reset") {
    if (payload.id) {
      const project = getProjectPacket(payload.id);
      if (!project) return { ok: false, error: "unknown project packet" };
      const baseline = createProjectPackets().find((item) => item.id === project.id);
      project.state = { ...(baseline?.state || {}) };
      pushEvent("project.updated", {
        projectId: project.id,
        title: project.title,
        owner: project.owner,
        kind: project.kind,
        surface: project.surface,
        state: project.state,
      }, { source });
      return { ok: true, project };
    }
    state.projectPackets = createProjectPackets();
    pushEvent("project.reset", { count: state.projectPackets.length }, { source });
    return { ok: true, projects: state.projectPackets };
  }

  return { ok: false, error: `unknown action type: ${type}` };
}

function splitStrokeOutsideRadius(stroke, center, radius) {
  const points = Array.isArray(stroke.points) ? stroke.points : [];
  const segments = [];
  let current = [];
  points.forEach((point) => {
    const dx = Number(point.x || 0) - center.x;
    const dy = Number(point.y || 0) - center.y;
    if (Math.hypot(dx, dy) <= radius) {
      if (current.length >= 2) segments.push(current);
      current = [];
      return;
    }
    current.push(point);
  });
  if (current.length >= 2) segments.push(current);
  return segments.map((segment, index) => ({
    ...stroke,
    id: index === 0 ? stroke.id : makeId("stroke"),
    points: segment,
  }));
}

function clamp01(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.max(0, Math.min(1, number));
}

function clamp(value, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return min;
  return Math.max(min, Math.min(max, number));
}

function normalizedBoardObjectSize(value, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return clamp(number, 0.04, 0.8);
}

function boardSquareWidth(height) {
  const board = (roomConfig.surfaces || []).find((surface) => surface.id === "board") || {};
  const widthMm = Number(board.widthMm || 1);
  const heightMm = Number(board.heightMm || 1);
  if (!widthMm || !heightMm) return height;
  return normalizedBoardObjectSize(height * (heightMm / widthMm), height);
}

function clampBoardObjectToSurface(object) {
  const halfW = normalizedBoardObjectSize(object.w, 0.11) / 2;
  const halfH = normalizedBoardObjectSize(object.h, halfW * 2) / 2;
  object.x = clamp(object.x, halfW, 1 - halfW);
  object.y = clamp(object.y, halfH, 1 - halfH);
  object.w = halfW * 2;
  object.h = halfH * 2;
}

function normalizeFocusPayload(payload = {}) {
  const tagId = payload.tagId ?? payload.numericTagId;
  const id = String(
    payload.id ||
    payload.focusId ||
    (tagId !== undefined && tagId !== null ? `tag-${tagId}` : "manual-focus")
  ).slice(0, 80);
  return {
    id,
    surface: payload.surface || "board",
    x: clamp01(payload.x ?? 0.5),
    y: clamp01(payload.y ?? 0.5),
    label: String(payload.label || "Focus").slice(0, 80),
    updatedAt: now(),
  };
}

function normalizePoint(value) {
  return parseCalibrationPoint(value, { clamp: true });
}

function parseCalibrationPoint(value, options = {}) {
  const point = value && typeof value === "object" ? value : {};
  if (point.x === undefined || point.y === undefined) {
    throw new Error("point requires x and y");
  }
  const parsed = {
    x: Number(point.x),
    y: Number(point.y),
  };
  if (!Number.isFinite(parsed.x) || !Number.isFinite(parsed.y)) {
    throw new Error("point x and y must be finite");
  }
  if (options.clamp) {
    parsed.x = clamp01(parsed.x);
    parsed.y = clamp01(parsed.y);
  }
  return parsed;
}

function safeParsePoint(value, options = {}) {
  try {
    return parseCalibrationPoint(value, options);
  } catch {
    return null;
  }
}

function calibrationPointForTag(surfaceId, tagId) {
  const mapped = tagMap?.calibrationTags?.[String(tagId)];
  if (mapped?.surface === surfaceId && mapped.surfacePoint) {
    return safeParsePoint(mapped.surfacePoint, { clamp: true });
  }
  const calibration = state.calibration[surfaceId];
  if (!calibration) return null;
  const index = calibration.calibrationTags.map(String).indexOf(String(tagId));
  return [
    { x: 0, y: 0 },
    { x: 1, y: 0 },
    { x: 1, y: 1 },
    { x: 0, y: 1 },
  ][index] || null;
}

function solveSurfaceCalibration(surfaceId, sourceSpace) {
  const calibration = state.calibration[surfaceId];
  if (!calibration) return { ok: false, error: "unknown calibrated surface" };
  const sourceKey = sourceSpace === "projector" ? "projector" : "camera";
  const samples = calibration.samples.filter((sample) => sample[sourceKey] && sample.surface);
  if (samples.length < 4) {
    return { ok: false, error: `need at least 4 ${sourceKey} samples` };
  }

  try {
    const sourcePoints = samples.map((sample) => sample[sourceKey]);
    const surfacePoints = samples.map((sample) => sample.surface);
    const matrix = computeHomography(sourcePoints, surfacePoints);
    const inverse = invertHomography(matrix);
    const error = reprojectionError(matrix, sourcePoints, surfacePoints);

    if (sourceKey === "camera") {
      calibration.cameraToSurfaceHomography = matrix;
      calibration.surfaceToCameraHomography = inverse;
    } else {
      calibration.projectorToSurfaceHomography = matrix;
      calibration.surfaceToProjectorHomography = inverse;
    }
    calibration.error = {
      ...calibration.error,
      [sourceKey]: error,
    };
    calibration.status = "calibrated";
    calibration.updatedAt = now();
    persistCalibrationState();
    return { ok: true, calibration };
  } catch (error) {
    calibration.status = "error";
    calibration.error = {
      ...calibration.error,
      [sourceKey]: { message: error.message },
    };
    persistCalibrationState();
    return { ok: false, error: error.message, calibration };
  }
}

function averageCorners(corners) {
  if (!Array.isArray(corners) || !corners.length) return null;
  const parsed = corners.map((corner) => safeParsePoint(corner, { clamp: false })).filter(Boolean);
  if (!parsed.length) return null;
  return {
    x: parsed.reduce((sum, point) => sum + point.x, 0) / parsed.length,
    y: parsed.reduce((sum, point) => sum + point.y, 0) / parsed.length,
  };
}

function detectionCenter(detection) {
  return (
    safeParsePoint(detection.center || detection.centroid, { clamp: false }) ||
    safeParsePoint(detection, { clamp: false }) ||
    averageCorners(detection.corners)
  );
}

function transformDetectionPoint(surfaceId, sourceSpace, point) {
  if (!point) return null;
  const normalizedSpaces = new Set(["surface", "normalized", `${surfaceId}.normalized`]);
  if (normalizedSpaces.has(sourceSpace)) return {
    x: clamp01(point.x),
    y: clamp01(point.y),
  };

  const calibration = state.calibration[surfaceId];
  if (!calibration) return null;
  const matrix = sourceSpace === "projector"
    ? calibration.projectorToSurfaceHomography
    : calibration.cameraToSurfaceHomography;
  if (!matrix) return null;

  const transformed = applyHomography(matrix, point);
  return {
    x: clamp01(transformed.x),
    y: clamp01(transformed.y),
  };
}

function ingestFiducialDetections(payload, source) {
  const surfaceId = String(payload.surface || "table");
  const sourceSpace = String(payload.sourceSpace || payload.coordinateSpace || "camera");
  const detections = Array.isArray(payload.detections) ? payload.detections : [];
  if (!state.calibration[surfaceId]) return { ok: false, error: "unknown calibrated surface" };

  const updated = [];
  const sampled = [];
  const skipped = [];

  for (const detection of detections) {
    const tagId = detection.tagId ?? detection.tag_id ?? detection.id;
    const center = detectionCenter(detection);
    if (!center) {
      skipped.push({ tagId, reason: "missing center/corners" });
      continue;
    }

    pushEvent("fiducial.raw.detected", {
      tag_id: tagId,
      surface: surfaceId,
      sourceSpace,
      center,
      corners: detection.corners || null,
      angle: Number.isFinite(Number(detection.angle)) ? Number(detection.angle) : null,
      confidence: Number(detection.confidence ?? 1),
    }, { source });
    rememberRawDetection(surfaceId, sourceSpace, tagId, {
      center,
      corners: detection.corners || null,
      angle: Number.isFinite(Number(detection.angle)) ? Number(detection.angle) : null,
      confidence: Number(detection.confidence ?? 1),
    }, source);

    if (payload.autoCalibration) {
      const surfacePoint = calibrationPointForTag(surfaceId, tagId);
      if (surfacePoint) {
        state.calibration[surfaceId].samples.push({
          camera: sourceSpace === "projector" ? null : center,
          projector: sourceSpace === "projector" ? center : null,
          surface: surfacePoint,
          tagId,
          createdAt: now(),
        });
        sampled.push(tagId);
      }
    }

    const token = getOrCreateTokenByTag(tagId, surfaceId, detection);
    if (!token) {
      skipped.push({ tagId, reason: "no marker mapping" });
      continue;
    }

    const surfacePoint = transformDetectionPoint(surfaceId, sourceSpace, center);
    if (!surfacePoint) {
      skipped.push({ tagId, reason: "surface calibration unavailable" });
      continue;
    }

    token.x = surfacePoint.x;
    token.y = surfacePoint.y;
    if (Number.isFinite(Number(detection.angle))) token.angle = Number(detection.angle);
    token.surface = surfaceId;
    token.confidence = Number(detection.confidence ?? 1);
    token.updatedAt = now();
    updated.push({
      id: token.id,
      tagId,
      role: token.role || token.kind,
      x: token.x,
      y: token.y,
      confidence: Number(detection.confidence ?? 1),
    });
    pushEvent("fiducial.detected", {
      id: token.id,
      tag_id: tagId,
      name: token.label,
      role: token.role || token.kind,
      x: token.x,
      y: token.y,
      surface: surfaceId,
      sourceSpace,
      confidence: Number(detection.confidence ?? 1),
    }, { source });
  }

  if (payload.autoCalibration && payload.autoSolve && state.calibration[surfaceId].samples.length >= 4) {
    solveSurfaceCalibration(surfaceId, sourceSpace === "projector" ? "projector" : "camera");
  } else if (sampled.length) {
    state.calibration[surfaceId].status = state.calibration[surfaceId].samples.length >= 4 ? "sampled" : "sampling";
    state.calibration[surfaceId].updatedAt = now();
    persistCalibrationState();
  }

  if (updated.length) evaluatePuzzle(source);
  pushEvent("fiducial.batch.ingested", {
    surface: surfaceId,
    sourceSpace,
    updated: updated.length,
    sampled: sampled.length,
    skipped: skipped.length,
  }, { source });

  return { ok: true, updated, sampled, skipped, calibration: state.calibration[surfaceId] };
}

const requestHandler = createRequestHandler({
  bootTime,
  buildRoomContext,
  cameraSnapshot,
  capabilityIndex,
  canonicalEventType,
  classObjectConfig,
  detectTagDebugFrame,
  deviceSpecs,
  eventFiltersFromUrl,
  eventLimitFromUrl,
  figuratePublicStatus,
  filterEvents,
  getProjectPacket,
  handleAction,
  ingestCameraState,
  legacyEventClients,
  legacyStateClients,
  now,
  projectContract,
  projectContractMarkdown,
  projectEvents,
  projectReadinessSnapshot,
  publicState,
  publishProjectEvent,
  readBody,
  readReplayEvents,
  resetRoomState,
  roomConfig,
  sendCameraCommand,
  sendJson,
  sendStatic,
  sendText,
  sseClients,
  state,
  tagMap,
  projectTags,
  lanHosts,
  port: PORT,
  updateProjectHeartbeat,
  validateEvent,
  writeSse,
});
const server = http.createServer(requestHandler);
let secureServer = null;

function createSecureServer() {
  if (!HTTPS_PORT || !HTTPS_PFX_PATH) return null;
  const options = {
    pfx: fs.readFileSync(HTTPS_PFX_PATH),
    passphrase: HTTPS_PFX_PASSPHRASE,
  };
  return https.createServer(options, requestHandler);
}

function start() {
  evaluatePuzzle("startup");

  server.on("error", (error) => {
    console.error("[room] server.listen failed:", error.message);
    process.exit(1);
  });

  server.listen(PORT, () => {
    console.log("Smart classroom prototype running");
    console.log(`  Local:   http://localhost:${PORT}`);
    console.log(`  IPv4:    http://127.0.0.1:${PORT}`);
    console.log(`  Health:  http://127.0.0.1:${PORT}/api/health`);
  });

  secureServer = createSecureServer();
  if (secureServer) {
    secureServer.on("error", (error) => {
      console.error("[room] secure server.listen failed:", error.message);
      process.exit(1);
    });
    secureServer.listen(HTTPS_PORT, () => {
      console.log(`  HTTPS:   https://localhost:${HTTPS_PORT}`);
      console.log(`  Secure:  https://127.0.0.1:${HTTPS_PORT}/api/health`);
    });
  }

  return { server, secureServer };
}

if (require.main === module) {
  start();
}

module.exports = {
  start,
  server,
};
