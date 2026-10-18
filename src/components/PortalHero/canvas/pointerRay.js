import * as THREE from "three";
import { pointer } from "../hooks/usePointer";

const raycaster = new THREE.Raycaster();
const ndc = new THREE.Vector2();

/** World-space ray under the current pointer (shared, no allocation). */
export function pointerRay(camera) {
  ndc.set(pointer.x, pointer.y);
  raycaster.setFromCamera(ndc, camera);
  return raycaster.ray;
}
