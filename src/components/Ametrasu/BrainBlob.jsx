import { useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";

// Extended config with extra color and dither options
const BLOB_CONFIG = {
  frequency: 5.0,
  amplitude: 0.5,
  scale: 0.65,
  position: [-0.3, 0.5, 0],
  icosahedronRadius: 0.5,
  icosahedronDetail: 10,
  ditherIntensity: 1.0, // New option for dither strength
  colorA: [22 / 255, 135 / 255, 255 / 255], // #1687FF (light blue)
  colorB: [0., 0.0, 0.], // Example: dark purple
  elevationLevel: 0.65, // Used for color interpolation
};

const vertexShader = `
  varying vec3 vNormal;
  varying vec3 vWorldPosition;
  varying float vElevation;
  varying float vFresnel;

  float hash(vec3 p) {
    return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453);
  }

  float noise(vec3 p) {
    vec3 i = floor(p);
    vec3 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float n = mix(
      mix(
        mix(hash(i + vec3(0,0,0)), hash(i + vec3(1,0,0)), f.x),
        mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x),
        f.y
      ),
      mix(
        mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x),
        mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x),
        f.y
      ),
      f.z
    );
    return n;
  }

  uniform float uTime;
  uniform float _frequency;
  uniform float _amplitude;

  void main() {
    vNormal = normalize(normalMatrix * normal);

    vec3 pos = position;
    float n = noise(pos * _frequency + uTime * 0.8);

    pos += normal * n * _amplitude;

    vec4 worldPosition = modelMatrix * vec4(pos, 1.0);
    vWorldPosition = worldPosition.xyz;

    vElevation = clamp(pos.y * 0.5 + 0.5, 0.0, 1.0);

    float fresnel = pow(1.0 - abs(normal.z), 2.0);
    vFresnel = fresnel;

    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
  }
`;

const fragmentShader = `
  varying vec3 vNormal;
  varying vec3 vWorldPosition;
  varying float vElevation;
  varying float vFresnel;

  uniform float _frequency;
  uniform float _amplitude;
  uniform float _ditherIntensity;
  uniform float _elevationLevel;
  uniform vec3 _colorA;
  uniform vec3 _colorB;

  float random(vec2 st) {
    return fract(sin(dot(st.xy, vec2(12.9898,78.233))) * 43758.5453123);
  }

  // New: more configurable palette function
  vec3 palette(float t, float scaler, vec3 colorA, vec3 colorB) {
    return mix(colorA * scaler, colorB * scaler, t);
  }

  void main() {
    float light = dot(vNormal, vec3(0.0, 0.0, 1.0)) * 0.5 + 0.5;
    float fresnel = vFresnel;
    // More influence from user elevation level (from config)
    float elevation = mix(light, fresnel, 0.4 + 0.4 * _elevationLevel);
    float base = mix(elevation, vElevation, 0.35 + 0.6 * _elevationLevel);
    float n = random(vWorldPosition.xy * 2.13) * 0.13;
    float t = clamp(base + n, 0.0, 1.0);

    // Palette now blends between _colorA, _colorB based on elevation
    float palIndex = smoothstep(0.12, 1.0, _elevationLevel);
    float colorScaler = 0.9 + fresnel * 2.5 + light * 0.6;

    vec3 color = palette(palIndex, colorScaler, _colorA, _colorB);

    color += fresnel * 0.13;

    // Adjustable dithering
    float edgeDither = smoothstep(0.13, 0.89, fresnel);
    float noiseVal = random(gl_FragCoord.xy * (0.4 + 2.5 * _ditherIntensity));
    float ditherStrength = edgeDither * _ditherIntensity;

    float threshold = t * 0.13 * mix(0.13, 1.15, ditherStrength);
    if (ditherStrength > 0.05 && noiseVal > threshold) discard;

    // Elevation alpha fade: more responsive to _elevationLevel
    float fade = smoothstep(0.08 * (1.0 - _elevationLevel), 0.25 * (0.8 + 0.2 * _elevationLevel), vElevation);
    float finalAlpha = fade;
    float alphaMask = step(noiseVal, threshold);
    finalAlpha *= alphaMask;

    if (finalAlpha < 0.025) discard;

    gl_FragColor = vec4(color, finalAlpha);
  }
`;

export default function BrainBlob({ opacityRef, icosahedronRef, config }) {
  const materialRef = useRef();
  const computedOpacity = opacityRef?.current ?? 1;
  // Merge config and default, allow partial override
  const cfg = { ...BLOB_CONFIG, ...(config || {}) };

  useFrame((state) => {
    if (materialRef.current) {
      materialRef.current.uniforms.uTime.value = state.clock.elapsedTime;
    }
  });

  // Pass float arrays as THREE.Color for uniforms, or convert here
  const colorA = Array.isArray(cfg.colorA) ? new THREE.Color(...cfg.colorA) : new THREE.Color(0, 0, 0);
  const colorB = Array.isArray(cfg.colorB) ? new THREE.Color(...cfg.colorB) : new THREE.Color(0, 0, 0);

  return (
    <>
      <mesh
        scale={cfg.scale}
        position={cfg.position}
        ref={icosahedronRef}
      >
        <icosahedronGeometry args={[cfg.icosahedronRadius, cfg.icosahedronDetail]} />
        <shaderMaterial
          ref={materialRef}
          vertexShader={vertexShader}
          fragmentShader={fragmentShader}
          transparent
          depthWrite={false}
          side={THREE.FrontSide}
          opacity={computedOpacity}
          uniforms={{
            uTime: { value: 0 },
            _frequency: { value: cfg.frequency },
            _amplitude: { value: cfg.amplitude },
            _ditherIntensity: { value: cfg.ditherIntensity ?? 1.0 },
            _elevationLevel: { value: cfg.elevationLevel ?? 0.65 },
            _colorA: { value: colorA },
            _colorB: { value: colorB }
          }}
        />
      </mesh>
      {/* <OrbitControls /> */}
    </>
  );
}
