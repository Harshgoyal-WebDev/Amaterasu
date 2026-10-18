import * as THREE from "three";
import { NETWORK, PARTICLES } from "../../config";

/**
 * Uniforms shared by every "energy" shader (particles, threads, gate glow).
 * One object, so a single update per frame drives all of them — and the
 * water reflection pass can temporarily swap the viewport size.
 */
export const energyUniforms = {
  uTime: { value: 0 },
  uMotion: { value: 1 },
  uIntensity: { value: 1 },
  uGlowIntensity: { value: 1 },
  uAwaken: { value: 0 },
  uTwinkle: { value: PARTICLES.twinkle },
  uPulse: { value: PARTICLES.pulses },
  uStirGlow: { value: PARTICLES.stirGlow },
  uSmokeTint: { value: PARTICLES.smokeTint },
  uReflectionPass: { value: 0 },
  uViewportHeight: { value: 1080 },
  uResolution: { value: new THREE.Vector2(1920, 1080) },
  uPointer: { value: new THREE.Vector3(0, 3.35, NETWORK.interactionPlaneZ) },
  uPointerStrength: { value: 0 },
  tOffset: { value: null },
  tDye: { value: null },
  uColorDeep: { value: new THREE.Color(PARTICLES.colorDeep) },
  uColorMid: { value: new THREE.Color(PARTICLES.colorMid) },
  uColorBright: { value: new THREE.Color(PARTICLES.colorBright) },
  uColorHot: { value: new THREE.Color(PARTICLES.colorHot) },
};
