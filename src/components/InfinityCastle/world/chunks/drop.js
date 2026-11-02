import * as THREE from "three";
import { Path, catmull, line, orientAuto } from "../path";
import { EYE, MID_SET, V, scatterAlong, underBridge } from "./common";

/**
 * A walkway that simply ends — broken railing, snapped beam — and a short
 * fall onto a bridge 26 m below. Also the generator's escape hatch: when no
 * other chunk fits without overlapping, the castle drops you somewhere else.
 */
const dropChunk = {
  type: "drop",
  build(b) {
    b.place("IC07_Bridge_Straight", { p: [0, 0, 0] });
    b.dress("IC20_Railing_Fragment", { p: [1.3, 0, -3.7], r: [0, 0.3, 0.2] }, { essential: true, force: true });
    b.dress("IC20_Broken_Beam", { p: [-1.1, -0.35, -4.1], r: [0.1, -0.5, -0.25] }, { essential: true, force: true });
    b.place("IC07_Bridge_Straight", { p: [0, -26, -12] });
    b.place("IC07_Bridge_Straight_Lantern", { p: [0, -26, -16] });
    underBridge(b, -12, -20, -26);

    const path = new Path([
      line([0, EYE, 0], [0, EYE, -3.6], { pace: 0.9, clear: 0.5 }),
      catmull(
        [
          [0, EYE, -3.6],
          [0, EYE - 0.3, -5],
          [0, -2, -6.6],
          [0, -9, -8.4],
          [0, -18, -10.5],
          [0, -23.6, -14],
          [0, -26 + EYE, -17],
          [0, -26 + EYE, -20],
        ],
        { pace: [1.2, 1.8], clear: 0, orient: orientAuto({ pitchScale: 0.6, maxPitch: 1.1 }) },
      ),
    ]);

    b.avoid([path], 2.5);
    scatterAlong(b, { z: [6, -30], dist: [7, 34], height: [-40, 12], count: 10, set: MID_SET, lights: true });

    return b.finalize({
      type: "drop",
      exits: { forward: { frame: { p: V(0, -26, -20), q: new THREE.Quaternion() }, path } },
      region: (s) => (s < 4 ? "walkway" : "drop"),
      fog: 0.016,
      voidness: 0.9,
      drift: (s) => (s > 3.4 && s < path.length - 3 ? 1 : 0),
    });
  },
};

export default dropChunk;
