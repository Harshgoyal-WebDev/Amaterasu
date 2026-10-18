import * as THREE from "three";

/**
 * Latest textures of the cursor fluid, published every frame by the particle
 * system (which owns the solver) and read by the glass post effect.
 *  - density:  liquid thickness (dye, red channel)
 *  - velocity: flow, in sim texels / s (× velocityTexel = screen uv / s)
 *  - glass:    precomputed glass field (offset, highlight, edge)
 *  - awake:    false while the solver sleeps (nothing to draw)
 */
export const fluidOutput = {
  density: null,
  velocity: null,
  glass: null,
  awake: false,
  densityTexel: new THREE.Vector2(1 / 512, 1 / 512),
  velocityTexel: new THREE.Vector2(1 / 128, 1 / 128),
};
