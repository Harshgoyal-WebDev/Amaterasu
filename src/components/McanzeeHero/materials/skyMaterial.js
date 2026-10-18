import * as THREE from "three";

/**
 * Gradient sky dome. Not tone-mapped and not fogged, so its horizon colour
 * lines up exactly with scene.fog — distant geometry melts into the sky.
 * Uniform values are set (and kept in sync) by SceneEnvironment.
 */
export function createSkyMaterial() {
  return new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    toneMapped: false,
    fog: false,
    uniforms: {
      uZenith: { value: new THREE.Color() },
      uHorizon: { value: new THREE.Color() },
      uGlow: { value: new THREE.Color() },
      uGlowDir: { value: new THREE.Vector3(0, 0, -1) },
      uGlowStrength: { value: 0 },
      uGlowPower: { value: 1 },
    },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uZenith;
      uniform vec3 uHorizon;
      uniform vec3 uGlow;
      uniform vec3 uGlowDir;
      uniform float uGlowStrength;
      uniform float uGlowPower;
      varying vec3 vDir;

      void main() {
        vec3 dir = normalize(vDir);
        float h = max(dir.y, 0.0);
        vec3 col = mix(uHorizon, uZenith, smoothstep(0.0, 0.6, pow(h, 0.8)));
        float g = pow(max(dot(dir, uGlowDir), 0.0), uGlowPower);
        col = mix(col, uGlow, g * uGlowStrength);
        gl_FragColor = vec4(col, 1.0);
        #include <colorspace_fragment>
      }
    `,
  });
}
