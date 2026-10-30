import * as THREE from "three";
import { Path, line } from "../path";
import { EYE, FAR_SET, FG_SET, MID_SET, V, scatterAlong, underBridge } from "./common";

/** STAGE 04 — a suspended walkway: bridge pieces over the void, rooms drifting on both sides. */
const walkwayChunk = {
  type: "walkway",
  build(b, opts = {}) {
    const { rng } = b;
    const n = opts.length ?? rng.int(3, 5);
    const L = n * 4;
    const path = new Path([line([0, EYE, 0], [0, EYE, -L], { pace: 1.1, clear: 0.7 })]);

    for (let i = 0; i < n; i++) {
      const name = i % 2 === 1 || rng.chance(0.25) ? "IC07_Bridge_Straight_Lantern" : "IC07_Bridge_Straight";
      b.place(name, { p: [0, 0, -4 * i] });
    }
    underBridge(b, 0, -L);

    b.avoid([path], 3);
    scatterAlong(b, { z: [8, -L - 8], dist: [4.5, 9], height: [-12, 7], count: Math.ceil(n * 1.6), set: FG_SET, invert: 0.2 });
    scatterAlong(b, { z: [14, -L - 14], dist: [10, 38], height: [-28, 22], count: n * 3, set: MID_SET, lights: true });
    scatterAlong(b, { z: [30, -L - 30], dist: [45, 95], height: [-45, 55], count: 4, set: FAR_SET, invert: 0.05, movers: 0 });

    return b.finalize({
      type: "walkway",
      exits: { forward: { frame: { p: V(0, 0, -L), q: new THREE.Quaternion() }, path } },
      region: () => "walkway",
      fog: 0.0175,
      voidness: 0.85,
    });
  },
};

export default walkwayChunk;
