"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { useGLTF, useTexture } from "@react-three/drei";
import * as THREE from "three";
import { BOULDER } from "../../config";
import { pointer } from "../../hooks/usePointer";
import { heroState } from "../../state";
import { pointerRay } from "../pointerRay";
import { createRevealLayer, patchBoulderMaterial } from "./boulderMaterial";

const MOTES = 48;
const origin = new THREE.Vector3(...BOULDER.position);
const frontPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), -(BOULDER.position[2] + BOULDER.front.z));
const hit = new THREE.Vector3();

/** World point on the inscribed front → atlas uv (the front is planar in UV). */
function frontUv(world, out) {
  const [u0, x0, ku] = BOULDER.front.u;
  const [v0, y0, kv] = BOULDER.front.v;
  out.x = u0 + (world.x - origin.x - x0) * ku;
  out.y = v0 + (world.y - origin.y - y0) * kv;
  return out.x >= 0 && out.x <= 1 && out.y >= 0 && out.y <= BOULDER.front.vMax;
}

const moteVertex = /* glsl */ `
attribute float aLife;
uniform float uPixel;
varying float vLife;
void main() {
  vLife = aLife;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = aLife > 0.0 ? clamp(0.02 * uPixel / -mv.z, 1.0, 6.0) : 0.0;
}
`;
const moteFragment = /* glsl */ `
varying float vLife;
void main() {
  vec2 c = gl_PointCoord * 2.0 - 1.0;
  float d = dot(c, c);
  if (d > 1.0 || vLife <= 0.0) discard;
  gl_FragColor = vec4(vec3(0.55, 0.48, 0.62) * exp(-d * 2.5) * vLife * 0.9, 1.0);
}
`;

/** A few dust motes that puff off the stone where it is scratched. */
function createMotes() {
  const positions = new Float32Array(MOTES * 3);
  const life = new Float32Array(MOTES);
  const velocity = new Float32Array(MOTES * 3);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage));
  geometry.setAttribute("aLife", new THREE.BufferAttribute(life, 1).setUsage(THREE.DynamicDrawUsage));
  const material = new THREE.ShaderMaterial({
    uniforms: { uPixel: { value: 500 } },
    vertexShader: moteVertex,
    fragmentShader: moteFragment,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  });
  let next = 0;
  let alive = 0;
  return {
    geometry,
    material,
    emit(at) {
      for (let k = 0; k < 2; k++) {
        const i = next++ % MOTES;
        positions.set([at.x, at.y, at.z + 0.03], i * 3);
        velocity.set([(Math.random() - 0.5) * 0.5, Math.random() * 0.25, 0.15 + Math.random() * 0.35], i * 3);
        life[i] = 1;
      }
      alive = 1.2;
    },
    update(dt, pixel) {
      material.uniforms.uPixel.value = pixel;
      if (alive <= 0) return;
      alive -= dt;
      for (let i = 0; i < MOTES; i++) {
        if (life[i] <= 0) continue;
        life[i] = Math.max(0, life[i] - dt * 0.9);
        velocity[i * 3 + 1] -= dt * 0.25; // settles
        for (let a = 0; a < 3; a++) positions[i * 3 + a] += velocity[i * 3 + a] * dt;
      }
      geometry.attributes.position.needsUpdate = true;
      geometry.attributes.aLife.needsUpdate = true;
    },
    dispose() {
      geometry.dispose();
      material.dispose();
    },
  };
}

/**
 * The Skills Boulder (Blender asset, 10 fragments kept as separate meshes so
 * they can be broken apart later). Its carved skills start under dust; once
 * the camera has arrived, click-drag (or a horizontal swipe on touch)
 * scratches the dust away and the engravings glow violet. Scratching maps
 * the pointer to the atlas with one ray–plane hit — no mesh raycasts.
 */
/** Masks / clean colour use the glTF atlas convention (no flip). */
function prepareTextures(masks, clean) {
  masks.flipY = false;
  masks.colorSpace = THREE.NoColorSpace;
  clean.flipY = false;
  clean.colorSpace = THREE.SRGBColorSpace;
  masks.needsUpdate = true;
  clean.needsUpdate = true;
}

/**
 * Builds the boulder's controller: material patch, scratch layer, motes and
 * the per-frame logic (visibility, scratching, cursor / touch behaviour).
 */
function createBoulder(scene, masks, clean) {
  prepareTextures(masks, clean);
  const reveal = createRevealLayer();
  let uniforms = null;
  scene.traverse((o) => {
    if (o.isMesh && !uniforms) uniforms = patchBoulderMaterial(o.material, { masks, clean, reveal: reveal.texture });
  });
  const motes = createMotes();
  const last = new THREE.Vector2();
  const uv = new THREE.Vector2();
  const state = { drawing: false, hover: false, dom: null };

  const setDom = (dom, cursor, touch) => {
    if (dom.style.cursor !== cursor) dom.style.cursor = cursor;
    if (dom.style.touchAction !== touch) dom.style.touchAction = touch;
  };

  return {
    motes,
    frame({ camera, size, gl }, rawDt, group, points) {
      const j = heroState.journey;
      state.dom = gl.domElement;
      group.visible = j.boulder;
      points.visible = j.boulder;
      // Once arrived: horizontal swipes scratch on touch, vertical still scroll.
      if (!j.boulder) {
        setDom(gl.domElement, "", "");
        return;
      }
      const dt = Math.min(rawDt, 0.1);
      uniforms.uTime.value = heroState.time;
      const pixel = size.height * gl.getPixelRatio() * camera.projectionMatrix.elements[5] * 0.5;
      motes.update(dt, pixel);

      let over = false;
      if (j.arrived && pointer.active) {
        over = pointerRay(camera).intersectPlane(frontPlane, hit) !== null && frontUv(hit, uv);
      }
      setDom(gl.domElement, over ? "crosshair" : "", j.arrived ? "pan-y" : "");
      if (over && pointer.pressed) {
        if (!state.drawing) last.copy(uv);
        reveal.stroke(last.x, last.y, uv.x, uv.y);
        if (!state.drawing || last.distanceToSquared(uv) > 1e-5) motes.emit(hit);
        last.copy(uv);
        state.drawing = true;
      } else {
        state.drawing = false;
      }
    },
    dispose() {
      if (state.dom) setDom(state.dom, "", "");
      reveal.dispose();
      motes.dispose();
    },
  };
}

/**
 * The Skills Boulder (Blender asset, 10 fragments kept as separate meshes so
 * they can be broken apart later). Its carved skills start under dust; once
 * the camera has arrived, click-drag (or a horizontal swipe on touch)
 * scratches the dust away and the engravings glow violet. Scratching maps
 * the pointer to the atlas with one ray–plane hit — no mesh raycasts.
 */
export default function SkillsBoulder() {
  const { scene } = useGLTF(BOULDER.url, false, true);
  const [masks, clean] = useTexture([BOULDER.masks, BOULDER.clean]);
  const group = useRef(null);
  const motes = useRef(null);
  const boulder = useMemo(() => createBoulder(scene, masks, clean), [scene, masks, clean]);
  useEffect(() => () => boulder.dispose(), [boulder]);
  useFrame((state, dt) => boulder.frame(state, dt, group.current, motes.current));

  return (
    <>
      <group ref={group} position={BOULDER.position} visible={false}>
        <primitive object={scene} />
      </group>
      <points ref={motes} geometry={boulder.motes.geometry} material={boulder.motes.material} frustumCulled={false} visible={false} renderOrder={4} />
    </>
  );
}
