"use client";

import React, { Suspense, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { Canvas, useFrame, useThree } from "@react-three/fiber";

/* -------------------------------------------------------------------------- */
/* CONFIG                                  */
/* -------------------------------------------------------------------------- */

const TUNNEL_CONFIG = {
  faceImageSrc: "/assets/face-outline.png",

  faceCount: 15,
  faceSpacing: 11.5,
  faceWorldWidth: 10.4,

  edgeSampleStep: 1,
  alphaThreshold: 20,
  edgeThreshold: 0.08,
  outlineDotSpacing: 0.1,

  faceParticleMinSize: 20.2,
  faceParticleMaxSize: 50.4,

  // HIGH DENSITY
  ambientParticlesPerFace: 1200, 
  deepFieldParticlesPerFace: 600,

  ambientParticleMinSize: 20.6,
  ambientParticleMaxSize: 40.2,
  deepParticleMinSize: 50.8,
  deepParticleMaxSize: 70.4,

  fieldSpreadX: 12.0,
  fieldSpreadY: 10.0,
  fieldDepthJitter: 5.6,

  // BOTTOM DENSITY BIAS (Renamed conceptually, logic inverted below)
  bottomDensityBoost: 3.5, 

  farVisibilityStrength: 1.35,
  farFadeNear: 8.0,
  farFadeFar: 120.0,
  farPoint: 22.0,

  cameraZ: 8,
  cameraLerp: 0.08,
  tunnelTravelExtra: 10,
  nearParticleBoost: 2.1,

  mouseParallaxX: 0.42,
  mouseParallaxY: 0.24,
  tunnelParallaxX: 0.32,
  tunnelParallaxY: 0.18,
  tunnelParallaxLerp: 0.08,

  faceParticleParallaxX: 1.72,
  faceParticleParallaxY: 1.64,
  fieldParticleParallaxX: 0.46,
  fieldParticleParallaxY: 0.4,

  hoverRadius: 0.16,
  hoverBloomStrength: 10.8,
  hoverBloomRise: 0.12,
  hoverBloomFall: 0.38,
  hoverMouseLerp: 0.14,
  hoverActivationThreshold: 0.002,

  faceParticleColor: "#d8f3ff",
  ambientColor: "#dff6ff",
  deepFieldColor: "#ADD8E6",

  faceJitterX: 0.22,
  faceJitterY: 0.18,
  faceJitterZ: 0.8,

  tunnelEasePower: 1.12,
};

/* -------------------------------------------------------------------------- */
/* HELPERS                                  */
/* -------------------------------------------------------------------------- */

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function hexToRGB(hex) {
  const c = new THREE.Color(hex);
  return [c.r, c.g, c.b];
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

function getAlphaAt(data, width, height, x, y) {
  const cx = Math.max(0, Math.min(width - 1, x));
  const cy = Math.max(0, Math.min(height - 1, y));
  return data[(cy * width + cx) * 4 + 3] / 255;
}

function computeAlphaEdge(data, width, height, x, y) {
  const a = getAlphaAt(data, width, height, x, y);
  if (a <= 0.0) return 0;
  let diff = 0;
  let count = 0;
  for (let oy = -1; oy <= 1; oy += 1) {
    for (let ox = -1; ox <= 1; ox += 1) {
      if (ox === 0 && oy === 0) continue;
      const na = getAlphaAt(data, width, height, x + ox, y + oy);
      diff += Math.abs(a - na);
      count += 1;
    }
  }
  return diff / Math.max(1, count);
}

/* -------------------------------------------------------------------------- */
/* EDGE EXTRACTION WITH DOT THINNING                      */
/* -------------------------------------------------------------------------- */

function buildSparseOutlinePoints({
  data,
  imageWidth,
  imageHeight,
  faceWorldWidth,
  worldHeight,
  edgeSampleStep,
  alphaThreshold,
  edgeThreshold,
  outlineDotSpacing,
}) {
  const sparsePoints = [];
  const occupied = new Set();

  for (let y = 0; y < imageHeight; y += edgeSampleStep) {
    for (let x = 0; x < imageWidth; x += edgeSampleStep) {
      const i = (y * imageWidth + x) * 4;
      const a = data[i + 3];

      if (a < alphaThreshold) continue;

      const edgeStrength = computeAlphaEdge(data, imageWidth, imageHeight, x, y);
      if (edgeStrength < edgeThreshold) continue;

      const px = (x / imageWidth - 0.5) * faceWorldWidth;
      const py = -(y / imageHeight - 0.5) * worldHeight;

      const gx = Math.round(px / outlineDotSpacing);
      const gy = Math.round(py / outlineDotSpacing);
      const key = `${gx}_${gy}`;

      if (occupied.has(key)) continue;
      occupied.add(key);

      sparsePoints.push([px, py]);
    }
  }
  return sparsePoints;
}

/* -------------------------------------------------------------------------- */
/* BUILD TUNNEL DATA FROM IMAGE                      */
/* -------------------------------------------------------------------------- */

async function buildFaceImageTunnelData(config) {
  const img = await loadImage(config.faceImageSrc);
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d", { willReadFrequently: true });

  canvas.width = img.width;
  canvas.height = img.height;
  ctx.drawImage(img, 0, 0);

  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const { data } = imageData;

  const imageWidth = canvas.width;
  const imageHeight = canvas.height;
  const aspect = imageWidth / imageHeight;
  const worldHeight = config.faceWorldWidth / aspect;

  const positions = [];
  const colors = [];
  const sizes = [];
  const randoms = [];
  const depthAlphas = [];
  const isOutline = [];

  const faceRGB = hexToRGB(config.faceParticleColor);
  const ambientRGB = hexToRGB(config.ambientColor);
  const deepRGB = hexToRGB(config.deepFieldColor);

  const outlinePoints = buildSparseOutlinePoints({
    data,
    imageWidth,
    imageHeight,
    faceWorldWidth: config.faceWorldWidth,
    worldHeight,
    edgeSampleStep: config.edgeSampleStep,
    alphaThreshold: config.alphaThreshold,
    edgeThreshold: config.edgeThreshold,
    outlineDotSpacing: config.outlineDotSpacing,
  });

  const totalTunnelDepth = Math.max(1, config.faceCount * config.faceSpacing);

  for (let faceIndex = 0; faceIndex < config.faceCount; faceIndex += 1) {
    const baseZ = -faceIndex * config.faceSpacing;
    const faceOffsetX = (Math.random() - 0.5) * config.faceJitterX;
    const faceOffsetY = (Math.random() - 0.5) * config.faceJitterY;
    const faceOffsetZ = (Math.random() - 0.5) * config.faceJitterZ;

    // 1. Face Outline
    for (let i = 0; i < outlinePoints.length; i += 1) {
      const [x, y] = outlinePoints[i];
      const z = baseZ + faceOffsetZ + (Math.random() - 0.5) * 0.02;
      positions.push(x + faceOffsetX, y + faceOffsetY, z);
      colors.push(faceRGB[0], faceRGB[1], faceRGB[2]);
      sizes.push(lerp(config.faceParticleMinSize, config.faceParticleMaxSize, Math.random()));
      randoms.push(Math.random(), Math.random(), Math.random());
      const farNorm = THREE.MathUtils.clamp(Math.abs(z) / totalTunnelDepth, 0, 1);
      depthAlphas.push(1.0 - farNorm * 0.55);
      isOutline.push(1.0);
    }

    // 2. Ambient Particles (Bottom Bias)
    const ambientCount = Math.floor(config.ambientParticlesPerFace);
    for (let i = 0; i < ambientCount; i += 1) {
      const angle = Math.random() * Math.PI * 2;
      const radiusX = lerp(0, config.fieldSpreadX, Math.random());
      
      // BOTTOM BIAS: Math.pow(rand, boost) clusters values near 0.0 (bottom)
      const bottomBias = Math.pow(Math.random(), config.bottomDensityBoost);
      const py = lerp(-config.fieldSpreadY, config.fieldSpreadY * 0.5, bottomBias) + faceOffsetY;
      
      const px = Math.cos(angle) * radiusX + faceOffsetX;
      const pz = baseZ + faceOffsetZ + (Math.random() - 0.5) * config.fieldDepthJitter;

      positions.push(px, py, pz);
      colors.push(ambientRGB[0], ambientRGB[1], ambientRGB[2]);
      sizes.push(lerp(config.ambientParticleMinSize, config.ambientParticleMaxSize, Math.random()));
      randoms.push(Math.random(), Math.random(), Math.random());
      const farNorm = THREE.MathUtils.clamp(Math.abs(pz) / totalTunnelDepth, 0, 1);
      depthAlphas.push(1.0 - farNorm * 0.68);
      isOutline.push(0.0);
    }

    // 3. Deep Field (Bottom Bias)
    const deepCount = Math.floor(config.deepFieldParticlesPerFace);
    for (let i = 0; i < deepCount; i += 1) {
      const bottomBias = Math.pow(Math.random(), config.bottomDensityBoost * 1.2);
      const px = (Math.random() - 0.5) * config.fieldSpreadX * 4.0;
      // Pull heavily toward negative Y
      const py = lerp(-config.fieldSpreadY * 1.8, config.fieldSpreadY * 0.2, bottomBias);
      const pz = baseZ + faceOffsetZ + (Math.random() - 0.5) * config.faceSpacing * 1.2;

      positions.push(px, py, pz);
      colors.push(deepRGB[0], deepRGB[1], deepRGB[2]);
      sizes.push(lerp(config.deepParticleMinSize, config.deepParticleMaxSize, Math.random()));
      randoms.push(Math.random(), Math.random(), Math.random());
      const farNorm = THREE.MathUtils.clamp(Math.abs(pz) / totalTunnelDepth, 0, 1);
      depthAlphas.push(1.0 - farNorm * 0.88);
      isOutline.push(0.0);
    }
  }

  return {
    positions: new Float32Array(positions),
    colors: new Float32Array(colors),
    sizes: new Float32Array(sizes),
    randoms: new Float32Array(randoms),
    depthAlphas: new Float32Array(depthAlphas),
    isOutline: new Float32Array(isOutline),
    count: positions.length / 3,
  };
}

/* -------------------------------------------------------------------------- */
/* SHADER MATERIAL                             */
/* -------------------------------------------------------------------------- */

const TunnelParticleMaterial = new THREE.ShaderMaterial({
  transparent: true,
  depthWrite: false,
  blending: THREE.AdditiveBlending, 
  uniforms: {
    uTime: { value: 0 },
    uPixelRatio: { value: 1 },
    uNearParticleBoost: { value: TUNNEL_CONFIG.nearParticleBoost },
    uFarVisibilityStrength: { value: TUNNEL_CONFIG.farVisibilityStrength },
    uFarFadeNear: { value: TUNNEL_CONFIG.farFadeNear },
    uFarFadeFar: { value: TUNNEL_CONFIG.farFadeFar },
    uFarPoint: { value: TUNNEL_CONFIG.farPoint },
    uMouse: { value: new THREE.Vector2(999, 999) },
    uHoverRadius: { value: TUNNEL_CONFIG.hoverRadius },
    uHoverBloomStrength: { value: TUNNEL_CONFIG.hoverBloomStrength },
    uHoverMix: { value: 0 },
    uPointer: { value: new THREE.Vector2(0, 0) },
    uFaceParallax: { value: new THREE.Vector2(TUNNEL_CONFIG.faceParticleParallaxX, TUNNEL_CONFIG.faceParticleParallaxY) },
    uFieldParallax: { value: new THREE.Vector2(TUNNEL_CONFIG.fieldParticleParallaxX, TUNNEL_CONFIG.fieldParticleParallaxY) },
  },
  vertexShader: `
    attribute float aSize;
    attribute vec3 aColor;
    attribute vec3 aRandom;
    attribute float aDepthAlpha;
    attribute float aIsOutline;

    uniform float uTime;
    uniform float uPixelRatio;
    uniform float uNearParticleBoost;
    uniform float uFarVisibilityStrength;
    uniform float uFarFadeNear;
    uniform float uFarFadeFar;
    uniform float uFarPoint;
    uniform vec2 uMouse;
    uniform float uHoverRadius;
    uniform float uHoverBloomStrength;
    uniform float uHoverMix;
    uniform vec2 uPointer;
    uniform vec2 uFaceParallax;
    uniform vec2 uFieldParallax;

    varying vec3 vColor;
    varying float vAlpha;

    void main() {
      vec3 pos = position;
      pos.x += sin(uTime * 0.75 + pos.z * 0.08 + aRandom.x * 12.0) * 0.02;
      pos.y += cos(uTime * 0.65 + pos.z * 0.05 + aRandom.y * 12.0) * 0.02;

      vec2 parallaxStrength = mix(uFieldParallax, uFaceParallax, aIsOutline);
      pos.x += uPointer.x * parallaxStrength.x;
      pos.y += -uPointer.y * parallaxStrength.y;

      vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
      float perspective = 1.0 / max(0.42, -mvPosition.z);
      float nearBoost = clamp((uNearParticleBoost * 2.6) / max(0.25, -mvPosition.z), 1.0, 9.0);

      vec4 clipPos = projectionMatrix * mvPosition;
      vec2 ndc = clipPos.xy / max(0.0001, clipPos.w);

      float d = distance(ndc, uMouse);
      float hover = 1.0 - smoothstep(uHoverRadius, uHoverRadius * 1.65, d);
      hover *= uHoverMix;

      gl_PointSize = aSize * uPixelRatio * perspective * nearBoost;
      gl_PointSize = clamp(gl_PointSize, 1.2, 40.0);
      gl_Position = clipPos;

      float brighten = hover * uHoverBloomStrength;
      vColor = aColor * (1.0 + brighten);

      float nearFade = smoothstep(0.8, 4.2, -mvPosition.z);
      float farPointFade = smoothstep(uFarFadeFar, uFarPoint, -mvPosition.z);
      float farFade = 1.0 - smoothstep(uFarFadeNear, uFarFadeFar, -mvPosition.z);
      farFade = mix(1.0, farFade, clamp(uFarVisibilityStrength, 0.0, 3.0) / 3.0);

      vAlpha = nearFade * farFade * farPointFade * aDepthAlpha;
    }
  `,
  fragmentShader: `
    varying vec3 vColor;
    varying float vAlpha;
    void main() {
      vec2 uv = gl_PointCoord - 0.5;
      float dist = length(uv);
      float alpha = 1.0 - smoothstep(0.42, 0.49, dist);
      if (alpha < 0.02) discard;
      gl_FragColor = vec4(vColor, alpha * vAlpha);
    }
  `,
});

/* -------------------------------------------------------------------------- */
/* FACE TUNNEL POINTS                            */
/* -------------------------------------------------------------------------- */

function FaceTunnelPoints({ progressRef, config = TUNNEL_CONFIG }) {
  const pointsRef = useRef();
  const tunnelGroupRef = useRef();
  const pointerLerpedRef = useRef(new THREE.Vector2(0, 0));
  const hoverMouseTargetRef = useRef(new THREE.Vector2(999, 999));
  const hoverMouseLerpedRef = useRef(new THREE.Vector2(999, 999));
  const bloomValueRef = useRef(0);
  const bloomTargetRef = useRef(0);
  const lastPointerRawRef = useRef(new THREE.Vector2(999, 999));

  const { camera, gl, pointer } = useThree();
  const [data, setData] = useState(null);

  useEffect(() => {
    let active = true;
    buildFaceImageTunnelData(config).then((result) => { if (active) setData(result); });
    return () => { active = false; };
  }, [config]);

  const geometry = useMemo(() => {
    if (!data) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(data.positions, 3));
    g.setAttribute("aColor", new THREE.BufferAttribute(data.colors, 3));
    g.setAttribute("aSize", new THREE.BufferAttribute(data.sizes, 1));
    g.setAttribute("aRandom", new THREE.BufferAttribute(data.randoms, 3));
    g.setAttribute("aDepthAlpha", new THREE.BufferAttribute(data.depthAlphas, 1));
    g.setAttribute("aIsOutline", new THREE.BufferAttribute(data.isOutline, 1));
    return g;
  }, [data]);

  useFrame((state, delta) => {
    const raw = THREE.MathUtils.clamp(progressRef?.current ?? 0, 0, 1);
    const t = Math.pow(raw, config.tunnelEasePower);

    pointerLerpedRef.current.x = THREE.MathUtils.lerp(pointerLerpedRef.current.x, pointer.x, config.tunnelParallaxLerp);
    pointerLerpedRef.current.y = THREE.MathUtils.lerp(pointerLerpedRef.current.y, pointer.y, config.tunnelParallaxLerp);

    camera.position.z = THREE.MathUtils.lerp(camera.position.z, config.cameraZ, config.cameraLerp);
    camera.position.x = THREE.MathUtils.lerp(camera.position.x, pointerLerpedRef.current.x * config.mouseParallaxX, config.tunnelParallaxLerp);
    camera.position.y = THREE.MathUtils.lerp(camera.position.y, -pointerLerpedRef.current.y * config.mouseParallaxY, config.tunnelParallaxLerp);
    camera.lookAt(pointerLerpedRef.current.x * 0.08, -pointerLerpedRef.current.y * 0.06, 0);

    if (tunnelGroupRef.current) {
      const travel = (config.faceCount - 1) * config.faceSpacing + config.tunnelTravelExtra;
      tunnelGroupRef.current.position.z = THREE.MathUtils.lerp(tunnelGroupRef.current.position.z, lerp(0, travel, t), 0.08);
      tunnelGroupRef.current.position.x = THREE.MathUtils.lerp(tunnelGroupRef.current.position.x, pointerLerpedRef.current.x * config.tunnelParallaxX, config.tunnelParallaxLerp);
      tunnelGroupRef.current.position.y = THREE.MathUtils.lerp(tunnelGroupRef.current.position.y, -pointerLerpedRef.current.y * config.tunnelParallaxY, config.tunnelParallaxLerp);
    }

    if (pointsRef.current?.material) {
      const mat = pointsRef.current.material;
      mat.uniforms.uTime.value = state.clock.elapsedTime;
      mat.uniforms.uPixelRatio.value = Math.min(gl.getPixelRatio(), 2);
      mat.uniforms.uPointer.value.lerp(pointerLerpedRef.current, config.tunnelParallaxLerp);

      const moved = Math.abs(pointer.x - lastPointerRawRef.current.x) > config.hoverActivationThreshold;
      if (moved) { hoverMouseTargetRef.current.set(pointer.x, pointer.y); bloomTargetRef.current = 1; } 
      else { bloomTargetRef.current = 0; }
      lastPointerRawRef.current.set(pointer.x, pointer.y);

      hoverMouseLerpedRef.current.lerp(hoverMouseTargetRef.current, config.hoverMouseLerp);
      const bloomLerp = bloomTargetRef.current > bloomValueRef.current ? 1 - Math.exp(-delta / config.hoverBloomRise) : 1 - Math.exp(-delta / config.hoverBloomFall);
      bloomValueRef.current = THREE.MathUtils.lerp(bloomValueRef.current, bloomTargetRef.current, bloomLerp);
      mat.uniforms.uHoverMix.value = bloomValueRef.current;
      mat.uniforms.uMouse.value.copy(hoverMouseLerpedRef.current);
    }
  });

  return data ? (
    <group ref={tunnelGroupRef}>
      <points ref={pointsRef} geometry={geometry} material={TunnelParticleMaterial} frustumCulled={false} />
    </group>
  ) : null;
}

/* -------------------------------------------------------------------------- */
/* EXPORT                                   */
/* -------------------------------------------------------------------------- */

export default function ParticleFaceTunnel({ progressRef, height = "100vh", config = TUNNEL_CONFIG }) {
  return (
    <div style={{ width: "100%", height }} className="relative">
      <Canvas camera={{ position: [0, 0, 8], fov: 48 }} gl={{ antialias: true, alpha: true }} dpr={[1, 2]}>
        <Suspense fallback={null}>
          <FaceTunnelPoints progressRef={progressRef} config={config} />
        </Suspense>
      </Canvas>
    </div>
  );
}