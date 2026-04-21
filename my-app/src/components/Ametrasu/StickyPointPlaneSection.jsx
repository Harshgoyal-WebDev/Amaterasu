"use client";

import React, { useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { Canvas, useFrame } from "@react-three/fiber";
import { EffectComposer, Bloom } from "@react-three/postprocessing";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/dist/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger);

function buildGridData({
  planeWidth,
  planeHeight,
  widthSegments,
  heightSegments,
  planeCount,
  planeSpacing,
}) {
  const planes = [];
  const flatPoints = [];

  for (let p = 0; p < planeCount; p++) {
    const z = (p - (planeCount - 1) / 2) * planeSpacing;
    const plane = [];

    for (let iy = 0; iy <= heightSegments; iy++) {
      const row = [];

      for (let ix = 0; ix <= widthSegments; ix++) {
        const x = (ix / widthSegments - 0.5) * planeWidth;
        const y = (iy / heightSegments - 0.5) * planeHeight;
        const point = new THREE.Vector3(x, y, z);

        row.push(point);
        flatPoints.push({
          position: point.clone(),
          ix,
          iy,
          planeIndex: p,
          z,
        });
      }

      plane.push(row);
    }

    planes.push(plane);
  }

  return { planes, flatPoints };
}

function sampleEvenly(items, count) {
  if (count <= 0) return [];
  if (items.length <= count) return items;

  const out = [];
  const last = items.length - 1;

  for (let i = 0; i < count; i++) {
    const t = count === 1 ? 0.5 : i / (count - 1);
    const index = Math.round(t * last);
    out.push(items[index]);
  }

  return out;
}

function pickDiagonalNodePath(planes, minNodes = 6, maxNodes = 14) {
  if (!planes?.length) return null;

  const directions = [
    [1, 1],
    [1, -1],
    [-1, 1],
    [-1, -1],
  ];

  for (let attempt = 0; attempt < 100; attempt++) {
    const plane = planes[Math.floor(Math.random() * planes.length)];
    const rows = plane.length;
    const cols = plane[0].length;

    const dir = directions[Math.floor(Math.random() * directions.length)];
    const length =
      Math.floor(Math.random() * (maxNodes - minNodes + 1)) + minNodes;

    const startX = Math.floor(Math.random() * cols);
    const startY = Math.floor(Math.random() * rows);

    const endX = startX + dir[0] * (length - 1);
    const endY = startY + dir[1] * (length - 1);

    if (endX < 0 || endX >= cols || endY < 0 || endY >= rows) continue;

    const path = [];
    for (let i = 0; i < length; i++) {
      const x = startX + dir[0] * i;
      const y = startY + dir[1] * i;
      path.push(plane[y][x].clone());
    }

    if (path.length >= minNodes) return path;
  }

  return null;
}

function densifyPath(path, samplesPerSegment = 14) {
  if (!path || path.length < 2) return path || [];

  const dense = [];

  for (let i = 0; i < path.length - 1; i++) {
    const a = path[i];
    const b = path[i + 1];

    for (let s = 0; s < samplesPerSegment; s++) {
      const t = s / samplesPerSegment;
      dense.push(new THREE.Vector3().lerpVectors(a, b, t));
    }
  }

  dense.push(path[path.length - 1].clone());
  return dense;
}

function GradientBackground() {
  return (
    <mesh position={[0, 0, -20]} scale={[60, 60, 1]}>
      <planeGeometry args={[1, 1]} />
      <shaderMaterial
        depthWrite={false}
        depthTest={false}
        toneMapped={false}
        uniforms={{
          uTop: { value: new THREE.Color("#010F4E") },
          uBottom: { value: new THREE.Color("#090088") },
        }}
        vertexShader={`
          varying vec2 vUv;
          void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `}
        fragmentShader={`
          uniform vec3 uTop;
          uniform vec3 uBottom;
          varying vec2 vUv;
          void main() {
            vec3 color = mix(uBottom, uTop, vUv.y);
            gl_FragColor = vec4(color, 1.0);
          }
        `}
      />
    </mesh>
  );
}

function PointPlane({
  planeWidth = 3,
  planeHeight = 3,
  widthSegments = 10,
  heightSegments = 10,
  z = 0,
  particleSize = 0.08,
  particleColor = [2.4, 2.4, 2.4],
  stretchRef,
}) {
  const materialRef = useRef(null);

  const geometry = useMemo(() => {
    const positions = [];

    for (let iy = 0; iy <= heightSegments; iy++) {
      for (let ix = 0; ix <= widthSegments; ix++) {
        const x = (ix / widthSegments - 0.5) * planeWidth;
        const y = (iy / heightSegments - 0.5) * planeHeight;
        positions.push(x, y, 0);
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(positions, 3),
    );

    return geo;
  }, [planeWidth, planeHeight, widthSegments, heightSegments]);

  const uniforms = useMemo(
    () => ({
      uBaseSize: { value: particleSize * 100.0 },
      uStretchY: { value: 1.0 },
      uColor: { value: new THREE.Color(...particleColor) },
    }),
    [particleSize, particleColor],
  );

  useFrame(() => {
    if (!materialRef.current || !stretchRef) return;

    materialRef.current.uniforms.uStretchY.value = THREE.MathUtils.lerp(
      materialRef.current.uniforms.uStretchY.value,
      stretchRef.current,
      0.12,
    );
  });

  return (
    <points position={[0, 0, z]} geometry={geometry}>
      <shaderMaterial
        ref={materialRef}
        uniforms={uniforms}
        transparent
        depthWrite={false}
        toneMapped={false}
        blending={THREE.AdditiveBlending}
        vertexShader={`
          uniform float uBaseSize;
          uniform float uStretchY;
          varying float vStretchY;
          varying float vDepthFade;

          void main() {
            vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
            gl_Position = projectionMatrix * mvPosition;

            float dist = max(-mvPosition.z, 0.001);
            gl_PointSize = (uBaseSize * (5.0 / dist)) * max(uStretchY, 1.0);

            vStretchY = max(uStretchY, 1.0);
            vDepthFade = 1.0 - smoothstep(4.0, 9.0, dist);
          }
        `}
        fragmentShader={`
          uniform vec3 uColor;
          varying float vStretchY;
          varying float vDepthFade;

          void main() {
            vec2 uv = gl_PointCoord - vec2(0.5);
            uv.x *= vStretchY;

            float d = length(uv);
            float alpha = 1.0 - smoothstep(0.18, 0.5, d);
            float glow = 1.0 - smoothstep(0.0, 0.5, d);

            alpha *= vDepthFade;

            if (alpha < 0.01) discard;

            vec3 color = uColor * (0.4 + glow * 0.8) * vDepthFade;
            gl_FragColor = vec4(color, alpha);
          }
        `}
      />
    </points>
  );
}

function buildDeterministicThreadAnchors(
  points,
  widthSegments,
  heightSegments,
  bottomRows = 3,
  threadStride = 1,
  threadCount = null,
) {
  const maxIy = bottomRows - 1;

  const filtered = points
    .filter((p) => p.iy <= maxIy)
    .sort((a, b) => {
      if (a.iy !== b.iy) return a.iy - b.iy;
      if (a.position.x !== b.position.x) return a.position.x - b.position.x;
      if (a.planeIndex !== b.planeIndex) return a.planeIndex - b.planeIndex;
      return 0;
    })
    .filter((_, index) => index % Math.max(1, threadStride) === 0);

  const selected =
    typeof threadCount === "number" && threadCount > 0
      ? sampleEvenly(filtered, threadCount)
      : filtered;

  return selected.map((p, i) => {
    const ixNorm = widthSegments === 0 ? 0 : p.ix / widthSegments;
    const iyNorm = heightSegments === 0 ? 0 : p.iy / heightSegments;

    return {
      anchor: p.position.clone(),
      ix: p.ix,
      iy: p.iy,
      planeIndex: p.planeIndex,
      side: (p.iy + p.planeIndex) % 2 === 0 ? 1 : -1,
      phase: iyNorm * 0.45 + p.planeIndex * 0.32,
      seed: i * 0.173 + ixNorm * 2.1,
      radiusBase: THREE.MathUtils.lerp(0.05, 0.16, ixNorm),
      curlBase: 1.8 + (p.iy % 4) * 0.33 + (p.planeIndex % 3) * 0.17,
      driftBase: 0.03 + (p.iy % 5) * 0.012,
      speedBase: 0.7 + (p.planeIndex % 4) * 0.08,
      wobbleBase: 0.5 + (p.iy % 3) * 0.18,
    };
  });
}

function DiagonalStrokeTrail({
  planes,
  maxTrailPoints = 320,
  trailSize = 0.012,
  trailColor = [2.4, 2.4, 2.4],
  samplesPerSegment = 14,
  minNodes = 6,
  maxNodes = 14,
  speedMin = 42,
  speedMax = 72,
  tailMin = 10,
  tailMax = 24,
  trailOpacity = 1,
  tailShrink = 1.35,

  // tighter defaults
  randomPathOffset = 0.06,
  randomSpacingAmount = 0.1,
  pulseSpeed = 1.8,
  pulseAmount = 0.45,
}) {
  const geoRef = useRef(null);
  const matRef = useRef(null);

  const positions = useMemo(
    () => new Float32Array(maxTrailPoints * 3),
    [maxTrailPoints],
  );
  const alphas = useMemo(
    () => new Float32Array(maxTrailPoints),
    [maxTrailPoints],
  );
  const scales = useMemo(
    () => new Float32Array(maxTrailPoints),
    [maxTrailPoints],
  );

  const pathDataRef = useRef([]);
  const randomsRef = useRef(null);

  const stateRef = useRef({
    activeCount: 0,
    progress: 0,
    speed: 32,
    tailLength: 18,
    delay: 0,
    scaleJitter: [],
  });

  const setupTrail = () => {
    const nodePath = pickDiagonalNodePath(planes, minNodes, maxNodes);
    if (!nodePath) return;

    const densePath = densifyPath(nodePath, samplesPerSegment).slice(
      0,
      maxTrailPoints,
    );

    const activeCount = densePath.length;
    const tailLength = THREE.MathUtils.clamp(
      Math.floor(
        THREE.MathUtils.randFloat(tailMin, tailMax) +
          activeCount * THREE.MathUtils.randFloat(0.02, 0.08),
      ),
      tailMin,
      tailMax,
    );

    stateRef.current.activeCount = activeCount;
    stateRef.current.progress = 0;
    stateRef.current.speed = THREE.MathUtils.randFloat(speedMin, speedMax);
    stateRef.current.tailLength = tailLength;
    stateRef.current.delay = THREE.MathUtils.randFloat(0.08, 0.9);
    stateRef.current.scaleJitter = Array.from({ length: activeCount }, () =>
      THREE.MathUtils.randFloat(0.9, 1.02),
    );

    pathDataRef.current = densePath;

    const randoms = new Float32Array(maxTrailPoints * 4);

    for (let i = 0; i < maxTrailPoints; i++) {
      const ridx = i * 4;

      randoms[ridx + 0] = Math.random();
      randoms[ridx + 1] = Math.random() * 2 - 1;
      randoms[ridx + 2] = Math.random() * 2 - 1;
      randoms[ridx + 3] = Math.random() * Math.PI * 2;

      if (i < activeCount) {
        positions[i * 3 + 0] = densePath[i].x;
        positions[i * 3 + 1] = densePath[i].y;
        positions[i * 3 + 2] = densePath[i].z;
        alphas[i] = 0;
        scales[i] = stateRef.current.scaleJitter[i];
      } else {
        positions[i * 3 + 0] = 0;
        positions[i * 3 + 1] = 0;
        positions[i * 3 + 2] = 0;
        alphas[i] = 0;
        scales[i] = 0;
      }
    }

    randomsRef.current = randoms;

    if (geoRef.current) {
      geoRef.current.attributes.position.needsUpdate = true;
      geoRef.current.attributes.aAlpha.needsUpdate = true;
      geoRef.current.attributes.aScale.needsUpdate = true;
    }
  };

  useLayoutEffect(() => {
    setupTrail();
  }, [
    planes,
    maxTrailPoints,
    samplesPerSegment,
    minNodes,
    maxNodes,
    speedMin,
    speedMax,
    tailMin,
    tailMax,
  ]);

  useFrame((state, delta) => {
    if (
      !geoRef.current ||
      !matRef.current ||
      !randomsRef.current ||
      !pathDataRef.current.length
    ) {
      return;
    }

    const s = stateRef.current;
    const randoms = randomsRef.current;
    const pathData = pathDataRef.current;

    if (s.delay > 0) {
      s.delay -= delta;
      return;
    }

    s.progress += delta * s.speed;

    const head = s.progress;
    const tailStart = head - s.tailLength;
    const endLife = s.activeCount + s.tailLength;

    for (let i = 0; i < maxTrailPoints; i++) {
      if (i >= s.activeCount) {
        alphas[i] = 0;
        continue;
      }

      const ridx = i * 4;

      const spacingShift = (randoms[ridx + 0] - 0.5) * randomSpacingAmount;
      const shiftedIndex = THREE.MathUtils.clamp(
        i + spacingShift,
        0,
        Math.max(s.activeCount - 1, 0),
      );

      const baseIndex = Math.floor(shiftedIndex);
      const nextIndex = Math.min(baseIndex + 1, s.activeCount - 1);
      const mixT = shiftedIndex - baseIndex;

      const a = pathData[baseIndex];
      const b = pathData[nextIndex];
      const pos = new THREE.Vector3().lerpVectors(a, b, mixT);

      const prev = pathData[Math.max(baseIndex - 1, 0)];
      const next = pathData[Math.min(nextIndex + 1, s.activeCount - 1)];
      const tangent = new THREE.Vector3().subVectors(next, prev).normalize();

      let side = new THREE.Vector3(-tangent.y, tangent.x, 0);
      if (side.lengthSq() < 0.0001) side = new THREE.Vector3(1, 0, 0);
      side.normalize();

      const lift = new THREE.Vector3().crossVectors(tangent, side).normalize();

      const randX = randoms[ridx + 1];
      const randY = randoms[ridx + 2];

      // much tighter jitter while travelling
      const jitterAmp =
        randomPathOffset *
        (0.18 + 0.12 * Math.sin(state.clock.elapsedTime * 1.2 + i * 0.05));

      pos.addScaledVector(side, randX * jitterAmp);
      pos.addScaledVector(lift, randY * jitterAmp * 0.22);

      positions[i * 3 + 0] = pos.x;
      positions[i * 3 + 1] = pos.y;
      positions[i * 3 + 2] = pos.z;

      if (i <= head && i >= tailStart) {
        const t = THREE.MathUtils.clamp(
          (head - i) / Math.max(s.tailLength, 1),
          0,
          1,
        );

        const bodyAlpha = (1 - Math.pow(t, 0.72)) * trailOpacity;
        const scaleFade = 1 - Math.pow(t, tailShrink);

        const pulse =
          1.0 +
          Math.sin(
            state.clock.elapsedTime * pulseSpeed * 2.0 +
              randoms[ridx + 3] +
              i * 0.08,
          ) *
            pulseAmount;

        scales[i] =
          THREE.MathUtils.lerp(0.22, s.scaleJitter[i], scaleFade) *
          THREE.MathUtils.clamp(pulse, 0.5, 1.45);

        const twinkle =
          0.97 + 0.03 * Math.sin(state.clock.elapsedTime * 8 + i * 0.12);

        alphas[i] =
          bodyAlpha * THREE.MathUtils.clamp(pulse, 0.45, 1.45) * twinkle;
      } else {
        alphas[i] = 0;
        if (i < s.activeCount) {
          scales[i] = s.scaleJitter[i];
        }
      }
    }

    geoRef.current.attributes.position.needsUpdate = true;
    geoRef.current.attributes.aAlpha.needsUpdate = true;
    geoRef.current.attributes.aScale.needsUpdate = true;
    matRef.current.uniforms.uTime.value = state.clock.elapsedTime;

    if (head > endLife) {
      setupTrail();
    }
  });

  return (
    <points>
      <bufferGeometry ref={geoRef}>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
        <bufferAttribute attach="attributes-aAlpha" args={[alphas, 1]} />
        <bufferAttribute attach="attributes-aScale" args={[scales, 1]} />
      </bufferGeometry>

      <shaderMaterial
        ref={matRef}
        transparent
        depthWrite={false}
        toneMapped={false}
        blending={THREE.AdditiveBlending}
        uniforms={{
          uSize: { value: trailSize * 100.0 },
          uColor: { value: new THREE.Color(...trailColor) },
          uTime: { value: 0 },
        }}
        vertexShader={`
          attribute float aAlpha;
          attribute float aScale;
          varying float vAlpha;
          varying float vDepthFade;
          uniform float uSize;

          void main() {
            vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
            gl_Position = projectionMatrix * mvPosition;

            float dist = max(-mvPosition.z, 0.001);
            gl_PointSize = (uSize * aScale) * (5.0 / dist);

            vAlpha = aAlpha;
            vDepthFade = 1.0 - smoothstep(2.5, 8.5, dist);
          }
        `}
        fragmentShader={`
          uniform vec3 uColor;
          varying float vAlpha;
          varying float vDepthFade;

          void main() {
            vec2 uv = gl_PointCoord - vec2(0.5);
            float d = length(uv);

            float circle = 1.0 - smoothstep(0.10, 0.5, d);
            float glow = 1.0 - smoothstep(0.0, 0.5, d);

            float alpha = circle * vAlpha * vDepthFade;
            if (alpha < 0.01) discard;

            vec3 color = uColor * (0.42 + glow * 1.15) * vDepthFade;
            gl_FragColor = vec4(color, alpha);
          }
        `}
      />
    </points>
  );
}
function DiagonalStrokeTrails({
  planes,
  count = 8,
  trailSize = 0.012,
  trailColor = [2.4, 2.4, 2.4],
  samplesPerSegment = 14,
  minNodes = 6,
  maxNodes = 14,
  speedMin = 42,
  speedMax = 72,
  tailMin = 10,
  tailMax = 24,
  trailOpacity = 1,
  tailShrink = 1.35,
}) {
  return (
    <group>
      {Array.from({ length: count }).map((_, i) => (
        <DiagonalStrokeTrail
          key={i}
          planes={planes}
          trailSize={trailSize}
          trailColor={trailColor}
          samplesPerSegment={samplesPerSegment}
          minNodes={minNodes}
          maxNodes={maxNodes}
          speedMin={speedMin}
          speedMax={speedMax}
          tailMin={tailMin}
          tailMax={tailMax}
          trailOpacity={trailOpacity}
          tailShrink={tailShrink}
        />
      ))}
    </group>
  );
}

function DrawnSwirlThreads({
  points,
  widthSegments,
  heightSegments,
  planeHeight = 10,
  bottomRows = 3,
  threadStride = 1,
  threadCount = null,
  maxPointsPerThread = 220,
  threadSize = 0.04,
  threadColor = [0.72, 0.9, 1.35],
  waveAmount = 1.0,
  swirlAmount = 1.0,
  swirlIntensity = 1.0,
  initialSwirlReveal = 0.55,
  trailDepthFadeNear = 3.5,
  trailDepthFadeFar = 11.0,
  trailMinVisibility = 0.72,
  threadTargetX = 0,
  threadTargetY = null,
  threadTargetZ = 0,
  convergeStrength = 1.0,
  randomPathOffset = 0.22,
  randomSpacingAmount = 0.35,
  pulseSpeed = 1.4,
  pulseAmount = 0.55,
  endTightness = 0.78,
  jitterEndFalloff = 0.9,
  swirlEndFalloff = 0.82,
  swirlProgressRef,
}) {
  const geoRef = useRef(null);
  const matRef = useRef(null);

  const anchors = useMemo(
    () =>
      buildDeterministicThreadAnchors(
        points,
        widthSegments,
        heightSegments,
        bottomRows,
        threadStride,
        threadCount,
      ),
    [
      points,
      widthSegments,
      heightSegments,
      bottomRows,
      threadStride,
      threadCount,
    ],
  );

  const threadCountResolved = anchors.length;
  const totalPoints = threadCountResolved * maxPointsPerThread;

  const positions = useMemo(
    () => new Float32Array(totalPoints * 3),
    [totalPoints],
  );
  const alphas = useMemo(() => new Float32Array(totalPoints), [totalPoints]);
  const scales = useMemo(() => new Float32Array(totalPoints), [totalPoints]);

  const randomsRef = useRef(null);
  const initializedRef = useRef(false);

  const resolvedTargetY =
    threadTargetY === null ? -planeHeight * 0.85 : threadTargetY;

  useLayoutEffect(() => {
    if (!anchors.length) return;

    const randoms = new Float32Array(totalPoints * 4);

    let ptr = 0;
    for (let a = 0; a < anchors.length; a++) {
      const anchor = anchors[a].anchor;

      for (let i = 0; i < maxPointsPerThread; i++) {
        const idx3 = ptr * 3;
        const ridx = ptr * 4;

        positions[idx3 + 0] = anchor.x;
        positions[idx3 + 1] = anchor.y;
        positions[idx3 + 2] = anchor.z;

        alphas[ptr] = 0;
        scales[ptr] = 0;

        randoms[ridx + 0] = Math.random();
        randoms[ridx + 1] = Math.random() * 2 - 1;
        randoms[ridx + 2] = Math.random() * 2 - 1;
        randoms[ridx + 3] = Math.random() * Math.PI * 2;

        ptr++;
      }
    }

    randomsRef.current = randoms;
    initializedRef.current = true;

    if (geoRef.current) {
      geoRef.current.attributes.position.needsUpdate = true;
      geoRef.current.attributes.aAlpha.needsUpdate = true;
      geoRef.current.attributes.aScale.needsUpdate = true;
    }
  }, [anchors, maxPointsPerThread, positions, alphas, scales, totalPoints]);

  useFrame((state) => {
    if (
      !geoRef.current ||
      !matRef.current ||
      !initializedRef.current ||
      !randomsRef.current
    ) {
      return;
    }

    const time = state.clock.elapsedTime;
    const progress = swirlProgressRef.current;
    const randoms = randomsRef.current;

    const visibleLength = Math.max(
      0,
      Math.floor(THREE.MathUtils.lerp(0, maxPointsPerThread, progress)),
    );

    const shapeProgress = THREE.MathUtils.clamp(
      initialSwirlReveal + progress * (1 - initialSwirlReveal),
      0,
      1,
    );

    const downwardLength = THREE.MathUtils.lerp(3.8, 6.8, shapeProgress);
    const radiusBoost = THREE.MathUtils.lerp(1.15, 2.0, shapeProgress);
    const threadSpread = THREE.MathUtils.lerp(0.72, 0.95, shapeProgress);
    const brightnessBoost = THREE.MathUtils.lerp(0.35, 1.0, progress);

    matRef.current.uniforms.uDepthFadeNear.value = trailDepthFadeNear;
    matRef.current.uniforms.uDepthFadeFar.value = trailDepthFadeFar;
    matRef.current.uniforms.uMinVisibility.value = trailMinVisibility;

    let ptr = 0;

    for (let a = 0; a < anchors.length; a++) {
      const anchorData = anchors[a];

      for (let i = 0; i < maxPointsPerThread; i++) {
        const idx3 = ptr * 3;
        const ridx = ptr * 4;

        const spacingShift = (randoms[ridx + 0] - 0.5) * randomSpacingAmount;
        const shiftedIndex = THREE.MathUtils.clamp(
          i + spacingShift,
          0,
          maxPointsPerThread - 1,
        );
        const u = shiftedIndex / Math.max(maxPointsPerThread - 1, 1);

        const flow = time * (0.95 + anchorData.speedBase) + anchorData.seed;

        const spiral =
          flow +
          u * (9.0 + anchorData.curlBase * swirlAmount) +
          anchorData.phase;

        const secondary =
          flow * (0.62 + 0.08 * swirlAmount) +
          u * (6.5 + 2.0 * waveAmount) +
          anchorData.phase * 0.7;

        const tertiary =
          flow * (0.38 + 0.1 * waveAmount) +
          u * (10.0 + 4.0 * waveAmount) +
          anchorData.phase * 1.3;

        const endCompress = 1.0 - Math.pow(u, 1.2) * endTightness;

        const radius =
          anchorData.radiusBase *
          radiusBoost *
          swirlAmount *
          swirlIntensity *
          endCompress *
          (0.22 + u * (1.45 + 0.22 * waveAmount)) *
          (0.96 + 0.04 * Math.sin(flow * 1.1 + i * 0.08));

        const convergeMix = Math.pow(u, 1.35) * convergeStrength;
        const clampedConverge = THREE.MathUtils.clamp(convergeMix, 0, 1);

        const baseX = THREE.MathUtils.lerp(
          anchorData.anchor.x,
          threadTargetX,
          clampedConverge,
        );
        const baseZ = THREE.MathUtils.lerp(
          anchorData.anchor.z,
          threadTargetZ,
          clampedConverge,
        );

        const lineY = THREE.MathUtils.lerp(
          anchorData.anchor.y,
          resolvedTargetY,
          Math.pow(u, 0.9),
        );

        const startLock = THREE.MathUtils.smoothstep(u, 0.02, 0.18);
        const swirlFalloff =
          (1.0 - clampedConverge * 0.42) *
          (1.0 - Math.pow(u, 1.15) * swirlEndFalloff) *
          startLock;

        const waveFalloff =
          (1.0 - clampedConverge * 0.22) *
          (1.0 - Math.pow(u, 1.05) * (swirlEndFalloff * 0.65)) *
          startLock;

        const swirlX =
          Math.sin(spiral) *
          radius *
          anchorData.side *
          threadSpread *
          swirlIntensity *
          swirlFalloff;

        const waveX =
          Math.sin(secondary) *
          anchorData.driftBase *
          (0.28 + u * (0.92 + waveAmount * 0.45)) *
          threadSpread *
          waveAmount *
          waveFalloff;

        const swirlZ =
          Math.cos(spiral) *
          radius *
          0.42 *
          threadSpread *
          swirlIntensity *
          swirlFalloff;

        const waveZ =
          Math.cos(secondary * 1.2) *
          anchorData.driftBase *
          0.2 *
          (0.2 + u * 0.65) *
          threadSpread *
          waveAmount *
          waveFalloff;

        const waveY =
          Math.sin(
            flow * 0.82 + u * (8.5 + waveAmount * 3.0) + anchorData.phase,
          ) *
          radius *
          0.22 *
          anchorData.wobbleBase *
          threadSpread *
          waveAmount *
          waveFalloff;

        let x =
          baseX +
          swirlX +
          waveX +
          Math.sin(tertiary) *
            radius *
            0.08 *
            waveAmount *
            threadSpread *
            swirlIntensity *
            swirlFalloff;

        let z =
          baseZ +
          swirlZ +
          waveZ +
          Math.cos(tertiary * 0.9) *
            radius *
            0.065 *
            waveAmount *
            threadSpread *
            swirlIntensity *
            swirlFalloff;

        let y = lineY - u * downwardLength * 0.12 + waveY;

        const randX = randoms[ridx + 1];
        const randZ = randoms[ridx + 2];
        const jitterFalloff =
          (1.0 - Math.pow(u, 1.1) * jitterEndFalloff) * startLock;

        const jitterAmp =
          randomPathOffset *
          radius *
          (0.18 + u * 0.55) *
          threadSpread *
          jitterFalloff *
          (0.75 + 0.25 * Math.sin(flow * 1.4 + randoms[ridx + 3]));

        x += randX * jitterAmp;
        z += randZ * jitterAmp * 0.8;
        y +=
          Math.sin(flow * 0.9 + randX * 3.2 + randZ * 2.7) * jitterAmp * 0.18;

        positions[idx3 + 0] = x;
        positions[idx3 + 1] = y;
        positions[idx3 + 2] = z;

        if (i >= visibleLength) {
          alphas[ptr] = 0;
          scales[ptr] = 0;
          ptr++;
          continue;
        }

        const pulse =
          1.0 +
          Math.sin(time * pulseSpeed * 2.0 + randoms[ridx + 3] + u * 9.0) *
            pulseAmount;

        const tailFade = Math.pow(1.0 - u, 0.16);
        const alpha =
          progress *
          tailFade *
          (0.42 + brightnessBoost * 0.85) *
          THREE.MathUtils.clamp(pulse, 0.15, 1.8);

        alphas[ptr] = alpha;

        const baseScale =
          THREE.MathUtils.lerp(0.12, 1.15, 1.0 - u) *
          (0.72 + progress * 1.0);

        scales[ptr] = baseScale * THREE.MathUtils.clamp(pulse, 0.3, 1.9);

        ptr++;
      }
    }

    geoRef.current.attributes.position.needsUpdate = true;
    geoRef.current.attributes.aAlpha.needsUpdate = true;
    geoRef.current.attributes.aScale.needsUpdate = true;
    matRef.current.uniforms.uTime.value = time;
  });

  return (
    <points>
      <bufferGeometry ref={geoRef}>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
        <bufferAttribute attach="attributes-aAlpha" args={[alphas, 1]} />
        <bufferAttribute attach="attributes-aScale" args={[scales, 1]} />
      </bufferGeometry>

      <shaderMaterial
        ref={matRef}
        transparent
        depthWrite={false}
        toneMapped={false}
        blending={THREE.AdditiveBlending}
        uniforms={{
          uSize: { value: threadSize * 100.0 },
          uColor: { value: new THREE.Color(...threadColor) },
          uTime: { value: 0 },
          uDepthFadeNear: { value: trailDepthFadeNear },
          uDepthFadeFar: { value: trailDepthFadeFar },
          uMinVisibility: { value: trailMinVisibility },
        }}
        vertexShader={`
          attribute float aAlpha;
          attribute float aScale;
          varying float vAlpha;
          varying float vDepthFade;

          uniform float uSize;
          uniform float uDepthFadeNear;
          uniform float uDepthFadeFar;
          uniform float uMinVisibility;

          void main() {
            vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
            gl_Position = projectionMatrix * mvPosition;

            float dist = max(-mvPosition.z, 0.001);
            gl_PointSize = (uSize * aScale) * (5.0 / dist);

            vAlpha = aAlpha;

            float fade = 1.0 - smoothstep(uDepthFadeNear, uDepthFadeFar, dist);
            vDepthFade = uMinVisibility + (1.0 - uMinVisibility) * fade;
          }
        `}
        fragmentShader={`
          uniform vec3 uColor;
          varying float vAlpha;
          varying float vDepthFade;

          void main() {
            vec2 uv = gl_PointCoord - vec2(0.5);
            float d = length(uv);

            float core = 1.0 - smoothstep(0.06, 0.22, d);
            float glow = 1.0 - smoothstep(0.0, 0.55, d);

            float alpha = core * vAlpha * vDepthFade;
            if (alpha < 0.01) discard;

            vec3 color = uColor * (0.95 + glow * 2.1) * vDepthFade;
            gl_FragColor = vec4(color, alpha);
          }
        `}
      />
    </points>
  );
}

function SceneContent({
  sectionRef,
  planeWidth = 12,
  planeHeight = 10,
  widthSegments = 9,
  heightSegments = 10,
  planeCount = 15,
  planeSpacing = 0.5,
  particleSize = 0.08,
  particleColor = [2.4, 2.4, 2.4],
  bottomRows = 3,
  threadStride = 1,
  threadCount = null,
  maxPointsPerThread = 120,
  threadSize = 0.04,
  waveAmount = 1.35,
  swirlAmount = 1.15,
  swirlIntensity = 1.0,
  initialSwirlReveal = 0.55,
  threadColor = [0.72, 0.9, 1.35],
  randomPathOffset = 0.22,
  randomSpacingAmount = 0.35,
  pulseSpeed = 1.4,
  pulseAmount = 0.55,
  trailDepthFadeNear = 3.5,
  trailDepthFadeFar = 11.0,
  trailMinVisibility = 0.72,
  threadTargetX = 0,
  threadTargetY = null,
  threadTargetZ = 0,
  convergeStrength = 1.0,
  endTightness = 0.78,
  jitterEndFalloff = 0.9,
  swirlEndFalloff = 0.82,

  autoTrailCount = 10,
  autoTrailSize = 0.12,
  autoTrailColor = [2.4, 2.4, 2.4],
  autoTrailDensity = 604,
  autoTrailMinNodes = 6,
  autoTrailMaxNodes = 14,
  autoTrailSpeedMin = 42,
  autoTrailSpeedMax = 72,
  autoTrailTailMin = 10,
  autoTrailTailMax = 24,
  autoTrailOpacity = 1,
  autoTrailTailShrink = 1.35,

  parallaxAmountX = 0.45,
  parallaxAmountY = 0.3,
  parallaxLerp = 0.08,

  stretchStart = "60% top",
  stretchEnd = "80% top",
}) {
  const parallaxRef = useRef(null);
  const groupRef = useRef(null);
  const stretchRef = useRef(1);
  const stopTimerRef = useRef(null);
  const stretchEnabledRef = useRef(false);
  const swirlProgressRef = useRef(0);

  const gridData = useMemo(
    () =>
      buildGridData({
        planeWidth,
        planeHeight,
        widthSegments,
        heightSegments,
        planeCount,
        planeSpacing,
      }),
    [
      planeWidth,
      planeHeight,
      widthSegments,
      heightSegments,
      planeCount,
      planeSpacing,
    ],
  );

  useFrame((state) => {
    if (!parallaxRef.current) return;

    const targetX = state.mouse.x * parallaxAmountX;
    const targetY = state.mouse.y * parallaxAmountY;

    parallaxRef.current.position.x = THREE.MathUtils.lerp(
      parallaxRef.current.position.x,
      targetX,
      parallaxLerp,
    );

    parallaxRef.current.position.y = THREE.MathUtils.lerp(
      parallaxRef.current.position.y,
      targetY,
      parallaxLerp,
    );
  });

  useLayoutEffect(() => {
    if (!sectionRef.current || !groupRef.current) return;

    const motion = { swirl: 0 };
    let master;
    let stretchWindowST;

    const ctx = gsap.context(() => {
      gsap.set(groupRef.current.position, {
        y: -2.5,
        z: -5,
      });

      stretchWindowST = ScrollTrigger.create({
        trigger: "#cube-container",
        start: stretchStart,
        end: stretchEnd,
        onEnter: () => {
          stretchEnabledRef.current = true;
        },
        onEnterBack: () => {
          stretchEnabledRef.current = true;
        },
        onLeave: () => {
          stretchEnabledRef.current = false;
          gsap.to(stretchRef, {
            current: 1,
            duration: 0.18,
            overwrite: true,
          });
        },
        onLeaveBack: () => {
          stretchEnabledRef.current = false;
          gsap.to(stretchRef, {
            current: 1,
            duration: 0.18,
            overwrite: true,
          });
        },
      });

      master = gsap.timeline({
        defaults: { ease: "none" },
        scrollTrigger: {
          trigger: "#cube-container",
          start: "50% top",
          end: "90% top",
          scrub: true,
          invalidateOnRefresh: true,
          onUpdate: (self) => {
            if (stretchEnabledRef.current) {
              const velocity = Math.abs(self.getVelocity());
              const intensity = Math.min(velocity / 2500, 1);
              stretchRef.current = 1 + intensity * 15;

              if (stopTimerRef.current) stopTimerRef.current.kill();
              stopTimerRef.current = gsap.delayedCall(0.1, () => {
                gsap.to(stretchRef, {
                  current: 1,
                  duration: 0.2,
                  overwrite: true,
                });
              });
            } else {
              if (stopTimerRef.current) stopTimerRef.current.kill();
              gsap.to(stretchRef, {
                current: 1,
                duration: 0.18,
                overwrite: true,
              });
            }

            swirlProgressRef.current = motion.swirl;
          },
          onRefresh: (self) => {
            if (master) master.progress(self.progress);
            swirlProgressRef.current = motion.swirl;
            stretchRef.current = 1;
          },
        },
      });

      master
        .to(groupRef.current.position, { z: -1, duration: 1 })
        .to(
          groupRef.current.position,
          { y: 4, duration: 2, ease: "power1.inOut" },
          1,
        )
        .to(
          groupRef.current.position,
          { y: 7.5, duration: 1, delay: 0.2, ease: "power1.inOut" },
          3,
        )
        .to(motion, { swirl: 1, duration: 1, ease: "power1.inOut" ,delay:-0.7});

      requestAnimationFrame(() => {
        ScrollTrigger.refresh();
        if (master?.scrollTrigger) {
          master.progress(master.scrollTrigger.progress);
          swirlProgressRef.current = motion.swirl;
          stretchRef.current = 1;
        }
      });
    }, sectionRef);

    return () => {
      if (stopTimerRef.current) stopTimerRef.current.kill();
      if (stretchWindowST) stretchWindowST.kill();
      ctx.revert();
    };
  }, [sectionRef, stretchStart, stretchEnd]);

  return (
    <>
      <GradientBackground />
      <ambientLight intensity={0.35} />

      <group ref={parallaxRef}>
        <group ref={groupRef} rotation={[0, Math.PI, 0]} position={[0, 0, -1]}>
          {Array.from({ length: planeCount }).map((_, i) => {
            const z = (i - (planeCount - 1) / 2) * planeSpacing;

            return (
              <PointPlane
                key={i}
                z={z}
                planeWidth={planeWidth}
                planeHeight={planeHeight}
                widthSegments={widthSegments}
                heightSegments={heightSegments}
                particleSize={particleSize}
                particleColor={particleColor}
                stretchRef={stretchRef}
              />
            );
          })}

          <DiagonalStrokeTrails
            planes={gridData.planes}
            count={autoTrailCount}
            trailSize={autoTrailSize}
            trailColor={autoTrailColor}
            samplesPerSegment={autoTrailDensity}
            minNodes={autoTrailMinNodes}
            maxNodes={autoTrailMaxNodes}
            speedMin={autoTrailSpeedMin}
            speedMax={autoTrailSpeedMax}
            tailMin={autoTrailTailMin}
            tailMax={autoTrailTailMax}
            trailOpacity={autoTrailOpacity}
            tailShrink={autoTrailTailShrink}
          />

          <DrawnSwirlThreads
            points={gridData.flatPoints}
            widthSegments={widthSegments}
            heightSegments={heightSegments}
            planeHeight={planeHeight}
            bottomRows={bottomRows}
            threadStride={threadStride}
            threadCount={threadCount}
            maxPointsPerThread={maxPointsPerThread}
            threadSize={threadSize}
            threadColor={threadColor}
            waveAmount={waveAmount}
            swirlAmount={swirlAmount}
            swirlIntensity={swirlIntensity}
            initialSwirlReveal={initialSwirlReveal}
            randomPathOffset={randomPathOffset}
            randomSpacingAmount={randomSpacingAmount}
            pulseSpeed={pulseSpeed}
            pulseAmount={pulseAmount}
            trailDepthFadeNear={trailDepthFadeNear}
            trailDepthFadeFar={trailDepthFadeFar}
            trailMinVisibility={trailMinVisibility}
            threadTargetX={threadTargetX}
            threadTargetY={threadTargetY}
            threadTargetZ={threadTargetZ}
            convergeStrength={convergeStrength}
            endTightness={endTightness}
            jitterEndFalloff={jitterEndFalloff}
            swirlEndFalloff={swirlEndFalloff}
            swirlProgressRef={swirlProgressRef}
          />
        </group>
      </group>

      <EffectComposer>
        <Bloom
          intensity={1.15}
          luminanceThreshold={0.02}
          luminanceSmoothing={0.28}
          mipmapBlur
        />
      </EffectComposer>
    </>
  );
}

export default function StickyPointPlaneSection({
  sectionHeight = "400vh",
  planeWidth = 13,
  planeHeight = 10,
  widthSegments = 9,
  heightSegments = 10,
  planeCount = 12,
  planeSpacing = 1.5,
  particleSize = 0.08,
  particleColor = [2.4, 2.4, 2.4],
  cameraPosition = [0, 0, 5],

  bottomRows = 3,
  threadStride = 1,
  threadCount = 40,
  maxPointsPerThread = 500,
  threadSize = 0.04,

  waveAmount = 1.35,
  swirlAmount = 2.15,
  swirlIntensity = 1.5,
  initialSwirlReveal = 1.0,

  threadColor = [0.72, 0.9, 1.35],
  randomPathOffset = 0,
randomSpacingAmount = 0.001,
  pulseSpeed = 5.6,
  pulseAmount = 0.7,

  trailDepthFadeNear = 3.5,
  trailDepthFadeFar = 11.0,
  trailMinVisibility = 0.72,

  threadTargetX = 0,
  threadTargetY = null,
  threadTargetZ = 0,
  convergeStrength = 1.0,

  endTightness = 0.78,
  jitterEndFalloff = 0.9,
  swirlEndFalloff = 0.82,

  autoTrailCount = 20,
  autoTrailSize = 0.05,
  autoTrailColor = [0.8, 1.0, 1.5],
  autoTrailDensity = 40,
  autoTrailMinNodes = 6,
  autoTrailMaxNodes = 24,
  autoTrailSpeedMin = 90,
  autoTrailSpeedMax = 100,
  autoTrailTailMin = 10,
  autoTrailTailMax = 74,
  autoTrailOpacity = 2,
  autoTrailTailShrink = 0.7,

  parallaxAmountX = 0.45,
  parallaxAmountY = 0.3,
  parallaxLerp = 0.08,

  stretchStart = "60% top",
  stretchEnd = "80% top",
}) {
  const sectionRef = useRef(null);

  return (
    <section
      ref={sectionRef}
      id="cube-container"
      className="relative"
      style={{ height: sectionHeight }}
    >
      <div className="sticky top-0 h-screen w-full overflow-hidden">
        <Canvas camera={{ position: cameraPosition, fov: 50 }} dpr={[1, 1.5]}>
          <SceneContent
            sectionRef={sectionRef}
            planeWidth={planeWidth}
            planeHeight={planeHeight}
            widthSegments={widthSegments}
            heightSegments={heightSegments}
            planeCount={planeCount}
            planeSpacing={planeSpacing}
            particleSize={particleSize}
            particleColor={particleColor}
            bottomRows={bottomRows}
            threadStride={threadStride}
            threadCount={threadCount}
            maxPointsPerThread={maxPointsPerThread}
            threadSize={threadSize}
            waveAmount={waveAmount}
            swirlAmount={swirlAmount}
            swirlIntensity={swirlIntensity}
            initialSwirlReveal={initialSwirlReveal}
            threadColor={threadColor}
            randomPathOffset={randomPathOffset}
            randomSpacingAmount={randomSpacingAmount}
            pulseSpeed={pulseSpeed}
            pulseAmount={pulseAmount}
            trailDepthFadeNear={trailDepthFadeNear}
            trailDepthFadeFar={trailDepthFadeFar}
            trailMinVisibility={trailMinVisibility}
            threadTargetX={threadTargetX}
            threadTargetY={threadTargetY}
            threadTargetZ={threadTargetZ}
            convergeStrength={convergeStrength}
            endTightness={endTightness}
            jitterEndFalloff={jitterEndFalloff}
            swirlEndFalloff={swirlEndFalloff}
            autoTrailCount={autoTrailCount}
            autoTrailSize={autoTrailSize}
            autoTrailColor={autoTrailColor}
            autoTrailDensity={autoTrailDensity}
            autoTrailMinNodes={autoTrailMinNodes}
            autoTrailMaxNodes={autoTrailMaxNodes}
            autoTrailSpeedMin={autoTrailSpeedMin}
            autoTrailSpeedMax={autoTrailSpeedMax}
            autoTrailTailMin={autoTrailTailMin}
            autoTrailTailMax={autoTrailTailMax}
            autoTrailOpacity={autoTrailOpacity}
            autoTrailTailShrink={autoTrailTailShrink}
            parallaxAmountX={parallaxAmountX}
            parallaxAmountY={parallaxAmountY}
            parallaxLerp={parallaxLerp}
            stretchStart={stretchStart}
            stretchEnd={stretchEnd}
          />
        </Canvas>
      </div>
    </section>
  );
}