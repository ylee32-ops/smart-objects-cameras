"use strict";

const EPS = 1e-10;

function computeHomography(sourcePoints, targetPoints) {
  if (!Array.isArray(sourcePoints) || !Array.isArray(targetPoints)) {
    throw new Error("sourcePoints and targetPoints must be arrays");
  }
  if (sourcePoints.length !== targetPoints.length || sourcePoints.length < 4) {
    throw new Error("homography needs at least four paired points");
  }

  const rows = [];
  const values = [];
  for (let i = 0; i < sourcePoints.length; i += 1) {
    const src = toPoint(sourcePoints[i]);
    const dst = toPoint(targetPoints[i]);
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
      for (let j = 0; j < 8; j += 1) {
        normal[i][j] += row[i] * row[j];
      }
    }
  }

  const h = solveLinearSystem(normal, rhs);
  return [h[0], h[1], h[2], h[3], h[4], h[5], h[6], h[7], 1];
}

function applyHomography(matrix, point) {
  validateMatrix(matrix);
  const p = toPoint(point);
  const w = matrix[6] * p.x + matrix[7] * p.y + matrix[8];
  if (Math.abs(w) < EPS) throw new Error("homography maps point to infinity");
  return {
    x: (matrix[0] * p.x + matrix[1] * p.y + matrix[2]) / w,
    y: (matrix[3] * p.x + matrix[4] * p.y + matrix[5]) / w,
  };
}

function invertHomography(matrix) {
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

function reprojectionError(matrix, sourcePoints, targetPoints) {
  if (sourcePoints.length !== targetPoints.length) {
    throw new Error("source and target point counts must match");
  }
  const errors = [];
  for (let i = 0; i < sourcePoints.length; i += 1) {
    const projected = applyHomography(matrix, sourcePoints[i]);
    const target = toPoint(targetPoints[i]);
    errors.push(distance(projected, target));
  }
  const sum = errors.reduce((acc, error) => acc + error, 0);
  return {
    avg: errors.length ? sum / errors.length : 0,
    max: errors.length ? Math.max(...errors) : 0,
    samples: errors.length,
  };
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
    if (pivotRow !== col) {
      [augmented[col], augmented[pivotRow]] = [augmented[pivotRow], augmented[col]];
    }

    const pivot = augmented[col][col];
    for (let j = col; j <= n; j += 1) augmented[col][j] /= pivot;

    for (let row = 0; row < n; row += 1) {
      if (row === col) continue;
      const factor = augmented[row][col];
      for (let j = col; j <= n; j += 1) {
        augmented[row][j] -= factor * augmented[col][j];
      }
    }
  }

  return augmented.map((row) => row[n]);
}

function toPoint(value) {
  const point = value && typeof value === "object" ? value : {};
  const x = Number(point.x);
  const y = Number(point.y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    throw new Error("point must have finite x and y");
  }
  return { x, y };
}

function validateMatrix(matrix) {
  if (!Array.isArray(matrix) || matrix.length !== 9 || matrix.some((value) => !Number.isFinite(Number(value)))) {
    throw new Error("homography matrix must be an array of nine finite numbers");
  }
}

function distance(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

module.exports = {
  applyHomography,
  computeHomography,
  invertHomography,
  reprojectionError,
};
