import * as THREE from "three";
import { NOISE_GLSL } from "./noise.glsl";

/**
 * Soft ground mist on vertical cards. Noise is sampled in world space so
 * every card looks different while sharing one shader. `shared` uniforms
 * (time, global opacity, lens glow) are passed in by reference so a single
 * write per frame updates every layer.
 */
export function createMistMaterial({ color, glowColor, glowPosition, glowRadius, opacity, nearFade, shared }) {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    toneMapped: false,
    fog: false,
    uniforms: {
      uTime: shared.uTime,
      uGlobalOpacity: shared.uGlobalOpacity,
      uGlowStrength: shared.uGlowStrength,
      uOpacity: { value: opacity },
      uColor: { value: new THREE.Color(color) },
      uGlowColor: { value: new THREE.Color(glowColor) },
      uGlowPos: { value: new THREE.Vector3(...glowPosition) },
      uGlowRadius: { value: glowRadius },
      uNearFade: { value: new THREE.Vector2(...nearFade) },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      varying vec3 vWorldPos;
      varying float vViewDepth;
      void main() {
        vUv = uv;
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorldPos = wp.xyz;
        vec4 mvPosition = viewMatrix * wp;
        vViewDepth = -mvPosition.z;
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform float uGlobalOpacity;
      uniform float uGlowStrength;
      uniform float uOpacity;
      uniform vec3 uColor;
      uniform vec3 uGlowColor;
      uniform vec3 uGlowPos;
      uniform float uGlowRadius;
      uniform vec2 uNearFade;
      varying vec2 vUv;
      varying vec3 vWorldPos;
      varying float vViewDepth;
      ${NOISE_GLSL}

      void main() {
        vec2 q = vec2(vWorldPos.x * 0.07 + vWorldPos.z * 0.05 + uTime * 0.025, vWorldPos.y * 0.3 - uTime * 0.012);
        float n = fbm(q + fbm(q * 0.6 + uTime * 0.01));

        float vertical = 1.0 - smoothstep(0.0, 1.0, vUv.y);
        vertical *= vertical;
        float edges = smoothstep(0.0, 0.22, vUv.x) * smoothstep(1.0, 0.78, vUv.x);
        float near = smoothstep(uNearFade.x, uNearFade.y, vViewDepth);

        float a = smoothstep(0.2, 0.8, n) * vertical * edges * near * uOpacity * uGlobalOpacity;

        float glow = 1.0 - smoothstep(0.0, uGlowRadius, distance(vWorldPos, uGlowPos));
        vec3 col = mix(uColor, uGlowColor, glow * glow * 0.55 * uGlowStrength);

        gl_FragColor = vec4(col, clamp(a, 0.0, 1.0));
        #include <colorspace_fragment>
      }
    `,
  });
}
