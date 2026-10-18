"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import * as THREE from "three";
import { TUNNEL, VOID } from "../../config";
import { useConfigVersion } from "../../controls/configStore";
import { heroState } from "../../state";
import { curve, knotS, pace, pathLength } from "./journeyPath";
import { behindWall, createNebula, createSmoke, fallAxis, mulberry32, veilMaterial, voidUniforms } from "./voidEffects";

const WORLD_UP = new THREE.Vector3(0, 1, 0);

/**
 * Rock placements along the fall: each rock gets a spot around the camera
 * path (never closer than its clearance), a scale, its own spin axis and
 * speed, and a slow float. Deterministic, computed once, sorted by distance
 * along the path (so "rocks up to here" is simply the first N instances).
 */
function placeRocks(density) {
  const rnd = mulberry32(TUNNEL.seed);
  const s0 = knotS(TUNNEL.fromKnot);
  const s1 = knotS(TUNNEL.toKnot);
  const [rMin, rMax] = TUNNEL.radius;
  const T = new THREE.Vector3();
  const N = new THREE.Vector3();
  const B = new THREE.Vector3();
  return TUNNEL.rocks.map((type) => {
    const count = Math.max(1, Math.round(type.count * density * TUNNEL.rockDensity));
    const items = [];
    for (let i = 0; i < count; i++) {
      // stratified along the path so rocks keep coming at a steady rhythm
      const s = s0 + ((i + rnd()) / count) * (s1 - s0);
      curve.getTangentAt(s, T);
      N.crossVectors(T, WORLD_UP).normalize();
      B.crossVectors(N, T).normalize();
      const angle = rnd() * Math.PI * 2;
      const scale = type.scale[0] + Math.pow(rnd(), 1.5) * (type.scale[1] - type.scale[0]);
      const r = Math.max(type.clearance * (0.6 + 0.4 * scale), rMin + Math.pow(rnd(), 0.8) * (rMax - rMin));
      const position = behindWall(
        curve.getPointAt(s).addScaledVector(N, Math.cos(angle) * r).addScaledVector(B, Math.sin(angle) * r),
        scale * 1.2,
      );
      items.push({
        s,
        position,
        scale,
        // per-axis turn rate factors (random speed + direction for each axis)
        turn: [0, 1, 2].map(() => (0.5 + rnd()) * (rnd() < 0.5 ? -1 : 1)),
        rest: new THREE.Quaternion().setFromEuler(new THREE.Euler(rnd() * 6.28, rnd() * 6.28, rnd() * 6.28)),
        floatDir: new THREE.Vector3(rnd() - 0.5, rnd() - 0.5, rnd() - 0.5).normalize(),
        floatSpeed: 0.15 + rnd() * 0.25,
        phase: rnd() * 6.28,
      });
    }
    return items;
  });
}

/* ---------------- void dust (motion-blurred) ---------------- */
// Each mote is a small capsule from where it was a moment ago (relative to the
// moving camera: p + v·shutter) to where it is now. Still → round dots;
// falling → streaks radiating from the vanishing point, longer the faster
// you scroll. Brightness is spread along the streak so fast ones don't flare.
const dustVertex = /* glsl */ `
uniform float uTime;
uniform float uPixel;
uniform vec2  uResolution;
uniform vec3  uVel;
uniform float uShutter;
uniform float uMaxStretch;
attribute vec2  aCorner; // x: -1 / 1 across, y: 0 tail → 1 head
attribute vec3  iPos;
attribute float iSeed;
attribute float iSize;
varying vec2  vLocal;
varying float vHalf;
varying float vRadius;
varying float vAlong;
varying float vAlpha;
varying float vHot;
void main() {
  vec3 p = iPos + vec3(sin(uTime * 0.21 + iSeed * 40.0), sin(uTime * 0.17 + iSeed * 23.0), cos(uTime * 0.19 + iSeed * 31.0)) * 0.35;
  vec3 trail = uVel * uShutter;
  float tl = length(trail);
  if (tl > uMaxStretch) trail *= uMaxStretch / tl;
  mat4 vp = projectionMatrix * viewMatrix;
  vec4 ch = vp * vec4(p, 1.0);
  vec4 ct = vp * vec4(p + trail, 1.0);
  if (ct.w < 0.05) ct = ch; // tail behind the lens
  vec2 hres = 0.5 * uResolution;
  vec2 sh = ch.xy / ch.w * hres;
  vec2 st = ct.xy / ct.w * hres;
  vec2 d = sh - st;
  float lenPx = min(length(d), uResolution.y * 0.25);
  vec2 dir = lenPx > 1e-3 ? d / length(d) : vec2(1.0, 0.0);
  st = sh - dir * lenPx;
  vec2 nrm = vec2(-dir.y, dir.x);
  float dist = ch.w;
  float r = clamp(iSize * uPixel / dist, 1.0, 10.0) * 0.5;
  vec2 px = mix(st, sh, aCorner.y) + dir * (aCorner.y * 2.0 - 1.0) * r + nrm * aCorner.x * r;
  gl_Position = vec4(px / hres * ch.w, ch.z, ch.w);
  vHalf = lenPx * 0.5;
  vRadius = r;
  vLocal = vec2(aCorner.x * r, (aCorner.y * 2.0 - 1.0) * (vHalf + r));
  vAlong = aCorner.y;
  vAlpha = exp(-dist * 0.04) * smoothstep(0.4, 2.0, dist) * r / (r + lenPx * 0.25);
  vHot = step(0.93, iSeed);
}
`;

const dustFragment = /* glsl */ `
uniform vec3 uColor;
uniform float uBrightness;
uniform float uVeil;
varying vec2  vLocal;
varying float vHalf;
varying float vRadius;
varying float vAlong;
varying float vAlpha;
varying float vHot;
void main() {
  // capsule: distance to the tail→head segment, in radii
  float k = length(vec2(vLocal.x, max(abs(vLocal.y) - vHalf, 0.0))) / vRadius;
  if (k > 1.0) discard;
  float tail = mix(1.0, mix(0.35, 1.0, vAlong), step(1.0, vHalf)); // fade towards the tail when stretched
  vec3 col = mix(uColor, vec3(0.85, 0.7, 1.0), vHot);
  gl_FragColor = vec4(col * exp(-k * k * 3.0) * tail * vAlpha * (0.6 + vHot) * uBrightness * uVeil, 1.0);
}
`;

function buildDust(count) {
  const rnd = mulberry32(TUNNEL.seed + 101);
  const s0 = knotS(TUNNEL.fromKnot); // all behind the back wall: none leak into the corridor
  const positions = new Float32Array(count * 3);
  const seeds = new Float32Array(count);
  const sizes = new Float32Array(count);
  const p = new THREE.Vector3();
  for (let i = 0; i < count; i++) {
    curve.getPointAt(s0 + rnd() * (1 - s0), p);
    const r = 0.6 + Math.pow(rnd(), 0.7) * 12;
    const a = rnd() * Math.PI * 2;
    const h = (rnd() - 0.5) * 6;
    p.set(p.x + Math.cos(a) * r, p.y + Math.sin(a) * r + h, p.z + (rnd() - 0.5) * 8);
    behindWall(p, 0.4);
    positions.set([p.x, p.y, p.z], i * 3);
    seeds[i] = rnd();
    sizes[i] = 0.02 + Math.pow(rnd(), 3) * 0.06;
  }
  const geometry = new THREE.InstancedBufferGeometry();
  geometry.setIndex([0, 1, 2, 1, 3, 2]);
  geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(12), 3));
  geometry.setAttribute("aCorner", new THREE.BufferAttribute(new Float32Array([-1, 0, 1, 0, -1, 1, 1, 1]), 2));
  geometry.setAttribute("iPos", new THREE.InstancedBufferAttribute(positions, 3));
  geometry.setAttribute("iSeed", new THREE.InstancedBufferAttribute(seeds, 1));
  geometry.setAttribute("iSize", new THREE.InstancedBufferAttribute(sizes, 1));
  geometry.instanceCount = count;
  return geometry;
}

const additive = { transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false };

/**
 * The void past the portal: fractured rocks (one InstancedMesh per rock type
 * → 6 draw calls) turning slowly on their own axes, motion-blurred dust,
 * smoke banks and the nebula backdrop.
 *
 * It is always there behind the portal: dimmed (voidUniforms.uVeil) while it
 * is only glimpsed through the opening, full strength once the camera has
 * crossed. Only rocks up to TUNNEL.ahead metres down the path are drawn.
 * Nothing is spawned or rebuilt while scrolling.
 */
export default function Tunnel({ density = 1 }) {
  const gltfs = useGLTF(
    TUNNEL.rocks.map((r) => r.url),
    false,
    true,
  );
  const version = useConfigVersion("TUNNEL"); // structure edits rebuild
  const rocks = useRef(null);
  const nebulaMesh = useRef(null);

  const system = useMemo(() => {
    const placements = placeRocks(density);
    const meshes = gltfs.map((gltf, k) => {
      let source = null;
      gltf.scene.traverse((o) => {
        if (o.isMesh && !source) source = o;
      });
      const material = source.material;
      veilMaterial(material);
      const mesh = new THREE.InstancedMesh(source.geometry, material, placements[k].length);
      mesh.frustumCulled = false; // instances move every frame; the group is toggled instead
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      // the GLB node carries the mesh-quantization scale / offset: keep it
      gltf.scene.updateMatrixWorld(true);
      mesh.userData.local = source.matrixWorld.clone();
      return mesh;
    });
    const dustGeometry = buildDust(Math.round(TUNNEL.dust * density));
    const dustLook = {
      uColor: { value: new THREE.Color(VOID.dustColor) },
      uBrightness: { value: VOID.dust },
      uResolution: { value: new THREE.Vector2(1920, 1080) },
      uVel: { value: heroState.journey.velocity }, // the eased camera velocity itself
      uShutter: { value: VOID.dustShutter },
      uMaxStretch: { value: VOID.dustMaxStretch },
    };
    const dustMaterial = new THREE.ShaderMaterial({
      uniforms: { ...voidUniforms, ...dustLook },
      vertexShader: dustVertex,
      fragmentShader: dustFragment,
      ...additive,
      side: THREE.DoubleSide, // quad winding follows the motion direction
    });
    const smoke = createSmoke(density);
    const nebula = createNebula();

    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const turn = new THREE.Quaternion();
    const euler = new THREE.Euler();
    // the fall's frame: x across the screen, y up the screen, z along the fall
    const fz = fallAxis.clone();
    const fx = new THREE.Vector3().crossVectors(fz, new THREE.Vector3(0, 1, 0)).normalize();
    const fy = new THREE.Vector3().crossVectors(fx, fz).normalize();
    const frame = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(fx, fy, fz));
    const frameInv = frame.clone().invert();
    const pos = new THREE.Vector3();
    const scl = new THREE.Vector3();
    const aheadS = TUNNEL.ahead / pathLength;
    return {
      meshes,
      dustGeometry,
      dustMaterial,
      smoke,
      nebula,
      update(time, pixel, width, height) {
        const j = heroState.journey;
        voidUniforms.uReveal.value = j.reveal;
        voidUniforms.uVeil.value = VOID.peek + (1 - VOID.peek) * j.reveal;
        voidUniforms.uTime.value = time;
        voidUniforms.uPixel.value = pixel;
        smoke.sync();
        nebula.sync();
        dustLook.uColor.value.set(VOID.dustColor);
        dustLook.uBrightness.value = VOID.dust;
        dustLook.uResolution.value.set(width, height);
        dustLook.uShutter.value = VOID.dustShutter * j.motionFx;
        dustLook.uMaxStretch.value = VOID.dustMaxStretch;
        const reach = pace(heroState.journey.progress) + aheadS;
        for (let k = 0; k < meshes.length; k++) {
          const items = placements[k];
          let n = 0;
          while (n < items.length && items[n].s < reach) n++;
          meshes[k].count = n;
          meshes[k].material.emissiveIntensity = TUNNEL.rocks[k].emissive * VOID.crackGlow;
          for (let i = 0; i < n; i++) {
            const it = items[i];
            // x / y / z turn rates are in the fall's frame (z = rolling in
            // the screen plane), × each rock's own speed + direction per axis
            const t = time * VOID.spin;
            euler.set(
              it.phase + t * VOID.spinX * it.turn[0],
              it.phase * 1.7 + t * VOID.spinY * it.turn[1],
              it.phase * 2.3 + t * VOID.spinZ * it.turn[2],
            );
            turn.setFromEuler(euler);
            q.copy(frame).multiply(turn).multiply(frameInv).multiply(it.rest);
            pos.copy(it.position).addScaledVector(it.floatDir, Math.sin(time * it.floatSpeed + it.phase) * TUNNEL.drift);
            scl.setScalar(it.scale);
            meshes[k].setMatrixAt(i, m.compose(pos, q, scl).multiply(meshes[k].userData.local));
          }
          if (n) meshes[k].instanceMatrix.needsUpdate = true;
        }
      },
      dispose() {
        meshes.forEach((mesh) => mesh.dispose());
        dustGeometry.dispose();
        dustMaterial.dispose();
        for (const fx of [smoke, nebula]) {
          fx.geometry.dispose();
          fx.material.dispose();
        }
      },
    };
  }, [gltfs, density, version]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => system.dispose(), [system]);

  useFrame(({ camera, size, gl }) => {
    rocks.current.visible = heroState.journey.tunnel;
    nebulaMesh.current.position.copy(camera.position); // backdrop always around the camera
    const pixel = size.height * gl.getPixelRatio() * camera.projectionMatrix.elements[5] * 0.5;
    system.update(heroState.time, pixel, size.width * gl.getPixelRatio(), size.height * gl.getPixelRatio());
  });

  return (
    <group>
      <mesh ref={nebulaMesh} geometry={system.nebula.geometry} material={system.nebula.material} frustumCulled={false} renderOrder={-1} />
      <group ref={rocks}>
        {system.meshes.map((mesh, k) => (
          <primitive key={k} object={mesh} />
        ))}
      </group>
      <mesh geometry={system.dustGeometry} material={system.dustMaterial} frustumCulled={false} renderOrder={4} />
      <mesh geometry={system.smoke.geometry} material={system.smoke.material} frustumCulled={false} renderOrder={5} />
    </group>
  );
}
