import * as THREE from "three";
import { Path, catmull, line, orientUp, segment, smoothstep } from "../path";
import { emitAudio } from "../../state";
import { EYE, FG_SET, MID_SET, V, scatterAlong } from "./common";

/**
 * STAGE 07 — the broken gravity chamber.
 *
 * Bridge → staircase → a walkway that twists like a ribbon around a tube
 * axis. The camera walks the inside of that tube, so "down" rotates with it:
 * by the end the old ceiling is the floor (180°) or a wall is (±90°). The
 * exit frame carries the roll, so every chunk after it is built in the new
 * orientation — nothing ever snaps back. Around the twist: upside-down rooms
 * on the ceiling plane, corridors and stairs mounted on the walls.
 */

const R = 2.6; // camera → tube axis
const Z0 = -23;
const Z1 = -47;
const Z_END = -55;
const AXIS_Y = 3.6 + EYE + R;
const FWD = V(0, 0, 1); // twist axis (+Z, so +θ rolls up → -X)

const upAt = (theta, out = new THREE.Vector3()) => out.set(-Math.sin(theta), Math.cos(theta), 0);

const gravityChunk = {
  type: "gravity",
  build(b, opts = {}) {
    const { rng } = b;
    let twist = opts.twist ?? rng.pick([Math.PI, Math.PI / 2, -Math.PI / 2]);
    if (b.reducedMotion && Math.abs(twist) > Math.PI / 2) twist = Math.sign(twist) * (Math.PI / 2);
    const thetaAt = (z) => twist * smoothstep(Z0, Z1, z);
    const U = new THREE.Vector3();
    const camAt = (z, out) => out.set(0, AXIS_Y, z).addScaledVector(upAt(thetaAt(z), U), -R);
    const floorAt = (z, theta, out) => out.set(0, AXIS_Y, z).addScaledVector(upAt(theta, U), -(R + EYE));

    // ── structure ──
    b.place("IC07_Bridge_Straight_Lantern", { p: [0, 0, 0] });
    b.place("IC07_Bridge_Straight", { p: [0, 0, -4] });
    b.place("IC07_Bridge_Straight", { p: [0, 0, -8] });
    b.place("IC05_Staircase_Full", { p: [0, 0, -12] });
    b.place("IC17_Floor_Wood_Polished", { p: [0, 3.6, -21.6] });
    for (const [x, y, z] of [
      [1.9, 2.6, -14],
      [-1.9, 4.4, -19],
    ])
      b.dress("IC20_Hanging_Chain_Lantern", { p: [x, y + 3.7, z] }, { essential: true, force: true, lights: true, lightPower: 1.2 });
    const F = new THREE.Vector3();
    for (let z = Z0 + 0.4, k = 0; z > Z_END + 3.9; z -= 2, k++) {
      const theta = thetaAt(z - 2);
      floorAt(z, theta, F);
      const q = new THREE.Quaternion().setFromAxisAngle(FWD, theta);
      b.place(k % 3 === 1 ? "IC07_Bridge_Straight_Lantern" : "IC07_Bridge_Straight", { p: [F.x, F.y, z], q }, { lightPower: 0.9 });
    }

    // ── paths ──
    const P = new THREE.Vector3();
    const upEnd = upAt(twist);
    const path = new Path([
      line([0, EYE, 0], [0, EYE, -12], { pace: 1, clear: 0.6 }),
      catmull(
        [
          [0, EYE, -12],
          [0, EYE + 1.8, -16],
          [0, EYE + 3.6, -20],
          [0, EYE + 3.6, -21.5],
          [0, EYE + 3.6, Z0],
        ],
        { pace: 0.9, clear: 0.4 },
      ),
      segment((t) => camAt(Z0 + (Z1 - Z0) * t, P), {
        pace: b.reducedMotion ? 0.65 : 0.8,
        clear: 0.12,
        orient: orientUp((t) => upAt(thetaAt(Z0 + (Z1 - Z0) * t), new THREE.Vector3())),
      }),
      segment((t) => camAt(Z1 + (Z_END - Z1) * t, P), { pace: 1, clear: 0.4, orient: orientUp(() => upEnd) }),
    ]);

    // ── the chamber: architecture in every orientation ──
    b.avoid([path], 3.2);
    const d = (name, p, r) => b.dress(name, { p, r }, { essential: true, lights: true, lightPower: 0.7 });
    d("IC06_Inverted_TatamiRoom_A", [8, 17.5, -30], [0, 0.3, 0]);
    d("IC06_Inverted_TatamiRoom_A", [-9, 18.5, -44], [0, -0.2, 0]);
    d("IC06_Inverted_Corridor_A", [-7.5, 17, -20], [0, 0, 0]);
    d("IC06_Inverted_Corridor_A", [-7.5, 17, -24], [0, 0, 0]);
    d("IC06_Inverted_Staircase_Full", [7, 17, -42], [0, Math.PI, 0]);
    d("IC06_Inverted_Balcony_Square", [-10, 15.5, -33], [0, 0.5, 0]);
    d("IC06_Wall_Corridor_A", [-10, 5, -26], [0, 0, 0]);
    d("IC06_Wall_Corridor_A", [-10, 5, -30], [0, 0, 0]);
    d("IC06_Wall_Staircase_Full", [-10, 2, -38], [0, 0, 0]);
    d("IC06_Wall_Corridor_A", [10, 6, -34], [0, Math.PI, 0]);
    d("IC06_Wall_Bridge_Straight", [10, 9, -24], [0, Math.PI, 0]);
    d("IC06_Wall_Staircase_Full", [10.5, 3, -46], [0, Math.PI, 0]);
    d("IC11_RoomBlock_A", [0, -15, -34], [0, 0.4, 0]);
    d("IC05_Staircase_Full", [-7, -10, -28], [0, 1.2, 0]);
    d("IC08_Balcony_Rect", [8, -8, -24], [0, -0.6, 0]);
    // more of the same at random roll — up and down stop meaning anything
    scatterAlong(b, { z: [0, -60], dist: [12, 40], height: [-30, 34], count: 16, set: MID_SET, invert: 0.35, roll: 0.45, lights: true });
    scatterAlong(b, { z: [0, -60], dist: [6, 11], height: [-8, 16], count: 6, set: FG_SET, roll: 0.5 });

    // the chamber turning over: sound as the twist begins (re-arms if you back out)
    let twisting = false;
    b.onUpdate(({ camLocal }) => {
      const inTwist = camLocal.z < Z0 + 1 && camLocal.z > Z1;
      if (inTwist && !twisting) emitAudio("transform", 1.1);
      twisting = inTwist;
    });

    const exitP = floorAt(Z_END, twist, new THREE.Vector3());
    return b.finalize({
      type: "gravity",
      exits: { forward: { frame: { p: exitP, q: new THREE.Quaternion().setFromAxisAngle(FWD, twist) }, path } },
      region: () => "gravity",
      fog: 0.016,
      voidness: 0.75,
    });
  },
};

export default gravityChunk;
