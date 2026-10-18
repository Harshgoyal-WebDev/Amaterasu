import * as THREE from "three";
import { BOULDER, JOURNEY, PORTAL } from "../../config";

/**
 * The whole journey as one camera path (see JOURNEY in config.js).
 *
 *   - `curve`: Catmull-Rom through JOURNEY.path (centripetal: no overshoot),
 *     sampled by distance, so speed along it is fully controlled by `pace`.
 *   - `pace(p)`: scroll progress 0..1 → distance along the path 0..1, a
 *     monotone cubic through the JOURNEY.keys stops. Velocity is continuous
 *     everywhere (no jolts at stage borders) and zero at both ends, so the
 *     journey eases out of the hero and settles at the boulder.
 *   - Look direction: the portal centre during the hero, then straight down
 *     the path ("falling"), then the boulder — blended by distance.
 *
 * Everything here is allocated once; `sampleJourney` writes into targets.
 */

export const curve = new THREE.CatmullRomCurve3(
  JOURNEY.path.map((p) => new THREE.Vector3(...p)),
  false,
  "centripetal",
);
// fine arc-length table: the default (200) makes the speed step visibly on a 130 m path
curve.arcLengthDivisions = 4000;
curve.updateArcLengths();
const LENGTH_SAMPLES = 4000;
const lengths = curve.getLengths(LENGTH_SAMPLES);
export const pathLength = lengths[LENGTH_SAMPLES];

/** Distance fraction (0..1) of a knot of JOURNEY.path. */
export function knotS(index) {
  const t = index / (JOURNEY.path.length - 1);
  return lengths[Math.round(t * LENGTH_SAMPLES)] / pathLength;
}

/* ---------------- pace: monotone cubic (Fritsch–Carlson) ---------------- */
const xs = JOURNEY.keys.map(([p]) => p);
const ys = JOURNEY.keys.map(([, knot]) => knotS(knot));
const slopes = (() => {
  const n = xs.length;
  const d = [];
  for (let k = 0; k < n - 1; k++) d.push((ys[k + 1] - ys[k]) / (xs[k + 1] - xs[k]));
  const m = new Array(n).fill(0); // ends stay 0: ease in / ease out
  for (let k = 1; k < n - 1; k++) m[k] = d[k - 1] * d[k] <= 0 ? 0 : (d[k - 1] + d[k]) / 2;
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

/* ---------------- look direction ---------------- */
const portalFocus = new THREE.Vector3(...JOURNEY.portalFocus);
export const boulderFocus = new THREE.Vector3(...BOULDER.position).add(new THREE.Vector3(...BOULDER.focus));
const endPoint = curve.getPointAt(1);
const endTangent = curve.getTangentAt(1);
const ahead = new THREE.Vector3();
const blend = new THREE.Vector3();
const lookAheadS = JOURNEY.lookAhead / pathLength;

const smooth = (a, b, x) => {
  const t = Math.min(Math.max((x - a) / (b - a), 0), 1);
  return t * t * (3 - 2 * t);
};

// Where the look leaves the portal centre (approach) and turns to the boulder.
const sPortalFrom = knotS(JOURNEY.look.portalFrom);
const sPortalTo = knotS(JOURNEY.look.portalTo);
const sBoulderFrom = knotS(JOURNEY.look.boulderFrom);

/** Camera position + look-at at scroll progress p (0..1). Returns s. */
export function sampleJourney(p, position, target) {
  const s = pace(p);
  curve.getPointAt(s, position);
  // straight down the path; past the end, continue along the final tangent
  const sa = s + lookAheadS;
  if (sa <= 1) curve.getPointAt(sa, ahead);
  else ahead.copy(endPoint).addScaledVector(endTangent, (sa - 1) * pathLength);
  const wPortal = 1 - smooth(sPortalFrom, sPortalTo, s);
  const wBoulder = smooth(sBoulderFrom, 1, s);
  blend.copy(ahead).lerp(portalFocus, wPortal).lerp(boulderFocus, wBoulder);
  target.copy(blend);
  return s;
}

/** Scroll progress at which the camera's z first passes `z` (bisection). */
export function progressAtZ(z) {
  const v = new THREE.Vector3();
  let lo = 0;
  let hi = 1;
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
