/**
 * MCanzee hero — single source of truth for every tunable value.
 *
 * World units ≈ metres. +Y is up, the camera looks down -Z toward the portal.
 * The water surface sits at y = 0.
 *
 * Every exported object here is live: the Leva panel (see controls/) writes
 * into them and notifies the section by name, and each consumer either reads
 * the value per frame, syncs it into a uniform, or rebuilds what depends on
 * it. Keep cross-section maths at the point of use, not in these literals,
 * so a tweak to one section is never frozen into another.
 */

// ---------------------------------------------------------------------------
// Quick knobs — the values you'll most likely want to tweak first
// ---------------------------------------------------------------------------

export const KNOBS = {
  parallaxStrength: 1, // 0 disables cursor parallax
  scrollDistance: 34, // total forward (-Z) camera travel across the hero
  lensGlow: 1, // master multiplier for the lens rim / light
  fogDensity: 0.011, // FogExp2 density at rest (stages multiply it)
  waterDistortion: 0.018, // reflection ripple strength
  soundwaveIntensity: 1, // brightness of the portal's pulse (0 = off)
  runeIntensity: 1, // master multiplier for the hover runes
};

// ---------------------------------------------------------------------------
// Palette
// ---------------------------------------------------------------------------

export const COLORS = {
  skyZenith: "#c3cde0",
  skyHorizon: "#e7ebf2",
  skyGlow: "#f7f9fc",
  fog: "#e3e8f0",
  lensLight: "#3a52ff",
  rune: "#3d5bff", // glyph halo colour
  runeCore: "#e3e9ff", // hot centre of the glyph strokes
  water: "#070a14",
  glow: "#3350ff", // cursor / soundwave electric blue on the water
  mist: "#edf1f7",
  mistGlow: "#b9c6ff",
  // Colour the hero fades into — should match the next section's background.
  transition: "#eef1f6",
};

// ---------------------------------------------------------------------------
// Renderer / quality tiers
// ---------------------------------------------------------------------------

// Media queries shared by the DOM (gsap.matchMedia) and the canvas (quality tier).
export const MOBILE_QUERY = "(max-width: 767px)";
export const LOW_QUALITY_QUERY = "(max-width: 767px), (pointer: coarse)";
export const FINE_POINTER_QUERY = "(hover: hover) and (pointer: fine)";
export const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

export const QUALITY = {
  high: {
    dpr: [1, 1.75],
    antialias: true,
    waterReflections: true,
    reflectionResolution: 0.5, // fraction of the drawing buffer
    tier: "high",
  },
  low: {
    dpr: [1, 1.25],
    antialias: true,
    waterReflections: false, // falls back to a cheap sky-tinted fresnel
    reflectionResolution: 0.35,
    tier: "low",
  },
};

export const RENDERER = {
  exposure: 1.05,
  near: 0.1,
  far: 600,
};

// ---------------------------------------------------------------------------
// Camera
// ---------------------------------------------------------------------------

/**
 * Camera keyframes per breakpoint.
 *
 * The camera ALWAYS looks straight at the lens (target is computed, not set
 * here). Composition comes from `lensShift` — an off-axis projection shift in
 * NDC (like a tilt-shift lens), so the lens can sit centre-right while the
 * camera is aimed at it. Cursor parallax then orbits around the lens, keeping
 * it anchored while everything else moves around it.
 *
 * Z for `approach` / `transition` is derived from KNOBS.scrollDistance.
 */
export const CAMERA_KEYFRAMES = {
  desktop: {
    arrival: { position: [5, 2.2, 24], lensShift: [0.214, -0.02], fov: 32 },
    approach: { position: [2.4, 4.0], lensShift: [0.08, 0], fov: 34 },
    transition: { position: [4.8, 6.8], lensShift: [0, 0], fov: 38 },
    approachShare: 0.62, // share of the travel covered by the end of stage 2
    distanceScale: 1, // per-breakpoint multiplier on KNOBS.scrollDistance
  },
  mobile: {
    arrival: { position: [3.2, 2.6, 30], lensShift: [0, -0.26], fov: 48 },
    approach: { position: [4.6, 4.2], lensShift: [0, -0.1], fov: 46 },
    transition: { position: [5.6, 6.8], lensShift: [0, 0], fov: 44 },
    approachShare: 0.62,
    distanceScale: 1.2,
  },
};

export const CAMERA = {
  // On narrow *landscape* viewports, widen the vertical FOV (clamped) to keep
  // at least this aspect's horizontal framing. Portrait uses mobile keyframes.
  minHorizontalAspect: 1.55,
  maxFov: 62,
  // How close the camera may get to the lens surface at the end of the scroll.
  lensSafetyMargin: 2.5,
  // Idle floating
  floatAmplitude: 0.06,
  floatSpeed: 0.35,
};

/**
 * Cursor parallax = a small orbit around the lens. The camera keeps looking
 * at the lens, so near rocks sweep across the frame while the lens stays put.
 */
export const PARALLAX = {
  orbit: [2.2, 1.0], // world units of camera travel at full pointer deflection (x, y)
  damping: 2.4, // higher = snappier follow
};

// ---------------------------------------------------------------------------
// Scroll story
// ---------------------------------------------------------------------------

export const SCROLL = {
  sectionHeightVh: 420, // total hero scroll length
  scrub: true, // true = locked to (Lenis-smoothed) scroll; a number adds extra lag
  // Relative durations of the three stages inside the master timeline.
  stages: {
    arrival: 0.1, // hold — nothing moves yet except idle life
    approach: 0.55,
    transition: 0.35,
  },
};

export const STAGE_VALUES = {
  // lensForward: world units the lens slides along the aperture axis toward
  // the viewer. It stays seated in the stone tunnel (~2 units of room), so
  // the scroll story is the camera pushing into the lens, not the lens
  // leaving the portal. lensScale > ~1.03 would cut into the stone.
  arrival: {
    lensForward: 0,
    lensScale: 1,
    lensGlow: 1,
    fog: 1, // × KNOBS.fogDensity
    mist: 1,
  },
  approach: {
    lensForward: 0.6,
    lensScale: 1,
    lensGlow: 1.35,
    fog: 1.35,
    mist: 1.45,
  },
  transition: {
    lensForward: 1.4,
    lensScale: 1.02,
    lensGlow: 2.6,
    fog: 1.6,
    mist: 1.8,
  },
  // Where inside the transition stage the fade-to-page starts (0–1).
  whiteoutStart: 0.55,
};

// ---------------------------------------------------------------------------
// Scene objects
// ---------------------------------------------------------------------------

export const SKY = {
  radius: 400,
  glowDirection: [0.25, 0.12, -1], // soft bright patch behind the portal
  glowStrength: 0.35,
  glowPower: 6,
};

export const ENVIRONMENT = {
  resolution: 128,
  intensity: 0.85,
};

export const LIGHTS = {
  hemisphere: { sky: "#e4ebfa", ground: "#14161c", intensity: 0.85 },
  // Back/top key light — gives rocks bright tops and dark camera-facing sides.
  key: { color: "#f4f7ff", intensity: 2.4, position: [-18, 40, -60] },
  // Soft front fill so the portal's camera-facing faces don't go black.
  fill: { color: "#d7e0f5", intensity: 0.55, position: [10, 12, 40] },
  // Blue light emitted by the lens (multiplied by KNOBS.lensGlow × stage lensGlow).
  lens: { intensity: 220, distance: 60, decay: 2 },
};

/**
 * The environment (portal + rocks) is the artist's GLB. Our own water plane
 * is the lake: the model is lowered so `waterLevel` lands on world y = 0.
 *
 * `aperture` was measured from the mesh in model space (before `scale`):
 * centre + radius of the carved circle, `axis` = the through-direction.
 * Re-measure it if the model is re-exported with a different pivot.
 */
export const ENV_MODEL = {
  url: {
    high: "/assets/models/mcanzee-env-high.glb", // ~757k tris, 2k/4k WebP textures
    low: "/assets/models/mcanzee-env-low.glb", // ~284k tris, 1k/2k WebP textures
  },
  scale: 40, // model is ~1 unit wide → ~40 m
  rotationY: -2.06, // radians — portal in a 3/4 view, rocks framing the foreground
  anchor: [6.5, -23], // world [x, z] of the aperture centre
  waterLevel: -0.19, // model-space y of the lake surface (rock bases sink below it)
  aperture: { center: [-0.115, 0.0116, -0.091], radius: 0.124, axis: [1, 0, 0] },
};

/**
 * Biconvex glass lens filling the portal aperture. It refracts (and, being
 * convex, flips) the world behind it, with chromatic dispersion at the rim.
 */
export const LENS = {
  fill: 0.97, // lens radius as a fraction of the aperture radius
  bulge: 0.3, // centre half-thickness as a fraction of the radius
  edge: 0.03, // rim half-thickness as a fraction of the radius
  offset: 0, // world units along the aperture axis (+ = toward the camera)
  segments: 96,
  material: {
    ior: 1.6,
    thickness: 70, // world units — how far rays bend; large values invert the world like a crystal ball
    roughness: 0,
    chromaticAberration: 0.14, // rainbow fringes where the pillars are pulled in
    anisotropicBlur: 0,
    distortion: 0.05, // slow liquid shimmer
    distortionScale: 0.25,
    temporalDistortion: 0.03,
    color: "#ffffff",
    attenuationColor: "#8f9dff", // blue body tint
    attenuationDistance: 100,
    envMapIntensity: 2,
    clearcoat: 1,
    clearcoatRoughness: 0.05,
    iridescence: 0.15,
    iridescenceIOR: 1.3,
  },
  // Refraction buffer (the scene behind the lens, rendered once per frame),
  // sized as a fraction of the drawing buffer.
  buffer: { high: { scale: 0.75, samples: 8 }, low: { scale: 0.5, samples: 4 } },
  rim: { width: 0.035, intensity: 1.6, color: "#6d82ff" }, // glowing ring at the lens edge
};

export const WATER = {
  size: 600,
  center: [0, 0, -120],
  reflectivity: 1.0,
  baseReflection: 0.25, // reflection amount looking straight down
};


// ---------------------------------------------------------------------------
// Cursor interaction + soundwave
// ---------------------------------------------------------------------------

export const INTERACTION = {
  water: {
    maxRipples: 10,
    rippleLife: 3.2, // seconds
    rippleSpeed: 3.2, // world units / second
    rippleStrength: 0.02, // reflection distortion per ripple
    spawnSpacing: 1.4, // world units the pointer must travel between ripples
    idleInterval: 1.6, // seconds between gentle ripples while hovering still
    hoverGlow: 0.9,
    maxDistance: 140, // ignore water hits further than this from the camera
  },
  // Runes reveal inside a cone around the pointer ray, on any stone it hits.
  runeHover: {
    angle: 0.13, // radians — cone around the pointer ray (≈ screen-space radius)
    idleEnergy: 0.45, // share of the glow kept while the pointer rests
    rise: 3, // how fast energy builds while moving
    fall: 1.2, // how fast it fades when idle
  },
};

/**
 * Sonar-like pulse from the portal: rings over the water, runes flaring as
 * the ring passes them. Intensities are × KNOBS.soundwaveIntensity.
 */
export const SOUNDWAVE = {
  period: 5.5, // seconds between pulses when the music is off (on: AUDIO.chordSeconds / 2)
  speed: 9, // ring expansion, world units / second
  rings: 3, // concentric rings per pulse
  waterIntensity: 1.4,
  runeIntensity: 0.45, // share of the full rune reveal lit by the passing ring
  lensFlash: 0.8, // rim / light boost at the moment of the pulse
};

/**
 * Generative ambient space soundtrack (Web Audio — no audio files): slow,
 * beatless, mysterious. While it plays, the soundwave fires at every chord
 * change and half-way through each chord.
 */
export const AUDIO = {
  chordSeconds: 11, // how long each chord of the progression holds
  volume: 0.75,
  fadeIn: 5, // seconds
  fadeOut: 2,
  shimmer: 0.28, // average glass-bell notes per second (rises with the scroll)
  space: 0.7, // reverb amount (0 = close, 1 = vast)
  brightness: 0.35, // pad filter opening at rest (the scroll opens it further)
};

/** Patches on the model's own PBR material (textures stay untouched). */
export const ENV_MATERIAL = {
  envMapIntensity: 0.9,
  // The baked roughness map is near-mirror (~0.08), which reads as chrome
  // under a bright sky. It is remapped into this range (wet band excepted).
  roughnessRange: [0.5, 0.88],
  wetHeight: 0.9, // world height above the water that still reads wet
  wetDarken: 0.55, // albedo multiplier right at the waterline
  wetRoughness: 0.2,
};

/**
 * Glowing runic inscriptions, revealed on the portal gate and rocks around
 * the cursor. Procedural Futhark-style glyphs laid out in rows, projected in
 * the model's own axes so they sit square on the gate's faces.
 */
export const RUNES = {
  size: 0.9, // glyph height, metres
  spacing: [0.8, 1.5], // cell width / row height, in glyph heights
  stroke: 0.05, // stroke half-width, in glyph heights
  gaps: 0.25, // share of empty cells (word breaks)
  intensity: 7, // emissive strength at full reveal (× KNOBS.runeIntensity)
  halo: 0.55, // soft glow around strokes
  shimmer: 0.35, // per-glyph brightness flicker (0 = steady)
  surfaceGlow: 0.35, // faint arcane wash on the stone under the cursor
};

export const ATMOSPHERE = {
  // Vertical mist cards: [x, y, z], [width, height], opacity
  layers: [
    { position: [6.5, -0.4, -18.5], size: [34, 7], opacity: 0.9, tier: "low" },
    { position: [-18, -0.5, -32], size: [55, 9], opacity: 0.7, tier: "low" },
    { position: [30, -0.5, -40], size: [60, 12], opacity: 0.75, tier: "high" },
    { position: [0, -1, -75], size: [220, 22], opacity: 0.8, tier: "low" },
    { position: [2, -0.4, -4], size: [40, 3.5], opacity: 0.55, tier: "high" },
    { position: [-6, -0.3, 10], size: [26, 2.4], opacity: 0.35, tier: "high" },
  ],
  nearFade: [2, 12], // mist fades out when the camera is closer than this
  glowRadius: 20, // how far the lens tints the mist blue
  driftSpeed: 1,
};

// ---------------------------------------------------------------------------
// Derived helpers
// ---------------------------------------------------------------------------

const rotateY = ([x, y, z], angle) => {
  const c = Math.cos(angle);
  const sn = Math.sin(angle);
  return [x * c + z * sn, y, -x * sn + z * c];
};

/** World transform of the GLB so the aperture lands on ENV_MODEL.anchor. */
export function getEnvPlacement() {
  const { scale, rotationY, anchor, waterLevel, aperture } = ENV_MODEL;
  const [cx, , cz] = rotateY(aperture.center, rotationY);
  return { position: [anchor[0] - cx * scale, -waterLevel * scale, anchor[1] - cz * scale], rotationY, scale };
}

/** Aperture in world space: centre, radius and the axis facing the camera side. */
export function getAperture() {
  const { scale, rotationY, anchor, waterLevel, aperture } = ENV_MODEL;
  const normal = rotateY(aperture.axis, rotationY);
  if (normal[2] < 0) normal.forEach((v, i) => (normal[i] = -v));
  return {
    center: [anchor[0], (aperture.center[1] - waterLevel) * scale, anchor[1]],
    normal,
    radius: aperture.radius * scale,
  };
}

/** Lens centre in world space for a given forward drift along the aperture axis. */
export function getLensWorldPosition(forward = 0) {
  const { center, normal } = getAperture();
  const d = LENS.offset + forward;
  return center.map((v, i) => v + normal[i] * d);
}

/**
 * Resolves full camera states for a breakpoint. The target of every stage is
 * the lens's position at that stage, so the camera never stops looking at it.
 */
export function getCameraKeyframes(breakpoint) {
  const k = CAMERA_KEYFRAMES[breakpoint];
  const start = k.arrival.position;
  const travel = KNOBS.scrollDistance * k.distanceScale;

  const stage = (key, z) => {
    const { position, lensShift, fov } = k[key];
    const [tx, ty, tz] = getLensWorldPosition(STAGE_VALUES[key].lensForward);
    return { x: position[0], y: position[1], z, tx, ty, tz, fov, sx: lensShift[0], sy: lensShift[1] };
  };

  const arrival = stage("arrival", start[2]);
  const approach = stage("approach", start[2] - travel * k.approachShare);
  const transition = stage("transition", start[2] - travel);

  // Never end up inside the (scaled, drifted) lens: back off along the
  // lens → camera line until we're a safe distance from its surface.
  const minDistance =
    getAperture().radius * LENS.fill * STAGE_VALUES.transition.lensScale + CAMERA.lensSafetyMargin;
  const d = [transition.x - transition.tx, transition.y - transition.ty, transition.z - transition.tz];
  const len = Math.hypot(...d);
  if (len < minDistance) {
    const f = minDistance / len;
    transition.x = transition.tx + d[0] * f;
    transition.y = transition.ty + d[1] * f;
    transition.z = transition.tz + d[2] * f;
  }

  return { arrival, approach, transition };
}
