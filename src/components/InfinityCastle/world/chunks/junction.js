import { Path, arc, line, yawQuat } from "../path";
import { EYE, FG_SET, HALF_PI, MID_SET, V, YAW, scatterAlong, scatterRing } from "./common";

const Z = V(0, 0, -1);

/** STAGE 05/09 — an open-air pavilion over the void where the walkway splits (cross or tee). */
const junctionChunk = {
  type: "junction",
  build(b, opts = {}) {
    const { rng } = b;
    const kind = opts.kind ?? rng.weighted([
      ["cross", 3],
      ["tee", 1],
    ]);

    b.place("IC07_Bridge_Straight", { p: [0, 0, 0] });
    b.place(kind === "cross" ? "IC07_Bridge_Cross" : "IC07_Bridge_Tee", { p: [0, 0, -4] });
    for (const [x, z] of [
      [-2.05, -4],
      [2.05, -4],
      [-2.05, -8],
      [2.05, -8],
    ]) {
      b.place("IC09_Pillar", { p: [x, 0, z] }, { lights: false });
      b.dress("IC09_Pillar", { p: [x, -0.4, z], r: [Math.PI, 0, 0] }, { essential: true, force: true });
    }
    b.place("IC16_Ceiling_Beamed_Lantern", { p: [0, 3.95, -6] }, { lightPower: 1.2 });

    const approach = line([0, EYE, 0], [0, EYE, -4], { pace: 0.9, clear: 0.6 });
    const turn = (dir) => [approach, arc([0, EYE, -4], Z, 2, HALF_PI, dir, { pace: 0.8, clear: 0.3 })];
    const decisionS = 3.6;
    const exits = {
      right: { frame: { p: V(2, 0, -6), q: yawQuat(YAW.right) }, path: new Path(turn(1), { decisionS }) },
      left: { frame: { p: V(-2, 0, -6), q: yawQuat(YAW.left) }, path: new Path(turn(-1), { decisionS }) },
    };
    if (kind === "cross")
      exits.forward = {
        frame: { p: V(0, 0, -8), q: yawQuat(0) },
        path: new Path([approach, line([0, EYE, -4], [0, EYE, -8], { pace: 0.9, clear: 0.6 })], { decisionS }),
      };

    b.avoid(Object.values(exits).map((e) => e.path), 3);
    scatterRing(b, { center: [0, 0, -6], radius: [11, 42], height: [-30, 24], count: 12, set: MID_SET, lights: true });
    scatterAlong(b, { z: [6, -16], dist: [5, 10], height: [-10, 6], count: 4, set: FG_SET });

    return b.finalize({
      type: "junction",
      exits,
      defaultDir: kind === "cross" ? "forward" : rng.pick(["left", "right"]),
      decisionS,
      region: () => "junction",
      fog: 0.017,
      voidness: 0.85,
    });
  },
};

export default junctionChunk;
