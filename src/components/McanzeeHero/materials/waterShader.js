import * as THREE from "three";
import { FX_UNIFORMS } from "../fx";
import { NOISE_GLSL } from "./noise.glsl";

/**
 * Shallow still-water shader, used with three's Reflector (planar reflection)
 * on desktop, or on a plain mesh with a sky-colour fallback on low-end.
 *
 *  - ambient ripples: stretched value noise offsetting the reflection lookup;
 *  - cursor ripples: a small ring buffer of (x, z, startTime) expanding rings;
 *  - cursor glow: soft electric-blue light where the pointer meets the water;
 *  - soundwave: wobbling rings pulsing out from the portal base.
 *
 * FX uniforms are shared objects — reassign them after Reflector clones
 * the uniforms (see Water.jsx). Only the loop counts are compile-time; every
 * other value is a uniform that Water.jsx keeps in sync with the config.
 */
export function createWaterShader({ reflections, rippleCount, rings }) {
  return {
    name: "McanzeeWater",
    defines: {
      ...(reflections ? { USE_REFLECTION: "" } : {}),
      RIPPLE_COUNT: rippleCount,
      PULSE_RINGS: rings,
    },
    uniforms: THREE.UniformsUtils.merge([
      THREE.UniformsLib.fog,
      {
        // Required by Reflector:
        color: { value: null },
        tDiffuse: { value: null },
        textureMatrix: { value: new THREE.Matrix4() },
        // Ours:
        uDistortion: { value: 0 },
        uReflectivity: { value: 1 },
        uBaseReflection: { value: 0.25 },
        uWaterColor: { value: new THREE.Color() },
        uSkyColor: { value: new THREE.Color() },
        uGlowColor: { value: new THREE.Color() },
        uRippleStrength: { value: 0 },
        uRippleLife: { value: 3 },
        uRippleSpeed: { value: 3 },
        uHoverGlow: { value: 1 },
        uPulseIntensity: { value: 1 },
      },
    ]),
    vertexShader: /* glsl */ `
      uniform mat4 textureMatrix;
      varying vec4 vReflUv;
      varying vec3 vWorldPos;
      #include <common>
      #include <fog_pars_vertex>
      #include <logdepthbuf_pars_vertex>

      void main() {
        vReflUv = textureMatrix * vec4(position, 1.0);
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorldPos = wp.xyz;
        vec4 mvPosition = viewMatrix * wp;
        gl_Position = projectionMatrix * mvPosition;
        #include <logdepthbuf_vertex>
        #include <fog_vertex>
      }
    `,
    fragmentShader: /* glsl */ `
      uniform sampler2D tDiffuse;
      uniform float uDistortion;
      uniform float uReflectivity;
      uniform float uBaseReflection;
      uniform vec3 uWaterColor;
      uniform vec3 uSkyColor;
      uniform vec3 uGlowColor;
      uniform float uRippleStrength;
      uniform float uRippleLife;
      uniform float uRippleSpeed;
      uniform float uHoverGlow;
      uniform float uPulseIntensity;
      // shared FX
      uniform float uFxTime;
      uniform vec3 uWaterPointer; // x, z, strength
      uniform vec3 uRipples[RIPPLE_COUNT];
      uniform vec2 uPulseOrigin;
      uniform float uPulseAge;
      uniform float uPulseSpeed;
      varying vec4 vReflUv;
      varying vec3 vWorldPos;
      #include <common>
      #include <fog_pars_fragment>
      #include <logdepthbuf_pars_fragment>
      ${NOISE_GLSL}

      void main() {
        #include <logdepthbuf_fragment>
        vec2 p = vWorldPos.xz;

        // Ambient ripples
        float n1 = vnoise(vec2(p.x * 0.35, p.y * 1.7) + vec2(uFxTime * 0.05, uFxTime * 0.22));
        float n2 = vnoise(vec2(p.x * 0.9, p.y * 3.4) - vec2(uFxTime * 0.07, uFxTime * 0.15));
        vec2 ripple = vec2(n1 - 0.5, (n2 - 0.5) * 1.6) * uDistortion;

        // Cursor ripples
        float rip = 0.0;
        float ripCrest = 0.0;
        for (int i = 0; i < RIPPLE_COUNT; i++) {
          vec3 r = uRipples[i];
          float age = uFxTime - r.z;
          if (age < 0.0 || age > uRippleLife) continue;
          float d = distance(p, r.xy);
          float front = age * uRippleSpeed;
          float env = exp(-pow((d - front) / (0.5 + age * 0.5), 2.0)) * (1.0 - age / uRippleLife);
          float w = sin((d - front) * 4.5) * env;
          rip += w;
          ripCrest += max(w, 0.0);
        }
        ripple += vec2(rip * 0.6, rip) * uRippleStrength;

        // Cursor glow spot
        float hd = distance(p, uWaterPointer.xy);
        float hover = exp(-hd * hd / 5.0) * uWaterPointer.z;

        // Soundwave rings from the portal base — radius wobbles like a waveform.
        float pr = uPulseAge * uPulseSpeed;
        vec2 fromPortal = p - uPulseOrigin;
        float pd = length(fromPortal);
        float pa = atan(fromPortal.y, fromPortal.x);
        float wobble = sin(pa * 14.0 + uFxTime * 2.0) * 0.35 + sin(pa * 31.0 - uFxTime * 3.0) * 0.15;
        float rings = 0.0;
        for (int k = 0; k < PULSE_RINGS; k++) {
          float rr = pr - float(k) * 2.4;
          if (rr <= 0.0) continue;
          // Ring width grows with radius so distant rings stay readable.
          rings += exp(-pow((pd - rr - wobble) / (0.35 + rr * 0.02), 2.0)) * (1.0 - float(k) * 0.28);
        }
        rings *= exp(-uPulseAge * 0.45) * smoothstep(0.0, 3.0, pr);
        ripple += fromPortal / max(pd, 0.001) * rings * 0.012;

        vec3 viewDir = normalize(cameraPosition - vWorldPos);
        float fresnel = uBaseReflection + (1.0 - uBaseReflection) * pow(1.0 - clamp(viewDir.y, 0.0, 1.0), 4.0);

        #ifdef USE_REFLECTION
          vec4 uv = vReflUv;
          uv.xy += ripple * uv.w;
          vec3 reflection = texture2DProj(tDiffuse, uv).rgb;
        #else
          vec3 reflection = uSkyColor * (0.85 + (n1 - 0.5) * 0.2 + rip * 0.1);
        #endif

        // Water is never a perfect mirror — keep it a touch darker/bluer.
        reflection *= vec3(0.78, 0.82, 0.92);
        vec3 col = mix(uWaterColor, reflection, clamp(fresnel * uReflectivity, 0.0, 1.0));

        // Electric light: cursor glow, ripple crests catching it, soundwave.
        col += uGlowColor * (hover * uHoverGlow * (0.6 + ripCrest) + ripCrest * 0.25 * uHoverGlow + rings * uPulseIntensity);

        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }
    `,
  };
}
