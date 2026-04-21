"use client";

import { useRef, useEffect, useState, Suspense, useMemo } from "react";
import { Canvas, useFrame, useThree, extend } from "@react-three/fiber";
import * as THREE from "three";
import { KTX2Loader } from "three/examples/jsm/loaders/KTX2Loader";

/* -------------------------------------------------------------------------- */
/*                               BLOB SHADER                                  */
/* -------------------------------------------------------------------------- */

const BLOB_SHADER = {
  uniforms: {
    uTime: { value: 0 },
    uTransition: { value: 0 },
    uMorphProgress: { value: 0 }, // 0 = sphere, 1 = donut
    uMouse: { value: new THREE.Vector2(0, 0) },
    uHover: { value: 0 },
    uHoverCenter: { value: new THREE.Vector2(0, 0) },
    uHoverRadius: { value: 0.2 },
    uBaseBloom: { value: 1.08 },
    uHoverBloom: { value: 0.75 },
    uNoiseStrength: { value: 0.085 },

    // blue particle color
    uColor: { value: new THREE.Color("#8AB9F1") },

    uParticleSize: { value: 1.0 },
    uCoreParticleSize: { value: 1.0 },
    uOpacity: { value: 1.0 },
  },
  vertexShader: /* glsl */ `
    attribute vec3 aTarget;
    attribute vec3 aNormalDir;
    attribute float aRibbon;
    attribute float aU;
    attribute float aV;
    attribute float aScale;

    varying float vHoverFalloff;
    varying float vV;
    varying float vDepthCenter;
    varying float vNoise;

    uniform float uTime;
    uniform float uTransition;
    uniform float uMorphProgress;
    uniform vec2 uMouse;
    uniform float uHover;
    uniform vec2 uHoverCenter;
    uniform float uHoverRadius;
    uniform float uBaseBloom;
    uniform float uHoverBloom;
    uniform float uNoiseStrength;
    uniform float uParticleSize;
    uniform float uCoreParticleSize;

    vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
    vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
    vec4 permute(vec4 x) { return mod289(((x * 34.0) + 1.0) * x); }

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
      vec4 p = permute(
        permute(
          permute(i.z + vec4(0.0, i1.z, i2.z, 1.0))
          + i.y + vec4(0.0, i1.y, i2.y, 1.0)
        ) + i.x + vec4(0.0, i1.x, i2.x, 1.0)
      );

      vec4 j = p - 49.0 * floor(p * 0.02040816326);
      vec4 x_ = floor(j * 0.14285714285);
      vec4 y_ = floor(j - 7.0 * x_);
      vec4 x = x_ * 0.14285714285 + 0.07142857142;
      vec4 y = y_ * 0.14285714285 + 0.07142857142;
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

      vec4 norm = inversesqrt(vec4(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));
      p0 *= norm.x;
      p1 *= norm.y;
      p2 *= norm.z;
      p3 *= norm.w;

      vec4 m = max(0.5 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
      m = m * m;

      return 42.0 * dot(m * m, vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3)));
    }

    vec3 buildSphereTarget(vec3 p, vec3 nrmDir, float vv) {
      vec3 dir = normalize(p + vec3(0.0001));
      float sphereRadius = 0.24;
      vec3 base = dir * sphereRadius;
      base += nrmDir * vv * 0.018;
      return base;
    }

    vec3 buildDonutTarget(vec3 p, vec3 nrmDir, float vv) {
      float theta = atan(p.z, p.x);
      float radialXZ = length(p.xz);

      float majorRadius = 0.23;
      float minorRadius = 0.075 + abs(vv) * 0.01;

      float phi = atan(p.y, max(0.0001, radialXZ - 0.22));

      vec3 base;
      base.x = cos(theta) * (majorRadius + minorRadius * cos(phi));
      base.y = minorRadius * sin(phi);
      base.z = sin(theta) * (majorRadius + minorRadius * cos(phi));

      base += nrmDir * vv * 0.012;
      return base;
    }

    void main() {
      float t = uTime;
      float morph = smoothstep(0.0, 1.0, uMorphProgress);

      vec3 sphereTarget = buildSphereTarget(aTarget, aNormalDir, aV);
      vec3 donutTarget = buildDonutTarget(aTarget, aNormalDir, aV);
      vec3 targetShape = mix(sphereTarget, donutTarget, morph);

      float n1 = snoise(targetShape * (2.0 + morph * 0.8) + vec3(0.0, t * (0.18 + morph * 0.6), aRibbon * 1.7));
      float n2 = snoise(targetShape * 4.2 + vec3(t * -0.16, t * (0.08 + morph * 0.9), aU * 4.0));

      float verticalFlow = sin(targetShape.y * (8.0 + morph * 8.0) + t * (1.2 + morph * 3.2) + aRibbon * 4.0) * (0.012 + morph * 0.02);

      float noise = n1 * 0.68 + n2 * 0.32;
      vNoise = noise;
      vV = aV;

      vec3 ordered = targetShape;

      float surfaceWave =
        sin(aU * (12.0 + morph * 6.0) - t * (1.8 + morph * 1.2) + aRibbon * 2.7) * (0.012 + morph * 0.008) +
        cos(aU * (7.0 + morph * 3.0) + t * (1.2 + morph * 0.9) + aRibbon * 4.1) * (0.008 + morph * 0.006);

      float edgeWave =
        sin(aU * 20.0 - t * (2.0 + morph * 1.2) + aV * 4.2 + aRibbon) * (0.008 + morph * 0.004) * abs(aV);

      ordered += aNormalDir * (surfaceWave + edgeWave + verticalFlow);
      ordered += normalize(targetShape + vec3(0.0001)) * (noise * (0.01 + morph * 0.015));

      vec3 chaos = targetShape;
      chaos += aNormalDir * (noise * uNoiseStrength * (1.2 + morph * 1.0));
      chaos += normalize(targetShape + vec3(0.0001)) * (noise * uNoiseStrength);
      chaos.y += sin(aU * 10.0 + t * (1.4 + morph * 2.2) + aRibbon * 2.6) * (0.014 + morph * 0.02);
      chaos.x += cos(aU * 9.0 - t * (1.0 + morph * 1.4) + aRibbon * 1.8) * (0.01 + morph * 0.008);
      chaos.z += sin(aU * 8.0 + t * (0.9 + morph * 1.5) + aV * 3.2) * (0.01 + morph * 0.008);

      vec3 pos = mix(chaos, ordered, uTransition);
      pos.xy += uMouse * 0.018;

      float hoverDist = distance(targetShape.xy, uHoverCenter);
      float hoverFalloff = 1.0 - smoothstep(0.0, uHoverRadius, hoverDist);
      vHoverFalloff = hoverFalloff * uHover;

      float centerFactor = 1.0 - smoothstep(0.0, mix(0.28, 0.52, morph), length(targetShape.xy));
      vDepthCenter = centerFactor;

      vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);

      float pointSize =
        mix(4.2, 3.35, uTransition) *
        aScale *
        uBaseBloom *
        uParticleSize *
        mix(1.0, uCoreParticleSize, centerFactor) *
        (1.0 + vHoverFalloff * uHoverBloom) *
        (1.0 + centerFactor * 0.10);

      gl_PointSize = pointSize * (1.0 / max(0.001, -mvPosition.z));
      gl_Position = projectionMatrix * mvPosition;
    }
  `,
  fragmentShader: /* glsl */ `
    varying float vHoverFalloff;
    varying float vV;
    varying float vDepthCenter;
    varying float vNoise;

    uniform vec3 uColor;
    uniform float uHoverBloom;
    uniform float uOpacity;

    void main() {
      vec2 p = gl_PointCoord - vec2(0.5);
      float d = length(p);
      if (d > 0.5) discard;

      float core = smoothstep(0.18, 0.0, d);
      float halo = smoothstep(0.5, 0.0, d);

      float lineEdge = 1.0 - smoothstep(0.0, 0.95, abs(vV));
      float innerBoost = vDepthCenter;
      float hoverBoost = vHoverFalloff * uHoverBloom;

      vec3 base = uColor;
      base *= (1.0 + innerBoost * 0.16 + lineEdge * 0.08);
      base += vec3(vNoise * 0.03);

      vec3 color = base * (
        core * (1.18 + hoverBoost * 1.08 + innerBoost * 0.18) +
        halo * (0.22 + hoverBoost * 0.82 + lineEdge * 0.06)
      );

      float alpha =
        core * (0.74 + hoverBoost * 0.22 + innerBoost * 0.06) +
        halo * (0.08 + hoverBoost * 0.16);

      gl_FragColor = vec4(color, alpha * uOpacity);
    }
  `,
};

/* -------------------------------------------------------------------------- */
/*                           GEOMETRY GENERATION                              */
/* -------------------------------------------------------------------------- */

function createVolumetricRibbonBlobGeometry({
  ribbons = 7,
  uSegments = 250,
  vSegments = 18,
}) {
  const total = ribbons * uSegments * vSegments;

  const positions = new Float32Array(total * 3);
  const targets = new Float32Array(total * 3);
  const normalDirs = new Float32Array(total * 3);
  const ribbonAttr = new Float32Array(total);
  const uAttr = new Float32Array(total);
  const vAttr = new Float32Array(total);
  const scaleAttr = new Float32Array(total);

  let ptr = 0;

  for (let r = 0; r < ribbons; r++) {
    const ribbonT = ribbons === 1 ? 0.5 : r / (ribbons - 1);
    const phase = ribbonT * Math.PI * 2.0;
    const heightOffset = (ribbonT - 0.5) * 0.22;
    const depthOffset = Math.sin(ribbonT * Math.PI * 2.0) * 0.06;

    const baseRadiusX = 0.19 + (1.0 - Math.abs(ribbonT - 0.5) * 2.0) * 0.07;
    const baseRadiusY = 0.10 + (1.0 - Math.abs(ribbonT - 0.5) * 2.0) * 0.03;
    const baseRadiusZ = 0.13 + (1.0 - Math.abs(ribbonT - 0.5) * 2.0) * 0.06;
    const turns = 1.2 + ribbonT * 1.1;
    const widthBase = 0.026 + (1.0 - Math.abs(ribbonT - 0.5) * 2.0) * 0.018;

    for (let i = 0; i < uSegments; i++) {
      const u = i / (uSegments - 1);
      const angle = u * Math.PI * 2.0 * turns + phase;

      const warp1 = Math.sin(angle * 0.7 + ribbonT * 5.0) * 0.03;
      const warp2 = Math.cos(u * Math.PI * 2.0 + ribbonT * 3.5) * 0.02;

      const cx =
        Math.cos(angle) * (baseRadiusX + warp1) +
        Math.cos(angle * 0.45 + phase) * 0.03;

      const cy =
        heightOffset +
        Math.sin(angle * 0.85 + phase * 0.5) * baseRadiusY +
        Math.cos(u * Math.PI * 2.0 + phase) * 0.025 +
        warp2;

      const cz =
        depthOffset +
        Math.sin(angle) * (baseRadiusZ + warp1 * 0.7) +
        Math.sin(angle * 0.52 - phase) * 0.025;

      const tangent = new THREE.Vector3(
        -Math.sin(angle),
        Math.cos(angle * 0.85 + phase * 0.5) * 0.5,
        Math.cos(angle),
      ).normalize();

      const outward = new THREE.Vector3(cx, cy * 0.85, cz).normalize();
      const widthDir = new THREE.Vector3()
        .crossVectors(tangent, outward)
        .normalize();

      for (let j = 0; j < vSegments; j++) {
        const v = j / (vSegments - 1);
        const vv = (v - 0.5) * 2.0;

        const width =
          widthBase *
          (0.9 + Math.sin(u * Math.PI) * 0.25) *
          (1.0 + Math.cos(u * Math.PI * 2.0 + phase) * 0.08);

        const tx = cx + widthDir.x * vv * width;
        const ty = cy + widthDir.y * vv * width;
        const tz = cz + widthDir.z * vv * width;

        const chaosSpread = 0.018 + Math.abs(vv) * 0.008;

        positions[ptr * 3 + 0] = tx + (Math.random() - 0.5) * chaosSpread;
        positions[ptr * 3 + 1] = ty + (Math.random() - 0.5) * chaosSpread;
        positions[ptr * 3 + 2] = tz + (Math.random() - 0.5) * chaosSpread;

        targets[ptr * 3 + 0] = tx;
        targets[ptr * 3 + 1] = ty;
        targets[ptr * 3 + 2] = tz;

        normalDirs[ptr * 3 + 0] = widthDir.x;
        normalDirs[ptr * 3 + 1] = widthDir.y;
        normalDirs[ptr * 3 + 2] = widthDir.z;

        ribbonAttr[ptr] = ribbonT;
        uAttr[ptr] = u;
        vAttr[ptr] = vv;

        const edgeThin = 1.0 - Math.abs(vv) * 0.16;
        const radial = Math.sqrt(tx * tx + ty * ty + tz * tz);
        const centerBright = 1.0 + (1.0 - Math.min(1.0, radial / 0.42)) * 0.14;
        scaleAttr[ptr] = (0.92 + Math.random() * 0.12) * edgeThin * centerBright;

        ptr++;
      }
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("aTarget", new THREE.BufferAttribute(targets, 3));
  geometry.setAttribute("aNormalDir", new THREE.BufferAttribute(normalDirs, 3));
  geometry.setAttribute("aRibbon", new THREE.BufferAttribute(ribbonAttr, 1));
  geometry.setAttribute("aU", new THREE.BufferAttribute(uAttr, 1));
  geometry.setAttribute("aV", new THREE.BufferAttribute(vAttr, 1));
  geometry.setAttribute("aScale", new THREE.BufferAttribute(scaleAttr, 1));

  return geometry;
}

function createCoreRingGeometry(points = 900) {
  const positions = new Float32Array(points * 3);
  const targets = new Float32Array(points * 3);
  const normalDirs = new Float32Array(points * 3);
  const ribbonAttr = new Float32Array(points);
  const uAttr = new Float32Array(points);
  const vAttr = new Float32Array(points);
  const scaleAttr = new Float32Array(points);

  for (let i = 0; i < points; i++) {
    const u = i / (points - 1);
    const angle = u * Math.PI * 2.0;
    const radius = 0.085;

    const tx = Math.cos(angle) * radius;
    const ty = Math.sin(angle * 1.3) * 0.01;
    const tz = Math.sin(angle) * radius * 0.95;

    positions[i * 3 + 0] = tx + (Math.random() - 0.5) * 0.008;
    positions[i * 3 + 1] = ty + (Math.random() - 0.5) * 0.008;
    positions[i * 3 + 2] = tz + (Math.random() - 0.5) * 0.008;

    targets[i * 3 + 0] = tx;
    targets[i * 3 + 1] = ty;
    targets[i * 3 + 2] = tz;

    normalDirs[i * 3 + 0] = Math.cos(angle);
    normalDirs[i * 3 + 1] = 0;
    normalDirs[i * 3 + 2] = Math.sin(angle);

    ribbonAttr[i] = 0.5;
    uAttr[i] = u;
    vAttr[i] = 0;
    scaleAttr[i] = 1.15;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("aTarget", new THREE.BufferAttribute(targets, 3));
  geometry.setAttribute("aNormalDir", new THREE.BufferAttribute(normalDirs, 3));
  geometry.setAttribute("aRibbon", new THREE.BufferAttribute(ribbonAttr, 1));
  geometry.setAttribute("aU", new THREE.BufferAttribute(uAttr, 1));
  geometry.setAttribute("aV", new THREE.BufferAttribute(vAttr, 1));
  geometry.setAttribute("aScale", new THREE.BufferAttribute(scaleAttr, 1));
  return geometry;
}

function BrainBlob({
  scrollProgress,
  mouse,
  baseBloomIntensity = 1.08,
  hoverBloomIntensity = 0.72,
  hoverRadius = 0.2,
  noiseStrength = 0.085,
  particleSize = 1.0,
  coreParticleSize = 1.0,
  mouseMoveStrength = 0.08,
  position = [-0.38, 0.52, 0.04],
  opacityRef,
}) {
  const groupRef = useRef();
  const pointsRef = useRef();
  const coreRef = useRef();
  const hoverPlaneRef = useRef();

  const hoverTarget = useRef(0);
  const hoverValue = useRef(0);
  const hoverCenter = useRef(new THREE.Vector2(0, 0));
  const morphProgressRef = useRef(0);

  const blobTargetPos = useRef(
    new THREE.Vector3(position[0], position[1], position[2]),
  );
  const blobCurrentPos = useRef(
    new THREE.Vector3(position[0], position[1], position[2]),
  );

  const ribbonGeometry = useMemo(
    () =>
      createVolumetricRibbonBlobGeometry({
        ribbons: 7,
        uSegments: 250,
        vSegments: 18,
      }),
    [],
  );

  const coreGeometry = useMemo(() => createCoreRingGeometry(900), []);

  useFrame((state, delta) => {
    const t = state.clock.elapsedTime;

    if (!groupRef.current || !pointsRef.current || !coreRef.current) return;

    hoverValue.current = THREE.MathUtils.lerp(
      hoverValue.current,
      hoverTarget.current,
      1 - Math.exp(-10 * delta),
    );

    const rotTarget = scrollProgress > 0.15 ? 1 : 0;
    const transition = THREE.MathUtils.lerp(
      pointsRef.current.material.uniforms.uTransition.value,
      rotTarget,
      0.05,
    );

    const morphTarget = scrollProgress >= 0.2 ? 1 : 0;

    morphProgressRef.current = THREE.MathUtils.lerp(
      morphProgressRef.current,
      morphTarget,
      1 - Math.exp(-5 * delta),
    );

    const morphProgress = morphProgressRef.current;

    blobTargetPos.current.set(
      position[0] + mouse.x * mouseMoveStrength,
      position[1] + mouse.y * mouseMoveStrength,
      position[2],
    );

    blobCurrentPos.current.lerp(
      blobTargetPos.current,
      1 - Math.exp(-8 * delta),
    );
    groupRef.current.position.copy(blobCurrentPos.current);

    groupRef.current.rotation.y = Math.sin(t * 0.35) * 0.28;
    groupRef.current.rotation.x = Math.sin(t * 0.42) * 0.08;
    groupRef.current.rotation.z = Math.cos(t * 0.27) * 0.04;

    const currentOpacity = opacityRef?.current ?? 1;

    const setUniforms = (mat, isCore = false) => {
      mat.uniforms.uTime.value = t;
      mat.uniforms.uTransition.value = transition;
      mat.uniforms.uMorphProgress.value = morphProgress;
      mat.uniforms.uMouse.value.lerp(mouse, 0.08);
      mat.uniforms.uHover.value = hoverValue.current;
      mat.uniforms.uHoverCenter.value.lerp(hoverCenter.current, 0.16);
      mat.uniforms.uHoverRadius.value = hoverRadius;
      mat.uniforms.uBaseBloom.value = baseBloomIntensity;
      mat.uniforms.uHoverBloom.value = hoverBloomIntensity;
      mat.uniforms.uNoiseStrength.value = noiseStrength;
      mat.uniforms.uParticleSize.value = particleSize;
      mat.uniforms.uCoreParticleSize.value = isCore ? coreParticleSize : 1.0;
      mat.uniforms.uOpacity.value = currentOpacity;
    };

    setUniforms(pointsRef.current.material, false);
    setUniforms(coreRef.current.material, true);
  });

  const setLocalHoverFromEvent = (e) => {
    if (!groupRef.current) return;
    const local = groupRef.current.worldToLocal(e.point.clone());
    hoverCenter.current.set(local.x, local.y);
    hoverTarget.current = 1;
  };

  return (
    <group ref={groupRef} position={position}>
      <points ref={pointsRef} geometry={ribbonGeometry} scale={2}>
        <shaderMaterial
          attach="material"
          {...BLOB_SHADER}
          transparent
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </points>

      <points ref={coreRef} geometry={coreGeometry} scale={1}>
        <shaderMaterial
          attach="material"
          {...BLOB_SHADER}
          transparent
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </points>

      <mesh
        ref={hoverPlaneRef}
        visible={false}
        onPointerMove={setLocalHoverFromEvent}
        onPointerOver={setLocalHoverFromEvent}
        onPointerOut={() => {
          hoverTarget.current = 0;
        }}
      >
        <planeGeometry args={[2.2, 2.2, 1, 1]} />
        <meshBasicMaterial transparent opacity={0} side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
}

class ParallaxDepthMaterial extends THREE.ShaderMaterial {
  constructor() {
    super({
      transparent: true,
      depthWrite: false,
      uniforms: {
        uColor: { value: null },
        uDepth: { value: null },
        uNormal: { value: null },
        uScan: { value: null },
        uMouse: { value: new THREE.Vector2(0, 0) },
        uParallax: { value: 0.04 },
        uHasDepth: { value: 0.0 },
        uHasNormal: { value: 0.0 },
        uHasScan: { value: 0.0 },
        uHasColor: { value: 0.0 },
        uAmbientColor: { value: new THREE.Color(1, 1, 1) },
        uAmbientIntensity: { value: 0.4 },
        uLightColor: { value: new THREE.Color(0.659, 0.847, 1.0) },
        uLightIntensity: { value: 0.8 },
        uDirLightColor: { value: new THREE.Color(1, 1, 1) },
        uDirLightIntensity: { value: 1.0 },
        uDirLightDir: { value: new THREE.Vector3(0.4, 0.6, 0.6) },
        uDirLightSpecular: { value: 64.0 },
        uOpacity: { value: 1.0 },
      },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform sampler2D uColor;
        uniform sampler2D uDepth;
        uniform sampler2D uNormal;
        uniform sampler2D uScan;
        uniform vec2 uMouse;
        uniform float uParallax;
        uniform float uHasDepth;
        uniform float uHasNormal;
        uniform float uHasScan;
        uniform float uHasColor;
        uniform vec3 uAmbientColor;
        uniform float uAmbientIntensity;
        uniform vec3 uLightColor;
        uniform float uLightIntensity;
        uniform vec3 uDirLightColor;
        uniform float uDirLightIntensity;
        uniform vec3 uDirLightDir;
        uniform float uOpacity;
        varying vec2 vUv;

        void main() {
          float depth = 0.5;
          if (uHasDepth > 0.5) depth = texture2D(uDepth, vUv).r;

          vec2 warpedUv = clamp(vUv - (uMouse * depth * uParallax), 0.001, 0.999);

          if (uHasColor < 0.5) discard;

          vec4 col = texture2D(uColor, warpedUv);
          vec3 lightContrib = vec3(0.0);

          if (uHasNormal > 0.5) {
            vec3 nrm = normalize(texture2D(uNormal, warpedUv).rgb * 2.0 - 1.0);
            vec3 mouseDir = normalize(vec3(uMouse.x * 1.5, uMouse.y * 1.5, 1.0));
            float mDiff = max(dot(nrm, mouseDir), 0.0);
            lightContrib += uLightColor * uLightIntensity * mDiff;

            float dDiff = max(dot(nrm, uDirLightDir), 0.0);
            lightContrib += uDirLightColor * uDirLightIntensity * dDiff;
          }

          col.rgb *= (uAmbientColor * uAmbientIntensity + lightContrib);

          if (uHasScan > 0.5) {
            col.rgb += uDirLightColor * texture2D(uScan, warpedUv).r * 0.1;
          }

          col.a *= uOpacity;
          gl_FragColor = col;
        }
      `,
    });
  }
}
extend({ ParallaxDepthMaterial });

let _ktx2 = null;

function useKTX2(path, gl) {
  const [tex, setTex] = useState(null);

  useEffect(() => {
    if (!path || !gl) return;

    let mounted = true;

    if (!_ktx2) {
      _ktx2 = new KTX2Loader().setTranscoderPath("/basis/").detectSupport(gl);
    }

    _ktx2.load(path, (t) => {
      if (!mounted) return;
      t.needsUpdate = true;
      setTex(t);
    });

    return () => {
      mounted = false;
    };
  }, [path, gl]);

  return tex;
}

function ParallaxScene({
  scrollProgress,
  blobOpacityRef,
  planeZoomRef,
  planeOpacityRef,
  ...props
}) {
  const matRef = useRef();
  const planeRef = useRef();
  const smoothMouse = useRef(new THREE.Vector2());
  const targetMouse = useRef(new THREE.Vector2());

  const { gl } = useThree();

  const tColor = useKTX2(props.colorMap, gl);
  const tDepth = useKTX2(props.depthMap, gl);
  const tNormal = useKTX2(props.normalMap, gl);
  const tScan = useKTX2(props.scanMap, gl);

  useEffect(() => {
    const onMove = (e) => {
      targetMouse.current.set(
        (e.clientX / window.innerWidth - 0.5) * 2,
        -((e.clientY / window.innerHeight - 0.5) * 2),
      );
    };

    window.addEventListener("mousemove", onMove, { passive: true });
    return () => window.removeEventListener("mousemove", onMove);
  }, []);

  useEffect(() => {
    if (!matRef.current) return;
    const u = matRef.current.uniforms;

    if (tColor) {
      u.uColor.value = tColor;
      u.uHasColor.value = 1;
    }
    if (tDepth) {
      u.uDepth.value = tDepth;
      u.uHasDepth.value = 1;
    }
    if (tNormal) {
      u.uNormal.value = tNormal;
      u.uHasNormal.value = 1;
    }
    if (tScan) {
      u.uScan.value = tScan;
      u.uHasScan.value = 1;
    }
  }, [tColor, tDepth, tNormal, tScan]);

  useEffect(() => {
    if (!matRef.current) return;
    matRef.current.uniforms.uParallax.value = props.parallaxStrength ?? 0.04;
  }, [props.parallaxStrength]);

  useFrame((_, delta) => {
    if (!matRef.current || !planeRef.current) return;

    smoothMouse.current.lerp(targetMouse.current, 1 - Math.exp(-9 * delta));
    matRef.current.uniforms.uMouse.value.copy(smoothMouse.current);

    const zoom = planeZoomRef?.current ?? 0;
    const opacity = planeOpacityRef?.current ?? 1;

    planeRef.current.position.z = THREE.MathUtils.lerp(
      planeRef.current.position.z,
      zoom * 4.3,
      1,
    );

    matRef.current.uniforms.uOpacity.value = opacity;
  });

  return (
    <Suspense fallback={null}>
      <mesh ref={planeRef} position={[0.08, -0.22, 0]}>
        <planeGeometry args={[props.width ?? 3, props.height ?? 4]} />
        <parallaxDepthMaterial ref={matRef} />
      </mesh>

      <BrainBlob
        scrollProgress={scrollProgress}
        mouse={smoothMouse.current}
        baseBloomIntensity={props.baseBloomIntensity}
        hoverBloomIntensity={props.hoverBloomIntensity}
        hoverRadius={props.hoverRadius}
        noiseStrength={props.noiseStrength}
        particleSize={props.particleSize}
        coreParticleSize={props.coreParticleSize}
        mouseMoveStrength={props.mouseMoveStrength}
        position={props.blobPosition ?? [-0.35, 0.2, 0.04]}
        opacityRef={blobOpacityRef}
      />
    </Suspense>
  );
}

export default function ParallaxCard(props) {
  const [scroll, setScroll] = useState(0);

  useEffect(() => {
    const handle = () => {
      const maxScroll =
        document.documentElement.scrollHeight - window.innerHeight;
      setScroll(maxScroll > 0 ? window.scrollY / maxScroll : 0);
    };

    handle();
    window.addEventListener("scroll", handle, { passive: true });
    window.addEventListener("resize", handle);

    return () => {
      window.removeEventListener("scroll", handle);
      window.removeEventListener("resize", handle);
    };
  }, []);

  return (
    <div
      className={props.className}
      style={{
        width: "100vw",
        height: "100vh",
        position: "fixed",
        top: 0,
        left: 0,
        ...props.style,
      }}
    >
      <Canvas
        dpr={[1, 1.5]}
        gl={{
          alpha: true,
          antialias: true,
          powerPreference: "high-performance",
        }}
        camera={{ position: [0, 0, 5], fov: 40 }}
      >
        <ParallaxScene scrollProgress={scroll} {...props} />
      </Canvas>
    </div>
  );
}