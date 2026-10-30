/**
 * PortalHero — every tunable value in one place.
 *
 * The UPPERCASE sections below are *live*: the Leva panel (dev, or `?controls`)
 * edits them in place and the canvas reads them every frame. Use the panel's
 * "Copy config" button to paste tuned values back into this file.
 *
 * Coordinates are three.js (Y up, -Z into the screen). The Blender scene was
 * exported +Y up, so Blender (x, y, z) -> three (x, z, -y). Every portal /
 * floor number was measured from the model in Blender, not guessed.
 */

export const MODEL = {
  url: "/assets/models/portal-environment.glb",
};

/** Measured portal geometry (not live). */
export const PORTAL = {
  /** Centre of the (empty) opening: 3.4 m wide, 6.7 m tall. */
  center: [0, 3.35, -12.2],
  radius: 1.7, // opening half-width / arch radius
  springY: 5.0, // straight jambs up to here, semicircle above
  rimDepth: 1.5, // the metal reveal runs from z -11.45 to -12.95
  /** Front face (z) of each layer, from the opening outwards. */
  faces: { rim: -11.45, inner: -11.5, outer: -11.74, surround: -12.01, wall: -12.7 },
  /** Radial extents (metres beyond the opening edge) of those layers. */
  bands: { rim: 0.27, inner: 0.85, outer: 1.73, surround: 3.05 },
};

export const CAMERA = {
  position: [0, 0.9, 5.5], // low, centred on the corridor axis
  fov: 46, // vertical; matches the 24 mm Blender hero lens at 16:9
  near: 0.1,
  far: 120,
  minHorizontalAspect: 1.6, // widen FOV below this aspect so the arch fits
  maxFov: 70,
};

export const PARALLAX = {
  range: [0.9, 0.35], // metres the camera travels at the screen edge (x, y)
  damping: 2.6, // higher = snappier (frame-rate independent lerp)
  floatAmplitude: 0.03,
  floatSpeed: 0.45,
};

/**
 * The scroll journey: hero → approach → through the portal → a straight
 * fall down the rock tunnel → the Skills Boulder (scroll stops until it is
 * uncovered and breaks) → the fall continues. One camera path, one timeline.
 *
 * The path = the hero knots below (through the portal) + a generated tube
 * (`tube`): straight out of the portal, a smooth tip-over into a straight
 * dive, a smooth level-out facing the boulder, then on down past it. Scroll progress p (0..1) is mapped to
 * distance along it by a smooth monotone curve through `keys` ([p, marker]);
 * a marker with `true` is a rest point (the camera eases to a stop there).
 *
 *   screens:  hero 2.4 · approach 2.4 · crossing 0.8 · fall 5.5 ·
 *             arrival 2.2 · after the boulder 4
 *
 * Coordinates: the portal opening is x ±1.7, y 0–6.7, rim z -11.45 → -12.95;
 * the back wall has a matching hole and nothing lies beyond z -14.2, so the
 * tunnel and boulder live in that void.
 */
export const JOURNEY = {
  scrollLength: 17.3, // viewport heights of scrolling for the whole journey
  scrub: 1.2, // s the camera trails the scroll (smoothing on top of Lenis)
  path: [
    [0, 0.9, 5.5], // 0  hero shot (CAMERA.position)
    [0, 1.0, 3.6], // 1  end of the hero drift
    [0, 1.7, -3.0], // 2
    [0, 2.35, -9.4], // 3  just in front of the portal (2 m before the rim)
    [0, 2.6, -13.6], // 4  through the opening (centre height, ±1.7 m clear)
    // …then the generated tube, starting at tube.start
  ],
  /**
   * The tube past the portal (metres along it): level out of the portal, a
   * smooth tip-over into a straight dive (with a slight left/right sway), a
   * smooth level-out facing the boulder, the stop — then level past where
   * the boulder stood and tipping over into the dive again.
   */
  tube: {
    start: [0, 2.4, -20], // level, heading -z, just past the back wall
    dive: 48, // ° of the straight dive
    lead: 4, // m level before tipping over
    tipOver: 28, // m over which the camera pitches down (and back up again)
    fall: 55, // m of straight dive
    glide: 10, // m level before the stop
    boulderDistance: 6.65, // m from the stop to the boulder's front
    past: 9, // m level past the boulder
    after: 24, // m of dive after it (until the next section)
    sway: 0.55, // m: gentle left/right drift while diving
    swayLength: 46, // m per sway
  },
  /** [scroll progress, marker, rest?] — stage borders. */
  keys: [
    [0, "start"],
    [0.139, "heroEnd"],
    [0.277, "portalFront"],
    [0.324, "voidStart"],
    [0.642, "emerge"], // boulder emerging (20 m before the stop)
    [0.769, "stop", true], // in front of the boulder: scroll locks until it breaks
    [1, "end"],
  ],
  portalFocus: [0, 3.0, -12.2], // looked at during the hero / approach
  lookAhead: 12, // m: how far down the path the camera looks while moving (longer = steadier)
  /** Scroll ranges of each stage (for effects). */
  stages: { approach: [0.139, 0.277], crossing: [0.277, 0.324], fall: [0.324, 0.642], arrival: [0.642, 0.769], after: [0.769, 1] },
  /** Stop scrolling inside the tunnel → it glides on (to the boulder, then on to the end). */
  autoScroll: { delay: 0.6, screensPerSecond: 1.3 }, // delay: s after your last scroll input
  /** heroState.fx values reached during the hero part (1 = at rest). */
  effects: {
    awaken: 1, // web nodes brighten, more filaments carry pulses
    mist: 1.6, // ground mist thickens
    water: 1.2, // violet reflections on the water
    glowAwaken: 1.12, // gate glow + violet lights + bloom while approaching
  },
  /** Hero lights (moon, fill, rake) once the corridor is behind us. */
  ambientAfterPortal: 0.45,
  /** Soft violet fill in the void (the hemisphere light, re-tinted; intensity: VOID.fill). */
  voidFill: { sky: "#6A2FC0", ground: "#120624" },
  /** Fog density per stage (exp²): the corridor, the fall, the arrival. */
  fog: { arrival: 0.012 }, // (the fall's fog: VOID.fog)
  /** Cursor parallax per stage (0..1). */
  parallax: { tunnel: 0.25, arrival: 0.35 },
};

/** Distortion as the camera passes through the portal (peaks inside the rim). */
export const WARP = {
  halfWidth: 0.025, // scroll progress either side of the peak
  stretch: 0.11, // radial stretch towards the edges
  chromatic: 0.012, // RGB split (uv), strongest at the edges
  blur: 0.05, // radial blur length
  /** Camera speed (m/s) mapped to 0..1 for the fall's motion effects (see VOID). */
  speed: { from: 3, to: 26 },
};

/**
 * The look of the void past the portal — live, with its own Leva panel
 * ("Tunnel"). Structure (counts, placement) is in TUNNEL and rebuilds.
 */
export const VOID = {
  bank: 6, // ° the camera leans into each sway of the dive
  peek: 0.35, // brightness of the void glimpsed through the portal before crossing
  nebula: 0.28, // the cloudy backdrop around the fall (kept dark)
  nebulaColor: "#1E0844",
  nebulaGlow: "#6A2FD0",
  fill: 0.18, // soft violet fill light on the rocks
  fog: 0.022, // exp² fog density while falling
  light: 190, // violet light travelling with the camera
  lightDistance: 30,
  lightColor: "#9440FF",
  crackGlow: 1, // × each rock type's crack emission
  spin: 1, // × all rock rotation
  spinX: 0.12, // rad/s tumbling top-over-bottom (× each rock's own factor 0.5–1.5, ± direction)
  spinY: 0.12, // rad/s turning side to side
  spinZ: 0.5, // rad/s rolling in the screen plane (around the line of fall)
  dust: 2.2,
  dustColor: "#8B2EFF",
  dustShutter: 0.07, // s of "exposure": how far motes smear with the camera's speed
  dustMaxStretch: 4, // m, longest smear
  smoke: 0.45,
  smokeColor: "#5B1CC4",
  chromatic: 0.004, // RGB split on the screen edges, always on in the void
  speedChromatic: 0.006, // extra RGB split while moving
  speedBlur: 0.06, // edge motion blur while moving
  edgeBlur: 7, // px: soft lens blur towards the screen edges (centre stays sharp)
};

/** The fall: instanced rocks + dust, placed along the path past the portal. */
export const TUNNEL = {
  seed: 7,
  rocks: [
    // url, count (× quality), scale range, min distance from the path, emissive
    { url: "/assets/models/journey/rock-large-jagged.glb", count: 11, scale: [1.2, 2.8], clearance: 5, emissive: 2.2 },
    { url: "/assets/models/journey/rock-medium-fragment.glb", count: 16, scale: [0.9, 2.0], clearance: 2.4, emissive: 1.2 },
    { url: "/assets/models/journey/rock-elongated-shard.glb", count: 12, scale: [1.0, 2.2], clearance: 2.6, emissive: 1.8 },
    { url: "/assets/models/journey/rock-flat-fracture.glb", count: 12, scale: [0.9, 2.0], clearance: 2.2, emissive: 1.0 },
    { url: "/assets/models/journey/rock-rune-fragment.glb", count: 6, scale: [1.0, 1.8], clearance: 3, emissive: 2.6 },
    { url: "/assets/models/journey/rock-small-debris.glb", count: 40, scale: [0.8, 2.6], clearance: 1.3, emissive: 0.4 },
  ],
  radius: [1.5, 11], // m from the path
  drift: 0.35, // m of slow floating
  ahead: 55, // m of path ahead of the camera whose rocks are drawn
  rockDensity: 1, // × every rock count (× quality)
  dust: 2600, // motes along the fall (× quality)
  smokeCount: 22, // soft smoke banks drifting around the fall
  smokeSize: [9, 22], // m
};

/** The Skills Boulder at the end of the fall. */
export const BOULDER = {
  url: "/assets/models/journey/skills-monolith.glb",
  masks: "/assets/models/journey/skills-monolith-masks.webp",
  clean: "/assets/models/journey/skills-monolith-clean.webp",
  // placed by the journey path (journeyPath.js → boulderPose): in the tube,
  // levelled out, its front (+Z) turned to face the camera at the stop
  focus: [0, 1.9, 1.0], // look-at, relative to the GLB root (centre of the inscribed front)
  halfWidth: 4.2, // m, for fitting the boulder on narrow screens
  front: {
    z: 1.05, // local z of the inscribed front (it is planar in UV: u→+X, v→-Y)
    u: [0.18854, -2.0337, 0.14276], // u = u0 + (x - x0) · k
    v: [0.19305, 2.2162, -0.1428], // v = v0 + (y - y0) · k
    vMax: 0.46771, // the front occupies v 0..vMax of the atlas
  },
  key: { color: "#B07CFF", intensity: 260, angle: 0.75, penumbra: 0.9, offset: [-4.5, 6.5, 7] },
  emissive: 1.2, // baked glowing cracks (dark until they light up from the centre)
  dustColor: "#6E6676",
  glowColor: "#9B4DFF",
  glow: 2.2, // revealed engravings
  hint: 0.08, // faint breathing glow on the still-dusty engravings
  brush: { radius: 0.13, strength: 0.6 }, // m: dust cleared under the cursor as gravel flies
  /** Carved skills (GLB root coords, from skills-monolith.json): [x, y, z, w, h] */
  skills: [
    { key: "nextjs", logo: [-2.0337, 2.2162, 1.0716, 0.4, 0.4], label: [-2.0331, 1.9265, 1.0831, 0.282, 0.084] },
    { key: "javascript", logo: [-1.3146, 2.2162, 1.0356, 0.4, 0.4], label: [-1.314, 1.9265, 1.0472, 0.4292, 0.084] },
    { key: "tailwind", logo: [-0.5955, 2.2162, 0.9996, 0.64, 0.3805], label: [-0.5949, 1.9265, 1.0112, 0.5285, 0.084] },
    { key: "threejs", logo: [0.6372, 2.2092, 0.9693, 0.4, 0.4], label: [0.6364, 1.9195, 0.9838, 0.3299, 0.084] },
    { key: "r3f", logo: [1.3959, 2.2092, 1.0149, 0.448, 0.4], label: [1.395, 1.9195, 1.0293, 0.7116, 0.084] },
    { key: "webgl", logo: [2.1545, 2.2092, 1.0604, 0.64, 0.2816], label: [2.1536, 1.9195, 1.0748, 0.2905, 0.084] },
    { key: "gsap", logo: [-0.3207, 1.0214, 1.1063, 0.64, 0.2343], label: [-0.3214, 0.7321, 1.0861, 0.2266, 0.084] },
  ],
  /** Small gravel covering each skill: hover flicks it away. */
  gravel: {
    perSquareMetre: 650,
    size: [0.022, 0.05], // m radius
    color: "#3a3440",
    kickRadius: 0.13, // m around the cursor
    clearedAt: 0.8, // a skill counts as uncovered once this share of its gravel is gone
  },
  /** Cracks lighting up from the centre as skills are uncovered. */
  crack: { color: "#A15CFF", glow: 1.8, seams: 3, reach: 5.2, centre: [0, 1.8, 1.0] }, // reach: m at 100%
  /** After the last skill: the boulder bursts and the scroll carries on. */
  burst: { delay: 0.7, hold: 2.2, speed: [3.5, 7], drag: 1.1, spin: [1.2, 3.2], minRadius: 4 }, // hold: s to watch it before the scroll carries on
};

/** Objects rendered into the water reflection are also put on this layer. */
export const LAYERS = { reflection: 1 };

/** Quality tiers. "low" = phones / coarse pointers. */
export const QUALITY = {
  high: {
    shadows: true,
    density: 1,
    reflectionScale: 0.4,
    multisampling: 2,
    bloomLevels: 6,
    dpr: [1, 1.5], // max pixel ratio; lowered automatically if frames drop
    fluidResolution: 128,
    dyeResolution: 512,
    pressureIterations: 16,
    warp: 1, // portal-crossing distortion
  },
  low: {
    shadows: false,
    density: 0.45,
    reflectionScale: 0.3,
    multisampling: 0,
    bloomLevels: 5,
    dpr: [1, 1.25],
    fluidResolution: 96,
    dyeResolution: 256,
    pressureIterations: 10,
    warp: 0.6,
  },
};

/* ================================================================== */
/* Live sections (Leva)                                               */
/* ================================================================== */

/** How particles ride the fluid. */
export const PARTICLES = {
  fluidForce: 2.1, // how strongly the flow carries particles
  drag: 7.749, // velocity damping (1/s) — lower = longer glides
  nodeSpring: 15, // pull of web nodes back to their rest position
  dustSpring: 4, // dust drifts much more freely
  maxOffset: 2.28, // m, furthest a particle can be swept
  wander: 0.32, // idle drift force
  stirGlow: 3.58, // how much stirred particles light up
  twinkle: 0.15, // depth of the slow particle twinkle (0 = steady)
  pulses: 0.35, // brightness of the light pulses travelling along threads
  nodeSize: 0.505,
  dustSize: 0.85,
  nodeBrightness: 15,
  threadBrightness: 3.475,
  dustBrightness: 1.7,
  threadWidth: 0.048, // m at a node; pinches to ~45% mid-thread
  threadBend: 0, // undulation, fraction of thread length
  threadCurve: 0.22, // resting curvature, fraction of thread length
  smokeTint: 1.55, // particles pick up the smoke colour as it passes
  colorDeep: "#5E0A92",
  colorMid: "#B82EF0",
  colorBright: "#E58BFF",
  colorHot: "#FCEBFF",
};

/** Screen-space fluid driven by the cursor (stable fluids). */
export const FLUID = {
  splatForce: 3700,
  splatRadius: 0.02, // % of the screen
  dyeDissipation: 4.0, // how fast the liquid trail fades
  trail: 2.0, // how much "liquid" each cursor move leaves behind
};

/**
 * The cursor's fluid rendered as clear liquid glass: it refracts the scene
 * behind it, splits colour at its edges and catches reflections, then
 * spreads and fades like the fluid it is.
 */
export const DISTORTION = {
  enabled: true,
  refraction: 0.12, // how far the liquid bends the scene
  chromatic: 0.2, // RGB split (dispersion) along the bend
  normalScale: 0.9, // how "domed" the liquid surface reads
  reflection: 0.09, // specular highlight on the liquid
  mirror: 0.08, // faint reflection of the scene on the liquid's edges
  rim: 0.03, // coloured glint along the liquid's edges
  highlightColor: "#F6EEFF",
  rimColor: "#B65CFF",
};

/** Web structure (changing these rebuilds the particles). */
export const NETWORK = {
  seed: 1337,
  archNodes: 1600, // nodes clinging to the arch (× quality density)
  clumps: 26,
  tendrils: 18,
  tendrilLength: [2.2, 5.5],
  tendrilStep: 0.17,
  strands: 8, // long filaments reaching out across the side walls
  strandLength: [5, 9],
  connectDistance: 0.34, // m
  maxDegree: 3, // links per node
  dropLinks: 0.16,
  dustCount: 6000, // free-floating motes (× quality density)
  nodeSize: [0.03, 0.09],
  dustSize: [0.012, 0.075],
  highlightRatio: 0.07,
  anchorReach: 0.4, // m from the gate edge: web nodes this close never move
  interactionPlaneZ: -11.55,
};

/** The glowing gate (an arch-shaped emissive layer on the rim). */
export const GATE = {
  ringIntensity: 0,
  ringWidth: 0.04, // m
  coreColor: "#9300ff",
  ringColor: "#a000ff",
  hotIntensity: 8.03, // the white-hot crescent
  hotPosition: 0, // 0..1 round the arch (0 = left foot, 0.5 = top)
  hotSpread: 0.6,
  hotDrift: -0.2, // crescent drift speed
  surfaceIntensity: 14.2, // ring light on the inner surface of the opening
  surfaceFalloff: 1.5, // m: how far back into the opening it reaches
  plane: { z: -11.4, width: 10.4, height: 11.2, centerY: 5.0 },
};

/** Violet light from the portal. */
export const VIOLET = {
  coreColor: "#8B2EFF",
  coreIntensity: 78,
  coreDistance: 13.675,
  spillColor: "#8B2EFF",
  spillIntensity: 112,
  spillDistance: 15, // falls off before the corridor walls / ceiling
  washColor: "#7F24F0",
  washIntensity: 380,
};

/** Original cool architectural rig (kept dim — night). */
export const LIGHTS = {
  coolColor: "#c9cde0",
  hemisphere: 0.035, // cool fill: keeps stone readable in shadow
  moon: 1.02,
  rakeR: 180,
};

export const WATER = {
  enabled: true,
  level: 0.082, // covers ~95% of the centre path; rocks break through
  reflection: 0.95,
  rippleIntensity: 4,
  rippleSpeed: 2.3, // m/s
  rippleScale: 11.87, // ring frequency
  roughness: 0.6, // patchy surface: blurs and breaks the reflection
  stretch: 1.0, // vertical streaking of the reflection
  color: "#030207",
  tint: "#2A0A5E",
  drips: true,
};

export const ATMOSPHERE = {
  background: "#030207",
  fogColor: "#07030f",
  fogDensity: 0.006,
  mistIntensity: 0.67,
  mistColor: "#5B1CC4",
  mistFalloff: 4.5, // m: mist glows near the portal, fading into black beyond
  hazeIntensity: 0.6, // faint depth haze around the arch (never inside it)
  hazeColor: "#2A0A5E",
};

/** Detail pass on the GLB's stone / ground / rock materials. */
export const STONE = {
  roughnessVariation: 0.35, // per-area roughness spread (± fraction)
  bump: 0.012, // fine procedural surface relief
  crevice: 0.45, // darkens grooves and chipped edges (from the normal maps)
  grime: 0.3, // patchy darkening
  damp: 0.6, // darker, glossier lower walls
  dampHeight: 1.1, // m above the floor
};

export const POST = {
  exposure: 0.9275,
  toneMapping: "AGX",
  bloomIntensity: 0.3,
  bloomThreshold: 0.79,
  bloomSmoothing: 0.25,
  bloomRadius: 0.62,
};

/** Sections the Leva panel edits / "Copy config" exports. */
export const LIVE_SECTIONS = ["PARTICLES", "FLUID", "DISTORTION", "NETWORK", "GATE", "VIOLET", "LIGHTS", "STONE", "WATER", "ATMOSPHERE", "POST", "PARALLAX"];
/** Sections the Tunnel panel edits / exports. */
export const TUNNEL_SECTIONS = ["VOID", "TUNNEL"];

/* ================================================================== */
/* Fixed rig data                                                     */
/* ================================================================== */

/** Positions of the cool lights (intensities live in LIGHTS). */
export const LIGHT_RIG = {
  moon: { position: [-12, 26.7, 6.7], target: [0, 0, -3] },
  spots: [
    // kept below the pipes so the metal doesn't blow out
    { name: "rakeR", key: "rakeR", position: [2.4, 6.5, 14], target: [6.1, 2.5, -9], angle: 0.24, penumbra: 0.6 },
  ],
};

export const VIOLET_RIG = {
  core: [0, 2.4, -12.3], // inside the opening
  spill: [0, 1.0, -9.6], // just in front, low: floor, rocks, water, pipes
  wash: { position: [0, 0.45, -6.8], target: [0, 5.6, -11.8], angle: 0.42, penumbra: 1 },
};

export const WATER_DATA = {
  bounds: { x: [-4.8, 4.8], z: [-11.3, 4.5] },
  /** Floor + rubble heights ray-cast in Blender, 8-bit, range (m). */
  heightMap: { url: "/assets/textures/portal-water-height.png", min: -0.1, max: 0.2 },
  drips: [
    [1.0, -4.24], [-2.26, -2.38], [0.27, -0.15], [3.17, -6.1],
    [2.45, -9.07], [-2.26, -4.98], [1.0, -7.21], [2.08, -2.01],
  ],
  dripInterval: [1.4, 3.6],
};

export const MIST_RIG = [
  // low around the portal base
  { position: [0, 0.45, -10.9], size: [7.5, 1.5] },
  { position: [-2.6, 0.5, -10.2], size: [5, 1.6] },
  { position: [2.8, 0.5, -10.4], size: [5, 1.6] },
  { position: [-3.4, 0.9, -8.6], size: [7, 2.4] },
  { position: [3.6, 0.8, -9.3], size: [7, 2.2] },
  { position: [-1.6, 0.55, -5.8], size: [6, 1.8] },
  { position: [2.4, 0.6, -4.2], size: [6, 1.8] },
];

/** Depth haze plane in front of the portal wall. */
export const HAZE_RIG = { z: -11.2, width: 18, height: 12, centerY: 4.6 };

export const PALETTE = {
  black: "#030207",
  darkViolet: "#15052B",
  deepPurple: "#3F0071",
  electric: "#8B2EFF",
  bright: "#C77DFF",
  hot: "#F3E8FF",
};

export const FINE_POINTER_QUERY = "(hover: hover) and (pointer: fine)";
export const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";
export const LOW_QUALITY_QUERY = "(max-width: 767px), (pointer: coarse)";
