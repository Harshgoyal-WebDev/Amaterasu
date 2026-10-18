/**
 * GLSL for the particle system.
 *
 * Simulation (GPUComputationRenderer, one texel per particle):
 *   tVelocity  += fluid flow at the particle's screen position
 *                 − spring back to rest + gentle noise wander, then damped
 *   tOffset    += velocity·dt   (w channel = "stir" energy, for glow)
 *
 * Rendering reads tOffset, so nodes, dust and the threads between nodes all
 * move together — threads stretch, thin and let go when pulled too far.
 */

/** Ashima / Stefan Gustavson 3D simplex noise (MIT). */
export const simplexNoise = /* glsl */ `
vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 permute(vec4 x) { return mod289(((x * 34.0) + 1.0) * x); }
vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }
float snoise(vec3 v) {
  const vec2 C = vec2(1.0 / 6.0, 1.0 / 3.0);
  const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
  vec3 i = floor(v + dot(v, C.yyy));
  vec3 x0 = v - i + dot(i, C.xxx);
  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min(g.xyz, l.zxy);
  vec3 i2 = max(g.xyz, l.zxy);
  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + C.yyy;
  vec3 x3 = x0 - D.yyy;
  i = mod289(i);
  vec4 p = permute(permute(permute(
            i.z + vec4(0.0, i1.z, i2.z, 1.0))
          + i.y + vec4(0.0, i1.y, i2.y, 1.0))
          + i.x + vec4(0.0, i1.x, i2.x, 1.0));
  float n_ = 0.142857142857;
  vec3 ns = n_ * D.wyz - D.xzx;
  vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_);
  vec4 x = x_ * ns.x + ns.yyyy;
  vec4 y = y_ * ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);
  vec4 b0 = vec4(x.xy, y.xy);
  vec4 b1 = vec4(x.zw, y.zw);
  vec4 s0 = floor(b0) * 2.0 + 1.0;
  vec4 s1 = floor(b1) * 2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));
  vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
  vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
  vec3 p0 = vec3(a0.xy, h.x);
  vec3 p1 = vec3(a0.zw, h.y);
  vec3 p2 = vec3(a1.xy, h.z);
  vec3 p3 = vec3(a1.zw, h.w);
  vec4 norm = taylorInvSqrt(vec4(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));
  p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
  vec4 m = max(0.6 - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.0);
  m = m * m;
  return 42.0 * dot(m * m, vec4(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3)));
}
`;

/* ------------------------------------------------------------------ */
/* Simulation                                                         */
/* ------------------------------------------------------------------ */

export const simVelocity = /* glsl */ `
uniform sampler2D tRest;     // xyz rest position, w kind (0 web, 1 dust, -1 unused)
uniform sampler2D tParams;   // x seed, y spring scale, z wander scale, w fluid response
uniform sampler2D tFluid;    // fluid velocity (sim texels / s)
uniform vec2  uFluidTexel;
uniform mat4  uViewProj;
uniform vec3  uCamRight;
uniform vec3  uCamUp;
uniform float uViewHeight;   // 2·tan(fov/2)
uniform float uAspect;
uniform float uDt;
uniform float uTime;
uniform float uFluidForce;
uniform float uNodeSpring;
uniform float uDustSpring;
uniform float uDrag;
uniform float uWander;
uniform float uMotion;       // global multiplier (scroll-ready)
uniform float uMaxOffset;
${simplexNoise}
void main() {
  vec2 uv = gl_FragCoord.xy / resolution.xy;
  vec4 rest = texture2D(tRest, uv);
  if (rest.w < -0.5) { gl_FragColor = vec4(0.0); return; }
  vec4 prm = texture2D(tParams, uv);
  vec3 off = texture2D(tOffset, uv).xyz;
  vec3 vel = texture2D(tVelocity, uv).xyz;
  vec3 p = rest.xyz + off;

  vec3 force = vec3(0.0);
  // carried by the fluid: screen-space flow → world velocity at this depth
  vec4 clip = uViewProj * vec4(p, 1.0);
  if (clip.w > 0.2) {
    vec2 suv = clip.xy / clip.w * 0.5 + 0.5;
    vec2 edge = smoothstep(0.0, 0.03, suv) * smoothstep(1.0, 0.97, suv);
    vec2 fv = texture2D(tFluid, suv).xy * uFluidTexel;
    float h = uViewHeight * clip.w;
    vec3 flow = uCamRight * (fv.x * h * uAspect) + uCamUp * (fv.y * h);
    force += flow * uFluidForce * prm.w * edge.x * edge.y;
  }
  // spring back to rest (dust much looser than the web)
  force -= off * mix(uNodeSpring, uDustSpring, rest.w) * prm.y;
  // slow wander so nothing is ever static
  float t = uTime * 0.12;
  vec3 q = rest.xyz * 0.45 + prm.x * 13.0;
  force += vec3(snoise(q + vec3(t, 0.0, 0.0)), snoise(q + vec3(0.0, t, 17.0)), snoise(q + vec3(31.0, 0.0, t))) * uWander * prm.z;

  vel += force * uMotion * uDt;
  vel *= exp(-uDrag * uDt);
  // at the offset limit, drop the outward push so nothing builds up against
  // the cap (it would otherwise release as a jolt)
  float ol = length(off);
  if (ol > uMaxOffset * 0.98) {
    vec3 n = off / ol;
    vel -= n * max(dot(vel, n), 0.0);
  }
  gl_FragColor = vec4(vel, 0.0);
}
`;

export const simOffset = /* glsl */ `
uniform float uDt;
uniform float uMaxOffset;
void main() {
  vec2 uv = gl_FragCoord.xy / resolution.xy;
  vec4 o = texture2D(tOffset, uv);
  vec3 v = texture2D(tVelocity, uv).xyz;
  vec3 off = o.xyz + v * uDt;
  float l = length(off);
  if (l > uMaxOffset) off *= uMaxOffset / l;
  // stir energy: jumps with speed, fades over ~1 s
  float stir = max(o.w * exp(-uDt * 1.4), min(length(v) * 0.5, 2.0));
  gl_FragColor = vec4(off, stir);
}
`;

/* ------------------------------------------------------------------ */
/* Rendering                                                          */
/* ------------------------------------------------------------------ */

const palette = /* glsl */ `
uniform vec3 uColorDeep;
uniform vec3 uColorMid;
uniform vec3 uColorBright;
uniform vec3 uColorHot;
vec3 tone(float t) {
  if (t < 0.5) return mix(uColorDeep, uColorMid, t * 2.0);
  if (t < 0.85) return mix(uColorMid, uColorBright, (t - 0.5) / 0.35);
  return mix(uColorBright, uColorHot, (t - 0.85) / 0.15);
}
`;

export const pointVertex = /* glsl */ `
uniform sampler2D tOffset;
uniform sampler2D tDye;
uniform float uSmokeTint;
uniform float uReflectionPass;
uniform float uViewportHeight;
uniform float uTime;
uniform float uIntensity;
uniform float uNodeGain;
uniform float uDustGain;
uniform float uStirGlow;
uniform float uAwaken;
uniform float uTwinkle;
uniform float uNodeSize;
uniform float uDustSize;
${palette}
attribute vec2  aRef;
attribute float aKind;
attribute float aSeed;
attribute float aSize;
attribute float aTone;
attribute float aGlow;
attribute float aPhase;
attribute float aFade;
varying vec3  vColor;
varying float vBright;
varying float vKind;
varying float vRing;
void main() {
  vec4 o = texture2D(tOffset, aRef);
  vec4 mv = modelViewMatrix * vec4(position + o.xyz, 1.0);
  gl_Position = projectionMatrix * mv;
  float stir = o.w;

  float wave = mix(0.62 + 0.38 * sin(aPhase * 9.0 - uTime * 0.9 + aSeed * 2.0), 1.0, aKind);
  // slow, shallow twinkle (uTwinkle = depth of the dip, 0 = steady)
  float twinkle = 1.0 - uTwinkle * (0.5 - 0.5 * sin(uTime * (0.5 + aSeed * 0.8) + aSeed * 40.0));
  vBright = (aGlow * wave * twinkle + stir * uStirGlow) * aFade * mix(uNodeGain, uDustGain, aKind) * uIntensity;
  vBright *= 1.0 + uAwaken * 0.35 * (1.0 - aKind); // web nodes only; dust stays sparse

  vec3 col = tone(aTone);
  if (uReflectionPass < 0.5) {
    // light up a little as the liquid trail passes over
    vec2 suv = gl_Position.xy / gl_Position.w * 0.5 + 0.5;
    col += uColorBright * texture2D(tDye, suv).r * uSmokeTint;
  }
  vColor = mix(col, uColorHot, clamp(stir * 0.15, 0.0, 0.35));

  float px = aSize * mix(uNodeSize, uDustSize, aKind) * (1.0 + stir * 0.2) * projectionMatrix[1][1] * uViewportHeight * 0.5 / -mv.z;
  // capped: particles bunching up in a trail would otherwise overdraw heavily
  gl_PointSize = clamp(px, 1.0, 28.0);
  vBright *= clamp(px / 1.5, 0.25, 1.0);
  vKind = aKind;
  vRing = aKind * step(0.72, fract(aSeed * 7.13));
}
`;

export const pointFragment = /* glsl */ `
varying vec3  vColor;
varying float vBright;
varying float vKind;
varying float vRing;
void main() {
  vec2 c = gl_PointCoord * 2.0 - 1.0;
  float d = dot(c, c);
  if (d > 1.0) discard;
  // web nodes: hot core + halo; dust: soft bokeh disc, some with a bright rim
  float node = exp(-d * 10.0) + exp(-d * 3.2) * 0.32;
  float dust = smoothstep(1.0, 0.7, d) * 0.5 + vRing * smoothstep(0.5, 0.82, d) * smoothstep(1.0, 0.86, d) * 0.9;
  gl_FragColor = vec4(vColor * mix(node, dust, vKind) * vBright, 1.0);
}
`;

export const threadVertex = /* glsl */ `
uniform sampler2D tOffset;
uniform float uViewportHeight;
uniform vec2  uResolution;
uniform float uTime;
uniform float uWidth;
uniform float uBend;
uniform float uCurve;
uniform float uConnectDistance;
uniform float uIntensity;
uniform float uGain;
uniform float uStirGlow;
uniform float uMotion;
uniform float uAwaken;
uniform float uPulse;
${simplexNoise}
attribute float aT;
attribute float aSide;
attribute vec3  iA;
attribute vec3  iB;
attribute vec2  iRefA;
attribute vec2  iRefB;
attribute vec3  iRand;   // x: width, y: speed, z: energy-carrier flag
attribute vec2  iPhase;
attribute vec2  iFade;
varying float vSide;
varying float vBright;
varying float vHot;

// arc (one hump) + S-bend (two humps), both zero at the nodes
vec3 curve(vec3 A, vec3 B, vec3 arc, vec3 sbend, float t) {
  return mix(A, B, t) + arc * sin(3.14159265 * t) + sbend * sin(6.2831853 * t);
}

void main() {
  vec4 oA = texture2D(tOffset, iRefA);
  vec4 oB = texture2D(tOffset, iRefB);
  vec3 A = iA + oA.xyz;
  vec3 B = iB + oB.xyz;
  vec3 AB = B - A;
  float len = length(AB);
  float stir = max(oA.w, oB.w);

  // two directions across the thread
  vec3 s1 = normalize(cross(AB, vec3(0.13, 0.97, 0.21)) + 1e-5);
  vec3 s2 = normalize(cross(AB, s1) + 1e-5);

  // resting shape: every thread has its own gentle arc in a random direction,
  // ~40% also a soft S-bend — organic, never ruler-straight
  float h1 = fract(iRand.x * 13.71 + iRand.y * 7.13);
  float h2 = fract(iRand.y * 11.37 + iRand.z * 5.31);
  float ang = h1 * 6.2831853;
  vec3 side = s1 * cos(ang) + s2 * sin(ang);
  vec3 arc = side * len * uCurve * (0.45 + 0.75 * h2);
  vec3 sbend = (s2 * cos(ang) - s1 * sin(ang)) * len * uCurve * 0.45 * step(0.6, h2);

  // slow undulation; swings wider while the fluid is stirring it
  // (noise only evaluated when there is any bend to apply)
  float bendAmt = (uBend + stir * 0.12) * uMotion;
  if (bendAmt > 1e-4) {
    float w1 = snoise(vec3(iRand.x * 23.0, uTime * 0.35, iRand.y * 7.0));
    float w2 = snoise(vec3(iRand.y * 19.0, uTime * 0.31 + 5.0, iRand.x * 3.0));
    arc += (s1 * w1 + s2 * w2) * len * bendAmt;
  }

  float t = aT;
  vec3 P  = curve(A, B, arc, sbend, t);
  vec3 P0 = curve(A, B, arc, sbend, max(t - 0.03, 0.0));
  vec3 P1 = curve(A, B, arc, sbend, min(t + 0.03, 1.0));
  mat4 mvp = projectionMatrix * modelViewMatrix;
  vec4 c  = mvp * vec4(P, 1.0);
  vec4 c0 = mvp * vec4(P0, 1.0);
  vec4 c1 = mvp * vec4(P1, 1.0);
  vec2 dir = normalize((c1.xy / c1.w - c0.xy / c0.w) * uResolution + 1e-5);
  vec2 nrm = vec2(-dir.y, dir.x);

  // gooey: swells into the nodes, pinches mid-way, thins as it is stretched
  float goo = pow(abs(2.0 * t - 1.0), 3.0);
  float stretch = clamp(uConnectDistance / max(len, 1e-3), 0.3, 1.0);
  // mostly fine threads, a few thick ones
  float worldW = uWidth * (0.4 + iRand.x * iRand.x * 1.6) * mix(0.45 * stretch, 1.6, goo);
  float px = worldW * projectionMatrix[1][1] * uViewportHeight * 0.5 / c.w;
  float drawPx = max(px, 0.9);
  c.xy += nrm * aSide * drawPx / uResolution * c.w;
  gl_Position = c;

  float wave = 0.55 + 0.45 * sin(mix(iPhase.x, iPhase.y, t) * 9.0 - uTime * 0.9);
  // ~8% of threads carry a soft, slow travelling pulse; awakening adds a few
  float carrier = step(0.92 - uAwaken * 0.05, iRand.z);
  float head = fract(uTime * (0.1 + iRand.y * 0.15) + iRand.x * 7.0);
  float travel = carrier * exp(-pow((t - head) / 0.14, 2.0)) * 2.4 * uPulse * (1.0 + uAwaken * 0.4);
  // pulled past ~2× its length the link lets go (and re-forms as it relaxes)
  float keep = 1.0 - smoothstep(uConnectDistance * 1.2, uConnectDistance * 2.4, len);
  float tone = 0.55 + 0.9 * fract(iRand.x * 7.31 + iRand.z * 3.17); // per-thread brightness
  vBright = (0.6 * wave * tone + travel + stir * uStirGlow * 0.8) * keep * mix(iFade.x, iFade.y, t) * uIntensity * uGain;
  vBright *= clamp(px / drawPx, 0.2, 1.0);
  vHot = clamp(travel * 0.4 + stir * 0.35, 0.0, 1.0);
  vSide = aSide;
}
`;

export const threadFragment = /* glsl */ `
uniform vec3 uColorDeep;
uniform vec3 uColorMid;
uniform vec3 uColorHot;
varying float vSide;
varying float vBright;
varying float vHot;
void main() {
  float a = 1.0 - vSide * vSide;
  a *= a;
  vec3 col = mix(uColorDeep, uColorMid, clamp(vBright * 0.45, 0.0, 1.0));
  col = mix(col, uColorHot, vHot * 0.65);
  gl_FragColor = vec4(col * vBright * a, 1.0);
}
`;

