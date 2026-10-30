import * as THREE from "three";
import gsap from "gsap";
import { Path, bezier, line, orientAuto, segment, smoothstep } from "../path";
import { emitAudio } from "../../state";
import { EYE, FAR_SET, FG_SET, HALF_PI, MID_SET, V, gateSounds, scatterRing, underBridge } from "./common";

/**
 * STAGES 01–03 — the summoning, the threshold, the fall.
 *
 *   z +26 … +4   approach bridge in the dark, the gateway ahead (doors closed)
 *   z  +3 … -3   the gateway (doors slide open as you approach, close behind)
 *   z  -4 … -15  threshold platform; the camera glances back at the doors
 *   z -12.6      pause … the biwa sounds, the floor opens
 *   fall         1.25-turn helix around a timber shaft, 143 m down, with roll
 *   landing      glide onto a bridge heading -X → first suspended walkway
 *
 * This chunk's frame is the world origin; everything else hangs off its exit.
 */

const AXIS = { x: -9, z: -18 };
const R = 9;
const Y_TOP = -7;
const Y_BOTTOM = -150;
const TURN = -2.5 * Math.PI;
const LAND = V(-33, -164, -27);

export const PROLOGUE_START_Z = { landscape: 14, portrait: 21 };
const APPROACH_FROM = 26;

function helixPos(u, out) {
  const phi = TURN * u;
  return out.set(AXIS.x + Math.cos(phi) * R, THREE.MathUtils.lerp(Y_TOP, Y_BOTTOM, u), AXIS.z + Math.sin(phi) * R);
}

function fallRoll(u, reduced) {
  const base = (0.15 + 0.28 * Math.sin(Math.PI * Math.min(u / 0.85, 1))) * (1 - smoothstep(0.86, 1, u));
  // the swing: for a moment a staircase hanging on the shaft wall becomes "the floor ahead"
  const swing = 1.15 * smoothstep(0.6, 0.7, u) * (1 - smoothstep(0.76, 0.88, u));
  return (base + swing) * (reduced ? 0.15 : 1);
}

const prologueChunk = {
  type: "prologue",
  build(b) {
    const { rng } = b;
    const reduced = b.reducedMotion;

    // ── paths ───────────────────────────────────────────────────────────
    const approach = line([0, EYE, APPROACH_FROM], [0, EYE, 3.4], {
      pace: 1.25,
      clear: 0.6,
      orient: orientAuto({
        pitch: (t) => {
          const z = APPROACH_FROM + (3.4 - APPROACH_FROM) * t;
          return 0.09 * (1 - smoothstep(14, 6, z));
        },
      }),
    });
    const lookBack = (z) => smoothstep(-2.6, -6, z) * (1 - smoothstep(-9, -11.2, z));
    const threshold = line([0, EYE, 3.4], [0, EYE, -10.8], {
      pace: [0.9, 0.5],
      clear: 0.5,
      orient: orientAuto({ yaw: (t) => (reduced ? 1.2 : 2.75) * lookBack(3.4 + (-10.8 - 3.4) * t), pitch: (t) => -0.08 * lookBack(3.4 + (-10.8 - 3.4) * t) }),
    });
    const pause = line([0, EYE, -10.8], [0, EYE, -12.6], { pace: 0.32, clear: 0.2 });
    const tip = bezier([0, EYE, -12.6], [0, EYE, -14.2], [0, -2.5, -16.6], [0, Y_TOP, AXIS.z], {
      pace: [0.6, 2.4],
      clear: 0,
      orient: orientAuto({ heading: V(0, 0, -1), pitchScale: 0.7, roll: (t) => 0.15 * t * (reduced ? 0.15 : 1) }),
    });
    const P = new THREE.Vector3();
    const helixSeg = (u0, u1, pace) =>
      segment((t) => helixPos(u0 + (u1 - u0) * t, P), {
        pace,
        clear: 0,
        orient: orientAuto({ pitchScale: 0.5, pitch: () => -0.12, roll: (t) => fallRoll(u0 + (u1 - u0) * t, reduced) }),
      });
    const h1 = helixSeg(0, 0.5, [2.4, 4.4]);
    const h2 = helixSeg(0.5, 1, [4.4, 2.2]);
    const end = helixPos(1, new THREE.Vector3());
    const tan = new THREE.Vector3(-R, (Y_BOTTOM - Y_TOP) / Math.abs(TURN), 0).normalize();
    const landing = bezier(end, end.clone().addScaledVector(tan, 9), LAND.clone().add(V(8, 0, 0)), LAND, {
      pace: [2.2, 1.0],
      clear: [0, 0.6],
      orient: orientAuto({ pitchScale: 0.55, pitch: (t) => -0.25 * (1 - smoothstep(0, 0.8, t)) }),
    });
    const glide = line(LAND, [-41, LAND.y, -27], { pace: 1, clear: 0.6 });
    const path = new Path([approach, threshold, pause, tip, h1, h2, landing, glide]);

    // stage boundaries, found by walking the samples
    const sGateBehind = path.sAtZ(-3);
    const sFallStart = path.s[Math.max(0, path.p.findIndex((p) => p.y < EYE - 0.4))];
    const sHelix = path.s[Math.max(0, path.p.findIndex((p) => p.y <= Y_TOP + 0.05))];
    const landIdx = path.p.findIndex((p) => p.x < LAND.x + 0.5 && p.y < LAND.y + 0.5);
    const sFallEnd = path.s[landIdx > 0 ? landIdx : path.p.length - 1];
    const helixLength = Math.hypot(R * Math.abs(TURN), Y_TOP - Y_BOTTOM);

    // ── architecture ───────────────────────────────────────────────────
    for (let z = APPROACH_FROM + 2; z > 4; z -= 4) b.place("IC07_Bridge_Straight", { p: [0, 0, z] }, { lights: false });
    underBridge(b, APPROACH_FROM + 2, 4);

    const gate = b.place("IC01_EntranceGateway", { p: [0, 0, 0] }, { lightPower: 1.25 });
    const setGate = (k) => {
      for (const key of ["Door_L", "Door_R"]) {
        const mv = gate.movables[key];
        if (!mv) continue;
        const { slide_open_x: open, slide_closed_x: closed } = mv.extras;
        mv.object.position.x = THREE.MathUtils.lerp(closed, open, k);
      }
    };
    setGate(0);

    // threshold platform + trapdoor
    b.place("IC17_Floor_Wood_Polished", { p: [0, 0, -5.6] });
    b.place("IC17_Floor_Wood_Polished", { p: [0, 0, -9.6] });
    const hingeL = new THREE.Group();
    const hingeR = new THREE.Group();
    hingeL.position.set(-2, 0, -13.6);
    hingeR.position.set(2, 0, -13.6);
    b.group.add(hingeL, hingeR);
    b.place("IC17_Floor_Wood_Polished", { p: [1, 0, 0], s: [0.5, 1, 1] }, { parent: hingeL, bounds: false });
    b.place("IC17_Floor_Wood_Polished", { p: [-1, 0, 0], s: [0.5, 1, 1] }, { parent: hingeR, bounds: false });
    for (const [x, z] of [
      [-1.75, -4.1],
      [1.75, -4.1],
      [-1.75, -11.2],
      [1.75, -11.2],
    ])
      b.place("IC10_Lantern_Standing", { p: [x, 0, z] }, { lightPower: 0.9 });
    for (const [x, z] of [
      [-1.9, -3.8],
      [1.9, -3.8],
      [-1.9, -11.6],
      [1.9, -11.6],
      [-1.9, -15.4],
      [1.9, -15.4],
    ])
      b.dress("IC09_Pillar", { p: [x, -0.2, z], r: [Math.PI, 0, 0] }, { essential: true, force: true });

    const trap = { k: 0 };
    let trapTween = null;
    let trapOpen = false;
    const setTrap = () => {
      const a = trap.k * 1.85;
      hingeL.rotation.z = -a;
      hingeR.rotation.z = a;
    };

    // landing bridge
    for (let x = -29; x > -41; x -= 4) b.place("IC07_Bridge_Straight_Lantern", { p: [x, LAND.y - EYE, -27], ry: HALF_PI });

    // ── the void ───────────────────────────────────────────────────────
    b.avoid([path], 2.2);
    // central timber shaft the helix circles
    for (let y = -6; y > Y_BOTTOM - 20; y -= 4.3) {
      for (let k = 0; k < 4; k++) {
        // one braced bay per side of a 4 × 4 m tower; frames run along local +X
        const a = (k * Math.PI) / 2;
        const tx = -Math.sin(a);
        const tz = Math.cos(a);
        const p = [AXIS.x + Math.cos(a) * 2 - tx * 2, y - 4.3, AXIS.z + Math.sin(a) * 2 - tz * 2];
        b.dress("IC09_Frame_Bay_Braced", { p, r: [0, -a - HALF_PI, 0] }, { essential: k % 2 === 0, force: true });
      }
      if (rng.chance(0.4)) b.dress("IC20_Hanging_Chain_Lantern", { p: [AXIS.x, y, AXIS.z], r: [0, rng.range(0, 6), 0] }, { essential: true, force: true, lights: true, lightPower: 1.1 });
    }
    // depth layers (fast foreground, mid rooms, slow far silhouettes)
    const ring = (o) => scatterRing(b, { center: [AXIS.x, 0, AXIS.z], ...o });
    ring({ radius: [13.5, 17], height: [Y_BOTTOM - 10, -9], count: 80, set: FG_SET, tilt: 0.6, invert: 0.3, faceIn: false, lights: true });
    ring({ radius: [11.5, 22], height: [Y_BOTTOM - 10, -6], count: 34, set: [["IC20_Hanging_Chain_Lantern", 1]], invert: 0, faceIn: false, lights: true });
    ring({ radius: [19, 36], height: [Y_BOTTOM - 15, -2], count: 58, set: MID_SET, invert: 0.3, lights: true });
    ring({ radius: [44, 85], height: [Y_BOTTOM - 30, 40], count: 18, set: FAR_SET, invert: 0.1 });
    // rooms visible from the platform: the castle beyond the gate
    scatterRing(b, { center: [0, 0, -18], radius: [30, 58], height: [-16, 22], count: 12, set: MID_SET, invert: 0.25 });
    scatterRing(b, { center: [0, 0, 0], radius: [70, 140], height: [10, 70], count: 8, set: FAR_SET, invert: 0 });
    // around the landing
    scatterRing(b, { center: [LAND.x, LAND.y, LAND.z], radius: [12, 40], height: [-20, 18], count: 14, set: MID_SET, invert: 0.2 });

    // the "staircase becomes the destination" beat (camera roll peaks here)
    {
      const pq = new THREE.Quaternion();
      const pp = new THREE.Vector3();
      path.at(sHelix + helixLength * 0.69, pp, pq);
      const fwd = V(0, 0, -1).applyQuaternion(pq);
      const up = V(0, 1, 0).applyQuaternion(pq);
      const pos = pp.clone().addScaledVector(fwd, 15).addScaledVector(up, -4.5);
      // keep it off the camera's own route
      const radial = V(pos.x - AXIS.x, 0, pos.z - AXIS.z).normalize();
      for (let i = 0; i < 8 && !b.clearOf(pos, 5); i++) pos.addScaledVector(radial, 2);
      b.dress("IC05_Staircase_Full", { p: pos, q: pq }, { essential: true, force: true });
      b.dress("IC07_Bridge_Straight_8m", { p: pos.clone().addScaledVector(fwd, 8.5).addScaledVector(up, 3.6), q: pq }, { essential: true, force: true });
    }

    // ── behaviour ──────────────────────────────────────────────────────
    const gateSound = gateSounds();
    b.onUpdate(({ camLocal }) => {
      const z = camLocal.z;
      const onPlatform = camLocal.y > EYE - 0.6;
      const open = smoothstep(10.5, 5.5, z) * (1 - (onPlatform ? smoothstep(-3.6, -6.8, z) : 1));
      setGate(open);
      gateSound(open);
      const shouldOpen = onPlatform ? z < -12.25 : camLocal.y < EYE - 0.6 && camLocal.y > -20;
      if (shouldOpen !== trapOpen) {
        trapOpen = shouldOpen;
        trapTween?.kill();
        if (shouldOpen) {
          emitAudio("biwa", 1.2);
          emitAudio("transform", 1);
        }
        trapTween = gsap.to(trap, { k: shouldOpen ? 1 : 0, duration: shouldOpen ? 0.7 : 1.1, ease: shouldOpen ? "power2.in" : "power2.out", onUpdate: setTrap });
      }
    });

    return b.finalize({
      type: "prologue",
      exits: { forward: { frame: { p: V(-41, LAND.y - EYE, -27), q: new THREE.Quaternion().setFromAxisAngle(V(0, 1, 0), HALF_PI) }, path } },
      region: (s) => (s < sGateBehind ? "gate" : s < sFallStart ? "threshold" : s < sFallEnd - 6 ? "fall" : "walkway"),
      fog: (s) => (s < sGateBehind - 2 ? 0.05 : s < sFallStart - 4 ? 0.026 : s < sFallEnd ? 0.0125 : 0.017),
      voidness: (s) => (s < sGateBehind ? 0.05 : s < sFallStart ? 0.45 : 0.9),
      progress: (s) => Math.min(1, s / sFallEnd),
      drift: (s) => (s > sFallStart + 1.5 && s < sFallEnd - 4 ? 1.35 : 0),
      dispose: () => trapTween?.kill(),
      extraBoundsPaths: [path],
      meta: { sFallStart, sFallEnd, startZ: PROLOGUE_START_Z, approachFrom: APPROACH_FROM },
    });
  },
};

export default prologueChunk;
