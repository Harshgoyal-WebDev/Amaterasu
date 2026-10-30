import * as THREE from "three";
import { Path, arc, catmull, line, orientAuto, segment, smoothstep, yawQuat } from "../path";
import { EYE, FAR_SET, FG_SET, HALF_PI, MID_SET, V, YAW, scatterRing, underBridge } from "./common";

/**
 * STAGE 08 — the central abyss (IC12 cluster, 180 m across).
 *
 * The cluster's core (|x|,|z| < 11 m) is clear at every height, ringed by
 * eight lattice towers at ±16 m. The camera arrives on a small bridge through
 * the gap between two towers (cluster x = 7, y = 20), glides out over the
 * core, spirals down one full turn, and lands on a cross of bridges at
 * cluster (7, 0, -7). From there every way on is a dive — straight down past
 * the towers, below the whole cluster (y < -63), then out.
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

    // entry bridge through the tower gap
    b.place("IC07_Bridge_Straight_Lantern", { p: [0, 0, 0] });
    b.place("IC07_Bridge_Straight", { p: [0, 0, -4] });
    b.place("IC07_Bridge_Straight", { p: [0, 0, -8] });
    underBridge(b, 0, -12);
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
    const entry = line([0, EYE, 0], [0, EYE, -12], { pace: 1, clear: 0.6 });
    const glide = line([0, EYE, -12], [0, 1.2, -24], { pace: 0.7, clear: 0.4 });
    const P = new THREE.Vector3();
    const yTop = 1.2;
    const yDeck = deck + EYE;
    const spiral = segment(
      (t) => {
        const phi = -2 * Math.PI * t;
        return P.set(O.x + 7 * Math.cos(phi), THREE.MathUtils.lerp(yTop, yDeck, smoothstep(0, 1, t)), O.z + 7 * Math.sin(phi));
      },
      { pace: 1.45, clear: 0.6, orient: orientAuto({ pitchScale: 0.5, pitch: (t) => -0.28 * Math.sin(Math.PI * t), roll: (t) => 0.07 * Math.sin(Math.PI * t) }) },
    );
    const onArm = line([0, yDeck, -24], [0, yDeck, -29.6], { pace: 0.75, clear: 0.6 });
    const shared = [entry, glide, spiral, onArm];
    const decisionS = new Path(shared).length - 0.05;
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

    // each dive is a fall until it levels out at the bottom
    const fallEnd = {};
    for (const [dir, e] of Object.entries(exits)) {
      let i = e.path.p.length - 1;
      while (i > 0 && e.path.p[i].y < yOut + 1) i--;
      fallEnd[dir] = e.path.s[i];
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
      drift: (s, dir) => (s > decisionS + 9 && s < (fallEnd[dir] ?? Infinity) ? 1.1 : 0),
    });
  },
};

export default abyssChunk;
