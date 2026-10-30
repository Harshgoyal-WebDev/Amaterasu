/**
 * Infinity Castle — every tunable in one place. Units are metres / seconds.
 * Plain constants: the R3F side reads them per frame, nothing here re-renders.
 */

export const ASSET_BASE = "/assets/models/infinity-castle/web/";

export const PALETTE = {
  void: "#030202",
  fog: "#0a0605",
  cedar: "#3a2417",
  amber: "#ff9a3c",
  ivory: "#f2e4cc",
  lantern: "#ffb46a",
};

export const RENDERER = {
  exposure: 1.2,
  near: 0.06,
  far: 1400,
};

export const CAMERA = {
  fov: 58,
  fovPortrait: 72,
  eye: 1.55,
  orientationDamping: 7.5, // 1/s — slerp rate towards the path orientation
  lookAhead: 2.6, // m — blend towards the orientation this far ahead
  speedFovKick: 9, // degrees at full fall speed
  sway: 0.012, // idle breathing amplitude (m)
  bankFromLateral: 0.05, // radians per m/s of lateral motion
  junctionLean: 0.32, // radians of yaw towards the selected branch
  // mouse parallax: the view eases towards the pointer (mouse only, off for reduced motion)
  parallax: { yaw: 0.17, pitch: 0.11, shift: 0.28, lift: 0.16, roll: 0.025, smoothing: 2.6 },
};

export const MOTION = {
  wheelGain: 0.034, // path-m/s per wheel pixel
  touchGain: 0.075,
  maxWheelDelta: 150, // clamp a single wheel event (prevents flings across rooms)
  keyAccel: 14, // path-m/s² while a key is held
  keySpeed: 5.5,
  damping: 0.62, // velocity time constant (s)
  maxSpeed: 10, // path-m/s (multiplied by the path's pace)
  lateralGain: 0.006, // m per wheel/touch pixel
  lateralReturn: 2.6, // s — lateral offset relaxes back to centre
  lateralSmoothing: 6,
  lateralDeadzone: 2.5, // px — ignore trackpad noise
  lateralDominance: 0.65, // |dx| must exceed this × |dy|
  preferenceThreshold: 70, // accumulated px before a left/right intent registers
  reducedMotionScale: 0.6,
  // scrolling fast pushes harder and raises the top speed (a sprint)
  boostFrom: 2200, // px/s of scrolling before the boost starts
  boostRange: 4500, // px/s over which it reaches full
  boost: 1.3, // extra impulse / top speed at full (×2.3)
};

// Falls (chunks mark them with drift): gravity drives the camera, scrolling is ignored.
export const FALL = {
  gravity: 3.6, // path-m/s² (the path's pace multiplies it, so long drops get faster still)
  terminal: 9.5, // path-m/s
  landingTime: 0.7, // s of braking after touching down (scaled by impact)
  landingDamping: 0.16, // velocity time constant while braking (s)
};

// Walking: the head bobs with each stride and footsteps sound on the floor.
export const GAIT = {
  walkStep: 0.8, // m per footstep at walking speed
  runStep: 1.45, // m per footstep when running
  runFrom: 3.8, // m/s where walking turns into running
  runFull: 8.5,
  bob: [0.009, 0.02], // vertical bob (m), walk → run
  sway: [0.005, 0.01], // side-to-side (m)
  roll: [0.0012, 0.003], // head roll (rad)
  nod: [0.001, 0.0025], // head pitch (rad)
  landingDip: 0.34, // m the head drops on a hard landing
};

// Radial blur towards the screen edges: grows with speed, strongest while falling.
export const BLUR = {
  speedFrom: 1.8, // m/s where it starts
  speedFull: 15,
  speed: 0.95, // strength at full speed
  fall: 1.15, // strength at full fall
  inner: 0.3, // radius (0 centre … 1 corner) where it starts while walking
  innerFall: 0.06, // … and while falling (the whole view smears)
  stretch: 0.26, // longest streak, as a fraction of the distance to the centre
  smoothing: 4,
  samples: 8,
};

// Crows wheeling through the open spaces (never in enclosed corridors). They
// only appear when the model exists at `url` (see README → Crows).
export const CROWS = {
  url: "/assets/models/infinity-castle/crow.glb",
  scale: 2.2, // the model is a real 0.95 m crow; the castle's are bigger — and must read at 20–30 m
  pool: 8,
  every: [5, 13], // s between flocks
  flock: [1, 4],
  minVoid: 0.45, // only where the space is open enough
  speed: [6.5, 9.5], // m/s
  cawChance: 0.75,
};

// Void dressing is drawn per copy: culled outside the view or beyond the fog,
// and swapped for a simplified mesh past lodDistance.
export const DRESSING = {
  lodDistance: 24, // m from the camera to the piece's surface
  lodRatio: 0.2, // fraction of triangles kept in the far version
  fogCutoff: 2.4, // hidden beyond fogCutoff / fog density (fog has swallowed it)
};

export const WORLD = {
  lookaheadDistance: 70, // m of path that must exist ahead of the camera
  maxDepthAhead: 4,
  keepBehind: 2, // chunks kept behind for reversing
  buildsPerFrame: 1,
  pruneDistance: 160,
  rebaseDistance: 1500,
  junctionHintDistance: 16,
  junctionLeanDistance: 9,
  overlapMargin: 0.35,
  falseExitAfter: [18, 26], // chunks between false exits (after the first)
};

export const FOG = {
  density: 0.021,
  smoothing: 0.6, // 1/s
};

// Lantern lights pooled onto the nearest LightAnchors. The count never
// changes at runtime (a changing light count would recompile every shader).
export const LIGHTS = {
  color: "#ffab5e",
  intensity: 14.5, // a little more per light: the high tier pools 8 (was 10)
  distance: 15,
  decay: 1.6,
  fadeRate: 5,
  // a warm base level everywhere, so corridors and staircases always read
  ambientBase: 0.5,
  ambientColor: "#ffc48c",
  ambient: 0.2, // hemisphere sky, scaled up in open spaces
  hemiSky: "#6a3c20",
  underGlow: "#ff8a3c", // the abyss's light rising from below, in open spaces
  underGlowIntensity: 1.25,
  hemiGround: "#050302",
  cameraLight: 3.2, // warm fill that travels with the camera (like a carried lantern)
  cameraLightDistance: 10,
  flickerEvery: [9, 22], // s between a nearby lantern guttering (with a sound)
};

// Optional background music: drop a file you have the rights to at this path.
// Missing file → only the generated ambience plays.
export const AUDIO = {
  // first one that exists is used
  musicUrls: [
    encodeURI("/assets/infinity-castle/music/To the Infinity Castle - Muzan vs Hashira Theme (from Demon Slayer ).mp3"),
    ...["mp3", "m4a", "ogg", "webm", "wav"].map((ext) => `/assets/audio/infinity-castle-bgm.${ext}`),
  ],
  musicVolume: 0.08,
  ambienceWithMusic: 0.45, // generated layers are lowered while music plays
  effectsVolume: 1,
};

export const QUALITY = {
  high: {
    name: "high",
    dpr: [1, 1.5],
    lights: 8,
    dust: 900,
    farLights: 2400,
    bloom: true,
    msaa: 2,
    dressing: 1,
    bgCount: 70,
    anisotropy: 8,
  },
  medium: {
    name: "medium",
    dpr: [1, 1.4],
    lights: 6,
    dust: 500,
    farLights: 1500,
    bloom: false,
    msaa: 0,
    dressing: 0.75,
    bgCount: 50,
    anisotropy: 4,
  },
  low: {
    name: "low",
    dpr: [0.75, 1],
    lights: 4,
    dust: 220,
    farLights: 800,
    bloom: false,
    msaa: 0,
    dressing: 0.5,
    bgCount: 30,
    anisotropy: 2,
  },
};

export const LOW_QUALITY_QUERY = "(max-width: 767px), (pointer: coarse)";
export const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

export const MATERIAL_TUNING = {
  lanternEmissive: 3.2,
  shojiGlowEmissive: 1.05,
  flicker: 0.16,
};

// Region labels — a journey indicator that never implies a destination.
export const REGIONS = {
  gate: { jp: "門", en: "The Gate" },
  threshold: { jp: "敷居", en: "The Threshold" },
  fall: { jp: "奈落", en: "The Fall" },
  walkway: { jp: "吊り橋", en: "Suspended Walkway" },
  corridor: { jp: "障子廊下", en: "Shoji Corridor" },
  gallery: { jp: "回廊", en: "Open Gallery" },
  junction: { jp: "辻", en: "Junction" },
  stairs: { jp: "階段", en: "Stairwell" },
  room: { jp: "座敷", en: "Tatami Room" },
  gravity: { jp: "逆さの間", en: "Inverted Chamber" },
  abyss: { jp: "深淵", en: "Central Abyss" },
  crossroads: { jp: "無限の辻", en: "Infinite Crossroads" },
  exit: { jp: "出口", en: "The Exit" },
  drop: { jp: "落下", en: "The Drop" },
};
