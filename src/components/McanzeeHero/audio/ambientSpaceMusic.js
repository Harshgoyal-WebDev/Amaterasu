import { AUDIO } from "../config";

const midiToHz = (m) => 440 * Math.pow(2, (m - 69) / 12);

// D minor drifting through Phrygian / Lydian colour: open fifths and added
// ninths, no thirds in the bass, a ♭II chord — it never quite resolves.
const PROGRESSION = [
  { root: 38, pad: [50, 57, 62, 64, 69] }, // Dm(add9)
  { root: 34, pad: [46, 53, 57, 60, 65] }, // B♭maj9
  { root: 31, pad: [43, 50, 55, 57, 62] }, // Gsus2
  { root: 39, pad: [51, 58, 62, 65, 70] }, // E♭maj7♯11 (♭II)
];

function createImpulse(ctx, seconds, decay) {
  const length = Math.floor(ctx.sampleRate * seconds);
  const buffer = ctx.createBuffer(2, length, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const data = buffer.getChannelData(ch);
    for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, decay);
  }
  return buffer;
}

function createNoise(ctx) {
  const buffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  return buffer;
}

/**
 * Generative ambient space soundtrack, synthesised live with Web Audio
 * (no audio files, ~0 KB download). Slow and beatless:
 *
 *   pads    — detuned saw/triangle chords, slow swells, breathing filter
 *   sub     — deep sine drone on each chord's root
 *   bells   — sparse FM glass tones through a ping-pong echo
 *   wind    — filtered noise swells, like solar wind
 *
 * Everything sits in a long reverb. `onPulse(delaySeconds)` fires at every
 * chord change and half-way through it, driving the portal's soundwave.
 * Live AUDIO edits (volume, space, brightness, timing) apply on the next
 * scheduler tick. Create from a user gesture (autoplay rules).
 */
export function createAmbientSpaceMusic({ onPulse } = {}) {
  const ctx = new AudioContext();
  const noise = createNoise(ctx);
  let intensity = 0;
  let playing = false;

  // ── Mix bus ──────────────────────────────────────────────────────────
  const master = ctx.createGain();
  master.gain.value = 0;
  const compressor = ctx.createDynamicsCompressor();
  compressor.threshold.value = -18;
  compressor.ratio.value = 3;
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 256;
  master.connect(compressor).connect(analyser).connect(ctx.destination);

  const reverb = ctx.createConvolver();
  reverb.buffer = createImpulse(ctx, 9, 2.6);
  const reverbReturn = ctx.createGain();
  reverb.connect(reverbReturn).connect(master);

  // Ping-pong echo for the bells.
  const delayL = ctx.createDelay(4);
  const delayR = ctx.createDelay(4);
  delayL.delayTime.value = 0.62;
  delayR.delayTime.value = 0.93;
  const feedback = ctx.createGain();
  feedback.gain.value = 0.5;
  const echoTone = ctx.createBiquadFilter();
  echoTone.type = "lowpass";
  echoTone.frequency.value = 3200;
  const panL = new StereoPannerNode(ctx, { pan: -0.7 });
  const panR = new StereoPannerNode(ctx, { pan: 0.7 });
  delayL.connect(panL).connect(master);
  delayR.connect(panR).connect(master);
  delayL.connect(delayR);
  delayR.connect(echoTone).connect(feedback).connect(delayL);
  panL.connect(reverb);
  panR.connect(reverb);

  // Pads: one breathing low-pass for the whole chord bed.
  const padFilter = ctx.createBiquadFilter();
  padFilter.type = "lowpass";
  padFilter.Q.value = 0.8;
  const padBus = ctx.createGain();
  padBus.gain.value = 0.07;
  padFilter.connect(padBus);
  padBus.connect(master);
  const padSend = ctx.createGain();
  padBus.connect(padSend).connect(reverb);

  const breath = new OscillatorNode(ctx, { frequency: 0.045 });
  const breathDepth = new GainNode(ctx, { gain: 380 });
  breath.connect(breathDepth).connect(padFilter.frequency);
  breath.start();

  // Shared slow vibrato on every pad voice (cents).
  const drift = new OscillatorNode(ctx, { frequency: 0.11 });
  const driftDepth = new GainNode(ctx, { gain: 5 });
  drift.connect(driftDepth);
  drift.start();

  const subBus = new GainNode(ctx, { gain: 0.16 });
  subBus.connect(master);

  const bellBus = new GainNode(ctx, { gain: 0.05 });
  bellBus.connect(master);
  bellBus.connect(delayL);
  const bellSend = ctx.createGain();
  bellBus.connect(bellSend).connect(reverb);

  const windBus = new GainNode(ctx, { gain: 1 });
  windBus.connect(reverb);
  windBus.connect(master);

  // ── Voices ───────────────────────────────────────────────────────────
  function pad(t, notes, duration) {
    const attack = duration * 0.45;
    const end = t + duration * 1.6; // overlaps the next chord
    notes.forEach((midi, i) => {
      const pan = new StereoPannerNode(ctx, { pan: ((i / (notes.length - 1)) * 2 - 1) * 0.6 });
      const env = ctx.createGain();
      env.gain.setValueAtTime(0.0001, t);
      env.gain.exponentialRampToValueAtTime(0.3, t + attack);
      env.gain.setTargetAtTime(0.0001, t + duration, duration * 0.18);
      env.connect(pan).connect(padFilter);
      [
        ["sawtooth", -7],
        ["sawtooth", 7],
        ["triangle", 0],
      ].forEach(([type, detune]) => {
        const osc = new OscillatorNode(ctx, { type, frequency: midiToHz(midi), detune });
        driftDepth.connect(osc.detune);
        // Release the shared LFO's link, or ended voices could never be freed.
        osc.onended = () => driftDepth.disconnect(osc.detune);
        osc.connect(env);
        osc.start(t);
        osc.stop(end);
      });
    });
  }

  function sub(t, root, duration) {
    const osc = new OscillatorNode(ctx, { type: "sine", frequency: midiToHz(root) });
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(1, t + duration * 0.3);
    env.gain.setTargetAtTime(0.0001, t + duration, duration * 0.15);
    osc.connect(env).connect(subBus);
    osc.start(t);
    osc.stop(t + duration * 1.6);
  }

  // FM glass bell: inharmonic modulator, index decays faster than the tone.
  function bell(t, midi) {
    const f = midiToHz(midi);
    const carrier = new OscillatorNode(ctx, { frequency: f });
    const modulator = new OscillatorNode(ctx, { frequency: f * 3.01 });
    const index = ctx.createGain();
    index.gain.setValueAtTime(f * 1.6, t);
    index.gain.exponentialRampToValueAtTime(f * 0.05, t + 1.8);
    modulator.connect(index).connect(carrier.frequency);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(1, t + 0.012);
    env.gain.exponentialRampToValueAtTime(0.0001, t + 5);
    const pan = new StereoPannerNode(ctx, { pan: Math.random() * 1.6 - 0.8 });
    carrier.connect(env).connect(pan).connect(bellBus);
    carrier.start(t);
    modulator.start(t);
    carrier.stop(t + 5.1);
    modulator.stop(t + 5.1);
  }

  function wind(t, duration) {
    const src = new AudioBufferSourceNode(ctx, { buffer: noise, loop: true });
    const filter = new BiquadFilterNode(ctx, { type: "bandpass", Q: 5 });
    filter.frequency.setValueAtTime(220, t);
    filter.frequency.exponentialRampToValueAtTime(1400 + Math.random() * 1200, t + duration * 0.55);
    filter.frequency.exponentialRampToValueAtTime(260, t + duration);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(0.06, t + duration * 0.5);
    env.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    const pan = new StereoPannerNode(ctx, { pan: Math.random() * 1.2 - 0.6 });
    src.connect(filter).connect(env).connect(pan).connect(windBus);
    src.start(t, Math.random());
    src.stop(t + duration + 0.1);
  }

  // ── Live settings ────────────────────────────────────────────────────
  const applied = {};
  function applySettings(force = false) {
    const now = ctx.currentTime;
    if (playing && (force || applied.volume !== AUDIO.volume)) {
      applied.volume = AUDIO.volume;
      master.gain.cancelScheduledValues(now);
      master.gain.setTargetAtTime(AUDIO.volume, now, force ? AUDIO.fadeIn / 4 : 0.2);
    }
    const space = AUDIO.space;
    if (force || applied.space !== space) {
      applied.space = space;
      reverbReturn.gain.setTargetAtTime(0.35 + space * 0.9, now, 0.3);
      padSend.gain.setTargetAtTime(space, now, 0.3);
      bellSend.gain.setTargetAtTime(0.4 + space * 0.6, now, 0.3);
    }
    const open = AUDIO.brightness + intensity * 0.6;
    if (force || applied.open !== open) {
      applied.open = open;
      padFilter.frequency.setTargetAtTime(260 + open * 2200, now, 0.6);
      echoTone.frequency.setTargetAtTime(2000 + open * 3000, now, 0.6);
    }
  }

  // ── Scheduler (look-ahead) ───────────────────────────────────────────
  let chordIndex = 0;
  let nextChord = 0;
  let nextPulse = 0;
  let nextBell = 0;
  let nextWind = 0;
  let timer = null;
  const LOOKAHEAD = 1;

  const bellGap = () => -Math.log(1 - Math.random()) / Math.max(AUDIO.shimmer * (0.6 + intensity), 0.01);

  function tick() {
    const now = ctx.currentTime;
    const horizon = now + LOOKAHEAD;
    applySettings();

    while (nextChord < horizon) {
      const { root, pad: notes } = PROGRESSION[chordIndex % PROGRESSION.length];
      pad(nextChord, notes, AUDIO.chordSeconds);
      sub(nextChord, root, AUDIO.chordSeconds);
      nextChord += AUDIO.chordSeconds;
      chordIndex += 1;
    }
    // A soundwave pulse at each chord change and half-way through it.
    while (nextPulse < horizon) {
      onPulse?.(Math.max(nextPulse - now, 0));
      nextPulse += AUDIO.chordSeconds / 2;
    }
    while (nextBell < horizon) {
      const { pad: notes } = PROGRESSION[Math.max(chordIndex - 1, 0) % PROGRESSION.length];
      const note = notes[Math.floor(Math.random() * notes.length)] + (Math.random() < 0.5 ? 12 : 24);
      bell(nextBell, note);
      nextBell += bellGap();
    }
    while (nextWind < horizon) {
      const duration = 8 + Math.random() * 6;
      wind(nextWind, duration);
      nextWind += duration + 6 + Math.random() * 10;
    }
  }

  function setIntensity(value) {
    intensity = Math.min(Math.max(value, 0), 1);
  }

  return {
    analyser,
    setIntensity,
    async start() {
      await ctx.resume();
      playing = true;
      if (!timer) {
        const t = ctx.currentTime + 0.05;
        nextChord = nextPulse = t;
        nextBell = t + 2;
        nextWind = t + 4;
        timer = setInterval(tick, 200);
        tick();
      }
      applySettings(true);
    },
    stop() {
      playing = false;
      master.gain.cancelScheduledValues(ctx.currentTime);
      master.gain.setTargetAtTime(0, ctx.currentTime, AUDIO.fadeOut / 4);
      // Stop scheduling once the fade has finished.
      setTimeout(() => {
        if (!playing) {
          clearInterval(timer);
          timer = null;
        }
      }, AUDIO.fadeOut * 1000 + 200);
    },
    dispose() {
      clearInterval(timer);
      ctx.close();
    },
  };
}
