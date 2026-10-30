import { WORLD } from "../config";

/**
 * Director — decides what comes next. The first journey follows a script
 * (the narrative milestones), then the castle generates itself: weighted
 * choices with cooldowns, room runs, periodic false exits.
 *
 * State is per lineage (stored on every node), so preview chunks on different
 * branches each continue the story correctly, and the same branch always
 * produces the same thing.
 */

export const SCRIPT = [
  { type: "prologue" }, // 01–03  gate, threshold, fall
  { type: "walkway", opts: { length: 4 } }, // 04  first suspended walkway
  { type: "corridor", opts: { segments: 6, style: "enclosed" } }, // 04–05
  { type: "junction", opts: { kind: "cross" } }, // 05/09 first choice
  { type: "corridor", opts: { segments: 5, style: "gallery" } }, // 05 shaft views
  { type: "room", opts: { repeat: 0, variant: "A" } }, // 06 the room…
  { type: "room", opts: { repeat: 1, variant: "A" } }, // …again
  { type: "room", opts: { repeat: 2, variant: "B" } },
  { type: "room", opts: { repeat: 3, variant: "A" } },
  { type: "gravity", opts: { twist: Math.PI } }, // 07
  { type: "corridor", opts: { segments: 3, style: "enclosed" } },
  { type: "abyss" }, // 08
  { type: "walkway", opts: { length: 3 } }, // 09
  { type: "stairs" }, // 09 vertical branches
  { type: "corridor", opts: { segments: 4, style: "gallery" } },
  { type: "crossroads" }, // 10 — the castle wakes up after this (11)
];

const ALIVE_AFTER = SCRIPT.findIndex((s) => s.type === "crossroads");

const POOL = [
  // type, weight, cooldown (chunks), opts factory
  ["corridor", 3, 1, (rng) => ({ segments: rng.int(3, 6), style: "enclosed" })],
  ["corridor", 2.2, 2, (rng) => ({ segments: rng.int(3, 5), style: "gallery" })],
  ["walkway", 2.2, 1, (rng) => ({ length: rng.int(2, 5) })],
  ["junction", 2.2, 2, () => ({})],
  ["stairs", 1.5, 3, () => ({})],
  ["room", 1.8, 6, () => ({ repeat: 0 })],
  ["gravity", 0.9, 8, () => ({})],
  ["abyss", 0.55, 12, () => ({})],
  ["crossroads", 0.7, 10, () => ({})],
  ["drop", 0.6, 5, () => ({})],
];

export function rootState() {
  return { index: 0, script: 0, last: {}, lastType: null, roomRun: 0, roomRepeat: 0, nextFalseExit: 0, alive: false, beyond: null };
}

/**
 * Candidates for the child of `parent` through `dir`, most wanted first,
 * each with the director state its node will carry.
 */
export function nextCandidates(parentState, rng) {
  const st = parentState;
  const index = st.index + 1;
  const base = { ...st, index, last: { ...st.last } };
  const withType = (spec) => {
    const s = { ...base, last: { ...base.last, [spec.type]: index }, lastType: spec.type };
    return { spec, state: s };
  };

  // through a false exit that only led on: the corridor carries on
  if (st.lastType === "falseExit" && st.beyond === "corridor") {
    return [withType({ type: "corridor", opts: { segments: rng.int(4, 6), style: "enclosed" } }), fallback(base)];
  }

  // scripted journey
  if (st.script + 1 < SCRIPT.length) {
    const spec = SCRIPT[st.script + 1];
    const c = withType(spec);
    c.state.script = st.script + 1;
    if (c.state.script >= ALIVE_AFTER) c.state.alive = true;
    if (c.state.script === SCRIPT.length - 1) c.state.nextFalseExit = index + rng.int(6, 9);
    return [c, fallback(base)];
  }

  // false exit when it's due: mostly the door opens onto a fall into the
  // castle, sometimes onto more corridor (the other one if the first won't fit)
  if (st.nextFalseExit && index >= st.nextFalseExit && st.lastType !== "drop") {
    const next = index + rng.int(WORLD.falseExitAfter[0], WORLD.falseExitAfter[1]);
    const variant = (beyond) => {
      const c = withType({ type: "falseExit", opts: { beyond } });
      c.state.nextFalseExit = next;
      c.state.beyond = beyond;
      return c;
    };
    const order = rng.chance(0.7) ? ["fall", "corridor"] : ["corridor", "fall"];
    return [...order.map(variant), fallback(base)];
  }

  // a run of repeating rooms
  if (st.roomRun > 0) {
    const c = withType({ type: "room", opts: { repeat: st.roomRepeat + 1 } });
    c.state.roomRun = st.roomRun - 1;
    c.state.roomRepeat = st.roomRepeat + 1;
    return [c, fallback(base)];
  }

  // procedural
  const avail = POOL.filter(([type, , cd]) => type !== st.lastType && (st.last[type] == null || index - st.last[type] > cd));
  const ordered = [];
  const pool = avail.map((e) => [e, e[1]]);
  while (pool.length && ordered.length < 3) {
    const pick = rng.weighted(pool);
    ordered.push(pick);
    pool.splice(
      pool.findIndex((p) => p[0] === pick),
      1,
    );
  }
  const cands = ordered.map(([type, , , opts]) => {
    const c = withType({ type, opts: opts(rng) });
    if (type === "room") {
      c.state.roomRun = rng.int(1, 3);
      c.state.roomRepeat = 0;
    }
    return c;
  });
  cands.push(fallback(base));
  return cands;
}

function fallback(base) {
  return { spec: { type: "drop" }, state: { ...base, last: { ...base.last, drop: base.index }, lastType: "drop", roomRun: 0 } };
}
