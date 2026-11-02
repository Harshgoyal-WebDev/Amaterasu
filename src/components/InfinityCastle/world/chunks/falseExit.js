import * as THREE from "three";
import { Path, catmull, line, orientAuto, smoothstep } from "../path";
import { EYE, FAR_SET, FG_SET, MID_SET, V, gateSounds, glowCard, leafCenter, scatterRing, underBridge } from "./common";

/**
 * STAGE 12 — the false exit. A corridor that narrows and darkens towards a
 * single doorway blazing with light. The doors part as you reach them and
 * the light dies as you cross: it was never outside.
 *
 *   beyond "fall"      a stub of floor that simply ends — and you fall,
 *                      gravity and all, 70 m down into the castle, onto a bridge
 *   beyond "corridor"  the corridor just carries on
 */

const DOOR_Z = -28;
const EDGE_Z = -31.6; // where the floor beyond the door ends
const FALL = 70; // m down to the landing
const LAND_Z = -60;
const LAND_END_Z = -72;

const falseExitChunk = {
  type: "falseExit",
  build(b, { beyond = "fall" } = {}) {
    const falls = beyond === "fall";
    const n = 7;
    for (let i = 0; i < n; i++) {
      const k = i / (n - 1);
      const sx = THREE.MathUtils.lerp(1, 0.66, k);
      const sy = THREE.MathUtils.lerp(1, 0.9, k);
      const lit = i < 3;
      b.place(i % 2 === 0 ? "IC04_Corridor_Straight_C" : "IC04_Corridor_Straight_A", { p: [0, 0, -4 * i], s: [sx, sy, 1] }, { lights: lit, lightPower: 0.8 - k * 0.5 });
    }
    const door = b.place("IC02_ShojiDoor_Double_Closed", { p: [0, 0, DOOR_Z], s: [0.8, 0.86, 1] }, { lights: false });
    // the light beyond the door: blinding from the corridor, gone once you're through
    const glow = glowCard(2.3, 2.6, "#ffcf96", 6);
    glow.position.set(0, 1.3, DOOR_Z - 0.5);
    const back = glowCard(3, 3.2, "#ffb36b", 2.4);
    back.position.set(0, 1.5, DOOR_Z - 0.9);
    for (const card of [glow, back]) {
      card.material.transparent = true;
      b.add(card, { bounds: false });
    }
    b.anchor(V(0, 1.7, DOOR_Z - 0.4), 3.2);
    b.anchor(V(0, 1.7, DOOR_Z + 2.5), 1.2);

    const leaves = Object.entries(door.movables).map(([key, mv]) => {
      // open = slide away from the centre
      const w = mv.extras.slide_distance ?? 1.2;
      const center = leafCenter(mv).x;
      return { key, dir: center < 0 ? -1 : 1, w, axisSign: mv.axis.x >= 0 ? 1 : -1 };
    });

    let path;
    let fallStart = Infinity;
    let fallEnd = Infinity;
    if (falls) {
      // the floor beyond the door, broken off over the void
      b.place("IC07_Bridge_Straight", { p: [0, 0, DOOR_Z - 0.3] });
      b.dress("IC20_Railing_Fragment", { p: [1.25, 0, EDGE_Z - 0.2], r: [0, 0.3, 0.25] }, { essential: true, force: true });
      b.dress("IC20_Broken_Beam", { p: [-1.1, -0.35, EDGE_Z - 0.5], r: [0.1, -0.5, -0.25] }, { essential: true, force: true });
      // the landing far below
      for (let z = LAND_Z + 8; z > LAND_END_Z + 0.1; z -= 4) b.place("IC07_Bridge_Straight_Lantern", { p: [0, -FALL, z] });
      underBridge(b, LAND_Z + 8, LAND_END_Z, -FALL);

      const y = -FALL + EYE;
      path = new Path([
        line([0, EYE, 0], [0, EYE, DOOR_Z], { pace: [1, 0.75], clear: [0.5, 0.1] }),
        line([0, EYE, DOOR_Z], [0, EYE, EDGE_Z], { pace: 0.7, clear: 0.2 }),
        catmull(
          [
            [0, EYE, EDGE_Z],
            [0, EYE - 0.3, EDGE_Z - 1.4],
            [0, -3, EDGE_Z - 3.2],
            [0, -16, EDGE_Z - 6.5],
            [0, -34, EDGE_Z - 11],
            [0, -52, EDGE_Z - 16.5],
            [0, -64, EDGE_Z - 22],
            [0, y, LAND_Z],
            [0, y, LAND_END_Z],
          ],
          { pace: [1.3, 2.4], clear: 0, orient: orientAuto({ pitchScale: 0.6, maxPitch: 1.15 }) },
        ),
      ]);
      fallStart = path.sAtZ(EDGE_Z - 0.6);
      const landIdx = path.p.findIndex((p) => p.y < y + 0.3);
      fallEnd = path.s[landIdx > 0 ? landIdx : path.p.length - 1];

      // the castle all around the drop
      b.avoid([path], 2.5);
      const c = [0, -FALL / 2, (EDGE_Z + LAND_Z) / 2];
      scatterRing(b, { center: c, radius: [9, 16], height: [-30, 30], count: 7, set: FG_SET, tilt: 0.6, faceIn: false });
      scatterRing(b, { center: c, radius: [18, 45], height: [-40, 40], count: 16, set: MID_SET, invert: 0.25, lights: true });
      scatterRing(b, { center: c, radius: [70, 140], height: [-80, 80], count: 9, set: FAR_SET, movers: 0 });
    } else {
      path = new Path([line([0, EYE, 0], [0, EYE, DOOR_Z - 1.2], { pace: [1, 0.8], clear: [0.5, 0.1] })]);
    }

    const doorSound = gateSounds();
    b.onUpdate(({ camLocal }) => {
      const open = smoothstep(DOOR_Z + 8, DOOR_Z + 2.4, camLocal.z);
      doorSound(open);
      for (const l of leaves) door.slide(l.key, l.dir * l.w * open * l.axisSign);
      const light = 1 - smoothstep(DOOR_Z + 2, DOOR_Z - 0.6, camLocal.z);
      for (const card of [glow, back]) {
        card.material.opacity = light;
        card.visible = light > 0.01;
      }
    });

    const end = path.p[path.p.length - 1];
    return b.finalize({
      type: "falseExit",
      exits: { forward: { frame: { p: V(0, end.y - EYE, end.z), q: new THREE.Quaternion() }, path } },
      region: (s) => (s < fallStart - 1 ? "exit" : s < fallEnd - 1 ? "fall" : "walkway"),
      fog: (s) => (s < fallStart - 2 ? 0.027 : 0.012),
      voidness: (s) => (s < fallStart - 2 ? 0 : 0.9),
      drift: falls ? (s) => (s > fallStart && s < fallEnd ? 1.1 : 0) : null,
    });
  },
};

export default falseExitChunk;
