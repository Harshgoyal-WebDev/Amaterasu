"use client";

import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { BOULDER, CAMERA, PARALLAX, WARP } from "../config";
import { pointer } from "../hooks/usePointer";
import { heroState } from "../state";

const forward = new THREE.Vector3();
const right = new THREE.Vector3();
const up = new THREE.Vector3();
const WORLD_UP = new THREE.Vector3(0, 1, 0);
const smoothed = { x: 0, y: 0 };
const DEG = Math.PI / 180;
const lastPose = new THREE.Vector3();
const frameVelocity = new THREE.Vector3();
const motion = { primed: false };

/** Keeps the arch's width in frame on narrow (but landscape) viewports. */
function responsiveFov(aspect) {
  if (aspect >= CAMERA.minHorizontalAspect) return CAMERA.fov;
  const halfH = Math.tan((CAMERA.fov * DEG) / 2) * CAMERA.minHorizontalAspect;
  return Math.min((2 * Math.atan(halfH / aspect)) / DEG, CAMERA.maxFov);
}

/**
 * Owns the camera.
 *
 *  - Base pose comes from `heroState.camera` (position + target), which a
 *    future GSAP / ScrollTrigger timeline can tween — nothing else moves it.
 *  - The cursor slides the camera across its own right/up plane; the offset
 *    is eased with a frame-rate independent lerp (1 - e^(-damping·dt)).
 *  - Every frame the camera re-aims at the target (the portal centre), so
 *    the portal stays anchored while the foreground sweeps past.
 *  - Arriving at the boulder on a narrow screen, it backs off along the view
 *    just enough to fit the boulder's width.
 */
export default function CameraRig({ parallax = true }) {
  useFrame(({ camera, size, clock }, delta) => {
    const { position, target, parallax: amount } = heroState.camera;

    // journey speed (m/s along the path, eased so one fast frame doesn't flash)
    const dt = Math.min(Math.max(delta, 1e-3), 0.1);
    if (motion.primed) frameVelocity.subVectors(position, lastPose).divideScalar(dt);
    else frameVelocity.set(0, 0, 0);
    lastPose.copy(position);
    motion.primed = true;
    const velocity = heroState.journey.velocity;
    velocity.lerp(frameVelocity, 1 - Math.exp(-6 * dt));
    const S = WARP.speed;
    heroState.journey.speed = Math.min(Math.max((velocity.length() - S.from) / (S.to - S.from), 0), 1);
    const k = 1 - Math.exp(-PARALLAX.damping * Math.min(delta, 0.1));
    const tx = parallax ? pointer.x * amount : 0;
    const ty = parallax ? pointer.y * amount : 0;
    smoothed.x += (tx - smoothed.x) * k;
    smoothed.y += (ty - smoothed.y) * k;

    forward.subVectors(target, position).normalize();
    right.crossVectors(forward, WORLD_UP).normalize();
    up.crossVectors(right, forward).normalize();

    const fov = responsiveFov(size.width / size.height);
    if (camera.fov !== fov) {
      camera.fov = fov;
      camera.updateProjectionMatrix();
    }

    let back = 0;
    const arrival = heroState.journey.arrival;
    if (arrival > 0) {
      const halfH = Math.tan((fov * DEG) / 2) * (size.width / size.height); // tan of half the horizontal FOV
      const need = BOULDER.halfWidth / halfH;
      back = Math.max(0, need - position.distanceTo(target)) * arrival;
    }

    const drift = parallax ? Math.sin(clock.elapsedTime * PARALLAX.floatSpeed) * PARALLAX.floatAmplitude : 0;
    camera.position
      .copy(position)
      .addScaledVector(forward, -back)
      .addScaledVector(right, smoothed.x * PARALLAX.range[0])
      .addScaledVector(up, smoothed.y * PARALLAX.range[1] + drift);
    camera.lookAt(target);
    camera.updateMatrixWorld(); // the water reflection pass reads this pose
  });

  return null;
}
