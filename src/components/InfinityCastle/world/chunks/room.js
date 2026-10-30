import gsap from "gsap";
import { Path, arc, line, yawQuat } from "../path";
import { emitAudio } from "../../state";
import { EYE, HALF_PI, V, YAW, doorController } from "./common";

/**
 * STAGE 06 — the room that repeats. An 8 × 8 tatami room (A or B, rotated by
 * a quarter turn now and then — the doors stay centred on every wall), entered
 * from the south. Every other wall is a way on, so the neighbouring rooms are
 * visible through open doors: the same room, again and again, with small
 * differences (lantern side, a scroll, how far a door is open).
 *
 * Once a direction is committed the other doors slide shut — and so does the
 * one behind you, unless you turn back.
 */

const WALL_ORDER = ["E", "N", "W", "S"]; // +90° yaw maps each to the next
const WALL_INFO = {
  N: { center: V(0, 0, -3.9), tangent: V(1, 0, 0) },
  S: { center: V(0, 0, 3.9), tangent: V(1, 0, 0) },
  E: { center: V(3.9, 0, 0), tangent: V(0, 0, 1) },
  W: { center: V(-3.9, 0, 0), tangent: V(0, 0, 1) },
};
const DIR_WALL = { forward: "N", right: "E", left: "W" };
const Z = V(0, 0, -1);

const roomChunk = {
  type: "room",
  build(b, opts = {}) {
    const { rng } = b;
    const repeat = opts.repeat ?? 0;
    const variant = opts.variant ?? (rng.chance(0.55) ? "A" : "B");
    const turns = repeat === 0 ? 0 : rng.int(0, 3);
    const room = b.place(`IC03_TatamiRoom_${variant}`, { p: [0, 0, -4], ry: turns * HALF_PI }, { lightPower: 1.1 });

    const doors = doorController(room, (key) => {
      const m = /^Door([NESW])_/.exec(key);
      if (!m) return null;
      const local = m[1];
      const wall = WALL_ORDER[(WALL_ORDER.indexOf(local) + turns) % 4];
      return { wall, ...WALL_INFO[local] };
    });

    // small differences between "identical" rooms
    const corner = [
      [-3.1, -7.1],
      [3.1, -7.1],
      [3.1, -0.9],
      [-3.1, -0.9],
    ][(repeat + (variant === "A" ? 0 : 2)) % 4];
    b.place("IC10_Lantern_Standing", { p: [corner[0], 0, corner[1]] }, { lightPower: 0.9 });
    if (rng.chance(0.7)) {
      const onLeft = (repeat + turns) % 2 === 0;
      b.place("IC18_Hanging_Scroll", { p: [onLeft ? -3.82 : 3.82, 0.55, -4 + rng.pick([-2.6, 2.6])], ry: onLeft ? HALF_PI : -HALF_PI }, { lights: false, bounds: false });
    }
    if (rng.chance(0.5)) b.place("IC10_Lantern_Hanging_Hex", { p: [rng.pick([-1.6, 1.6]), 3.15, -4 + rng.pick([-1.6, 1.6])] });

    // paths
    const approach = line([0, EYE, 0], [0, EYE, -2], { pace: 0.85, clear: [0.3, 0.9] });
    const decisionS = 1.9;
    const side = (dir) => [approach, arc([0, EYE, -2], Z, 2, HALF_PI, dir, { pace: 0.8, clear: 0.8 }), line([2 * dir, EYE, -4], [4 * dir, EYE, -4], { pace: 0.85, clear: [0.8, 0.3] })];
    const exits = {
      forward: { frame: { p: V(0, 0, -8), q: yawQuat(0) }, path: new Path([approach, line([0, EYE, -2], [0, EYE, -8], { pace: 0.85, clear: [0.9, 0.3] })], { decisionS }) },
      right: { frame: { p: V(4, 0, -4), q: yawQuat(YAW.right) }, path: new Path(side(1), { decisionS }) },
      left: { frame: { p: V(-4, 0, -4), q: yawQuat(YAW.left) }, path: new Path(side(-1), { decisionS }) },
    };

    // doors: entry open, exits open (by slightly different amounts)
    const amount = { S: 1, N: rng.range(0.82, 1), E: rng.range(0.82, 1), W: rng.range(0.82, 1) };
    for (const w in amount) doors.set(w, amount[w]);

    const tweens = [];
    const st = { committed: null, behindClosed: false };
    const animate = (wall, to, duration = 0.85) => {
      const o = { k: doors.get(wall) };
      tweens.push(gsap.to(o, { k: to, duration, ease: "power2.inOut", onUpdate: () => doors.set(wall, o.k) }));
    };

    b.onUpdate(({ camLocal, alive }) => {
      if (!st.committed) return;
      // the door you came through closes once you are well inside, re-opens if you turn back
      const inside = camLocal.z < -3.2 || Math.abs(camLocal.x) > 1.2;
      const wantClosed = (alive || repeat >= 1) && inside;
      if (wantClosed !== st.behindClosed) {
        st.behindClosed = wantClosed;
        if (wantClosed) emitAudio("door", 0.6);
        animate("S", wantClosed ? 0 : 1, wantClosed ? 1.1 : 0.5);
      }
    });

    return b.finalize({
      type: "room",
      exits,
      defaultDir: "forward",
      decisionS,
      region: () => "room",
      fog: 0.024,
      voidness: 0.05,
      onCommit(dir) {
        st.committed = dir;
        for (const [d, wall] of Object.entries(DIR_WALL)) {
          if (d === dir) animate(wall, 1, 0.4);
          else if (exits[d].sealed || b.alive || repeat >= 2) {
            animate(wall, 0, 0.9);
            emitAudio("door", 0.8);
          }
        }
      },
      onSeal(dir) {
        doors.set(DIR_WALL[dir], 0);
      },
      dispose: () => tweens.forEach((t) => t.kill()),
    });
  },
};

export default roomChunk;
