import { Path, arc, catmull, line, orientAuto, yawQuat } from "../path";
import { EYE, FAR_SET, HALF_PI, MID_SET, V, YAW, scatterRing, underBridge } from "./common";

/**
 * STAGE 10 — the infinite crossroads (IC13). Entered from its south socket,
 * the camera slows over the hub; ahead a corridor (round the open shaft in
 * the hub's floor), left and right corridors, above the shaft lifts you to a
 * bridge high over everything, below it drops you through the shaft onto a
 * bridge 16 m down. The visitor picks one by moving.
 *
 * Hub centre sits 18 m ahead of the entry (crossroads origin at z -18).
 */

const C = -18;
const Z = V(0, 0, -1);

const crossroadsChunk = {
  type: "crossroads",
  build(b) {
    b.place("IC13_Infinite_Crossroads", { p: [0, 0, C] }, { lightPower: 1 });
    // a bridge high over the hub (up) and one below its shaft (down)
    for (let i = 0; i < 5; i++) b.place(i % 2 ? "IC07_Bridge_Straight_Lantern" : "IC07_Bridge_Straight", { p: [0, 24, C - 2 - 4 * i] });
    underBridge(b, C - 2, C - 22, 24);
    for (let i = 0; i < 3; i++) b.place(i === 1 ? "IC07_Bridge_Straight_Lantern" : "IC07_Bridge_Straight", { p: [0, -16, C - 1 - 4 * i] });
    underBridge(b, C - 1, C - 13, -16);

    const approach = line([0, EYE, 0], [0, EYE, -11.5], { pace: 0.7, clear: 0.6 });
    const decisionS = 11.2;
    const side = (dir) => [
      approach,
      arc([0, EYE, -11.5], Z, 6.5, HALF_PI, dir, { pace: 0.75, clear: 0.6 }),
      line([6.5 * dir, EYE, C], [18 * dir, EYE, C], { pace: 0.9, clear: 0.5 }),
    ];
    const rise = orientAuto({ pitchScale: 0.42, maxPitch: 0.75 });
    const exits = {
      forward: {
        frame: { p: V(0, 0, C - 18), q: yawQuat(0) },
        path: new Path(
          [
            approach,
            // the hub's floor is open round the shaft: walk past it
            catmull(
              [
                [0, EYE, -11.5],
                [0.4, EYE, -13],
                [2.9, EYE, -15.6],
                [3.1, EYE, C],
                [2.9, EYE, -20.4],
                [0.4, EYE, -23],
                [0, EYE, -24.5],
              ],
              { pace: 0.8, clear: 0.3 },
            ),
            line([0, EYE, -24.5], [0, EYE, C - 18], { pace: 0.8, clear: 0.5 }),
          ],
          { decisionS },
        ),
      },
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
        frame: { p: V(0, -16, C - 13), q: yawQuat(0) },
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
                [0, -16 + EYE, C - 13],
              ],
              { pace: [0.9, 1.4], clear: [0, 0.5], orient: orientAuto({ pitchScale: 0.5, maxPitch: 0.9 }) },
            ),
          ],
          { decisionS },
        ),
      },
    };

    // down is a fall: gravity from the shaft's edge to the bridge
    const down = exits.down.path;
    const fall = [down.s[down.p.findIndex((p) => p.y < EYE - 0.4)], down.s[down.p.findIndex((p) => p.y < -16 + EYE + 0.3)]];
    // up is a lift through the shaft: no footsteps until the bridge at the top
    const upPath = exits.up.path;
    const lift = [upPath.s[upPath.p.findIndex((p) => p.y > EYE + 0.3)], upPath.s[upPath.p.findIndex((p) => p.y > 24 + EYE - 0.15)]];

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
      drift: (s, dir) => (dir === "down" && s > fall[0] && s < fall[1] ? 1 : 0),
      airborne: (s, dir) => dir === "up" && s > lift[0] && s < lift[1],
    });
  },
};

export default crossroadsChunk;
