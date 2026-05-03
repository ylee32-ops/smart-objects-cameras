export const ROOM = Object.freeze({ halfX: 3.0, depthZ: 3.0, height: 3.0 });
export const TABLE = Object.freeze({
  widthX: 1.8,
  depthZ: 1.8,
  surfaceY: 0.72,
  dragY: 0.742,
  coverageY: 0.762,
  markerY: 0.79,
});
export const STREAM = Object.freeze({ minPostIntervalMs: 80 });
export const SOURCE = "virtual-room";

export const ROLE_START_TAGS = Object.freeze({
  sticky: 20,
  zone: 21,
  focus: 23,
  timer: 28,
  tool: 34,
  write: 35,
  video: 37,
  object3d: 33,
  slide: 36,
  vertex: 38,
  action: 39,
  figurate: 40,
});

export const ROLE_LABELS = Object.freeze({
  sticky: "Sticky",
  zone: "Zone",
  focus: "Focus",
  timer: "Timer",
  tool: "Erase",
  write: "Write",
  video: "Video",
  object3d: "3D Model",
  slide: "Slide",
  vertex: "Vertex",
  action: "Action",
  figurate: "Figurate",
});

export const ROLE_COLORS = Object.freeze({
  sticky: "#facc15",
  zone: "#7fbcd2",
  focus: "#fb7185",
  timer: "#c4b5fd",
  tool: "#e5e7eb",
  write: "#d9f99d",
  video: "#fca5a5",
  object3d: "#bfdbfe",
  slide: "#93c5fd",
  vertex: "#86efac",
  action: "#ffb360",
  figurate: "#c7d2fe",
});
