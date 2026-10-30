"use client";

import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { CAMERA, GAIT } from "../config";
import { journey, pointer } from "../state";

const _q = new THREE.Quaternion();
const _bank = new THREE.Quaternion();
const _up = new THREE.Vector3();
const _right = new THREE.Vector3();
const _look = new THREE.Quaternion();
const _e = new THREE.Euler(0, 0, 0, "YXZ");
const Z = new THREE.Vector3(0, 0, 1);
const lerp = THREE.MathUtils.lerp;

/**
 * Applies the world controller's target pose to the camera:
 * position directly (it is already continuous), orientation through a
 * critically-damped slerp, plus banking from sideways drift, mouse
 * parallax (a few degrees of look + a small shift towards the pointer),
 * a gentle breathing sway, a walking / running head bob driven by the
 * stride, a dip on landing and a field-of-view kick at falling speed.
 */
export default function CameraRig({ reducedMotion }) {
  const st = useRef({ init: false, bank: 0, fov: CAMERA.fov, px: 0, py: 0, landT: 9, landK: 0 });

  useFrame((state, delta) => {
    const dt = Math.min(delta, 1 / 20);
    const cam = state.camera;
    const s = st.current;
    const pose = journey.pose;

    const bankTarget = reducedMotion ? 0 : THREE.MathUtils.clamp(-pose.lateralVel * CAMERA.bankFromLateral, -0.08, 0.08);
    s.bank += (bankTarget - s.bank) * (1 - Math.exp(-dt * 4));
    _q.copy(pose.q).multiply(_bank.setFromAxisAngle(Z, s.bank));

    // mouse parallax: ease towards the pointer, relax to centre when it leaves
    const P = CAMERA.parallax;
    const on = !reducedMotion && pointer.active;
    const kp = 1 - Math.exp(-dt * P.smoothing);
    s.px += ((on ? pointer.x : 0) - s.px) * kp;
    s.py += ((on ? pointer.y : 0) - s.py) * kp;
    if (s.px || s.py) _q.multiply(_look.setFromEuler(_e.set(s.py * P.pitch, -s.px * P.yaw, -s.px * P.roll)));

    // stride: the head dips on each footfall and rolls from foot to foot
    const g = reducedMotion ? 0 : journey.gait;
    const run = journey.run;
    const phase = journey.stride * Math.PI; // one footstep = half a sway cycle
    if (g > 0.001) _q.multiply(_look.setFromEuler(_e.set(Math.sin(phase * 2) * lerp(GAIT.nod[0], GAIT.nod[1], run) * g, 0, Math.sin(phase) * lerp(GAIT.roll[0], GAIT.roll[1], run) * g)));
    if (journey.landing) {
      s.landK = journey.landing;
      s.landT = 0;
      journey.landing = 0;
    }
    s.landT += dt;

    if (!s.init) {
      cam.quaternion.copy(_q);
      s.init = true;
    } else {
      cam.quaternion.slerp(_q, 1 - Math.exp(-dt * CAMERA.orientationDamping));
    }

    cam.position.copy(pose.p);
    if (s.px || s.py) {
      _right.set(1, 0, 0).applyQuaternion(pose.q);
      _up.set(0, 1, 0).applyQuaternion(pose.q);
      cam.position.addScaledVector(_right, s.px * P.shift).addScaledVector(_up, s.py * P.lift);
    }
    if (!reducedMotion) {
      const t = state.clock.elapsedTime;
      _up.set(0, 1, 0).applyQuaternion(cam.quaternion);
      _right.set(1, 0, 0).applyQuaternion(cam.quaternion);
      const bob = -(1 - Math.cos(phase * 2)) * 0.5 * lerp(GAIT.bob[0], GAIT.bob[1], run) * g;
      const dip = -GAIT.landingDip * s.landK * Math.exp(-s.landT * 4.5) * Math.sin(Math.min(s.landT * 9, Math.PI));
      cam.position.addScaledVector(_up, Math.sin(t * 0.8) * CAMERA.sway + Math.sin(t * 1.9) * CAMERA.sway * 0.3 + bob + dip);
      cam.position.addScaledVector(_right, Math.sin(phase) * lerp(GAIT.sway[0], GAIT.sway[1], run) * g);
    }

    const portrait = state.size.width / Math.max(1, state.size.height) < 0.85;
    const base = portrait ? CAMERA.fovPortrait : CAMERA.fov;
    const kick = reducedMotion ? 0 : CAMERA.speedFovKick * journey.fall;
    const fov = base + kick;
    s.fov += (fov - s.fov) * (1 - Math.exp(-dt * 3));
    if (Math.abs(cam.fov - s.fov) > 0.01) {
      cam.fov = s.fov;
      cam.updateProjectionMatrix();
    }
  }, -1);

  return null;
}
