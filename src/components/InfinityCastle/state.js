import * as THREE from "three";

/**
 * Plain mutable objects shared between the DOM side (overlays, audio, input)
 * and the R3F side (useFrame). High-frequency values live in `journey` and are
 * read in rAF loops; low-frequency UI changes go through `uiStore`, which
 * React subscribes to with useSyncExternalStore.
 */

export const journey = {
  started: false, // first movement input received
  progress: 0, // 0..1 through the opening (gate → fall), drives the intro overlay
  speed: 0, // m/s along the path
  fall: 0, // 0..1 falling intensity (audio wind, FOV kick)
  void: 0, // 0..1 how open the surroundings are (audio space)
  blackout: 0, // 0..1 full-screen darkness (false exit)
  fogTarget: 0.021,
  fogDensity: 0.021, // the fog as it is right now (eases towards fogTarget)
  alive: false, // stage 11+: the castle rearranges itself
  falling: false, // in a fall: gravity has the camera, input is ignored
  landing: 0, // set to the impact strength on touching down (the rig consumes it)
  gait: 0, // 0..1 how much we're walking (head bob)
  run: 0, // 0..1 walk → run
  stride: 0, // footsteps taken (fraction = phase within a step)
  chunkCount: 0,
  // camera target written by the world controller, applied by the rig
  pose: { p: new THREE.Vector3(0, 1.55, 14), q: new THREE.Quaternion(), roll: 0, lateralVel: 0 },
  audioEvents: [], // { type: "biwa" | "creak" | "door" | "slide" | "step" | "land" | …, intensity }
};

// Normalised mouse position (-1..1, +y up). Written by the input controller,
// eased into the camera by the rig. Touch never writes it.
export const pointer = { x: 0, y: 0, active: false };

/** Queue a sound for the audio layer. `extra`: { pan (-1..1), duration (s) }. */
export function emitAudio(type, intensity = 1, extra = null) {
  if (journey.audioEvents.length < 24) journey.audioEvents.push({ type, intensity, ...extra });
}

function createStore(initial) {
  let state = initial;
  const listeners = new Set();
  return {
    get: () => state,
    set(partial) {
      let changed = false;
      for (const k in partial) {
        if (state[k] !== partial[k]) {
          changed = true;
          break;
        }
      }
      if (!changed) return;
      state = { ...state, ...partial };
      listeners.forEach((l) => l());
    },
    subscribe(l) {
      listeners.add(l);
      return () => listeners.delete(l);
    },
  };
}

export const uiStore = createStore({
  phase: "loading", // loading → ready → journey
  region: null, // { key, jp, en }
  regionSerial: 0,
  junction: null, // { available: [...dirs], selected, first }
  hintsSeen: false,
  paper: true, // the summons letter is open (input waits until it's dismissed)
  soundOn: false, // ambience + effects
  quality: "high",
  error: null,
});

export function resetJourney() {
  journey.started = false;
  journey.progress = 0;
  journey.speed = 0;
  journey.fall = 0;
  journey.void = 0;
  journey.blackout = 0;
  journey.alive = false;
  journey.falling = false;
  journey.landing = 0;
  journey.gait = journey.run = journey.stride = 0;
  journey.chunkCount = 0;
  journey.audioEvents.length = 0;
}
