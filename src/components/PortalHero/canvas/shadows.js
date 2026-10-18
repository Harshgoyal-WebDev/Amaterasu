/**
 * Static shadows. Nothing that casts a shadow ever moves (the corridor and
 * its lights are fixed; the camera moving doesn't change shadow maps), so the
 * maps are rendered once and only refreshed on request — e.g. when a light is
 * switched on — instead of re-rendering the whole model per light per frame.
 */
let pending = true;

export function requestShadowUpdate() {
  pending = true;
}

/** Call from a useFrame with the frame state's renderer. */
export function syncShadows(gl) {
  if (gl.shadowMap.autoUpdate) gl.shadowMap.autoUpdate = false;
  if (pending) {
    gl.shadowMap.needsUpdate = true;
    pending = false;
  }
}

/**
 * Lights at zero intensity are removed from shading entirely (three skips
 * invisible lights), so they cost nothing per pixel. Toggling changes the
 * light count, which recompiles materials once — only when crossing zero.
 */
export function setLightOn(light, on) {
  if (light.visible === on) return;
  light.visible = on;
  if (light.castShadow) requestShadowUpdate();
}
