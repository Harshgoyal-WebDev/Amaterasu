"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { BOULDER, GATE, LAYERS, PORTAL, VIOLET, VIOLET_RIG, VOID } from "../config";
import { heroState } from "../state";
import { energyUniforms } from "./network/energyUniforms";
import { setLightOn } from "./shadows";

const glowVertex = /* glsl */ `
varying vec3 vWorld;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWorld = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}
`;

const glowFragment = /* glsl */ `
uniform float uTime;
uniform float uGlowIntensity;
uniform vec3  uPointer;
uniform float uPointerStrength;
uniform float uRadius;
uniform float uSpring;
uniform vec3  uCore;
uniform vec3  uRing;
uniform float uRingIntensity;
uniform float uRingWidth;
uniform float uHotIntensity;
uniform float uHotPosition;
uniform float uHotSpread;
uniform float uHotDrift;
varying vec3 vWorld;

// Signed distance to the opening outline (negative inside the opening).
float archSdf(vec2 p) {
  if (p.y < uSpring) return abs(p.x) - uRadius;
  return length(p - vec2(0.0, uSpring)) - uRadius;
}
// 0..1 along the outline (left foot → top → right foot).
float archParam(vec2 p) {
  float arc = 3.14159265 * uRadius;
  float L = 2.0 * uSpring + arc;
  if (p.y < uSpring) return p.x < 0.0 ? p.y / L : (L - p.y) / L;
  float th = atan(p.y - uSpring, p.x);
  return (uSpring + (3.14159265 - th) * uRadius) / L;
}
float wrapd(float x) { return x - floor(x + 0.5); }

void main() {
  vec2 p = vWorld.xy;
  float d = archSdf(p);
  float s = archParam(p);
  float w = max(uRingWidth, 1e-3);
  float t = uTime;

  // thick glowing ring hugging the edge, white-hot core just inside it
  float ring = exp(-abs(d) / w);
  float core = exp(-abs(d + w * 0.25) / (w * 0.22));
  // the hot crescent (white, like the reference's left inner edge)
  float hd = wrapd(s - uHotPosition - t * uHotDrift);
  float hot = exp(-(hd * hd) / (uHotSpread * uHotSpread));
  // cursor brightens the rim nearby
  vec2 dp = p - uPointer.xy;
  float near = exp(-dot(dp, dp) / 1.4) * uPointerStrength;

  vec3 col = uRing * ring * uRingIntensity * (1.0 + hot * 0.6 + near)
           + uCore * core * uRingIntensity * (0.3 + hot * uHotIntensity);
  col *= smoothstep(-0.02, 0.3, p.y) * uGlowIntensity;
  gl_FragColor = vec4(max(col, 0.0), 1.0);
}
`;

// Inner surface of the gate (the reveal): the ring's light running back
// into the opening, brightest at the front lip.
const surfaceVertex = /* glsl */ `
attribute float aS;      // 0..1 along the outline (left foot → top → right foot)
attribute float aDepth;  // m back from the front lip
varying float vS;
varying float vDepth;
varying float vY;
void main() {
  vS = aS;
  vDepth = aDepth;
  vec4 w = modelMatrix * vec4(position, 1.0);
  vY = w.y;
  gl_Position = projectionMatrix * viewMatrix * w;
}
`;

const surfaceFragment = /* glsl */ `
uniform float uTime;
uniform float uGlowIntensity;
uniform vec3  uCore;
uniform vec3  uRing;
uniform float uHotIntensity;
uniform float uHotPosition;
uniform float uHotSpread;
uniform float uHotDrift;
uniform float uSurfaceIntensity;
uniform float uSurfaceFalloff;
varying float vS;
varying float vDepth;
varying float vY;
float wrapd(float x) { return x - floor(x + 0.5); }
void main() {
  float hd = wrapd(vS - uHotPosition - uTime * uHotDrift);
  float hot = exp(-(hd * hd) / (uHotSpread * uHotSpread));
  float f = max(uSurfaceFalloff, 1e-3);
  float glow = exp(-vDepth / f);
  float core = exp(-vDepth / (f * 0.25));
  vec3 col = uRing * glow * (1.0 + hot * 0.6)
           + uCore * core * (0.3 + hot * uHotIntensity);
  col *= uSurfaceIntensity * smoothstep(-0.02, 0.3, vY) * uGlowIntensity;
  gl_FragColor = vec4(max(col, 0.0), 1.0);
}
`;

/** A ribbon lining the opening: the arch outline swept back through the rim depth. */
function buildSurfaceGeometry(segments = 240, inset = 0.012) {
  const R = PORTAL.radius - inset;
  const H = PORTAL.springY;
  const arc = Math.PI * R;
  const L = 2 * H + arc;
  const z0 = PORTAL.faces.rim;
  const position = [];
  const aS = [];
  const aDepth = [];
  for (let i = 0; i <= segments; i++) {
    const s = (i / segments) * L;
    let x;
    let y;
    if (s < H) [x, y] = [-R, s];
    else if (s < H + arc) {
      const th = Math.PI - (s - H) / R;
      [x, y] = [R * Math.cos(th), H + R * Math.sin(th)];
    } else [x, y] = [R, H - (s - H - arc)];
    position.push(x, y, z0, x, y, z0 - PORTAL.rimDepth);
    aS.push(s / L, s / L);
    aDepth.push(0, PORTAL.rimDepth);
  }
  const index = [];
  for (let i = 0; i < segments; i++) {
    const a = i * 2;
    index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setIndex(index);
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(position, 3));
  geometry.setAttribute("aS", new THREE.Float32BufferAttribute(aS, 1));
  geometry.setAttribute("aDepth", new THREE.Float32BufferAttribute(aDepth, 1));
  return geometry;
}

const camOffset = new THREE.Vector3();
const boulderFocus = new THREE.Vector3(...BOULDER.position).add(new THREE.Vector3(...BOULDER.focus));

/**
 * Violet light from the portal (three real lights) + the glowing gate:
 * an arch-shaped emissive layer just in front of the rim lip, and the same
 * light lining the inner surface of the opening. The opening only receives
 * additive light — no surface ever blocks it.
 */
export default function PortalLighting() {
  const core = useRef(null);
  const spill = useRef(null);
  const wash = useRef(null);
  const washTarget = useRef(null);
  const plane = useRef(null);
  const surface = useRef(null);

  const glow = useMemo(() => {
    const local = {
      uRadius: { value: PORTAL.radius },
      uSpring: { value: PORTAL.springY },
      uCore: { value: new THREE.Color() },
      uRing: { value: new THREE.Color() },
      uRingIntensity: { value: 1 },
      uRingWidth: { value: 0.1 },
      uHotIntensity: { value: 1 },
      uHotPosition: { value: 0.25 },
      uHotSpread: { value: 0.15 },
      uHotDrift: { value: 0 },
      uSurfaceIntensity: { value: 1 },
      uSurfaceFalloff: { value: 0.3 },
    };
    const additive = {
      uniforms: { ...energyUniforms, ...local },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      toneMapped: false,
    };
    const material = new THREE.ShaderMaterial({ ...additive, vertexShader: glowVertex, fragmentShader: glowFragment });
    const surfaceMaterial = new THREE.ShaderMaterial({ ...additive, vertexShader: surfaceVertex, fragmentShader: surfaceFragment });
    const surfaceGeometry = buildSurfaceGeometry();
    return {
      material,
      surfaceMaterial,
      surfaceGeometry,
      dispose() {
        material.dispose();
        surfaceMaterial.dispose();
        surfaceGeometry.dispose();
      },
      update() {
        local.uCore.value.set(GATE.coreColor);
        local.uRing.value.set(GATE.ringColor);
        local.uRingIntensity.value = GATE.ringIntensity;
        local.uRingWidth.value = GATE.ringWidth;
        local.uHotIntensity.value = GATE.hotIntensity;
        local.uHotPosition.value = GATE.hotPosition;
        local.uHotSpread.value = Math.max(GATE.hotSpread, 0.01);
        local.uHotDrift.value = GATE.hotDrift;
        local.uSurfaceIntensity.value = GATE.surfaceIntensity;
        local.uSurfaceFalloff.value = GATE.surfaceFalloff;
      },
    };
  }, []);
  useEffect(() => () => glow.dispose(), [glow]);

  useEffect(() => {
    wash.current.target = washTarget.current;
    for (const l of [core.current, spill.current, wash.current]) l.layers.enable(LAYERS.reflection);
  }, []);

  useFrame(({ camera }) => {
    const k = heroState.fx.glowIntensity;
    const j = heroState.journey;
    plane.current.visible = j.hero;
    surface.current.visible = j.hero;
    if (j.hero) glow.update();
    setLightOn(core.current, VIOLET.coreIntensity > 0);
    setLightOn(spill.current, VIOLET.spillIntensity > 0);
    setLightOn(wash.current, VIOLET.washIntensity > 0);
    core.current.color.set(VIOLET.coreColor);
    core.current.intensity = VIOLET.coreIntensity * k;
    core.current.distance = VIOLET.coreDistance;

    if (j.void > 0) {
      // Past the portal the corridor is behind us: the same two lights become
      // the void's lights (no new lights → no shader recompiles mid-scroll).
      // spill → a violet light travelling with the camera, lighting the rocks
      // as they rush past; wash → the key light grazing the boulder.
      spill.current.position.copy(camera.position).add(camOffset.set(1.2, 1.6, -1.5).applyQuaternion(camera.quaternion));
      spill.current.color.set(VOID.lightColor);
      spill.current.intensity = VOID.light * j.void;
      spill.current.distance = VOID.lightDistance;
      const K = BOULDER.key;
      wash.current.position.fromArray(BOULDER.position).add(camOffset.fromArray(K.offset));
      washTarget.current.position.copy(boulderFocus);
      wash.current.color.set(K.color);
      wash.current.intensity = K.intensity * j.arrival;
      wash.current.angle = K.angle;
      wash.current.penumbra = K.penumbra;
      wash.current.distance = 0;
      return;
    }
    spill.current.position.fromArray(VIOLET_RIG.spill);
    spill.current.color.set(VIOLET.spillColor);
    spill.current.intensity = VIOLET.spillIntensity * k;
    spill.current.distance = VIOLET.spillDistance;
    wash.current.position.fromArray(VIOLET_RIG.wash.position);
    washTarget.current.position.fromArray(VIOLET_RIG.wash.target);
    wash.current.color.set(VIOLET.washColor);
    wash.current.intensity = VIOLET.washIntensity * k;
    wash.current.angle = VIOLET_RIG.wash.angle;
    wash.current.penumbra = VIOLET_RIG.wash.penumbra;
  });

  const { plane: gatePlane } = GATE;
  return (
    <group>
      <pointLight ref={core} position={VIOLET_RIG.core} decay={2} />
      <pointLight ref={spill} position={VIOLET_RIG.spill} decay={2} />
      <spotLight
        ref={wash}
        position={VIOLET_RIG.wash.position}
        angle={VIOLET_RIG.wash.angle}
        penumbra={VIOLET_RIG.wash.penumbra}
        decay={2}
      />
      <object3D ref={washTarget} position={VIOLET_RIG.wash.target} />

      <mesh
        ref={plane}
        position={[0, gatePlane.centerY, gatePlane.z]}
        material={glow.material}
        renderOrder={2}
        frustumCulled={false}
        layers-mask={(1 << 0) | (1 << LAYERS.reflection)}
      >
        <planeGeometry args={[gatePlane.width, gatePlane.height]} />
      </mesh>
      <mesh
        ref={surface}
        geometry={glow.surfaceGeometry}
        material={glow.surfaceMaterial}
        renderOrder={2}
        layers-mask={(1 << 0) | (1 << LAYERS.reflection)}
      />
    </group>
  );
}
