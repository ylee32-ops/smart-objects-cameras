import * as THREE from "three";
import { aimMinusZAt } from "./orientation.js";

export function createCameraRig({ name, kind, position, lookAt, fov, aspect, mountOnCeiling = false }) {
  const rig = new THREE.Group();
  rig.position.set(position.x, mountOnCeiling ? position.y : 0, position.z);
  rig.userData = { selectable: true, kind: "camera", label: name, sub: kind, allowMove: true, allowRotate: true };

  const supportMaterial = new THREE.MeshStandardMaterial({ color: 0x161a20, roughness: 0.65 });
  if (mountOnCeiling) {
    const stemHeight = 3.0 - position.y;
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, stemHeight, 8), supportMaterial);
    stem.position.y = stemHeight / 2;
    stem.userData.parent = rig;
    rig.add(stem);
  } else {
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, position.y - 0.04, 8), supportMaterial);
    stem.position.y = (position.y - 0.04) / 2;
    stem.userData.parent = rig;
    rig.add(stem);
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.012, 16), supportMaterial);
    base.position.y = 0.006;
    base.userData.parent = rig;
    rig.add(base);
  }

  const head = new THREE.Group();
  head.position.y = mountOnCeiling ? 0 : position.y;
  rig.add(head);

  const body = new THREE.Mesh(
    new THREE.BoxGeometry(0.11, 0.075, 0.09),
    new THREE.MeshStandardMaterial({ color: 0x11161d, roughness: 0.42, metalness: 0.25 }),
  );
  body.position.z = 0.025;
  body.userData.parent = rig;
  head.add(body);

  const lens = new THREE.Mesh(
    new THREE.CylinderGeometry(0.036, 0.044, 0.07, 24, 1, true),
    new THREE.MeshStandardMaterial({ color: 0x05070a, roughness: 0.25, metalness: 0.6, side: THREE.DoubleSide }),
  );
  lens.rotation.x = Math.PI / 2;
  lens.position.z = -0.055;
  lens.userData.parent = rig;
  head.add(lens);

  const cam = new THREE.PerspectiveCamera(fov, aspect, 0.05, 30);
  head.add(cam);
  aimAt(head, lookAt);

  const helper = createLensFrustumVisual({ aspect, fov });
  helper.visible = false;
  head.add(helper);
  rig.userData.camera = cam;
  rig.userData.head = head;
  rig.userData.helper = helper;

  return { rig, head, cam, helper };
}

function createLensFrustumVisual({ aspect, fov }) {
  const length = 6.2;
  const origin = new THREE.Vector3(0, 0, -0.095);
  const h = Math.tan(THREE.MathUtils.degToRad(fov) / 2) * length;
  const w = h * aspect;
  const z = -length;
  const corners = [
    new THREE.Vector3(-w, -h, z),
    new THREE.Vector3(w, -h, z),
    new THREE.Vector3(w, h, z),
    new THREE.Vector3(-w, h, z),
  ];
  const points = [];
  corners.forEach((corner) => points.push(origin, corner));
  for (let i = 0; i < corners.length; i += 1) {
    points.push(corners[i], corners[(i + 1) % corners.length]);
  }
  const geometry = new THREE.BufferGeometry().setFromPoints(points);
  const material = new THREE.LineBasicMaterial({
    color: 0x7fbcd2,
    transparent: true,
    opacity: 0.48,
    depthTest: false,
  });
  const helper = new THREE.LineSegments(geometry, material);
  helper.renderOrder = 40;
  helper.update = () => {};
  return helper;
}

export function aimAt(head, target) {
  // Shared -Z aiming convention; avoids Group.lookAt() asymmetry (anti-patterns.md #1).
  aimMinusZAt(head, target);
}

export class CameraSwitcher {
  constructor({ rigs, povRenderer }) {
    this.rigs = rigs;
    this.povRenderer = povRenderer;
    this.activeIndex = 0;
    this.setActive(0);
  }

  setActive(index) {
    this.activeIndex = Math.max(0, Math.min(this.rigs.length - 1, Number(index) || 0));
    this.rigs.forEach((rig, i) => {
      if (rig.helper) rig.helper.visible = i === this.activeIndex;
      if (rig.helper) rig.helper.update();
    });
  }

  getActive() {
    return this.rigs[this.activeIndex];
  }
}
