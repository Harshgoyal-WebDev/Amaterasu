"use client";

import { useEffect, useMemo } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { FOG, PALETTE } from "../config";
import { journey } from "../state";
import { createRng } from "../world/rng";

/**
 * Air, not decoration:
 *   - exponential fog in the void colour; its density eases towards what the
 *     current space asks for (corridors closer, the abyss deeper) — never a cut
 *   - dust: a few hundred motes in a box that wraps around the camera
 *   - distant lanterns: thousands of tiny lights in a 900 m wrapped volume,
 *     no fog, faded by distance — the castle continuing in every direction
 * Both particle systems are a single Points draw each; wrapping happens in
 * the vertex shader, so they never run out and never move on the CPU.
 */

const dustVertex = /* glsl */ `
uniform vec3 uCam;
uniform float uSize;
uniform float uBox;
uniform float uTime;
uniform float uPixel;
attribute float aSeed;
varying float vAlpha;
varying float vWarm;
void main() {
  vec3 rel = mod(position - uCam + uBox * 0.5, uBox) - uBox * 0.5;
  rel += vec3(sin(uTime * 0.21 + aSeed * 6.0), sin(uTime * 0.17 + aSeed * 9.0) * 0.6, cos(uTime * 0.19 + aSeed * 4.0)) * 0.35;
  vec4 mv = viewMatrix * vec4(uCam + rel, 1.0);
  gl_Position = projectionMatrix * mv;
  float d = -mv.z;
  float edge = 1.0 - smoothstep(uBox * 0.32, uBox * 0.5, length(rel));
  float near = smoothstep(0.4, 1.6, d);
  float tw = 0.55 + 0.45 * sin(uTime * (0.6 + aSeed * 1.7) + aSeed * 40.0);
  vAlpha = edge * near * tw;
  vWarm = step(0.86, aSeed);
  gl_PointSize = uSize * uPixel * (mix(1.0, 2.2, vWarm)) / max(d, 0.5);
}`;

const dustFragment = /* glsl */ `
varying float vAlpha;
varying float vWarm;
uniform vec3 uColor;
uniform vec3 uWarm;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float a = smoothstep(0.5, 0.0, length(c));
  vec3 col = mix(uColor, uWarm, vWarm);
  gl_FragColor = vec4(col * (vWarm > 0.5 ? 2.4 : 1.0), a * vAlpha * (vWarm > 0.5 ? 0.9 : 0.35));
}`;

const farVertex = /* glsl */ `
uniform vec3 uCam;
uniform float uBox;
uniform float uTime;
uniform float uPixel;
attribute float aSeed;
varying float vAlpha;
varying float vTone;
void main() {
  vec3 rel = mod(position - uCam + uBox * 0.5, uBox) - uBox * 0.5;
  vec4 mv = viewMatrix * vec4(uCam + rel, 1.0);
  gl_Position = projectionMatrix * mv;
  float d = length(rel);
  float fade = smoothstep(55.0, 110.0, d) * (1.0 - smoothstep(uBox * 0.36, uBox * 0.5, d));
  float flick = 0.75 + 0.25 * sin(uTime * (1.5 + aSeed * 3.0) + aSeed * 70.0);
  vAlpha = fade * flick;
  vTone = aSeed;
  gl_PointSize = clamp(uPixel * (1.4 + aSeed * 2.2) * 120.0 / d, 1.0, 6.0 * uPixel);
}`;

const farFragment = /* glsl */ `
varying float vAlpha;
varying float vTone;
uniform vec3 uAmber;
uniform vec3 uIvory;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float a = smoothstep(0.5, 0.05, length(c));
  vec3 col = mix(uAmber, uIvory, step(0.82, vTone) * 0.6);
  gl_FragColor = vec4(col * 1.6, a * vAlpha);
}`;

function makePoints(count, box, seed) {
  const rng = createRng(seed);
  const pos = new Float32Array(count * 3);
  const seeds = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    pos[i * 3] = rng.range(-box / 2, box / 2);
    pos[i * 3 + 1] = rng.range(-box / 2, box / 2);
    pos[i * 3 + 2] = rng.range(-box / 2, box / 2);
    seeds[i] = rng.next();
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  g.setAttribute("aSeed", new THREE.BufferAttribute(seeds, 1));
  return g;
}

function createAtmosphere(quality) {
  const fog = new THREE.FogExp2(PALETTE.fog, FOG.density);
  const points = (count, box, seed, vertexShader, fragmentShader, uniforms) => {
    const mat = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: { uCam: { value: new THREE.Vector3() }, uBox: { value: box }, uTime: { value: 0 }, uPixel: { value: 1 }, ...uniforms },
    });
    const pts = new THREE.Points(makePoints(count, box, seed), mat);
    pts.frustumCulled = false;
    return pts;
  };
  const dust = points(quality.dust, 30, 11, dustVertex, dustFragment, {
    uSize: { value: 2.2 },
    uColor: { value: new THREE.Color("#8a6a52") },
    uWarm: { value: new THREE.Color(PALETTE.amber) },
  });
  const far = points(quality.farLights, 900, 23, farVertex, farFragment, {
    uAmber: { value: new THREE.Color(PALETTE.lantern) },
    uIvory: { value: new THREE.Color(PALETTE.ivory) },
  });
  far.renderOrder = -1;

  return {
    attach(scene) {
      scene.fog = fog;
      scene.add(dust, far);
    },
    detach(scene) {
      scene.remove(dust, far);
      if (scene.fog === fog) scene.fog = null;
    },
    update(state, delta, pixelRatio) {
      const dt = Math.min(delta, 1 / 20);
      fog.density += (journey.fogTarget - fog.density) * (1 - Math.exp(-dt * FOG.smoothing));
      journey.fogDensity = fog.density;
      for (const p of [dust, far]) {
        const u = p.material.uniforms;
        u.uCam.value.copy(state.camera.position);
        u.uTime.value = state.clock.elapsedTime;
        u.uPixel.value = pixelRatio;
      }
      dust.material.uniforms.uSize.value = 2.2 * (1 + journey.fall * 0.8);
    },
    dispose() {
      for (const p of [dust, far]) {
        p.geometry.dispose();
        p.material.dispose();
      }
    },
  };
}

export default function Atmosphere({ quality }) {
  const scene = useThree((s) => s.scene);
  const gl = useThree((s) => s.gl);
  const atmosphere = useMemo(() => createAtmosphere(quality), [quality]);

  useEffect(() => {
    atmosphere.attach(scene);
    return () => {
      atmosphere.detach(scene);
      atmosphere.dispose();
    };
  }, [scene, atmosphere]);

  useFrame((state, delta) => atmosphere.update(state, delta, gl.getPixelRatio()));
  return null;
}
