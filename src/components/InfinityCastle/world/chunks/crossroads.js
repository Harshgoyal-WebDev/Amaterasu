import { Path, arc, catmull, line, orientAuto, yawQuat } from "../path";
import { EYE, FAR_SET, HALF_PI, MID_SET, V, YAW, scatterRing } from "./common";

/**
 * STAGE 10 — the infinite crossroads (IC13). Entered from its south socket,
 * the camera slows over the hub; ahead a corridor, left and right corridors,
 * above the shaft rises to the crossing bridges at +10.8 m, below it drops
 * through the hub's open shaft. The visitor picks one by moving.
 *
 * Hub centre sits 18 m ahead of the entry (crossroads origin at z -18).
 */

const C = -18;
const Z = V(0, 0, -1);

const crossroadsChunk = {
  type: "crossroads",
  build(b) {
    b.place("IC13_Infinite_Crossroads", { p: [0, 0, C] }, { lightPower: 1 });

    const approach = line([0, EYE, 0], [0, EYE, -11.5], { pace: 0.7, clear: 0.6 });
    const decisionS = 11.2;
    const side = (dir) => [
      approach,
      arc([0, EYE, -11.5], Z, 6.5, HALF_PI, dir, { pace: 0.75, clear: 0.6 }),
      line([6.5 * dir, EYE, C], [18 * dir, EYE, C], { pace: 0.9, clear: 0.5 }),
    ];
    const rise = orientAuto({ pitchScale: 0.42, maxPitch: 0.75 });
    const exits = {
      forward: { frame: { p: V(0, 0, C - 18), q: yawQuat(0) }, path: new Path([approach, line([0, EYE, -11.5], [0, EYE, C - 18], { pace: 0.8, clear: 0.5 })], { decisionS }) },
      right: { frame: { p: V(18, 0, C), q: yawQuat(YAW.right) }, path: new Path(side(1), { decisionS }) },
      left: { frame: { p: V(-18, 0, C), q: yawQuat(YAW.left) }, path: new Path(side(-1), { decisionS }) },
      up: {
        // the central shaft is open all the way up: rise above everything, then head on
        frame: { p: V(0, 24, C - 22), q: yawQuat(0) },
        path: new Path(
          [
            approach,
            catmull(
              [
                [0, EYE, -11.5],
                [0, EYE, -15.5],
                [0, 2.4, C + 0.4],
                [0, 7, C],
                [0, 14, C],
                [0, 19, C],
                [0, 23.2, C - 0.2],
                [0, 24 + EYE, C - 2.6],
                [0, 24 + EYE, C - 8],
                [0, 24 + EYE, C - 22],
              ],
              { pace: [1.2, 1.4], clear: 0.2, orient: rise },
            ),
          ],
          { decisionS },
        ),
      },
      down: {
        frame: { p: V(0, -16, C - 12), q: yawQuat(0) },
        path: new Path(
          [
            approach,
            catmull(
              [
                [0, EYE, -11.5],
                [0, EYE, -15.5],
                [0, 0.6, C + 0.4],
                [0, -3, C - 0.1],
                [0, -9, C - 0.3],
                [0, -13.2, C - 2.5],
                [0, -16 + EYE, C - 6],
                [0, -16 + EYE, C - 12],
              ],
              { pace: [0.9, 1.4], clear: 0.2, orient: orientAuto({ pitchScale: 0.5, maxPitch: 0.9 }) },
            ),
          ],
          { decisionS },
        ),
      },
    };

    b.avoid(Object.values(exits).map((e) => e.path), 3);
    scatterRing(b, { center: [0, 0, C], radius: [30, 70], height: [-40, 40], count: 16, set: MID_SET, invert: 0.25, lights: true });
    scatterRing(b, { center: [0, 0, C], radius: [80, 160], height: [-80, 90], count: 10, set: FAR_SET, movers: 0 });

    return b.finalize({
      type: "crossroads",
      exits,
      defaultDir: "forward",
      decisionS,
      region: () => "crossroads",
      fog: 0.0145,
      voidness: 0.6,
      hint: "crossroads",
    });
  },
};

export default crossroadsChunk;
