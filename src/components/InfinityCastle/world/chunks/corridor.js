import * as THREE from "three";
import gsap from "gsap";
import { Path, line } from "../path";
import { emitAudio } from "../../state";
import { EYE, FAR_SET, HALF_PI, MID_SET, V, scatterAlong } from "./common";

/**
 * STAGES 04–05 — corridors. "enclosed": shoji walls both sides (A / C mix),
 * some leaves slid open onto the void, now and then one gallery bay that
 * opens onto a shaft. "gallery": the B module (open on one side, mirrored
 * for the other) with the abyss beside it.
 *
 * Alive castle: a wall leaf ahead slides shut / open as you approach.
 */
const corridorChunk = {
  type: "corridor",
  build(b, opts = {}) {
    const { rng } = b;
    const style = opts.style ?? "enclosed";
    const n = opts.segments ?? rng.int(4, 7);
    const L = n * 4;
    const gallerySide = rng.sign(); // +1 open right, -1 open left (mirrored)
    const shaftBay = style === "enclosed" && n >= 5 && rng.chance(0.6) ? rng.int(1, n - 2) : -1;
    const shaftSide = rng.sign();
    const path = new Path([line([0, EYE, 0], [0, EYE, -L], { pace: 1, clear: 0.5 })]);

    const leaves = [];
    let leafTween = null;
    for (let i = 0; i < n; i++) {
      const z = -4 * i;
      let name;
      let side = 1;
      if (style === "gallery") {
        name = rng.chance(0.85) ? "IC04_Corridor_Straight_B" : "IC04_Corridor_Straight_A";
        side = gallerySide;
      } else if (i === shaftBay) {
        name = "IC04_Corridor_Straight_B";
        side = shaftSide;
      } else {
        name = rng.weighted([
          ["IC04_Corridor_Straight_A", 3],
          ["IC04_Corridor_Straight_C", 2],
        ]);
      }
      const inst = b.place(name, { p: [0, 0, z], s: [side, 1, 1] });
      Object.keys(inst.movables).forEach((key, k) => {
        const dir = k % 2 ? 1 : -1;
        const open = rng.chance(0.2) ? rng.range(0.5, 1) : 0;
        if (open) inst.slide(key, dir * 0.95 * open);
        leaves.push({ inst, key, dir, open, z });
      });
      if (rng.chance(0.18)) {
        const s = rng.sign();
        b.place("IC18_Banner_Hanging", { p: [s * 1.42, 0.35, z - 2], ry: s * -HALF_PI }, { lights: false, bounds: false });
      }
    }

    b.avoid([path], 1.2);
    if (style === "gallery") {
      const side = gallerySide > 0 ? "right" : "left";
      scatterAlong(b, { z: [10, -L - 10], side, dist: [7, 40], height: [-34, 20], count: Math.ceil(n * 2.6), set: MID_SET, lights: true });
      scatterAlong(b, { z: [30, -L - 30], side, dist: [45, 90], height: [-50, 50], count: 3, set: FAR_SET, movers: 0 });
    } else {
      // glimpses through open leaves
      scatterAlong(b, { z: [4, -L - 4], dist: [6, 26], height: [-10, 10], count: n, set: MID_SET, invert: 0.25 });
      if (shaftBay >= 0) {
        const zc = -4 * shaftBay - 2;
        scatterAlong(b, { z: [zc + 14, zc - 14], side: shaftSide > 0 ? "right" : "left", dist: [8, 36], height: [-60, 30], count: 9, set: MID_SET, lights: true });
      }
    }

    // stage 11: one leaf ahead moves on its own as you approach
    if (b.alive && leaves.length) {
      const target = leaves[rng.int(Math.floor(leaves.length / 2), leaves.length - 1)];
      const st = { k: target.open };
      let done = false;
      b.onUpdate(({ camLocal }) => {
        if (done || camLocal.z > target.z + 9 || camLocal.z < target.z) return;
        done = true;
        emitAudio("door", 0.9);
        leafTween = gsap.to(st, {
          k: target.open > 0.3 ? 0 : 1,
          duration: 0.9,
          ease: "power2.inOut",
          onUpdate: () => target.inst.slide(target.key, target.dir * 0.95 * st.k),
        });
      });
    }

    return b.finalize({
      type: "corridor",
      exits: { forward: { frame: { p: V(0, 0, -L), q: new THREE.Quaternion() }, path } },
      region: () => (style === "gallery" ? "gallery" : "corridor"),
      fog: style === "gallery" ? 0.017 : 0.022,
      voidness: style === "gallery" ? 0.6 : 0.15,
      dispose: () => leafTween?.kill(),
    });
  },
};

export default corridorChunk;
