import { uiStore } from "../state";
import { createCastleAudio } from "./castleAudio";

/**
 * The one castle audio instance, shared by the HUD toggle
 * and the summons letter's "with sound". Call these from click handlers:
 * the audio graph is created on first use (autoplay rules).
 */
let audio = null;

const ensure = () => (audio ??= createCastleAudio());

/** Ambience + effects (footsteps, doors, the castle moving, crows…). */
export function setSound(on) {
  if (on || audio) ensure().setSound(on);
  uiStore.set({ soundOn: on });
}

export const getSound = () => audio;

export function disposeSound() {
  audio?.dispose();
  audio = null;
  uiStore.set({ soundOn: false });
}
