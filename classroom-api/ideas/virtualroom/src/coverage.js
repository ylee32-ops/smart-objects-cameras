import * as THREE from "three";
import { TABLE } from "./conventions.js";

const TABLE_BOUNDS = Object.freeze({
  minX: -TABLE.widthX / 2,
  maxX: TABLE.widthX / 2,
  minZ: -TABLE.depthZ / 2,
  maxZ: TABLE.depthZ / 2,
});

export function computeCameraCoverage(camera) {
  camera.updateMatrixWorld(true);
  camera.updateProjectionMatrix();

  const cameraWorld = new THREE.Vector3();
  camera.getWorldPosition(cameraWorld);
  const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -TABLE.surfaceY);
  const corners = [
    new THREE.Vector3(-1, -1, 1),
    new THREE.Vector3(1, -1, 1),
    new THREE.Vector3(1, 1, 1),
    new THREE.Vector3(-1, 1, 1),
  ];

  const points = [];
  for (const corner of corners) {
    corner.unproject(camera);
    const direction = corner.sub(cameraWorld).normalize();
    const ray = new THREE.Ray(cameraWorld, direction);
    const hit = new THREE.Vector3();
    if (!ray.intersectPlane(plane, hit)) return [];
    points.push({ x: hit.x, z: hit.z });
  }

  return clipPolygonToTable(points);
}

export function coverageGrid(coverages, cols = 32, rows = 32) {
  const cells = [];
  const cellW = TABLE.widthX / cols;
  const cellH = TABLE.depthZ / rows;
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const x = TABLE_BOUNDS.minX + (col + 0.5) * cellW;
      const z = TABLE_BOUNDS.minZ + (row + 0.5) * cellH;
      let count = 0;
      coverages.forEach((coverage) => {
        if (pointInPolygon({ x, z }, coverage.polygon)) count += 1;
      });
      cells.push({ x, z, w: cellW, h: cellH, count });
    }
  }
  return cells;
}

export function tableBounds() {
  return TABLE_BOUNDS;
}

function clipPolygonToTable(points) {
  let output = points;
  output = clipAgainst(output, "x", TABLE_BOUNDS.minX, true);
  output = clipAgainst(output, "x", TABLE_BOUNDS.maxX, false);
  output = clipAgainst(output, "z", TABLE_BOUNDS.minZ, true);
  output = clipAgainst(output, "z", TABLE_BOUNDS.maxZ, false);
  return output;
}

function clipAgainst(points, axis, value, keepGreater) {
  if (!points.length) return [];
  const result = [];
  for (let i = 0; i < points.length; i += 1) {
    const current = points[i];
    const previous = points[(i + points.length - 1) % points.length];
    const currentInside = keepGreater ? current[axis] >= value : current[axis] <= value;
    const previousInside = keepGreater ? previous[axis] >= value : previous[axis] <= value;

    if (currentInside) {
      if (!previousInside) result.push(intersection(previous, current, axis, value));
      result.push(current);
    } else if (previousInside) {
      result.push(intersection(previous, current, axis, value));
    }
  }
  return result;
}

function intersection(a, b, axis, value) {
  const t = (value - a[axis]) / (b[axis] - a[axis]);
  return {
    x: a.x + (b.x - a.x) * t,
    z: a.z + (b.z - a.z) * t,
  };
}

function pointInPolygon(point, polygon) {
  if (!polygon || polygon.length < 3) return false;
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const pi = polygon[i];
    const pj = polygon[j];
    const crosses = (pi.z > point.z) !== (pj.z > point.z);
    if (crosses) {
      const xAtZ = ((pj.x - pi.x) * (point.z - pi.z)) / (pj.z - pi.z) + pi.x;
      if (point.x < xAtZ) inside = !inside;
    }
  }
  return inside;
}
