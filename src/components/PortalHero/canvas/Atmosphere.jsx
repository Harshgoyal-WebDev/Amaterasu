"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { ATMOSPHERE, HAZE_RIG, JOURNEY, MIST_RIG, PORTAL, VOID } from "../config";
import { heroState } from "../state";
import { getNoiseTexture } from "./noiseTexture";

const mistVertex = /* glsl */ `
varying vec2 vUv;
varying vec3 vWorld;
void main() {
  vUv = uv;
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWorld = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}
`;

const mistFragment = /* glsl */ `
uniform sampler2D tNoise;
uniform float uTime;
uniform float uIntensity;
uniform vec3  uColor;
uniform float uSeed;
uniform vec3  uPortalBase;
uniform float uFalloff;
varying vec2 vUv;
varying vec3 vWorld;
void main() {
  vec2 q = vWorld.xz * 0.35 + vec2(uSeed * 7.0, 0.0);
  float n = (texture2D(tNoise, q * 0.12 + vec2(uTime * 0.006, 0.0)).r * 2.0 - 1.0) * 0.6
          + (texture2D(tNoise, q * 0.27 - vec2(0.0, uTime * 0.009)).b * 2.0 - 1.0) * 0.4;
  n *= 1.8; // value noise has a narrower range than simplex
  float shape = smoothstep(0.0, 0.25, vUv.x) * smoothstep(1.0, 0.75, vUv.x)
              * smoothstep(0.0, 0.3, vUv.y) * smoothstep(1.0, 0.35, vUv.y);
  float m = clamp(n * 0.5 + 0.5, 0.0, 1.0);
  m = m * m * shape;
  // lit by the portal: bright at its base, fading quickly into black
  float lit = 0.2 + 1.6 * exp(-length(vWorld - uPortalBase) / uFalloff);
  // fade out as the camera flies through a patch (no pop at the near plane)
  float near = smoothstep(0.6, 2.8, length(vWorld - cameraPosition));
  gl_FragColor = vec4(uColor * m * lit * near * uIntensity * 0.35, 1.0);
}
`;

const hazeFragment = /* glsl */ `
uniform sampler2D tNoise;
uniform float uTime;
uniform float uIntensity;
uniform vec3  uColor;
uniform float uRadius;
uniform float uSpring;
varying vec2 vUv;
varying vec3 vWorld;
void main() {
  vec2 p = vWorld.xy;
  float d = p.y < uSpring ? abs(p.x) - uRadius : length(p - vec2(0.0, uSpring)) - uRadius;
  // clear inside the opening and right at its edge, so the silhouette stays crisp
  float mask = smoothstep(0.2, 1.2, d);
  float edge = smoothstep(0.0, 0.2, vUv.x) * smoothstep(1.0, 0.8, vUv.x) * smoothstep(0.0, 0.15, vUv.y) * smoothstep(1.0, 0.6, vUv.y);
  float n = texture2D(tNoise, p * 0.05 + vec2(uTime * 0.004, uTime * 0.002)).r;
  n = smoothstep(0.25, 0.85, n);
  float low = 0.55 + 0.45 * smoothstep(7.0, 0.5, p.y); // a touch denser low down
  gl_FragColor = vec4(uColor * n * mask * edge * low * uIntensity, 1.0);
}
`;

const additive = {
  transparent: true,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
  side: THREE.DoubleSide,
  toneMapped: false,
};
const portalBase = new THREE.Vector3(PORTAL.center[0], 0.4, PORTAL.faces.rim);

/** Low violet mist hugging the floor (camera-facing soft planes). */
function Mist() {
  const group = useRef(null);
  const materials = useMemo(
    () =>
      MIST_RIG.map(
        (_, i) =>
          new THREE.ShaderMaterial({
            uniforms: {
              tNoise: { value: getNoiseTexture() },
              uTime: { value: 0 },
              uIntensity: { value: ATMOSPHERE.mistIntensity },
              uColor: { value: new THREE.Color(ATMOSPHERE.mistColor) },
              uSeed: { value: i * 1.37 },
              uPortalBase: { value: portalBase },
              uFalloff: { value: ATMOSPHERE.mistFalloff },
            },
            vertexShader: mistVertex,
            fragmentShader: mistFragment,
            ...additive,
          }),
      ),
    [],
  );
  useEffect(() => () => materials.forEach((m) => m.dispose()), [materials]);

  useFrame(({ camera }) => {
    group.current.visible = heroState.journey.hero;
    if (!group.current.visible) return;
    group.current.children.forEach((mesh, i) => {
      mesh.quaternion.copy(camera.quaternion);
      const u = materials[i].uniforms;
      u.uTime.value = heroState.time;
      u.uIntensity.value = ATMOSPHERE.mistIntensity * heroState.fx.mist;
      u.uColor.value.set(ATMOSPHERE.mistColor);
      u.uFalloff.value = ATMOSPHERE.mistFalloff;
    });
  });

  return (
    <group ref={group}>
      {MIST_RIG.map((m, i) => (
        <mesh key={i} position={m.position} material={materials[i]} renderOrder={5}>
          <planeGeometry args={m.size} />
        </mesh>
      ))}
    </group>
  );
}

/** Faint depth haze in front of the portal wall (never inside the opening). */
function Haze() {
  const mesh = useRef(null);
  const haze = useMemo(() => {
    const u = {
      tNoise: { value: getNoiseTexture() },
      uTime: { value: 0 },
      uIntensity: { value: ATMOSPHERE.hazeIntensity },
      uColor: { value: new THREE.Color(ATMOSPHERE.hazeColor) },
      uRadius: { value: PORTAL.radius },
      uSpring: { value: PORTAL.springY },
    };
    return {
      material: new THREE.ShaderMaterial({ uniforms: u, vertexShader: mistVertex, fragmentShader: hazeFragment, ...additive }),
      update(object) {
        u.uTime.value = heroState.time;
        u.uIntensity.value = ATMOSPHERE.hazeIntensity;
        u.uColor.value.set(ATMOSPHERE.hazeColor);
        object.visible = ATMOSPHERE.hazeIntensity > 0 && heroState.journey.hero;
      },
    };
  }, []);
  useEffect(() => () => haze.material.dispose(), [haze]);
  useFrame(() => haze.update(mesh.current));

  return (
    <mesh ref={mesh} position={[0, HAZE_RIG.centerY, HAZE_RIG.z]} material={haze.material} renderOrder={1}>
      <planeGeometry args={[HAZE_RIG.width, HAZE_RIG.height]} />
    </mesh>
  );
}

/**
 * Background colour, violet exponential fog, floor mist and haze — all live.
 * Fog thickens in the void (rocks emerge from the dark) and thins again as
 * the boulder comes into view.
 */
export default function Atmosphere() {
  const background = useRef(null);
  const fog = useRef(null);
  useFrame(() => {
    const j = heroState.journey;
    background.current.set(ATMOSPHERE.background);
    fog.current.color.set(ATMOSPHERE.fogColor);
    const voidFog = ATMOSPHERE.fogDensity + (VOID.fog - ATMOSPHERE.fogDensity) * j.void;
    fog.current.density = voidFog + (JOURNEY.fog.arrival - voidFog) * j.arrival * j.void;
  });
  return (
    <>
      <color ref={background} attach="background" args={[ATMOSPHERE.background]} />
      <fogExp2 ref={fog} attach="fog" args={[ATMOSPHERE.fogColor, ATMOSPHERE.fogDensity]} />
      <Mist />
      <Haze />
    </>
  );
}
