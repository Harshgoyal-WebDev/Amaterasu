"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { GPUComputationRenderer } from "three/examples/jsm/misc/GPUComputationRenderer.js";
import { DISTORTION, FLUID, LAYERS, NETWORK, PARTICLES } from "../../config";
import { useConfigVersion } from "../../controls/configStore";
import { pointer } from "../../hooks/usePointer";
import { heroState } from "../../state";
import { FluidSim } from "../fluid/FluidSim";
import { fluidOutput } from "../fluid/fluidOutput";
import { pointerRay } from "../pointerRay";
import { buildNetwork, buildThreadGeometry } from "./buildNetwork";
import { energyUniforms as E } from "./energyUniforms";
import {
  pointFragment,
  pointVertex,
  simOffset,
  simVelocity,
  threadFragment,
  threadVertex,
} from "./shaders";

const REFLECTION_MASK = (1 << 0) | (1 << LAYERS.reflection);
const THREAD_SEGMENTS = 16; // enough for smooth curves
const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), -NETWORK.interactionPlaneZ);
const hit = new THREE.Vector3();
const target = new THREE.Vector3(0, 3.35, NETWORK.interactionPlaneZ);
const drawSize = new THREE.Vector2();

/**
 * Builds the whole energy system once (per quality tier / NETWORK change):
 * fluid solver, GPU particle simulation, nodes + dust points and thread
 * ribbons. Returns a controller driven from useFrame. The fluid itself is
 * drawn by the glass post effect (Effects.jsx) via `fluidOutput`.
 */
function createSystem(gl, quality) {
  const net = buildNetwork({ density: quality.density });
  const fluid = new FluidSim(gl, {
    resolution: quality.fluidResolution,
    dyeResolution: quality.dyeResolution,
    iterations: quality.pressureIterations,
  });

  /* ---------- GPU simulation: one texel per particle ---------- */
  const size = net.texSize;
  const gpu = new GPUComputationRenderer(size, size, gl);
  gpu.setDataType(THREE.HalfFloatType);
  const offsetVar = gpu.addVariable("tOffset", simOffset, gpu.createTexture());
  const velocityVar = gpu.addVariable("tVelocity", simVelocity, gpu.createTexture());
  gpu.setVariableDependencies(offsetVar, [offsetVar, velocityVar]);
  gpu.setVariableDependencies(velocityVar, [offsetVar, velocityVar]);
  const restTexture = new THREE.DataTexture(net.rest, size, size, THREE.RGBAFormat, THREE.FloatType);
  const paramTexture = new THREE.DataTexture(net.params, size, size, THREE.RGBAFormat, THREE.FloatType);
  restTexture.needsUpdate = true;
  paramTexture.needsUpdate = true;
  const sim = {
    tRest: { value: restTexture },
    tParams: { value: paramTexture },
    tFluid: { value: null },
    uFluidTexel: { value: new THREE.Vector2() },
    uViewProj: { value: new THREE.Matrix4() },
    uCamRight: { value: new THREE.Vector3(1, 0, 0) },
    uCamUp: { value: new THREE.Vector3(0, 1, 0) },
    uViewHeight: { value: 1 },
    uAspect: { value: 1 },
    uDt: { value: 0 },
    uTime: { value: 0 },
    uFluidForce: { value: 0 },
    uNodeSpring: { value: 0 },
    uDustSpring: { value: 0 },
    uDrag: { value: 0 },
    uWander: { value: 0 },
    uMotion: { value: 1 },
    uMaxOffset: { value: PARTICLES.maxOffset },
  };
  Object.assign(velocityVar.material.uniforms, sim);
  Object.assign(offsetVar.material.uniforms, { uDt: sim.uDt, uMaxOffset: sim.uMaxOffset });
  const error = gpu.init();
  if (error) console.error("[PortalParticleNetwork]", error);

  /* ---------- points: web nodes + dust ---------- */
  const p = net.particles;
  const pointGeometry = new THREE.BufferGeometry();
  pointGeometry.setAttribute("position", new THREE.BufferAttribute(p.positions, 3));
  pointGeometry.setAttribute("aRef", new THREE.BufferAttribute(p.refs, 2));
  pointGeometry.setAttribute("aKind", new THREE.BufferAttribute(p.kinds, 1));
  pointGeometry.setAttribute("aSeed", new THREE.BufferAttribute(p.seeds, 1));
  pointGeometry.setAttribute("aSize", new THREE.BufferAttribute(p.sizes, 1));
  pointGeometry.setAttribute("aTone", new THREE.BufferAttribute(p.tones, 1));
  pointGeometry.setAttribute("aGlow", new THREE.BufferAttribute(p.glows, 1));
  pointGeometry.setAttribute("aPhase", new THREE.BufferAttribute(p.phases, 1));
  pointGeometry.setAttribute("aFade", new THREE.BufferAttribute(p.fades, 1));

  const additive = { transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false };
  const point = {
    uNodeGain: { value: 1 },
    uDustGain: { value: 1 },
    uNodeSize: { value: 1 },
    uDustSize: { value: 1 },
  };
  const pointMaterial = new THREE.ShaderMaterial({
    ...additive,
    uniforms: { ...E, ...point },
    vertexShader: pointVertex,
    fragmentShader: pointFragment,
  });

  /* ---------- threads between web nodes ---------- */
  const threadGeometry = buildThreadGeometry(net.threads, THREAD_SEGMENTS);
  const thread = {
    uWidth: { value: PARTICLES.threadWidth },
    uBend: { value: PARTICLES.threadBend },
    uCurve: { value: PARTICLES.threadCurve },
    uConnectDistance: { value: NETWORK.connectDistance },
    uGain: { value: 1 },
  };
  const threadMaterial = new THREE.ShaderMaterial({
    ...additive,
    side: THREE.DoubleSide,
    uniforms: { ...E, ...thread },
    vertexShader: threadVertex,
    fragmentShader: threadFragment,
  });

  /* ---------- pointer → fluid splats ---------- */
  const splatPool = Array.from({ length: 5 }, () => ({ x: 0, y: 0, dx: 0, dy: 0, color: new THREE.Color(), radius: 0 }));
  const ctrl = { lastX: 0, lastY: 0, had: false };

  const splats = []; // reused every frame
  const collectSplats = (aspect) => {
    splats.length = 0;
    const radius = FLUID.splatRadius / 100;

    if (pointer.active && ctrl.had) {
      let du = (pointer.x - ctrl.lastX) * 0.5;
      let dv = (pointer.y - ctrl.lastY) * 0.5;
      if (Math.abs(du) + Math.abs(dv) > 1e-5) {
        // Spread a long jump (slow frame / fast flick) along the path, so the
        // trail stays continuous instead of a row of blobs.
        const steps = Math.min(5, Math.max(1, Math.ceil(Math.hypot(du, dv) / 0.012)));
        const x0 = (ctrl.lastX + 1) * 0.5;
        const y0 = (ctrl.lastY + 1) * 0.5;
        const x1 = (pointer.x + 1) * 0.5;
        const y1 = (pointer.y + 1) * 0.5;
        if (aspect < 1) du *= aspect;
        if (aspect > 1) dv /= aspect;
        const amount = (Math.min(Math.hypot(du, dv) * 40, 1) * FLUID.trail) / steps;
        for (let k = 1; k <= steps; k++) {
          const s = splatPool[k - 1];
          const t = k / steps;
          s.x = x0 + (x1 - x0) * t;
          s.y = y0 + (y1 - y0) * t;
          s.dx = (du * FLUID.splatForce) / Math.sqrt(steps);
          s.dy = (dv * FLUID.splatForce) / Math.sqrt(steps);
          s.radius = radius;
          s.color.setScalar(amount); // liquid thickness
          splats.push(s);
        }
      }
    }
    ctrl.had = pointer.active;
    ctrl.lastX = pointer.x;
    ctrl.lastY = pointer.y;

    return splats;
  };

  return {
    counts: { particles: p.count, web: p.web, threads: net.threads.count, texture: size },
    pointGeometry,
    pointMaterial,
    threadGeometry,
    threadMaterial,

    /**
     * The cursor fluid runs for the whole journey (it is drawn as liquid
     * glass by the post pass); the particle web only while it is on screen.
     */
    update({ gl: renderer, camera, size: viewport }, rawDelta, interactive, particles) {
      const dt = Math.min(rawDelta, 1 / 30);
      const fx = heroState.fx;
      const aspect = viewport.width / viewport.height;

      // fluid
      fluid.ensureSize(aspect);
      fluid.iterations = quality.pressureIterations;
      // The solver sleeps ~1 s after the trail has faded (≈ ln(100) / fade
      // rate), so an idle hero spends nothing on it.
      const sleepAfter = Math.min(8, 4.6 / Math.max(FLUID.dyeDissipation, 0.1)) + 0.5;
      const awake = fluid.update(
        dt,
        { dyeDissipation: FLUID.dyeDissipation },
        interactive ? collectSplats(aspect) : [],
        DISTORTION.enabled ? DISTORTION : null,
        sleepAfter,
      );
      fluidOutput.density = fluid.dyeTexture;
      fluidOutput.velocity = fluid.velocityTexture;
      fluidOutput.glass = fluid.glassTexture;
      fluidOutput.awake = awake;
      fluidOutput.densityTexel.copy(fluid.dyeTexel);
      fluidOutput.velocityTexel.copy(fluid.velocityTexel);
      if (!particles) return;

      // particle simulation
      sim.tFluid.value = fluid.velocityTexture;
      sim.uFluidTexel.value.copy(fluid.velocityTexel);
      sim.uViewProj.value.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
      sim.uCamRight.value.setFromMatrixColumn(camera.matrixWorld, 0);
      sim.uCamUp.value.setFromMatrixColumn(camera.matrixWorld, 1);
      sim.uViewHeight.value = 2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
      sim.uAspect.value = camera.aspect;
      sim.uDt.value = dt;
      sim.uTime.value = heroState.time;
      sim.uFluidForce.value = PARTICLES.fluidForce * fx.cursorStrength;
      sim.uNodeSpring.value = PARTICLES.nodeSpring;
      sim.uDustSpring.value = PARTICLES.dustSpring;
      sim.uDrag.value = PARTICLES.drag;
      sim.uWander.value = PARTICLES.wander;
      sim.uMotion.value = fx.displacement;
      sim.uMaxOffset.value = PARTICLES.maxOffset;
      gpu.compute();

      // shared render uniforms
      E.tOffset.value = gpu.getCurrentRenderTarget(offsetVar).texture;
      E.tDye.value = fluid.dyeTexture;
      E.uTime.value = heroState.time;
      E.uMotion.value = fx.displacement;
      E.uIntensity.value = fx.particleIntensity;
      E.uGlowIntensity.value = fx.glowIntensity;
      E.uAwaken.value = fx.awaken;
      E.uTwinkle.value = PARTICLES.twinkle;
      E.uPulse.value = PARTICLES.pulses;
      E.uStirGlow.value = PARTICLES.stirGlow;
      E.uSmokeTint.value = PARTICLES.smokeTint;
      E.uColorDeep.value.set(PARTICLES.colorDeep);
      E.uColorMid.value.set(PARTICLES.colorMid);
      E.uColorBright.value.set(PARTICLES.colorBright);
      E.uColorHot.value.set(PARTICLES.colorHot);
      renderer.getDrawingBufferSize(drawSize);
      E.uResolution.value.copy(drawSize);
      E.uViewportHeight.value = drawSize.y;
      point.uNodeGain.value = PARTICLES.nodeBrightness;
      point.uDustGain.value = PARTICLES.dustBrightness;
      point.uNodeSize.value = PARTICLES.nodeSize;
      point.uDustSize.value = PARTICLES.dustSize;
      thread.uGain.value = PARTICLES.threadBrightness;
      thread.uWidth.value = PARTICLES.threadWidth;
      thread.uBend.value = PARTICLES.threadBend;
      thread.uCurve.value = PARTICLES.threadCurve;

      // cursor on the arch plane (brightens the gate edge nearby)
      const ray = pointerRay(camera);
      const onPlane = interactive && ray.intersectPlane(plane, hit) !== null;
      if (onPlane) target.copy(hit);
      E.uPointer.value.lerp(target, 1 - Math.exp(-6 * dt));
      const want = onPlane && pointer.active ? 1 : 0;
      E.uPointerStrength.value += (want - E.uPointerStrength.value) * (1 - Math.exp(-2.5 * dt));
    },

    dispose() {
      fluid.dispose();
      fluidOutput.density = null;
      fluidOutput.velocity = null;
      fluidOutput.glass = null;
      fluidOutput.awake = false;
      gpu.dispose();
      restTexture.dispose();
      paramTexture.dispose();
      pointGeometry.dispose();
      pointMaterial.dispose();
      threadGeometry.dispose();
      threadMaterial.dispose();
    },
  };
}

/**
 * Fluid-driven particle web around the portal.
 *
 *  - The cursor stirs a screen-space fluid.
 *  - ~10k particles live on the GPU: each is carried by the flow at its
 *    screen position, springs back to rest, and glows while stirred.
 *  - Threads read the same simulation, so they stretch, thin and let go
 *    when pulled, then re-form as the web relaxes.
 *  - The fluid is drawn as clear liquid glass by the post effect.
 *
 * Draw calls: points + threads (+ the same two in the water reflection).
 */
export default function PortalParticleNetwork({ quality, interactive = true }) {
  const gl = useThree((s) => s.gl);
  const version = useConfigVersion("NETWORK");
  const system = useMemo(() => createSystem(gl, quality), [gl, quality, version]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => system.dispose(), [system]);
  const group = useRef(null);
  useFrame((state, delta) => {
    // past the portal the web is behind the camera: stop drawing + simulating
    // it, but keep the cursor fluid (liquid glass) alive for the whole journey
    group.current.visible = heroState.journey.hero;
    system.update(state, delta, interactive, group.current.visible);
  });

  return (
    <group ref={group} userData={system.counts}>
      <mesh
        geometry={system.threadGeometry}
        material={system.threadMaterial}
        frustumCulled={false}
        renderOrder={3}
        layers-mask={REFLECTION_MASK}
      />
      <points
        geometry={system.pointGeometry}
        material={system.pointMaterial}
        frustumCulled={false}
        renderOrder={4}
        layers-mask={REFLECTION_MASK}
      />
    </group>
  );
}
