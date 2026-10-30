import * as THREE from "three";

/**
 * Camera paths. A path is a dense list of samples { p, q } (position at eye
 * height + camera orientation, chunk-local) with cumulative arc length, so a
 * pose is a binary search + lerp/slerp. Orientation is authored per segment
 * and stored, which keeps vertical drops, twists and look-backs stable — no
 * lookAt() degeneracies at runtime.
 *
 * Segments are sampled independently and concatenated, so branch paths that
 * share an approach segment are bit-identical up to the decision point.
 */

const _x = new THREE.Vector3();
const _y = new THREE.Vector3();
const _z = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _t = new THREE.Vector3();
const _h = new THREE.Vector3();
const _f = new THREE.Vector3();
const _u = new THREE.Vector3();
const _qa = new THREE.Quaternion();

export const UP = new THREE.Vector3(0, 1, 0);
export const SAMPLE_SPACING = 0.25; // metres between stored samples

/** Camera quaternion looking along `forward` with `up` (camera looks down its local -Z). */
export function basisQuat(forward, up, out = new THREE.Quaternion()) {
  _z.copy(forward).normalize().negate();
  _x.crossVectors(up, _z);
  if (_x.lengthSq() < 1e-8) {
    // up is parallel to the view axis: borrow any other up
    _y.set(Math.abs(_z.y) < 0.9 ? 0 : 1, Math.abs(_z.y) < 0.9 ? 1 : 0, 0);
    _x.crossVectors(_y, _z);
  }
  _x.normalize();
  _y.crossVectors(_z, _x).normalize();
  _x.crossVectors(_y, _z).normalize();
  _m.makeBasis(_x, _y, _z);
  return out.setFromRotationMatrix(_m);
}

export const yawQuat = (radians) => new THREE.Quaternion().setFromAxisAngle(UP, radians);

const smooth = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
export { smooth as smoothstep };

/**
 * Default orientation: heading follows the horizontal tangent (relative to
 * `up`), pitch follows a fraction of the slope, optional roll / yaw / pitch
 * offsets as functions of t. Stateful: vertical stretches keep the last
 * heading, so drops and rises never spin.
 */
export function orientAuto({
  up = UP,
  pitchScale = 0.55,
  maxPitch = 1.1,
  heading = null, // optional fixed heading vector (horizontal)
  roll = null,
  yaw = null,
  pitch = null,
  lookAt = null, // { target: Vector3, weight: (t) => 0..1 }
} = {}) {
  const lastHeading = new THREE.Vector3();
  let hasHeading = false;
  const upV = up.clone().normalize();
  return (t, p, tangent, out) => {
    _t.copy(tangent).normalize();
    if (heading) {
      _h.copy(typeof heading === "function" ? heading(t) : heading);
    } else {
      _h.copy(_t).addScaledVector(upV, -_t.dot(upV));
      if (_h.lengthSq() < 0.04) {
        if (hasHeading) _h.copy(lastHeading);
        else _h.set(0, 0, -1);
      }
    }
    _h.normalize();
    lastHeading.copy(_h);
    hasHeading = true;

    let pt = Math.asin(THREE.MathUtils.clamp(_t.dot(upV), -1, 1)) * pitchScale;
    pt = THREE.MathUtils.clamp(pt, -maxPitch, maxPitch);
    if (pitch) pt += pitch(t);

    let yw = yaw ? yaw(t) : 0;
    if (yw) _h.applyQuaternion(_qa.setFromAxisAngle(upV, yw));

    _f.copy(_h).multiplyScalar(Math.cos(pt)).addScaledVector(upV, Math.sin(pt));
    _u.copy(upV);

    if (lookAt) {
      const w = lookAt.weight(t);
      if (w > 0) {
        _z.copy(lookAt.target).sub(p).normalize();
        _f.lerp(_z, w).normalize();
      }
    }
    basisQuat(_f, _u, out);
    const r = roll ? roll(t) : 0;
    if (r) out.multiply(_qa.setFromAxisAngle(_z.set(0, 0, 1), r));
    return out;
  };
}

/** Orientation with a moving up vector (gravity twist). upFn(t) → Vector3. */
export function orientUp(upFn) {
  return (t, p, tangent, out) => basisQuat(tangent, upFn(t), out);
}

/**
 * Sample one segment. posFn(t) → Vector3 for t in [0,1]. `pace` = number or
 * [start, end] scroll-speed multiplier; `clear` = lateral clearance (m).
 */
export function segment(posFn, { orient = orientAuto(), pace = 1, clear = 0.5, length } = {}) {
  // estimate length for sample count
  let est = length;
  if (!est) {
    est = 0;
    const a = new THREE.Vector3();
    const b = new THREE.Vector3();
    a.copy(posFn(0));
    for (let i = 1; i <= 32; i++) {
      b.copy(posFn(i / 32));
      est += a.distanceTo(b);
      a.copy(b);
    }
  }
  const n = Math.max(2, Math.ceil(est / SAMPLE_SPACING));
  const samples = [];
  const tan = new THREE.Vector3();
  const eps = 1 / (n * 4);
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const p = posFn(t).clone();
    const t0 = Math.max(0, t - eps);
    const t1 = Math.min(1, t + eps);
    tan.copy(posFn(t1)).sub(posFn(t0));
    if (tan.lengthSq() < 1e-12) tan.set(0, 0, -1);
    const q = orient(t, p, tan, new THREE.Quaternion());
    samples.push({ p, q, t });
  }
  const [p0, p1] = Array.isArray(pace) ? pace : [pace, pace];
  const [c0, c1] = Array.isArray(clear) ? clear : [clear, clear];
  return { samples, pace: [p0, p1], clear: [c0, c1] };
}

const v = (a) => (a.isVector3 ? a.clone() : new THREE.Vector3(...a));

export function line(a, b, opts) {
  const A = v(a);
  const B = v(b);
  const P = new THREE.Vector3();
  return segment((t) => P.lerpVectors(A, B, t), { length: A.distanceTo(B), ...opts });
}

export function bezier(a, c1, c2, b, opts) {
  const curve = new THREE.CubicBezierCurve3(v(a), v(c1), v(c2), v(b));
  const P = new THREE.Vector3();
  return segment((t) => curve.getPointAt(t, P), { length: curve.getLength(), ...opts });
}

export function catmull(points, opts) {
  const curve = new THREE.CatmullRomCurve3(points.map(v), false, "centripetal");
  const P = new THREE.Vector3();
  return segment((t) => curve.getPointAt(t, P), { length: curve.getLength(), ...opts });
}

/** Horizontal arc from `start` heading `heading` (unit XZ vector), turning `dir` (+1 right / -1 left). */
export function arc(start, heading, radius, angle, dir, opts) {
  const S = v(start);
  const H = v(heading).normalize();
  const R = new THREE.Vector3(-H.z, 0, H.x); // right of heading
  const C = S.clone().addScaledVector(R, radius * dir);
  const a0 = Math.atan2(S.z - C.z, S.x - C.x);
  const P = new THREE.Vector3();
  return segment(
    (t) => {
      const a = a0 + angle * t * dir;
      return P.set(C.x + Math.cos(a) * radius, S.y, C.z + Math.sin(a) * radius);
    },
    { length: radius * angle, ...opts },
  );
}

export class Path {
  constructor(segments, { decisionS = 0, tags = {} } = {}) {
    const p = [];
    const q = [];
    const s = [];
    const pace = [];
    const clear = [];
    let acc = 0;
    for (const seg of segments) {
      const n = seg.samples.length;
      for (let i = 0; i < n; i++) {
        const sm = seg.samples[i];
        if (p.length && i === 0) {
          // join: skip duplicate first sample if it coincides
          if (sm.p.distanceToSquared(p[p.length - 1]) < 1e-6) {
            q[q.length - 1] = sm.q;
            continue;
          }
        }
        if (p.length) acc += sm.p.distanceTo(p[p.length - 1]);
        p.push(sm.p);
        q.push(sm.q);
        s.push(acc);
        pace.push(THREE.MathUtils.lerp(seg.pace[0], seg.pace[1], sm.t));
        clear.push(THREE.MathUtils.lerp(seg.clear[0], seg.clear[1], sm.t));
      }
    }
    this.p = p;
    this.q = q;
    this.s = s;
    this.paceArr = pace;
    this.clearArr = clear;
    this.length = acc;
    this.decisionS = decisionS;
    this.tags = tags;
  }

  index(s) {
    const arr = this.s;
    if (s <= 0) return [0, 0];
    if (s >= this.length) return [arr.length - 2, 1];
    let lo = 0;
    let hi = arr.length - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (arr[mid] <= s) lo = mid;
      else hi = mid;
    }
    const span = arr[lo + 1] - arr[lo];
    return [lo, span > 0 ? (s - arr[lo]) / span : 0];
  }

  at(s, outP, outQ) {
    const [i, f] = this.index(s);
    if (outP) outP.lerpVectors(this.p[i], this.p[i + 1], f);
    if (outQ) outQ.slerpQuaternions(this.q[i], this.q[i + 1], f);
  }

  pace(s) {
    const [i, f] = this.index(s);
    return THREE.MathUtils.lerp(this.paceArr[i], this.paceArr[i + 1], f);
  }

  clear(s) {
    const [i, f] = this.index(s);
    return THREE.MathUtils.lerp(this.clearArr[i], this.clearArr[i + 1], f);
  }

  /** s of the sample closest to a local point (for authored events). */
  sAtZ(z) {
    let best = 0;
    let bd = Infinity;
    for (let i = 0; i < this.p.length; i++) {
      const d = Math.abs(this.p[i].z - z);
      if (d < bd) {
        bd = d;
        best = this.s[i];
      }
    }
    return best;
  }
}

/** Exit frame { p, q } from a floor position + heading yaw (+ optional roll quaternion). */
export function exitFrame(p, yawRad = 0, extra = null) {
  const q = yawQuat(yawRad);
  if (extra) q.multiply(extra);
  return { p: v(p), q };
}
