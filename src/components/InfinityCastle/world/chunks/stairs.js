import * as THREE from "three";
import { Path, bezier, line } from "../path";
import { EYE, MID_SET, V, scatterAlong } from "./common";

/**
 * STAGE 09 — a landing with three ways on: a staircase up, a staircase down,
 * a bridge straight on. The vertical branches of the navigation graph.
 */
const stairsChunk = {
  type: "stairs",
  build(b) {
    b.place("IC07_Bridge_Straight", { p: [0, 0, 0] });
    for (const x of [-4, 0, 4]) for (const z of [-6, -10]) b.place("IC17_Floor_Wood_Polished", { p: [x, 0, z] });
    for (const [x, z] of [
      [-5.7, -4.3],
      [5.7, -4.3],
      [-5.7, -11.7],
      [5.7, -11.7],
    ]) {
      b.place("IC10_Lantern_Standing", { p: [x, 0, z] });
      b.dress("IC09_Pillar", { p: [x, -0.2, z], r: [Math.PI, 0, 0] }, { essential: true, force: true });
    }
    b.place("IC05_Staircase_Full", { p: [4, 0, -12] });
    b.place("IC05_Staircase_Full", { p: [-4, -3.6, -20], ry: Math.PI });
    b.place("IC07_Bridge_Straight_8m", { p: [0, 0, -12] });
    // lanterns hung beside each flight so the steps always read
    const chain = (x, lanternY, z) => b.dress("IC20_Hanging_Chain_Lantern", { p: [x, lanternY + 3.7, z], r: [0, 0.4, 0] }, { essential: true, force: true, lights: true, lightPower: 1.2 });
    for (const [x, y, z] of [
      [6.1, 2.4, -13],
      [6.1, 4.2, -18.5],
      [1.9, 3.3, -16],
      [-6.1, 0.6, -13],
      [-6.1, -1.2, -18.5],
      [-1.9, 0.9, -16],
    ])
      chain(x, y, z);

    const approach = line([0, EYE, 0], [0, EYE, -4.5], { pace: 0.9, clear: 0.6 });
    const decisionS = 4.2;
    const shift = (x) => bezier([0, EYE, -4.5], [0, EYE, -8], [x, EYE, -8.5], [x, EYE, -12], { pace: 0.85, clear: 0.4 });
    const exits = {
      forward: {
        frame: { p: V(0, 0, -20), q: new THREE.Quaternion() },
        path: new Path([approach, line([0, EYE, -4.5], [0, EYE, -20], { pace: 0.95, clear: 0.6 })], { decisionS }),
      },
      up: {
        frame: { p: V(4, 3.6, -20), q: new THREE.Quaternion() },
        path: new Path([approach, shift(4), line([4, EYE, -12], [4, EYE + 3.6, -20], { pace: 0.8, clear: 0.3 })], { decisionS }),
      },
      down: {
        frame: { p: V(-4, -3.6, -20), q: new THREE.Quaternion() },
        path: new Path([approach, shift(-4), line([-4, EYE, -12], [-4, EYE - 3.6, -20], { pace: 0.8, clear: 0.3 })], { decisionS }),
      },
    };

    b.avoid(Object.values(exits).map((e) => e.path), 3);
    scatterAlong(b, { z: [10, -30], dist: [11, 40], height: [-28, 26], count: 12, set: MID_SET, lights: true });

    return b.finalize({
      type: "stairs",
      exits,
      defaultDir: "forward",
      decisionS,
      region: () => "stairs",
      fog: 0.018,
      voidness: 0.75,
    });
  },
};

export default stairsChunk;
