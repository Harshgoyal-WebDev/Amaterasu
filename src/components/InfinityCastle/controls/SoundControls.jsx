"use client";

import { Leva, button, folder, useControls } from "leva";
import { getSound, setSound } from "../audio/sound";
import { MIX } from "../config";
import { uiStore } from "../state";

/**
 * Leva "Sound" panel (dev, or `?controls`). Every slider writes straight into
 * MIX, which the audio engine reads live. The buttons play a sound now
 * (switching sound on if it is off); "Copy mix" copies MIX as JS for config.js.
 */
const vol = (key, label, max = 2) => ({
  [key]: { value: MIX[key], min: 0, max, step: 0.01, label, onChange: (v) => (MIX[key] = v) },
});
const knob = (key, label, min, max, step = 0.01) => ({
  [key]: { value: MIX[key], min, max, step, label, onChange: (v) => (MIX[key] = v) },
});

function play(type, intensity = 1, extra = {}) {
  if (!uiStore.get().soundOn) setSound(true); // a click: allowed to start audio
  getSound()?.trigger(type, intensity, { pan: 0, ...extra });
}

const schema = {
  "Copy mix (for config.js)": button(() => navigator.clipboard?.writeText(`export const MIX = ${JSON.stringify(MIX, null, 2)};`)),
  ...vol("master", "master"),
  Ambience: folder({
    ...vol("room", "room tone", 3),
    ...vol("wind", "void wind", 3),
    ...vol("drone", "drone", 3),
    ...vol("reverb", "reverb"),
  }),
  Footsteps: folder({
    ...vol("steps", "steps", 3),
    ...vol("squeak", "board squeak", 3),
    ...knob("squeakChance", "squeak chance", 0, 1),
    ...vol("land", "landing", 3),
    "▶ walk step": button(() => play("step", 0.45)),
    "▶ run step": button(() => play("step", 1)),
    "▶ squeak": button(() => play("squeak", 1)),
    "▶ landing": button(() => play("land", 1)),
  }),
  Castle: folder({
    ...vol("creak", "creaks", 3),
    ...vol("door", "shoji doors", 3),
    ...vol("gate", "gate", 3),
    ...vol("flicker", "lantern gutter", 3),
    ...vol("transform", "rearranging", 3),
    ...vol("grind", "moving pieces", 3),
    ...vol("biwa", "biwa", 3),
    "▶ creak": button(() => play("creak", 0.8)),
    "▶ shoji door": button(() => play("door", 0.9)),
    "▶ gate open": button(() => play("gate", 1)),
    "▶ gate close": button(() => play("gateClose", 0.9)),
    "▶ lantern gutter": button(() => play("flicker", 0.9)),
    "▶ rearranging": button(() => play("transform", 1)),
    "▶ moving piece": button(() => play("grind", 1, { duration: 3 })),
    "▶ biwa": button(() => play("biwa", 0.8)),
  }),
  Crows: folder({
    ...vol("crow", "caw", 3),
    ...knob("crowPitch", "caw pitch", 0.5, 1.6),
    ...vol("wings", "wingbeats", 3),
    "▶ caw": button(() => play("crow", 1)),
    "▶ wingbeats": button(() => play("wings", 1)),
  }),
};

export default function SoundControls() {
  useControls(schema);
  return <Leva collapsed titleBar={{ title: "Sound" }} />; // collapsed: it would cover the loader on a phone
}
