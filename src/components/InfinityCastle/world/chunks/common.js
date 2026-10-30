import * as THREE from "three";
import { CAMERA } from "../../config";
import { emitAudio } from "../../state";

export const EYE = CAMERA.eye;
export const PI = Math.PI;
export const HALF_PI = Math.PI / 2;

// Yaw that turns chunk-forward (-Z) into each exit heading.
export const YAW = { forward: 0, left: HALF_PI, right: -HALF_PI, back: PI };

export const V = (x, y, z) => new THREE.Vector3(x, y, z);

// Dressing vocabularies by depth layer.
export const FG_SET = [
  ["IC09_Beam_4m", 3],
  ["IC09_Pillar", 2],
  ["IC20_Broken_Beam", 2],
  ["IC20_Floating_Planks", 2],
  ["IC20_Debris_Small", 2],
  ["IC20_Railing_Fragment", 1.5],
  ["IC20_Stair_Fragment", 1.5],
  ["IC20_Suspended_Frame_Piece", 1.5],
  ["IC20_Hanging_Chain_Lantern", 2.5],
];

export const MID_SET = [
  ["IC11_RoomBlock_A", 3],
  ["IC11_RoomBlock_B_TwoStory", 2],
  ["IC11_RoomBlock_C_Gabled", 2],
  ["IC08_Balcony_Rect", 1.5],
  ["IC08_Balcony_Square", 1],
  ["IC07_Bridge_Straight_8m", 2.5],
  ["IC05_Staircase_Full", 1.5],
  ["IC06_Inverted_RoomBlock_A", 1.5],
  ["IC06_Inverted_TatamiRoom_A", 1],
  ["IC06_Inverted_Staircase_Full", 1],
  ["IC09_Frame_Bay_Braced", 1.5],
  ["IC20_Hanging_Chain_Lantern", 2],
];

export const FAR_SET = [
  ["IC19_BG_Tower_L", 1],
  ["IC19_BG_Tower_M", 1.5],
  ["IC19_BG_Tower_S", 1.5],
  ["IC19_BG_Block_Wide", 1.5],
  ["IC19_BG_Suspended_Cluster", 1.5],
  ["IC19_BG_Balcony_Row", 1.5],
  ["IC11_RoomBlock_B_TwoStory", 1],
];

const yawSnap = (rng) => (rng.int(0, 3) * Math.PI) / 2 + rng.range(-0.12, 0.12);

/** Pick a mover for a dressing piece (stage 11: the castle starts moving). */
function moverFor(name, rng) {
  if (/Bridge|Balcony/.test(name)) return { type: "slide", offset: [rng.sign() * rng.range(5, 9), rng.range(-2, 2), 0], duration: rng.range(5, 8), distance: 45, sound: "transform" };
  if (/Staircase|Stair/.test(name)) return { type: "rotate", axis: [0, 1, 0], angle: (rng.sign() * Math.PI) / 2, duration: 6, distance: 40, sound: "transform" };
  if (/RoomBlock|Tatami/.test(name)) return { type: "appear", offset: [0, -rng.range(18, 30), 0], duration: rng.range(6, 9), distance: 50, sound: "transform" };
  return null;
}

/**
 * Scatter void architecture in a box-shaped region around an axis running
 * along local -Z (from z0 to z1), on one or both sides.
 */
export function scatterAlong(b, { z = [10, -30], side = "both", dist = [10, 40], height = [-25, 25], count = 10, set = MID_SET, invert = 0.15, roll = 0, movers = 0.25, lights = false }) {
  const { rng } = b;
  let placed = 0;
  for (let i = 0; i < count * 3 && placed < count; i++) {
    const s = side === "both" ? rng.sign() : side === "left" ? -1 : 1;
    const x = s * rng.range(dist[0], dist[1]);
    const y = rng.range(height[0], height[1]);
    const zz = rng.range(z[1], z[0]);
    const name = rng.weighted(set);
    const r = [0, yawSnap(rng), 0];
    if (rng.chance(invert)) r[2] = Math.PI;
    if (roll && rng.chance(roll)) r[2] = rng.sign() * Math.PI * 0.5;
    const mover = b.alive && rng.chance(movers) ? moverFor(name, rng) : null;
    if (b.dress(name, { p: [x, y, zz], r }, { mover, lights })) placed++;
  }
  return placed;
}

/** Scatter in a ring (cylindrical shell) around a vertical axis — used for shafts and the fall. */
export function scatterRing(b, { center = [0, 0, 0], radius = [12, 30], height = [-20, 20], count = 12, set = MID_SET, invert = 0.2, tilt = 0, movers = 0.2, faceIn = true, lights = false }) {
  const { rng } = b;
  let placed = 0;
  for (let i = 0; i < count * 3 && placed < count; i++) {
    const a = rng.range(0, Math.PI * 2);
    const rad = rng.range(radius[0], radius[1]);
    const x = center[0] + Math.cos(a) * rad;
    const z = center[2] + Math.sin(a) * rad;
    const y = center[1] + rng.range(height[0], height[1]);
    const name = rng.weighted(set);
    const yaw = faceIn ? -a + Math.PI / 2 + rng.range(-0.3, 0.3) : yawSnap(rng);
    const r = [tilt ? rng.range(-tilt, tilt) : 0, yaw, 0];
    if (rng.chance(invert)) r[2] = Math.PI;
    const mover = b.alive && rng.chance(movers) ? moverFor(name, rng) : null;
    if (b.dress(name, { p: [x, y, z], r }, { mover, lights })) placed++;
  }
  return placed;
}

/** Hanging pillars + chain lanterns under a bridge run (z from z0 to z1). */
export function underBridge(b, z0, z1, y = 0) {
  const { rng } = b;
  for (let z = z0 - 2; z > z1; z -= 8) {
    if (rng.chance(0.7)) b.dress("IC09_Pillar", { p: [rng.sign() * 1.35, y - 0.4, z], r: [Math.PI, 0, 0] }, { essential: true, force: true });
    if (rng.chance(0.45)) b.dress("IC20_Hanging_Chain_Lantern", { p: [rng.sign() * 1.6, y - 0.3, z - 3], r: [0, rng.range(0, 3), 0] }, { essential: true, force: true, lights: true, lightPower: 0.6 });
  }
}

/** A glowing card (used for the false exit's light). Owns its geometry/material. */
export function glowCard(w, h, color, intensity = 4) {
  const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(intensity), toneMapped: true, side: THREE.DoubleSide, fog: false });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
  mesh.userData.ownGeometry = true;
  mesh.userData.ownMaterial = true;
  return mesh;
}

/** Shoji door leaves: centre-based opening that works for every rotation / A-B variant. */
export function doorController(inst, wallAxisOf) {
  // wallAxisOf(key) → unit Vector3 along the wall (in prefab space) and door centre
  const leaves = [];
  for (const key in inst.movables) {
    const mv = inst.movables[key];
    const info = wallAxisOf(key, mv);
    if (!info) continue;
    const along = mv.axis.clone();
    // leaf centre along the wall relative to the door centre
    const w = mv.extras.slide_distance ?? 1.2;
    const leafCenter = mv.base.clone().addScaledVector(along, w / 2);
    const c = leafCenter.clone().sub(info.center).dot(info.tangent);
    const sign = Math.sign(c) || 1;
    // position (along tangent) of the closed and open centre
    const closed = sign * (w / 2);
    const open = sign * (w * 1.5);
    const dirDot = along.dot(info.tangent); // ±1: leaf X vs wall tangent
    leaves.push({ key, mv, wall: info.wall, c, closed, open, dirDot });
  }
  const amounts = {};
  return {
    leaves,
    set(wall, amount) {
      amounts[wall] = amount;
      for (const l of leaves) {
        if (l.wall !== wall) continue;
        const target = THREE.MathUtils.lerp(l.closed, l.open, amount);
        const delta = (target - l.c) * l.dirDot;
        l.mv.object.position.copy(l.mv.base).addScaledVector(l.mv.axis, delta);
      }
    },
    get: (wall) => amounts[wall] ?? 0,
  };
}

/** Sounds for a pair of gate doors driven by an open amount (0..1): heavy slide open / shut. */
export function gateSounds() {
  let last = 0;
  return (open) => {
    if (open > 0.04 && last <= 0.04) emitAudio("gate", 1);
    else if (open < 0.9 && last >= 0.9) emitAudio("gateClose", 0.9);
    last = open;
  };
}
