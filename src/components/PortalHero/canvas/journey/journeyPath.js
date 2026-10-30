import * as THREE from "three";
import { BOULDER, JOURNEY, PORTAL } from "../../config";

/**
 * The whole journey as one camera path (see JOURNEY in config.js).
 *
 *   - `curve`: Catmull-Rom (centripetal: no overshoot) through the hero knots
 *     and a generated tube past the portal: level out of the portal, a smooth
 *     tip-over (pitch eases in and out) into a straight dive with a slight
 *     sway, a smooth level-out facing the boulder, then on down past it.
 *   - `pace(p)`: scroll progress 0..1 → distance along the path 0..1, a
 *     monotone cubic through the JOURNEY.keys markers. Velocity is continuous
 *     everywhere; it is zero at both ends and at rest markers (the boulder).
 *   - Look: the portal centre during the hero, then down the tube, then the
 *     boulder, then down the tube again — blended by distance.
 *   - Roll: the camera leans gently into each sway of the dive (VOID.bank).
 *   - `boulderPose`: where the tube puts the boulder (facing the camera).
 *
 * Everything here is allocated once; `sampleJourney` writes into targets.
 */

const T = JOURNEY.tube;
const DEG = Math.PI / 180;
const smooth = (a, b, x) => {
  const t = Math.min(Math.max((x - a) / (b - a), 0), 1);
  return t * t * (3 - 2 * t);
};

/* ---------------- the tube: straight, tip over, dive, level out ---------------- */
// distances (m) along the tube where each phase starts
const D = {};
D.tip1 = T.lead;
D.dive1 = D.tip1 + T.tipOver;
D.level1 = D.dive1 + T.fall;
D.glide = D.level1 + T.tipOver;
D.stop = D.glide + T.glide;
D.boulder = D.stop + T.boulderDistance;
D.tip2 = D.boulder + T.past;
D.dive2 = D.tip2 + T.tipOver;
D.end = D.dive2 + T.after;

/** Dive weight 0 (level) … 1 (full dive) at distance d: eased in and out. */
const diving = (d) => smooth(D.tip1, D.dive1, d) * (1 - smooth(D.level1, D.glide, d)) + smooth(D.tip2, D.dive2, d);
/** Sway weight: only on the straight dives. */
const swaying = (d) =>
  smooth(D.dive1 - 6, D.dive1 + 10, d) * (1 - smooth(D.level1 - 14, D.level1, d)) + smooth(D.dive2 - 6, D.dive2 + 10, d);
const swayPhase = (d) => (2 * Math.PI * (d - D.dive1)) / T.swayLength;

const STEP = 0.05; // m, integration step
const spine = [];
{
  let y = 0;
  let z = 0;
  for (let d = 0; d <= D.end + STEP; d += STEP) {
    spine.push([y, z]);
    const pitch = T.dive * DEG * diving(d);
    y -= Math.sin(pitch) * STEP;
    z -= Math.cos(pitch) * STEP;
  }
}
const [sx, sy, sz] = T.start;
/** Point on the tube at distance d. */
function tubePoint(d, out = new THREE.Vector3()) {
  const [y, z] = spine[Math.min(spine.length - 1, Math.round(d / STEP))];
  return out.set(sx + T.sway * swaying(d) * Math.sin(swayPhase(d)), sy + y, sz + z);
}

// knots: hero → tube (dense; an exact knot at the stop, so it is precise)
const knots = JOURNEY.path.map((p) => new THREE.Vector3(...p));
const markerKnot = { start: 0, heroEnd: 1, portalFront: 3, portal: 4 };
markerKnot.voidStart = knots.length;
const KNOT_STEP = 2; // m
const toStop = Math.round(D.stop / KNOT_STEP);
for (let i = 0; i <= toStop; i++) knots.push(tubePoint((D.stop * i) / toStop));
markerKnot.stop = knots.length - 1;
const afterSteps = Math.round((D.end - D.stop) / KNOT_STEP);
for (let i = 1; i <= afterSteps; i++) knots.push(tubePoint(D.stop + ((D.end - D.stop) * i) / afterSteps));
markerKnot.end = knots.length - 1;

export const curve = new THREE.CatmullRomCurve3(knots, false, "centripetal");
// fine arc-length table: the default (200) makes the speed step visibly on a long path
curve.arcLengthDivisions = 8000;
curve.updateArcLengths();
const LENGTH_SAMPLES = 8000;
const lengths = curve.getLengths(LENGTH_SAMPLES);
export const pathLength = lengths[LENGTH_SAMPLES];

/** Distance fraction (0..1) of a knot. */
function knotS(index) {
  const t = index / (knots.length - 1);
  return lengths[Math.round(t * LENGTH_SAMPLES)] / pathLength;
}
const metres = (m) => m / pathLength;

/** Named distance fractions along the path. */
export const marks = {
  start: 0,
  heroEnd: knotS(markerKnot.heroEnd),
  portalFront: knotS(markerKnot.portalFront),
  portal: knotS(markerKnot.portal),
  voidStart: knotS(markerKnot.voidStart),
  stop: knotS(markerKnot.stop),
  end: 1,
};
marks.emerge = marks.stop - metres(20);
const tubeStartS = marks.voidStart;
/** Tube distance (m) of a path fraction s (past the portal). */
const tubeDistance = (s) => (s - tubeStartS) * pathLength;

/* ---------------- the boulder, placed by the tube ---------------- */
// level there, heading -z: its front (+Z) faces straight back at the camera
const boulderCentre = tubePoint(D.boulder);
const quaternion = new THREE.Quaternion();
const focusLocal = new THREE.Vector3(...BOULDER.focus);
const position = boulderCentre.clone().sub(focusLocal);
export const boulderPose = {
  position,
  quaternion,
  rotationY: 0,
  matrix: new THREE.Matrix4().compose(position, quaternion, new THREE.Vector3(1, 1, 1)),
  /** World point of a boulder-local point. */
  toWorld: (local, out = new THREE.Vector3()) => out.copy(local).applyQuaternion(quaternion).add(position),
};
boulderPose.inverse = boulderPose.matrix.clone().invert();
export const boulderFocus = boulderPose.toWorld(focusLocal);

/* ---------------- pace: monotone cubic (Fritsch–Carlson) ---------------- */
const xs = JOURNEY.keys.map(([p]) => p);
const ys = JOURNEY.keys.map(([, m]) => marks[m]);
const rests = JOURNEY.keys.map(([, , rest]) => !!rest);
const slopes = (() => {
  const n = xs.length;
  const d = [];
  for (let k = 0; k < n - 1; k++) d.push((ys[k + 1] - ys[k]) / (xs[k + 1] - xs[k]));
  const m = new Array(n).fill(0); // ends stay 0: ease in / ease out
  for (let k = 1; k < n - 1; k++) m[k] = rests[k] || d[k - 1] * d[k] <= 0 ? 0 : (d[k - 1] + d[k]) / 2;
  for (let k = 0; k < n - 1; k++) {
    if (d[k] === 0) {
      m[k] = m[k + 1] = 0;
      continue;
    }
    const a = m[k] / d[k];
    const b = m[k + 1] / d[k];
    const h = a * a + b * b;
    if (h > 9) {
      const tau = 3 / Math.sqrt(h);
      m[k] = tau * a * d[k];
      m[k + 1] = tau * b * d[k];
    }
  }
  return m;
})();

export function pace(p) {
  if (p <= xs[0]) return ys[0];
  const last = xs.length - 1;
  if (p >= xs[last]) return ys[last];
  let k = 0;
  while (p > xs[k + 1]) k++;
  const h = xs[k + 1] - xs[k];
  const t = (p - xs[k]) / h;
  const t2 = t * t;
  const t3 = t2 * t;
  return (
    (2 * t3 - 3 * t2 + 1) * ys[k] + (t3 - 2 * t2 + t) * h * slopes[k] + (-2 * t3 + 3 * t2) * ys[k + 1] + (t3 - t2) * h * slopes[k + 1]
  );
}

/** Scroll progress of a marker. */
export const progressOf = (marker) => JOURNEY.keys.find(([, m]) => m === marker)[0];

/* ---------------- look + roll ---------------- */
const portalFocus = new THREE.Vector3(...JOURNEY.portalFocus);
const endPoint = curve.getPointAt(1);
const endTangent = curve.getTangentAt(1);
const ahead = new THREE.Vector3();
const lookAheadS = metres(JOURNEY.lookAhead);

/** Camera position + look-at at scroll progress p. Returns { s, bank } (bank -1..1). */
const out = { s: 0, bank: 0 };
export function sampleJourney(p, position, target) {
  const s = pace(p);
  curve.getPointAt(s, position);
  // down the tube; past the end, continue along the final tangent
  const sa = s + lookAheadS;
  if (sa <= 1) curve.getPointAt(sa, ahead);
  else ahead.copy(endPoint).addScaledVector(endTangent, (sa - 1) * pathLength);
  const wPortal = 1 - smooth(marks.heroEnd, marks.portal, s);
  // (fades out before the camera reaches where the boulder stood, 6.65 m on)
  const wBoulder = smooth(marks.stop - metres(24), marks.stop - metres(2), s) * (1 - smooth(marks.stop + metres(0.3), marks.stop + metres(4), s));
  target.copy(ahead).lerp(portalFocus, wPortal).lerp(boulderFocus, wBoulder);
  // lean into each sway of the dive (signed: -1 … 1)
  out.s = s;
  const d = tubeDistance(s);
  out.bank = d > 0 ? -swaying(d) * Math.sin(swayPhase(d)) : 0;
  return out;
}

/** Scroll progress at which the camera's z first passes `z` (hero → portal part only). */
export function progressAtZ(z) {
  const v = new THREE.Vector3();
  let lo = 0;
  let hi = progressOf("voidStart") + 0.02;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    curve.getPointAt(pace(mid), v);
    if (v.z > z) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

/** Progress where the camera is inside the portal rim (crossing peak). */
export const crossingProgress = progressAtZ((PORTAL.faces.rim + PORTAL.faces.rim - PORTAL.rimDepth) / 2);

