const EPS = 1e-10;

const UNIT_SQUARE = Object.freeze([
  { x: 0, y: 0 },
  { x: 1, y: 0 },
  { x: 1, y: 1 },
  { x: 0, y: 1 },
]);

export function projectorMappingForPolygon(polygon, fallbackPolygon) {
  const points = normalizedProjectionPolygon(polygon, fallbackPolygon);
  const quad = calibrationQuadFromPolygon(points);
  let surfaceToProjector;
  try {
    // The editable polygon is an output-space warp: dragging a corner right
    // should move that board corner right in the projector window.
    surfaceToProjector = computeHomography(UNIT_SQUARE, quad);
  } catch {
    surfaceToProjector = computeHomography(UNIT_SQUARE, normalizedProjectionPolygon(fallbackPolygon, UNIT_SQUARE).slice(0, 4));
  }
  const projectorToSurface = invertHomography(surfaceToProjector);
  return {
    points,
    quad,
    projectorToSurface,
    surfaceToProjector,
  };
}

export function normalizedProjectionPolygon(polygon, fallbackPolygon = UNIT_SQUARE) {
  const fallback = Array.isArray(fallbackPolygon) && fallbackPolygon.length >= 4 ? fallbackPolygon : UNIT_SQUARE;
  const source = Array.isArray(polygon) && polygon.length >= 4 ? polygon : fallback;
  return source.map((point) => ({
    x: clamp01(point?.x),
    y: clamp01(point?.y),
  }));
}

export function calibrationQuadFromPolygon(polygon) {
  const points = normalizedProjectionPolygon(polygon);
  if (points.length === 4) return points.map(copyPoint);

  const corners = [
    extremum(points, (point) => point.x + point.y, "min"),
    extremum(points, (point) => point.x - point.y, "max"),
    extremum(points, (point) => point.x + point.y, "max"),
    extremum(points, (point) => point.x - point.y, "min"),
  ];
  return hasUniquePoints(corners) ? corners.map(copyPoint) : points.slice(0, 4).map(copyPoint);
}

export function applyHomography(matrix, point) {
  validateMatrix(matrix);
  const x = Number(point?.x);
  const y = Number(point?.y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) throw new Error("point must have finite x and y");
  const w = matrix[6] * x + matrix[7] * y + matrix[8];
  if (Math.abs(w) < EPS) throw new Error("homography maps point to infinity");
  return {
    x: (matrix[0] * x + matrix[1] * y + matrix[2]) / w,
    y: (matrix[3] * x + matrix[4] * y + matrix[5]) / w,
  };
}

export function invertHomography(matrix) {
  validateMatrix(matrix);
  const [
    a, b, c,
    d, e, f,
    g, h, i,
  ] = matrix;
  const det =
    a * (e * i - f * h) -
    b * (d * i - f * g) +
    c * (d * h - e * g);
  if (Math.abs(det) < EPS) throw new Error("homography is not invertible");

  return [
    (e * i - f * h) / det,
    (c * h - b * i) / det,
    (b * f - c * e) / det,
    (f * g - d * i) / det,
    (a * i - c * g) / det,
    (c * d - a * f) / det,
    (d * h - e * g) / det,
    (b * g - a * h) / det,
    (a * e - b * d) / det,
  ];
}

export function computeHomography(sourcePoints, targetPoints) {
  if (!Array.isArray(sourcePoints) || !Array.isArray(targetPoints)) {
    throw new Error("sourcePoints and targetPoints must be arrays");
  }
  if (sourcePoints.length !== targetPoints.length || sourcePoints.length < 4) {
    throw new Error("homography needs at least four paired points");
  }

  const rows = [];
  const values = [];
  for (let i = 0; i < sourcePoints.length; i += 1) {
    const src = finitePoint(sourcePoints[i]);
    const dst = finitePoint(targetPoints[i]);
    rows.push([src.x, src.y, 1, 0, 0, 0, -dst.x * src.x, -dst.x * src.y]);
    values.push(dst.x);
    rows.push([0, 0, 0, src.x, src.y, 1, -dst.y * src.x, -dst.y * src.y]);
    values.push(dst.y);
  }

  const normal = Array.from({ length: 8 }, () => Array(8).fill(0));
  const rhs = Array(8).fill(0);
  for (let r = 0; r < rows.length; r += 1) {
    const row = rows[r];
    for (let i = 0; i < 8; i += 1) {
      rhs[i] += row[i] * values[r];
      for (let j = 0; j < 8; j += 1) normal[i][j] += row[i] * row[j];
    }
  }

  const h = solveLinearSystem(normal, rhs);
  return [h[0], h[1], h[2], h[3], h[4], h[5], h[6], h[7], 1];
}

function solveLinearSystem(matrix, vector) {
  const n = vector.length;
  const augmented = matrix.map((row, index) => [...row, vector[index]]);

  for (let col = 0; col < n; col += 1) {
    let pivotRow = col;
    let pivotValue = Math.abs(augmented[col][col]);
    for (let row = col + 1; row < n; row += 1) {
      const value = Math.abs(augmented[row][col]);
      if (value > pivotValue) {
        pivotValue = value;
        pivotRow = row;
      }
    }
    if (pivotValue < EPS) throw new Error("point pairs produce a singular homography");
    if (pivotRow !== col) [augmented[col], augmented[pivotRow]] = [augmented[pivotRow], augmented[col]];

    const pivot = augmented[col][col];
    for (let j = col; j <= n; j += 1) augmented[col][j] /= pivot;

    for (let row = 0; row < n; row += 1) {
      if (row === col) continue;
      const factor = augmented[row][col];
      for (let j = col; j <= n; j += 1) augmented[row][j] -= factor * augmented[col][j];
    }
  }

  return augmented.map((row) => row[n]);
}

function extremum(points, score, mode) {
  return points.reduce((best, point) => {
    const value = score(point);
    const bestValue = score(best);
    return mode === "min" ? (value < bestValue ? point : best) : (value > bestValue ? point : best);
  }, points[0]);
}

function hasUniquePoints(points) {
  const keys = new Set(points.map((point) => `${point.x.toFixed(4)}:${point.y.toFixed(4)}`));
  return keys.size === points.length;
}

function finitePoint(point) {
  const x = Number(point?.x);
  const y = Number(point?.y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) throw new Error("point must have finite x and y");
  return { x, y };
}

function copyPoint(point) {
  return { x: point.x, y: point.y };
}

function validateMatrix(matrix) {
  if (!Array.isArray(matrix) || matrix.length !== 9 || matrix.some((value) => !Number.isFinite(Number(value)))) {
    throw new Error("homography matrix must be an array of nine finite numbers");
  }
}

function clamp01(value) {
  return Math.max(0, Math.min(1, Number(value) || 0));
}
