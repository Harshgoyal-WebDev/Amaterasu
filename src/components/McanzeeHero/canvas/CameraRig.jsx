"use client";

import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { CAMERA, KNOBS, PARALLAX } from "../config";
import { heroState, pointerState } from "../heroState";

const target = new THREE.Vector3();
const forward = new THREE.Vector3();
const right = new THREE.Vector3();
const up = new THREE.Vector3();
const WORLD_UP = new THREE.Vector3(0, 1, 0);
const smoothed = { x: 0, y: 0 };
const DEG = Math.PI / 180;

/**
 * Widens vertical FOV on narrow landscape screens (tablets, split windows) so
 * the horizontal framing survives. Portrait uses the mobile keyframes as-is.
 */
function responsiveFov(fov, aspect) {
  if (aspect >= CAMERA.minHorizontalAspect || aspect < 1) return fov;
  const halfH = Math.tan((fov * DEG) / 2) * CAMERA.minHorizontalAspect;
  const adjusted = (2 * Math.atan(halfH / aspect)) / DEG;
  return Math.min(adjusted, Math.max(fov, CAMERA.maxFov));
}

/**
 * Owns the camera.
 *
 *  - Aim: always lookAt the lens (heroState.camera.t*, tweened by GSAP).
 *  - Framing: an off-axis "lens shift" in NDC places the lens centre-right
 *    without turning the camera away from it.
 *  - Parallax: the pointer orbits the camera around the lens (right/up in
 *    camera space). The lens stays anchored; foreground rocks sweep across
 *    the frame, the distant ones barely move.
 */
export default function CameraRig({ parallax = true, float = true }) {
  useFrame(({ camera, size, clock }, delta) => {
    const strength = parallax ? KNOBS.parallaxStrength : 0;
    const k = 1 - Math.exp(-PARALLAX.damping * Math.min(delta, 0.1));
    smoothed.x += (pointerState.x * strength - smoothed.x) * k;
    smoothed.y += (pointerState.y * strength - smoothed.y) * k;

    const c = heroState.camera;
    target.set(c.tx, c.ty, c.tz);
    camera.position.set(c.x, c.y, c.z);

    // Camera-space basis for the orbit offset.
    forward.subVectors(target, camera.position).normalize();
    right.crossVectors(forward, WORLD_UP).normalize();
    up.crossVectors(right, forward);

    const drift = float ? Math.sin(clock.elapsedTime * CAMERA.floatSpeed) * CAMERA.floatAmplitude : 0;
    camera.position
      .addScaledVector(right, smoothed.x * PARALLAX.orbit[0])
      .addScaledVector(up, smoothed.y * PARALLAX.orbit[1] + drift);
    camera.lookAt(target);
    camera.updateMatrixWorld(); // raycasts later this frame need the fresh pose

    // Projection: responsive FOV + lens shift (rebuilt every frame so R3F's
    // resize handling can never wipe the shift).
    camera.fov = responsiveFov(c.fov, size.width / size.height);
    camera.updateProjectionMatrix();
    const te = camera.projectionMatrix.elements;
    te[8] -= c.sx;
    te[9] -= c.sy;
    camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
  });

  return null;
}
