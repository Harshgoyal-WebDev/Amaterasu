import { Path, arc, catmull, line, orientAuto, yawQuat } from "../path";
import { EYE, FAR_SET, FG_SET, HALF_PI, MID_SET, V, YAW, scatterRing, underBridge } from "./common";

/**
 * STAGE 08 — the central abyss (IC12 cluster, 180 m across).
 *
 * The cluster's core (|x|,|z| < 11 m) is clear at every height, ringed by
 * eight lattice towers at ±16 m. The camera arrives on a small bridge through
 * the gap between two towers (cluster x = 7, y = 20); the bridge breaks off
 * over the core and you fall 20 m onto a cross of bridges at cluster
 * (7, 0, -7). From there every way on is a dive — straight down past the
 * towers, below the whole cluster (y < -63), onto a bridge, then out.
 *
 * Cluster coordinates c map to chunk-local c + O.
 */

const O = V(-7, -20, -24);
const L = (x, y, z) => V(x + O.x, y + O.y, z + O.z);
const Z = V(0, 0, -1);

const abyssChunk = {
  type: "abyss",
  build(b) {
    b.place("IC12_Central_Abyss_Cluster", { p: O }, { bounds: false, solids: true, lightPower: 1 });

    // entry bridge through the tower gap, snapped off over the core
    b.place("IC07_Bridge_Straight_Lantern", { p: [0, 0, 0] });
    b.place("IC07_Bridge_Straight", { p: [0, 0, -4] });
    b.place("IC07_Bridge_Straight", { p: [0, 0, -8] });
    underBridge(b, 0, -12);
    b.dress("IC20_Railing_Fragment", { p: [1.3, 0, -11.7], r: [0, 0.3, 0.2] }, { essential: true, force: true });
    b.dress("IC20_Broken_Beam", { p: [-1.1, -0.35, -12.1], r: [0.1, -0.5, -0.25] }, { essential: true, force: true });
    // the cross of bridges at the heart of the core
    const deck = O.y;
    b.place("IC07_Bridge_Straight", { p: [0, deck, -21] });
    b.place("IC07_Bridge_Straight_Lantern", { p: [0, deck, -25] });
    b.place("IC07_Bridge_Cross", { p: [0, deck, -29] });
    b.place("IC07_Bridge_Straight_Lantern", { p: [0, deck, -33] });
    b.place("IC07_Bridge_Straight", { p: [2, deck, -31], ry: -HALF_PI });
    b.place("IC07_Bridge_Straight", { p: [-2, deck, -31], ry: HALF_PI });
    b.place("IC16_Ceiling_Beamed_Lantern", { p: [0, deck + 3.95, -31] });
    underBridge(b, -21, -37, deck);

    // ── paths ──
    const yDeck = deck + EYE;
    const entry = line([0, EYE, 0], [0, EYE, -11.6], { pace: 1, clear: 0.6 });
    // off the end of the bridge, down onto the deck
    const fall = catmull(
      [
        [0, EYE, -11.6],
        [0, EYE - 0.3, -13],
        [0, -2, -14.6],
        [0, -8, -16.6],
        [0, -14, -19],
        [0, yDeck - 0.6, -21.6],
        [0, yDeck, -23.4],
        [0, yDeck, -25.5],
      ],
      { pace: [1.2, 1.8], clear: 0, orient: orientAuto({ pitchScale: 0.6, maxPitch: 1.1 }) },
    );
    const onArm = line([0, yDeck, -25.5], [0, yDeck, -29.6], { pace: 0.75, clear: [0.3, 0.6] });
    const shared = [entry, fall, onArm];
    const sharedPath = new Path(shared);
    const decisionS = sharedPath.length - 0.05;
    const firstFall = [sharedPath.s[sharedPath.p.findIndex((p) => p.z < -11.9)], sharedPath.s[sharedPath.p.findIndex((p) => p.y < yDeck + 0.3)]];
    const dive = (points) => catmull(points, { pace: [1.6, 2.8], clear: 0, orient: orientAuto({ pitchScale: 0.62, maxPitch: 1.15 }) });
    const yOut = -70 + O.y + EYE;

    const exits = {
      forward: {
        frame: { p: L(7, -70, -40), q: yawQuat(0) },
        path: new Path(
          [
            ...shared,
            line([0, yDeck, -29.6], [0, yDeck, -37], { pace: 0.8, clear: 0.6 }),
            dive([
              [0, yDeck, -37],
              [0, yDeck - 0.6, -37.6],
              [0, yDeck - 5, -37.8],
              L(7, -20, -13.5),
              L(7, -38, -13.6),
              L(7, -52, -16),
              L(7, -64, -22),
              [0, yOut, L(0, 0, -31).z],
              [0, yOut, L(0, 0, -40).z],
            ]),
          ],
          { decisionS },
        ),
      },
    };
    for (const [dir, s] of [
      ["right", 1],
      ["left", -1],
    ]) {
      const armEnd = 6 * s;
      exits[dir] = {
        frame: { p: L(7 + 40 * s, -70, -7), q: yawQuat(s > 0 ? YAW.right : YAW.left) },
        path: new Path(
          [
            ...shared,
            arc([0, yDeck, -29.6], Z, 1.4, HALF_PI, s, { pace: 0.75, clear: 0.3 }),
            line([1.4 * s, yDeck, -31], [armEnd, yDeck, -31], { pace: 0.8, clear: 0.6 }),
            dive([
              [armEnd, yDeck, -31],
              [armEnd + 0.5 * s, yDeck - 0.6, -31],
              [armEnd + 0.4 * s, yDeck - 5, -31],
              [armEnd + 0.4 * s, -40, -31],
              [armEnd + 0.4 * s, -58, -31],
              [armEnd + 5 * s, -74, -31],
              [armEnd + 13 * s, -84, -31],
              [armEnd + 22 * s, yOut, -31],
              [L(7 + 40 * s, 0, 0).x, yOut, -31],
            ]),
          ],
          { decisionS },
        ),
      };
    }

    // the bridges each dive lands on
    const yFloor = O.y - 70;
    for (let i = 0; i < 4; i++) {
      const name = i % 2 ? "IC07_Bridge_Straight_Lantern" : "IC07_Bridge_Straight";
      b.place(name, { p: [0, yFloor, -48 - 4 * i] });
      b.place(name, { p: [24 + 4 * i, yFloor, -31], ry: -HALF_PI });
      b.place(name, { p: [-24 - 4 * i, yFloor, -31], ry: HALF_PI });
    }
    underBridge(b, -48, -64, yFloor);

    // each dive is a fall from the moment you step off the deck until it levels out at the bottom
    const fallStart = {};
    const fallEnd = {};
    for (const [dir, e] of Object.entries(exits)) {
      const pts = e.path.p;
      let i = pts.length - 1;
      while (i > 0 && pts[i].y < yOut + 1) i--;
      fallEnd[dir] = e.path.s[i];
      const j = pts.findIndex((p, k) => e.path.s[k] > decisionS && p.y < yDeck - 0.05);
      fallStart[dir] = e.path.s[Math.max(0, j)] - 0.6;
    }

    // ── the world beyond the cluster: reusable modules keep it going ──
    const all = Object.values(exits).map((e) => e.path);
    b.avoid(all, 2.5);
    scatterRing(b, { center: [O.x, O.y, O.z], radius: [2, 10], height: [-60, 45], count: 16, set: FG_SET, tilt: 0.8, faceIn: false });
    scatterRing(b, { center: [O.x, O.y, O.z], radius: [95, 150], height: [-90, 80], count: 18, set: MID_SET, invert: 0.25, lights: true });
    scatterRing(b, { center: [O.x, O.y, O.z], radius: [150, 240], height: [-120, 120], count: 10, set: FAR_SET, movers: 0 });

    return b.finalize({
      type: "abyss",
      exits,
      defaultDir: "forward",
      decisionS,
      region: () => "abyss",
      fog: 0.0085,
      voidness: 1,
      drift: (s, dir) => ((s > firstFall[0] && s < firstFall[1]) || (s > (fallStart[dir] ?? Infinity) && s < (fallEnd[dir] ?? Infinity)) ? 1.1 : 0),
    });
  },
};

export default abyssChunk;
