import * as THREE from "three";
import { STREAM } from "./conventions.js";
import { ingestDetections } from "./server-client.js";

export class DetectionPipeline {
  constructor({ markers, cameras, throttleMs = STREAM.minPostIntervalMs, onPost }) {
    this.markers = markers;
    this.cameras = cameras;
    this.throttleMs = throttleMs;
    this.onPost = onPost || (() => {});
    this.surface = "table";
    this.sourceSpace = "surface";
    this.running = false;
    this.lastPost = 0;
    this.latest = [];
    this.pending = false;
    this.postCount = 0;
  }

  setSurface(surfaceName) {
    this.surface = surfaceName;
  }

  setSourceSpace(sourceSpace) {
    this.sourceSpace = sourceSpace;
  }

  start() {
    this.running = true;
  }

  stop() {
    this.running = false;
  }

  tick() {
    const active = this.cameras.getActive();
    this.latest = this.buildDetections(active?.cam);
    if (!this.running) return this.latest;
    const now = performance.now();
    if (now - this.lastPost < this.throttleMs) return this.latest;
    this.lastPost = now;
    this.postLatest();
    return this.latest;
  }

  postLatest() {
    if (this.pending) return;
    const start = performance.now();
    const detections = this.latest.map((detection) => {
      const payload = {
        tagId: detection.tagId,
        role: detection.role,
        center: detection.center,
        angle: detection.angle,
        confidence: detection.confidence,
      };
      // Camera-space posts must include corners as well as center; see anti-patterns.md #3.
      if (this.sourceSpace === "camera" && detection.corners) payload.corners = detection.corners;
      return payload;
    });
    this.pending = true;
    ingestDetections({
      surface: this.surface,
      sourceSpace: this.sourceSpace,
      detections,
    }).then((result) => {
      this.pending = false;
      if (result.ok) this.postCount += 1;
      this.onPost({
        ok: result.ok,
        count: detections.length,
        error: result.error,
        ms: performance.now() - start,
        updated: result.data?.updated || [],
        skipped: result.data?.skipped || [],
        sampled: result.data?.sampled || [],
        calibration: result.data?.calibration || null,
      });
    });
  }

  buildDetections(cam) {
    if (!cam) return [];
    cam.updateMatrixWorld();
    cam.updateProjectionMatrix();
    return this.markers.list().map((marker) => {
      const surface = this.markers.surfacePointForMarker(marker);
      const angle = this.markers.markerAngle(marker);
      if (this.sourceSpace === "surface") {
        return {
          tagId: marker.userData.tagId,
          role: marker.userData.role,
          center: surface,
          angle,
          confidence: 0.96,
        };
      }
      const center = project(marker.position, cam);
      const corners = this.markers.markerWorldCorners(marker).map((corner) => project(corner, cam));
      return {
        tagId: marker.userData.tagId,
        role: marker.userData.role,
        center,
        corners,
        angle,
        confidence: 0.96,
        surface,
      };
    });
  }

  projectWorldPoint(point, cam, res = { width: 1280, height: 960 }) {
    return project(point, cam, res);
  }
}

function project(world, cam, res = { width: 1280, height: 960 }) {
  const vector = world.isVector3 ? world.clone() : new THREE.Vector3(world.x, world.y, world.z);
  const p = vector.project(cam);
  return {
    x: +((p.x * 0.5 + 0.5) * res.width).toFixed(1),
    y: +((1 - (p.y * 0.5 + 0.5)) * res.height).toFixed(1),
  };
}
