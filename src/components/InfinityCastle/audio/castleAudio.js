/**
 * Castle ambience, synthesised live with Web Audio. Layers:
 *
 *   room tone   brown noise through a low shelf — the weight of the building
 *   void wind   band-passed noise; opens with falling speed and open space
 *   drone       two low detuned sines, barely there
 *   biwa        plucked string (Karplus-Strong) in a miyako-bushi scale —
 *               the castle rearranging itself
 *   creaks      short resonant noise bursts, more often in corridors
 *   slides      shoji doors running in their tracks
 *   gate        heavy cedar doors rolling open / shut, landing with a thump
 *   flicker     a lantern guttering: a draught and a few sputters
 *   transform   architecture rearranging: timber groan, rumble, settling beams
 *   steps       footfalls on cedar boards, alternating feet; heavier when running
 *   grind       a moving piece, for as long as it moves: stone dragged over
 *               rough stone (stick-slip), timber runners rattling in their
 *               grooves like a heavy drawer, a knock as it starts and settles
 *   crow        a caw (harsh, nasal, falling) — panned to where the bird is;
 *               wingbeats when one passes close
 *   land        touching down after a fall
 *   music       optional file at AUDIO.musicUrls, looped quietly; the generated
 *               layers sit back while it plays (missing file → ignored)
 *
 * Two channels, switched separately: music, and sound (everything generated).
 * With both off the context is suspended, so it costs nothing.
 *
 * Everything shares one long convolution reverb whose send grows with how
 * open the space is. Create from a user gesture (autoplay rules); the camera
 * architecture never depends on it.
 */

import { AUDIO } from "../config";

// soft clip for the crow's voice
const SHAPE = (() => {
  const c = new Float32Array(1024);
  for (let i = 0; i < c.length; i++) c[i] = Math.tanh(((i / (c.length - 1)) * 2 - 1) * 3.5);
  return c;
})();

const SCALE = [50, 51, 55, 57, 58, 62, 63, 67, 69]; // D Eb G A Bb (in-sen flavour)
const midiHz = (m) => 440 * Math.pow(2, (m - 69) / 12);

function noiseBuffer(ctx, seconds, brown = false) {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  let last = 0;
  for (let i = 0; i < len; i++) {
    const w = Math.random() * 2 - 1;
    if (brown) {
      last = (last + 0.02 * w) / 1.02;
      d[i] = last * 3.5;
    } else d[i] = w;
  }
  return buf;
}

function impulse(ctx, seconds, decay) {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
  }
  return buf;
}

/** Karplus-Strong pluck rendered into a buffer (cheap, sounds like a struck string). */
function pluck(ctx, hz, seconds = 3.2, bright = 0.5) {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  const period = Math.max(2, Math.round(ctx.sampleRate / hz));
  const ring = new Float32Array(period);
  for (let i = 0; i < period; i++) ring[i] = Math.random() * 2 - 1;
  let idx = 0;
  const damp = 0.996 - (1 - bright) * 0.004;
  for (let i = 0; i < len; i++) {
    const next = (idx + 1) % period;
    const v = (ring[idx] + ring[next]) * 0.5 * damp;
    // the biwa's sawari buzz: a soft fold on the attack
    d[i] = Math.tanh(ring[idx] * (i < 2400 ? 2.2 : 1.1)) * 0.6;
    ring[idx] = v;
    idx = next;
  }
  return buf;
}

export function createCastleAudio() {
  const ctx = new AudioContext();
  const master = ctx.createGain();
  master.gain.value = 0.9;
  // everything but the music: switched as one
  const sfx = new GainNode(ctx, { gain: 0 });
  sfx.connect(master);
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -20;
  comp.ratio.value = 3;
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 256;
  master.connect(comp).connect(analyser).connect(ctx.destination);

  const reverb = ctx.createConvolver();
  reverb.buffer = impulse(ctx, 6.5, 2.4);
  const wet = ctx.createGain();
  wet.gain.value = 0.5;
  reverb.connect(wet).connect(sfx);
  // generated layers share one bus so they can sit back while music plays
  const ambience = new GainNode(ctx, { gain: 1 });
  ambience.connect(sfx);
  const send = (node, amount) => {
    const g = ctx.createGain();
    g.gain.value = amount;
    node.connect(g).connect(reverb);
    return g;
  };

  const white = noiseBuffer(ctx, 3);
  const brown = noiseBuffer(ctx, 4, true);
  const loop = (buffer) => {
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;
    src.start();
    return src;
  };

  // room tone
  const room = loop(brown);
  const roomLp = new BiquadFilterNode(ctx, { type: "lowpass", frequency: 220 });
  const roomGain = new GainNode(ctx, { gain: 0.11 });
  room.connect(roomLp).connect(roomGain).connect(ambience);

  // void wind
  const wind = loop(white);
  const windBp = new BiquadFilterNode(ctx, { type: "bandpass", frequency: 500, Q: 0.7 });
  const windGain = new GainNode(ctx, { gain: 0 });
  wind.connect(windBp).connect(windGain).connect(ambience);
  send(windGain, 0.6);
  const gust = new OscillatorNode(ctx, { frequency: 0.07 });
  const gustDepth = new GainNode(ctx, { gain: 180 });
  gust.connect(gustDepth).connect(windBp.frequency);
  gust.start();

  // drone
  const drone = new GainNode(ctx, { gain: 0.035 });
  drone.connect(ambience);
  send(drone, 0.5);
  const drones = [36.7, 55.1].map((f, i) => {
    const o = new OscillatorNode(ctx, { type: "sine", frequency: f, detune: i ? 4 : -3 });
    o.connect(drone);
    o.start();
    return o;
  });

  const plucks = SCALE.map((m) => pluck(ctx, midiHz(m - 12)));
  const fx = new GainNode(ctx, { gain: AUDIO.effectsVolume });
  fx.connect(sfx);
  send(fx, 0.7);

  function playBuffer(buffer, { gain = 0.5, rate = 1, pan = 0, filter = null, delay = 0 } = {}) {
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.playbackRate.value = rate;
    const g = new GainNode(ctx, { gain });
    const p = new StereoPannerNode(ctx, { pan });
    let node = src;
    if (filter) node = node.connect(filter);
    node.connect(g).connect(p).connect(fx);
    src.start(ctx.currentTime + delay);
    return { src, g };
  }

  function biwa(intensity = 1) {
    const n = 1 + Math.floor(Math.random() * 2);
    for (let i = 0; i < n; i++) {
      const idx = Math.floor(Math.random() * plucks.length);
      playBuffer(plucks[idx], { gain: 0.32 * intensity, pan: Math.random() * 0.8 - 0.4, delay: i * (0.11 + Math.random() * 0.12) });
    }
  }

  function creak(intensity = 1) {
    const f = new BiquadFilterNode(ctx, { type: "bandpass", frequency: 500 + Math.random() * 900, Q: 18 });
    const { src, g } = playBuffer(white, { gain: 0, rate: 0.5 + Math.random() * 0.3, pan: Math.random() * 1.4 - 0.7, filter: f });
    const t = ctx.currentTime;
    const dur = 0.25 + Math.random() * 0.5;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.5 * intensity, t + 0.04);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    f.frequency.setValueAtTime(f.frequency.value, t);
    f.frequency.linearRampToValueAtTime(f.frequency.value * (0.7 + Math.random() * 0.6), t + dur);
    src.stop(t + dur + 0.1);
  }

  function slide(intensity = 1) {
    const f = new BiquadFilterNode(ctx, { type: "lowpass", frequency: 1600 });
    const { src, g } = playBuffer(white, { gain: 0, pan: Math.random() * 0.6 - 0.3, filter: f });
    const t = ctx.currentTime;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.16 * intensity, t + 0.08);
    g.gain.linearRampToValueAtTime(0.1 * intensity, t + 0.5);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.85);
    src.stop(t + 1);
  }

  /** Short shaped noise burst through a filter. */
  function burst({ type = "lowpass", freq = 800, q = 0.7, gain = 0.3, attack = 0.02, hold = 0, release = 0.4, rate = 1, pan = 0, delay = 0, sweepTo = null }) {
    const f = new BiquadFilterNode(ctx, { type, frequency: freq, Q: q });
    const { src, g } = playBuffer(white, { gain: 0, rate, pan, filter: f, delay });
    const t = ctx.currentTime + delay;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + attack);
    g.gain.setValueAtTime(gain, t + attack + hold);
    g.gain.exponentialRampToValueAtTime(0.0008, t + attack + hold + release);
    if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t + attack + hold + release);
    src.stop(t + attack + hold + release + 0.1);
  }

  /** Low sine hit (a heavy door landing in its frame, a beam settling). */
  function thump(gain = 0.5, delay = 0, from = 70, to = 38, dur = 0.7) {
    const t = ctx.currentTime + delay;
    const o = new OscillatorNode(ctx, { type: "sine", frequency: from });
    const g = new GainNode(ctx, { gain: 0 });
    o.connect(g).connect(fx);
    o.frequency.setValueAtTime(from, t);
    o.frequency.exponentialRampToValueAtTime(to, t + dur);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  /** The gate's heavy cedar doors rolling in their tracks. */
  function gate(intensity = 1, closing = false) {
    const len = closing ? 0.8 : 1.5;
    burst({ freq: 420, q: 0.9, gain: 0.32 * intensity, attack: 0.25, hold: len, release: 0.5, rate: 0.6, sweepTo: 260 });
    burst({ type: "bandpass", freq: 900, q: 3, gain: 0.07 * intensity, attack: 0.1, hold: len * 0.8, release: 0.4, rate: 0.8, pan: -0.3 });
    burst({ freq: 120, q: 0.5, gain: 0.45 * intensity, attack: 0.3, hold: len, release: 0.8, rate: 0.4 });
    creak(0.6 * intensity);
    thump((closing ? 0.7 : 0.45) * intensity, len + 0.2);
  }

  /** A lantern flame guttering: a soft draught and a few sputters. */
  function flicker(intensity = 1) {
    burst({ freq: 320, q: 0.6, gain: 0.12 * intensity, attack: 0.12, release: 0.6, rate: 0.7 });
    const n = 4 + Math.floor(Math.random() * 5);
    for (let i = 0; i < n; i++)
      burst({ type: "bandpass", freq: 1400 + Math.random() * 2800, q: 6, gain: (0.05 + Math.random() * 0.06) * intensity, attack: 0.004, release: 0.04 + Math.random() * 0.06, delay: Math.random() * 0.9, pan: Math.random() * 0.6 - 0.3 });
  }

  /** Architecture rearranging itself: timber groan, a deep rumble, beams settling. */
  function transform(intensity = 1) {
    const t = ctx.currentTime;
    const o = new OscillatorNode(ctx, { type: "sawtooth", frequency: 74 + Math.random() * 20 });
    const bp = new BiquadFilterNode(ctx, { type: "bandpass", frequency: 320, Q: 4 });
    const g = new GainNode(ctx, { gain: 0 });
    o.connect(bp).connect(g).connect(fx);
    o.frequency.setValueAtTime(o.frequency.value, t);
    o.frequency.linearRampToValueAtTime(o.frequency.value * 0.72, t + 2.6);
    bp.frequency.exponentialRampToValueAtTime(170, t + 2.6);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.06 * intensity, t + 0.5);
    g.gain.linearRampToValueAtTime(0.045 * intensity, t + 1.8);
    g.gain.exponentialRampToValueAtTime(0.0008, t + 2.8);
    o.start(t);
    o.stop(t + 2.9);
    burst({ freq: 110, q: 0.5, gain: 0.5 * intensity, attack: 0.6, hold: 1.2, release: 1.4, rate: 0.35 });
    creak(0.7 * intensity);
    setTimeout(() => playing && creak(0.5 * intensity), 900 + Math.random() * 700);
    thump(0.4 * intensity, 1.9 + Math.random() * 0.5, 60, 34, 0.9);
  }

  /** A footfall on cedar boards: heel thud, then the board's knock (left / right alternate). */
  let foot = 1;
  function step(intensity = 1) {
    foot = -foot;
    const pan = foot * 0.16;
    const v = 0.85 + Math.random() * 0.3;
    thump(0.2 * intensity * v, 0, 120 + Math.random() * 30, 55, 0.14);
    burst({ freq: 600 + intensity * 500 + Math.random() * 300, q: 0.9, gain: 0.2 * intensity * v, attack: 0.003, release: 0.07 + 0.06 * intensity, rate: 0.7 + Math.random() * 0.4, pan });
    burst({ type: "bandpass", freq: 1500 + Math.random() * 900, q: 2, gain: 0.05 * intensity * v, attack: 0.002, release: 0.05, delay: 0.045 + Math.random() * 0.03, pan });
    if (Math.random() < 0.07) creak(0.22);
  }

  function land(intensity = 1) {
    thump(0.75 * intensity, 0, 80, 32, 0.9);
    burst({ freq: 500, q: 0.7, gain: 0.4 * intensity, attack: 0.004, release: 0.35, rate: 0.6 });
    burst({ type: "bandpass", freq: 2200, q: 1.5, gain: 0.08 * intensity, attack: 0.003, release: 0.25, delay: 0.03 });
    creak(0.5 * intensity);
  }

  /** Gain that wanders randomly — friction that grabs and lets go. */
  function jitter(param, { from, to, base, depth, every: [a, b] }) {
    let t = from;
    while (t < to) {
      param.setTargetAtTime(base * (1 - depth + Math.random() * depth * 2), t, (b - a) * 0.4);
      t += a + Math.random() * (b - a);
    }
  }

  let grinding = 0;
  function grind(intensity = 1, { duration = 6, pan = 0 } = {}) {
    if (grinding >= 3) return; // a crowd of moving rooms is one wall of sound
    grinding++;
    setTimeout(() => grinding--, duration * 1000);
    const t = ctx.currentTime;
    const end = t + duration;
    const shape = (g, peak) => {
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(peak, t + 0.5);
      g.gain.setValueAtTime(peak, end - 0.9);
      g.gain.linearRampToValueAtTime(0, end);
    };
    const panner = new StereoPannerNode(ctx, { pan });
    panner.connect(fx);

    // stone on stone: low rough noise, its level grabbing and slipping
    const stone = ctx.createBufferSource();
    stone.buffer = brown;
    stone.loop = true;
    stone.playbackRate.value = 0.55 + Math.random() * 0.2;
    const stoneBp = new BiquadFilterNode(ctx, { type: "bandpass", frequency: 260, Q: 0.9 });
    const stoneEnv = new GainNode(ctx, { gain: 0 });
    const stoneJit = new GainNode(ctx, { gain: 1 });
    stone.connect(stoneBp).connect(stoneJit).connect(stoneEnv).connect(panner);
    shape(stoneEnv, 0.9 * intensity);
    jitter(stoneJit.gain, { from: t, to: end, base: 1, depth: 0.6, every: [0.05, 0.16] });
    stoneBp.frequency.setValueAtTime(220, t);
    stoneBp.frequency.linearRampToValueAtTime(320, t + duration * 0.5);
    stoneBp.frequency.linearRampToValueAtTime(200, end);

    // grit: the rough surface, higher and sparser
    const grit = ctx.createBufferSource();
    grit.buffer = white;
    grit.loop = true;
    const gritBp = new BiquadFilterNode(ctx, { type: "bandpass", frequency: 1900, Q: 1.4 });
    const gritEnv = new GainNode(ctx, { gain: 0 });
    const gritJit = new GainNode(ctx, { gain: 1 });
    grit.connect(gritBp).connect(gritJit).connect(gritEnv).connect(panner);
    shape(gritEnv, 0.05 * intensity);
    jitter(gritJit.gain, { from: t, to: end, base: 1, depth: 0.95, every: [0.02, 0.07] });

    // the drawer: wooden runners chattering in their grooves
    const runner = ctx.createBufferSource();
    runner.buffer = white;
    runner.loop = true;
    runner.playbackRate.value = 0.7;
    const runnerBp = new BiquadFilterNode(ctx, { type: "bandpass", frequency: 700 + Math.random() * 300, Q: 5 });
    const runnerEnv = new GainNode(ctx, { gain: 0 });
    const runnerJit = new GainNode(ctx, { gain: 1 });
    runner.connect(runnerBp).connect(runnerJit).connect(runnerEnv).connect(panner);
    shape(runnerEnv, 0.22 * intensity);
    jitter(runnerJit.gain, { from: t, to: end, base: 1, depth: 0.9, every: [0.025, 0.06] });

    for (const src of [stone, grit, runner]) {
      src.start(t);
      src.stop(end + 0.1);
    }
    // the first lurch and the final settling knock
    thump(0.45 * intensity, 0, 75, 40, 0.6);
    burst({ freq: 900, q: 0.8, gain: 0.12 * intensity, attack: 0.004, release: 0.12, pan });
    thump(0.6 * intensity, duration - 0.25, 68, 34, 0.9);
    burst({ freq: 700, q: 0.8, gain: 0.16 * intensity, attack: 0.004, release: 0.18, pan, delay: duration - 0.24 });
    if (Math.random() < 0.6) setTimeout(() => playing && creak(0.4 * intensity), duration * 400);
  }

  /** A crow: two or three harsh, nasal caws, each falling in pitch. */
  function crow(intensity = 1, { pan = 0 } = {}) {
    const p = new StereoPannerNode(ctx, { pan });
    p.connect(fx);
    const calls = 1 + Math.floor(Math.random() * 3);
    const f0 = 470 + Math.random() * 160;
    let t = ctx.currentTime + 0.02;
    for (let i = 0; i < calls; i++) {
      const dur = 0.24 + Math.random() * 0.14;
      const f = f0 * (1 - i * 0.03);
      const o = new OscillatorNode(ctx, { type: "sawtooth", frequency: f });
      // the rasp: the voice fluttering ~60 times a second
      const rasp = new OscillatorNode(ctx, { type: "square", frequency: 55 + Math.random() * 25 });
      const raspDepth = new GainNode(ctx, { gain: 0.45 });
      const voice = new GainNode(ctx, { gain: 0.55 });
      rasp.connect(raspDepth).connect(voice.gain);
      const shaper = new WaveShaperNode(ctx, { curve: SHAPE });
      const f1 = new BiquadFilterNode(ctx, { type: "bandpass", frequency: 1250, Q: 2.2 });
      const f2 = new BiquadFilterNode(ctx, { type: "bandpass", frequency: 2600, Q: 3 });
      const f2g = new GainNode(ctx, { gain: 0.5 });
      const env = new GainNode(ctx, { gain: 0 });
      o.connect(voice).connect(shaper);
      shaper.connect(f1).connect(env);
      shaper.connect(f2).connect(f2g).connect(env);
      env.connect(p);
      o.frequency.setValueAtTime(f * 1.06, t);
      o.frequency.exponentialRampToValueAtTime(f * 0.72, t + dur);
      env.gain.setValueAtTime(0, t);
      env.gain.linearRampToValueAtTime(0.16 * intensity, t + 0.03);
      env.gain.setValueAtTime(0.14 * intensity, t + dur * 0.6);
      env.gain.exponentialRampToValueAtTime(0.0008, t + dur);
      for (const n of [o, rasp]) {
        n.start(t);
        n.stop(t + dur + 0.05);
      }
      t += dur + 0.12 + Math.random() * 0.16;
    }
  }

  /** Wingbeats of a bird passing close. */
  function wings(intensity = 1, { pan = 0 } = {}) {
    const n = 3 + Math.floor(Math.random() * 3);
    for (let i = 0; i < n; i++) burst({ freq: 420, q: 0.6, gain: 0.12 * intensity, attack: 0.04, release: 0.12, rate: 0.6, pan, delay: i * 0.17 });
  }

  // optional background music (a file the site owner provides)
  const musicGain = new GainNode(ctx, { gain: 0 });
  musicGain.connect(master);
  let music = null;
  let musicIndex = 0;
  let musicOk = AUDIO.musicUrls.length > 0;
  let wantMusic = false;
  function startMusic() {
    wantMusic = true;
    if (!musicOk) return;
    if (!music) {
      music = new Audio(AUDIO.musicUrls[musicIndex]);
      music.loop = true;
      music.preload = "auto";
      music.addEventListener("error", () => {
        // try the next format; give up quietly when none exists
        musicIndex++;
        if (musicIndex >= AUDIO.musicUrls.length) {
          musicOk = false;
          ambience.gain.setTargetAtTime(1, ctx.currentTime, 1);
          return;
        }
        music.src = AUDIO.musicUrls[musicIndex];
        if (wantMusic) playMusic();
      });
      ctx.createMediaElementSource(music).connect(musicGain);
    }
    playMusic();
  }
  function playMusic() {
    music
      .play()
      .then(() => {
        if (!wantMusic) return music.pause();
        musicGain.gain.setTargetAtTime(AUDIO.musicVolume, ctx.currentTime, 2.5);
        ambience.gain.setTargetAtTime(AUDIO.ambienceWithMusic, ctx.currentTime, 2.5);
      })
      .catch(() => {});
  }
  function stopMusic() {
    wantMusic = false;
    musicGain.gain.setTargetAtTime(0, ctx.currentTime, 0.4);
    ambience.gain.setTargetAtTime(1, ctx.currentTime, 1.5);
    setTimeout(() => !wantMusic && music?.pause(), 1200);
  }

  let playing = false; // the sound channel
  let nextCreak = 0;
  let nextBiwa = 0;
  let idle = null;

  // both channels off: let the context sleep (after the fades)
  const settle = () => {
    clearTimeout(idle);
    if (playing || wantMusic) {
      if (ctx.state === "suspended") ctx.resume();
    } else idle = setTimeout(() => !playing && !wantMusic && ctx.suspend(), 1500);
  };

  return {
    analyser,
    get playing() {
      return playing;
    },
    /** Music on/off. Call from a click (autoplay rules). */
    setMusic(on) {
      if (on) startMusic();
      else stopMusic();
      settle();
    },
    /** Everything generated (ambience + effects) on/off. Call from a click. */
    setSound(on) {
      playing = on;
      sfx.gain.cancelScheduledValues(ctx.currentTime);
      sfx.gain.setTargetAtTime(on ? 1 : 0, ctx.currentTime, on ? 1.2 : 0.4);
      if (on) {
        nextCreak = ctx.currentTime + 3;
        nextBiwa = ctx.currentTime + 6;
      }
      settle();
    },
    /** Called every frame with the journey state. */
    update({ speed = 0, fall = 0, openness = 0, alive = false }) {
      if (!playing) return;
      const t = ctx.currentTime;
      const w = Math.min(1, 0.04 + openness * 0.18 + fall * 0.9 + Math.min(speed / 30, 0.25));
      windGain.gain.setTargetAtTime(w * 0.42, t, 0.3);
      windBp.frequency.setTargetAtTime(380 + fall * 900 + openness * 120, t, 0.4);
      wet.gain.setTargetAtTime(0.35 + openness * 0.45, t, 1);
      roomGain.gain.setTargetAtTime(0.12 - openness * 0.06, t, 1);
      if (t > nextCreak) {
        creak(0.5 + (1 - openness) * 0.5);
        nextCreak = t + 5 + Math.random() * (openness > 0.5 ? 14 : 8);
      }
      if (t > nextBiwa) {
        biwa(0.55);
        nextBiwa = t + (alive ? 14 : 26) + Math.random() * 18;
      }
    },
    trigger(type, intensity = 1, extra = {}) {
      if (!playing) return;
      if (type === "biwa") biwa(intensity);
      else if (type === "creak") creak(intensity);
      else if (type === "door" || type === "slide") slide(intensity);
      else if (type === "gate") gate(intensity);
      else if (type === "gateClose") gate(intensity, true);
      else if (type === "flicker") flicker(intensity);
      else if (type === "transform") transform(intensity);
      else if (type === "step") step(intensity);
      else if (type === "land") land(intensity);
      else if (type === "grind") grind(intensity, extra);
      else if (type === "crow") crow(intensity, extra);
      else if (type === "wings") wings(intensity, extra);
    },
    dispose() {
      playing = false;
      if (music) {
        music.pause();
        music.removeAttribute("src");
        music.load();
      }
      try {
        room.stop();
        wind.stop();
        gust.stop();
        drones.forEach((o) => o.stop());
      } catch {
        // already stopped
      }
      ctx.close();
    },
  };
}
