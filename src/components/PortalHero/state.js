import * as THREE from "three";
import { CAMERA, JOURNEY } from "./config";

/**
 * Mutable journey state, read every frame by the canvas (no React re-renders).
 *
 * Written by the scroll timeline (hooks/usePortalJourney.js) — the only
 * thing that moves the camera — and read by the scene:
 *   camera   pose along the journey path (+ cursor parallax amount)
 *   fx       effect multipliers (1 = at rest)
 *   journey  where we are: progress, which worlds are visible, stage weights
 */
export const heroState = {
  camera: {
    position: new THREE.Vector3(...CAMERA.position),
    target: new THREE.Vector3(...JOURNEY.portalFocus),
    /** 0 = cursor parallax off, 1 = full. */
    parallax: 1,
  },
  fx: {
    particleIntensity: 1, // node + thread brightness
    displacement: 1, // idle + cursor motion of the network
    cursorStrength: 1, // how hard the cursor pushes the network
    glowIntensity: 1, // portal edge glow, violet lights and bloom
    waterIntensity: 1, // reflections on the water
    rippleIntensity: 1, // cursor + drip ripples
    awaken: 0, // 0..1: web nodes near the gate brighten, more filaments pulse
    mist: 1, // ground mist intensity
    ambient: 1, // hero moon / fill / rake lights
  },
  journey: {
    progress: 0, // 0..1 scroll progress (smoothed by the scrub)
    hero: true, // corridor, water, web, mist drawn (and simulated)
    tunnel: true, // rocks drawn (glimpsed through the portal, then all around)
    reveal: 0, // 0..1 the void goes from a dim glimpse to full strength (crossing)
    boulder: false, // the Skills Boulder drawn
    void: 0, // 0..1 the camera is in the void past the portal (lights / fog)
    arrival: 0, // 0..1 settling in front of the boulder
    arrived: false, // the boulder can be scratched
    warp: 0, // 0..1 portal-crossing distortion
    motionFx: 1, // 0 for reduced motion: no warp / speed blur
    speed: 0, // 0..1 camera speed (eased), drives the fall's motion effects
    velocity: new THREE.Vector3(), // m/s, eased: motion-blurs the void's dust
  },
  /** Effect clock (seconds). Advanced by FxClock; slowed for reduced motion. */
  time: 0,
};
