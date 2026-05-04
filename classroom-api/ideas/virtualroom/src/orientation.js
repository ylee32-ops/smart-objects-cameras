import * as THREE from "three";

export const FORWARD = Object.freeze(new THREE.Vector3(0, 0, -1));

export function aimMinusZAt(object, target) {
  const parent = object.parent;
  const localTarget = target.clone();
  if (parent) parent.worldToLocal(localTarget);
  const direction = localTarget.sub(object.position).normalize();
  if (direction.lengthSq() < 1e-8) return;
  object.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, -1), direction);
  object.updateMatrixWorld(true);
}

export function worldForward(object) {
  object.updateMatrixWorld(true);
  return new THREE.Vector3(0, 0, -1).transformDirection(object.matrixWorld).normalize();
}

export function headingFromForward(forward) {
  return Math.atan2(forward.x, -forward.z);
}

export function headingForObject(object) {
  return headingFromForward(worldForward(object));
}
