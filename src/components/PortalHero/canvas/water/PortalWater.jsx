"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { useTexture } from "@react-three/drei";
import * as THREE from "three";
import { LAYERS, PORTAL, WATER, WATER_DATA } from "../../config";
import { pointer } from "../../hooks/usePointer";
import { heroState } from "../../state";
import { energyUniforms } from "../network/energyUniforms";
import { pointerRay } from "../pointerRay";
import { MAX_RIPPLES, waterFragment, waterVertex } from "./waterShader";
import { getNoiseTexture } from "../noiseTexture";

// ---- planar reflection scratch objects (adapted from three/examples Reflector)
const reflectorPlane = new THREE.Plane();
const normal = new THREE.Vector3();
const reflectorWorldPosition = new THREE.Vector3();
const cameraWorldPosition = new THREE.Vector3();
const rotationMatrix = new THREE.Matrix4();
const lookAtPosition = new THREE.Vector3();
const clipPlane = new THREE.Vector4();
const view = new THREE.Vector3();
const target = new THREE.Vector3();
const q = new THREE.Vector4();
const savedResolution = new THREE.Vector2();
const clearColor = new THREE.Color();

const waterPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -WATER.level);
const hit = new THREE.Vector3();
const lastRipple = new THREE.Vector3(0, -50, 0);
const [X0, X1] = WATER_DATA.bounds.x;
const [Z0, Z1] = WATER_DATA.bounds.z;

/** Material, reflection buffer and per-frame logic for the water. */
function createWater(heightMap, { reflections }) {
  heightMap.colorSpace = THREE.NoColorSpace;
  heightMap.wrapS = heightMap.wrapT = THREE.ClampToEdgeWrapping;
  heightMap.needsUpdate = true;

  const renderTarget = new THREE.WebGLRenderTarget(16, 16, { type: THREE.HalfFloatType, depthBuffer: true });
  renderTarget.texture.generateMipmaps = false;
  const textureMatrix = new THREE.Matrix4();
  const virtualCamera = new THREE.PerspectiveCamera();
  virtualCamera.layers.set(LAYERS.reflection);

  const material = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      tNoise: { value: getNoiseTexture() },
      uHeight: { value: heightMap },
      uHeightRange: { value: new THREE.Vector2(WATER_DATA.heightMap.min, WATER_DATA.heightMap.max) },
      uBounds: { value: new THREE.Vector4(X0, X1, Z0, Z1) },
      uLevel: { value: WATER.level },
      uReflection: { value: renderTarget.texture },
      uHasReflection: { value: reflections ? 1 : 0 },
      uReflectionTexel: { value: new THREE.Vector2(1 / 16, 1 / 16) },
      uTextureMatrix: { value: textureMatrix },
      uRipples: { value: Array.from({ length: MAX_RIPPLES }, () => new THREE.Vector4(0, 0, -100, 0)) },
      uRippleIntensity: { value: WATER.rippleIntensity },
      uRippleSpeed: { value: WATER.rippleSpeed },
      uRippleScale: { value: WATER.rippleScale },
      uRoughness: { value: WATER.roughness },
      uStretch: { value: WATER.stretch },
      uWaterIntensity: { value: WATER.reflection },
      uDeep: { value: new THREE.Color(WATER.color) },
      uTint: { value: new THREE.Color(WATER.tint) },
      uPortalCenter: { value: new THREE.Vector3(...PORTAL.center) },
    },
    vertexShader: waterVertex,
    fragmentShader: waterFragment,
    transparent: true,
    depthWrite: false,
    toneMapped: false,
  });
  const u = material.uniforms;
  const ripples = { next: 0, lastEmit: -10, downCount: pointer.downCount, nextDrip: 1 };

  const emit = (x, z, strength) => {
    u.uRipples.value[ripples.next++ % MAX_RIPPLES].set(x, z, heroState.time, strength);
  };

  /** Renders only the reflection layer, mirrored through the water plane. */
  const renderReflection = (gl, scene, camera, size, mesh, scale) => {
    const w = Math.max(64, Math.round(size.width * gl.getPixelRatio() * scale));
    const h = Math.max(64, Math.round(size.height * gl.getPixelRatio() * scale));
    if (renderTarget.width !== w || renderTarget.height !== h) {
      renderTarget.setSize(w, h);
      u.uReflectionTexel.value.set(1 / w, 1 / h);
    }

    reflectorWorldPosition.setFromMatrixPosition(mesh.matrixWorld);
    cameraWorldPosition.setFromMatrixPosition(camera.matrixWorld);
    rotationMatrix.extractRotation(mesh.matrixWorld);
    normal.set(0, 0, 1).applyMatrix4(rotationMatrix);
    view.subVectors(reflectorWorldPosition, cameraWorldPosition);
    if (view.dot(normal) > 0) return; // camera below the water
    view.reflect(normal).negate().add(reflectorWorldPosition);
    rotationMatrix.extractRotation(camera.matrixWorld);
    lookAtPosition.set(0, 0, -1).applyMatrix4(rotationMatrix).add(cameraWorldPosition);
    target.subVectors(reflectorWorldPosition, lookAtPosition).reflect(normal).negate().add(reflectorWorldPosition);
    virtualCamera.position.copy(view);
    virtualCamera.up.set(0, 1, 0).applyMatrix4(rotationMatrix).reflect(normal);
    virtualCamera.lookAt(target);
    virtualCamera.far = camera.far;
    virtualCamera.updateMatrixWorld();
    virtualCamera.projectionMatrix.copy(camera.projectionMatrix);

    textureMatrix.set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1);
    textureMatrix.multiply(virtualCamera.projectionMatrix).multiply(virtualCamera.matrixWorldInverse).multiply(mesh.matrixWorld);

    // Oblique near plane: clip everything below the water line.
    reflectorPlane.setFromNormalAndCoplanarPoint(normal, reflectorWorldPosition);
    reflectorPlane.applyMatrix4(virtualCamera.matrixWorldInverse);
    clipPlane.set(reflectorPlane.normal.x, reflectorPlane.normal.y, reflectorPlane.normal.z, reflectorPlane.constant);
    const pm = virtualCamera.projectionMatrix.elements;
    q.x = (Math.sign(clipPlane.x) + pm[8]) / pm[0];
    q.y = (Math.sign(clipPlane.y) + pm[9]) / pm[5];
    q.z = -1;
    q.w = (1 + pm[10]) / pm[14];
    clipPlane.multiplyScalar(2 / clipPlane.dot(q));
    pm[2] = clipPlane.x;
    pm[6] = clipPlane.y;
    pm[10] = clipPlane.z + 1 - 0.003;
    pm[14] = clipPlane.w;

    // Energy shaders size points / threads by viewport → use the buffer's size.
    savedResolution.copy(energyUniforms.uResolution.value);
    energyUniforms.uResolution.value.set(w, h);
    energyUniforms.uViewportHeight.value = h;
    energyUniforms.uReflectionPass.value = 1;

    const prevTarget = gl.getRenderTarget();
    const prevShadowAuto = gl.shadowMap.autoUpdate;
    const prevAlpha = gl.getClearAlpha();
    gl.getClearColor(clearColor);
    mesh.visible = false;
    gl.shadowMap.autoUpdate = false; // reuse this frame's shadow maps
    gl.setRenderTarget(renderTarget);
    gl.setClearColor(0x000000, 1);
    gl.clear();
    gl.render(scene, virtualCamera);
    gl.setRenderTarget(prevTarget);
    gl.setClearColor(clearColor, prevAlpha);
    gl.shadowMap.autoUpdate = prevShadowAuto;
    mesh.visible = true;

    energyUniforms.uResolution.value.copy(savedResolution);
    energyUniforms.uViewportHeight.value = savedResolution.y;
    energyUniforms.uReflectionPass.value = 0;
  };

  return {
    material,

    update({ gl, scene, camera, size }, mesh, { reflectionScale, ambientDrips }) {
      const now = heroState.time;
      u.uTime.value = now;
      u.uRippleIntensity.value = WATER.rippleIntensity * heroState.fx.rippleIntensity;
      u.uRippleSpeed.value = WATER.rippleSpeed;
      u.uRippleScale.value = WATER.rippleScale;
      u.uRoughness.value = WATER.roughness;
      u.uStretch.value = WATER.stretch;
      u.uWaterIntensity.value = WATER.reflection * heroState.fx.waterIntensity;
      u.uLevel.value = WATER.level;
      u.uDeep.value.set(WATER.color);
      u.uTint.value.set(WATER.tint);
      waterPlane.constant = -WATER.level;
      if (mesh) mesh.position.y = WATER.level;

      // Cursor ripples: a new ring whenever the cursor has travelled a bit.
      const ray = pointerRay(camera);
      const onWater = ray.intersectPlane(waterPlane, hit) !== null && hit.x > X0 && hit.x < X1 && hit.z > Z0 && hit.z < Z1;
      if (onWater && pointer.active) {
        const moved = hit.distanceTo(lastRipple);
        if (moved > 0.32 && now - ripples.lastEmit > 0.09) {
          emit(hit.x, hit.z, Math.min(0.35 + moved * 0.5, 1));
          lastRipple.copy(hit);
          ripples.lastEmit = now;
        }
      }
      // Click / tap → a stronger splash.
      if (pointer.downCount !== ripples.downCount) {
        ripples.downCount = pointer.downCount;
        if (onWater) emit(hit.x, hit.z, 1.3);
      }
      // Ambient drips (what touch users see without interacting).
      if (ambientDrips && WATER.drips && now > ripples.nextDrip) {
        const [dx, dz] = WATER_DATA.drips[Math.floor(Math.random() * WATER_DATA.drips.length)];
        emit(dx + (Math.random() - 0.5) * 0.4, dz + (Math.random() - 0.5) * 0.4, 0.45);
        const [a, b] = WATER_DATA.dripInterval;
        ripples.nextDrip = now + a + Math.random() * (b - a);
      }

      if (reflections && mesh) renderReflection(gl, scene, camera, size, mesh, reflectionScale);
    },

    dispose() {
      material.dispose();
      renderTarget.dispose();
    },
  };
}

/**
 * Shallow, dark water over the existing floor.
 *
 *  - Coverage comes from a heightmap ray-cast from the Blender model, so the
 *    shoreline hugs the real floor and rocks break the surface naturally.
 *  - Ripples: a fixed ring buffer of 16 uniforms (no meshes per ripple).
 *  - Reflection: a low-res planar pass that renders ONLY the reflection layer
 *    (portal stones + particle network + glow, lit by the violet lights), so
 *    it costs a handful of draw calls, not the whole scene.
 */
export default function PortalWater({ reflectionScale = 0.5, reflections = true, ambientDrips = true }) {
  const mesh = useRef(null);
  const heightMap = useTexture(WATER_DATA.heightMap.url);
  const water = useMemo(() => createWater(heightMap, { reflections }), [heightMap, reflections]);
  useEffect(() => () => water.dispose(), [water]);
  useFrame((state) => {
    // past the portal: no water, and no reflection pass
    mesh.current.visible = heroState.journey.hero;
    if (mesh.current.visible) water.update(state, mesh.current, { reflectionScale, ambientDrips });
  });

  return (
    <mesh
      ref={mesh}
      position={[(X0 + X1) / 2, WATER.level, (Z0 + Z1) / 2]}
      rotation-x={-Math.PI / 2}
      material={water.material}
      renderOrder={1}
    >
      <planeGeometry args={[X1 - X0, Z1 - Z0]} />
    </mesh>
  );
}
