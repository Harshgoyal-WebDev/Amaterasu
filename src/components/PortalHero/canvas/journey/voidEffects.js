import * as THREE from "three";
import { TUNNEL, VOID } from "../../config";
import { getNoiseTexture } from "../noiseTexture";
import { curve, knotS } from "./journeyPath";

/**
 * The look of the void past the portal: smoke banks and the nebula backdrop
 * (rocks + dust live in Tunnel.jsx). One draw call each.
 * Every look value is read live from VOID (Leva "Tunnel" panel).
 *
 * `voidUniforms` is shared by every void material, rocks included:
 *   uVeil   brightness of the whole void — VOID.peek while it is only
 *           glimpsed through the portal, 1 once the camera has crossed
 *   uReveal 0 before the crossing, 1 after
 */
export const voidUniforms = {
  uVeil: { value: VOID.peek },
  uReveal: { value: 0 },
  uTime: { value: 0 },
  uPixel: { value: 500 }, // px per world metre at distance 1
};

export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const WORLD_UP = new THREE.Vector3(0, 1, 0);
const BACK_WALL_Z = -14.6; // the portal's back wall ends at z -14.2
const fall = new THREE.Vector3();

/**
 * Keep void content (with a reach of `radius` m) behind the portal's back
 * wall, so nothing pokes into the corridor: slide it on down the fall.
 */
export function behindWall(point, radius = 0) {
  if (point.z + radius <= BACK_WALL_Z) return point;
  curve.getTangentAt(0.5, fall);
  return point.addScaledVector(fall, (point.z + radius - BACK_WALL_Z) / -fall.z + 0.5);
}

/** A point around the camera path at distance s, radius r, angle a. */
function aroundPath(s, r, a, out) {
  const T = curve.getTangentAt(s);
  const N = new THREE.Vector3().crossVectors(T, WORLD_UP).normalize();
  const B = new THREE.Vector3().crossVectors(N, T).normalize();
  return curve.getPointAt(s, out).addScaledVector(N, Math.cos(a) * r).addScaledVector(B, Math.sin(a) * r);
}

/** Direction of the fall (rocks roll around it, the nebula wraps it). */
export const fallAxis = curve
  .getPointAt(knotS(TUNNEL.toKnot))
  .sub(curve.getPointAt(knotS(TUNNEL.fromKnot)))
  .normalize();

/** Dim the GLB rock materials with the void veil (patched shader). */
export function veilMaterial(material) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uVeil = voidUniforms.uVeil;
    shader.fragmentShader = `uniform float uVeil;\n${shader.fragmentShader.replace(
      "#include <dithering_fragment>",
      "#include <dithering_fragment>\n  gl_FragColor.rgb *= uVeil;",
    )}`;
  };
  material.customProgramCacheKey = () => "void-veil";
  material.needsUpdate = true;
}

/* ------------------------------------------------------------------ */
/* Smoke: camera-facing soft noise banks (one instanced draw)         */
/* ------------------------------------------------------------------ */
const smokeVertex = /* glsl */ `
attribute vec3  iCenter;
attribute float iSize;
attribute float iSeed;
varying vec2  vUv;
varying vec3  vWorld;
varying float vSeed;
void main() {
  vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
  vec3 up = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
  vec3 w = iCenter + (right * position.x + up * position.y) * iSize;
  vUv = uv;
  vWorld = w;
  vSeed = iSeed;
  gl_Position = projectionMatrix * viewMatrix * vec4(w, 1.0);
}
`;
const smokeFragment = /* glsl */ `
uniform sampler2D tNoise;
uniform float uTime;
uniform float uVeil;
uniform vec3  uColor;
uniform float uIntensity;
varying vec2  vUv;
varying vec3  vWorld;
varying float vSeed;
void main() {
  vec2 c = vUv - 0.5;
  float shape = smoothstep(0.5, 0.1, length(c));
  vec2 q = vUv * 1.3 + vSeed * 7.0;
  float n = texture2D(tNoise, q * 0.5 + vec2(uTime * 0.008, -uTime * 0.006)).r * 0.6
          + texture2D(tNoise, q * 1.1 - vec2(uTime * 0.012, 0.0)).b * 0.4;
  n = smoothstep(0.3, 0.85, n);
  float dist = length(vWorld - cameraPosition);
  float fade = smoothstep(1.5, 6.0, dist) * exp(-dist * 0.03);
  gl_FragColor = vec4(uColor * n * shape * fade * uIntensity * uVeil, 1.0);
}
`;

export function createSmoke(density) {
  const count = Math.max(1, Math.round(TUNNEL.smokeCount * Math.max(density, 0.5)));
  const [sizeMin, sizeMax] = TUNNEL.smokeSize;
  const rnd = mulberry32(TUNNEL.seed + 307);
  const s0 = knotS(TUNNEL.fromKnot);
  const s1 = knotS(TUNNEL.toKnot + 1);
  const iCenter = new Float32Array(count * 3);
  const iSize = new Float32Array(count);
  const iSeed = new Float32Array(count);
  const p = new THREE.Vector3();
  for (let i = 0; i < count; i++) {
    behindWall(aroundPath(s0 + ((i + rnd()) / count) * (s1 - s0), 4 + rnd() * 8, rnd() * Math.PI * 2, p), 1);
    iCenter.set([p.x, p.y, p.z], i * 3);
    iSize[i] = sizeMin + rnd() * (sizeMax - sizeMin);
    iSeed[i] = rnd();
  }
  const plane = new THREE.PlaneGeometry(1, 1);
  const geometry = new THREE.InstancedBufferGeometry();
  geometry.index = plane.index;
  geometry.setAttribute("position", plane.attributes.position);
  geometry.setAttribute("uv", plane.attributes.uv);
  geometry.setAttribute("iCenter", new THREE.InstancedBufferAttribute(iCenter, 3));
  geometry.setAttribute("iSize", new THREE.InstancedBufferAttribute(iSize, 1));
  geometry.setAttribute("iSeed", new THREE.InstancedBufferAttribute(iSeed, 1));
  geometry.instanceCount = count;
  const u = {
    tNoise: { value: getNoiseTexture() },
    uColor: { value: new THREE.Color(VOID.smokeColor) },
    uIntensity: { value: VOID.smoke },
  };
  const material = new THREE.ShaderMaterial({
    uniforms: { ...voidUniforms, ...u },
    vertexShader: smokeVertex,
    fragmentShader: smokeFragment,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    toneMapped: false,
  });
  return {
    geometry,
    material,
    sync() {
      u.uColor.value.set(VOID.smokeColor);
      u.uIntensity.value = VOID.smoke;
    },
  };
}

/* ------------------------------------------------------------------ */
/* Nebula: a dark cloudy backdrop around the camera, a little lighter   */
/* around the line of fall, darkest straight ahead. Always on: from the  */
/* corridor it can only be seen through the portal opening (the corridor */
/* is closed everywhere else — ray-cast checked).                        */
/* ------------------------------------------------------------------ */
const nebulaVertex = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = normalize((modelMatrix * vec4(position, 1.0)).xyz - cameraPosition);
  vec4 p = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.0);
  gl_Position = p.xyww; // at the far plane: behind everything
}
`;
const nebulaFragment = /* glsl */ `
uniform sampler2D tNoise;
uniform float uTime;
uniform vec3  uAxis;    // down the fall
uniform vec3  uColor;
uniform vec3  uGlow;
uniform float uIntensity;
varying vec3 vDir;
// seamless clouds on the sphere of directions (tri-planar, no wrap seam)
float clouds(vec3 d) {
  vec3 w = pow(abs(d), vec3(4.0));
  w /= w.x + w.y + w.z;
  vec2 drift = vec2(uTime * 0.003, uTime * 0.002);
  vec4 a = texture2D(tNoise, d.yz * 0.9 + drift);
  vec4 b = texture2D(tNoise, d.xz * 0.9 + drift);
  vec4 c = texture2D(tNoise, d.xy * 0.9 + drift);
  vec4 n = a * w.x + b * w.y + c * w.z;
  return n.r * 0.65 + n.g * 0.35;
}
void main() {
  vec3 d = normalize(vDir);
  float along = dot(d, uAxis);
  float cloud = smoothstep(0.32, 0.85, clouds(d));
  // a faint tube of cloud around the line of fall, a dark heart straight ahead
  float ring = smoothstep(-0.1, 0.6, along) * (1.0 - smoothstep(0.86, 0.98, along));
  float heart = smoothstep(0.9, 0.995, along);
  vec3 col = mix(uColor, uGlow, cloud * ring) * (0.12 + cloud) * (0.35 + 0.65 * ring);
  col *= 1.0 - heart * 0.85;
  gl_FragColor = vec4(col * uIntensity, 1.0);
}
`;

export function createNebula() {
  const geometry = new THREE.SphereGeometry(80, 48, 24);
  const u = {
    tNoise: { value: getNoiseTexture() },
    uAxis: { value: fallAxis },
    uColor: { value: new THREE.Color(VOID.nebulaColor) },
    uGlow: { value: new THREE.Color(VOID.nebulaGlow) },
    uIntensity: { value: VOID.nebula },
  };
  const material = new THREE.ShaderMaterial({
    uniforms: { ...voidUniforms, ...u },
    vertexShader: nebulaVertex,
    fragmentShader: nebulaFragment,
    side: THREE.BackSide,
    depthWrite: false,
    toneMapped: false,
  });
  return {
    geometry,
    material,
    sync() {
      u.uColor.value.set(VOID.nebulaColor);
      u.uGlow.value.set(VOID.nebulaGlow);
      u.uIntensity.value = VOID.nebula;
    },
  };
}
