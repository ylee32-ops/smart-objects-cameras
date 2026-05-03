"use strict";

const assert = require("assert");
const {
  applyHomography,
  computeHomography,
  invertHomography,
  reprojectionError,
} = require("../lib/homography");

const camera = [
  { x: 112, y: 84 },
  { x: 932, y: 128 },
  { x: 884, y: 702 },
  { x: 148, y: 664 },
];
const surface = [
  { x: 0, y: 0 },
  { x: 1, y: 0 },
  { x: 1, y: 1 },
  { x: 0, y: 1 },
];

const h = computeHomography(camera, surface);
const error = reprojectionError(h, camera, surface);
assert(error.max < 1e-8, `expected exact corner reprojection, got ${error.max}`);

const center = applyHomography(h, { x: 519, y: 394 });
assert(center.x > 0.45 && center.x < 0.56, `center x out of range: ${center.x}`);
assert(center.y > 0.45 && center.y < 0.56, `center y out of range: ${center.y}`);

const inv = invertHomography(h);
const cameraAgain = applyHomography(inv, center);
assert(Math.abs(cameraAgain.x - 519) < 1e-6, `inverse x mismatch: ${cameraAgain.x}`);
assert(Math.abs(cameraAgain.y - 394) < 1e-6, `inverse y mismatch: ${cameraAgain.y}`);

console.log("calibration math ok");
