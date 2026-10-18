import * as THREE from "three";

/**
 * One tileable 256² noise texture, generated once on the CPU (~10 ms), shared
 * by the gate glow, water and mist. A texture read is far cheaper per pixel
 * than evaluating 3D simplex noise in the fragment shader.
 *
 *   R  fbm value noise        (soft variation)
 *   G  ridged fbm             (thin bright lines — lightning veins)
 *   B  fbm, different seed    (water swell / second layer)
 *   A  fine single-octave noise
 */
const SIZE = 256;
let texture = null;

function lattice(period, seed) {
  const g = new Float32Array(period * period);
  let s = seed >>> 0;
  for (let i = 0; i < g.length; i++) {
    s = (s * 1664525 + 1013904223) >>> 0;
    g[i] = s / 4294967296;
  }
  return g;
}

/** Periodic smooth value noise at (x, y) in lattice units. */
function valueNoise(g, period, x, y) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const fx = x - xi;
  const fy = y - yi;
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  const x0 = ((xi % period) + period) % period;
  const y0 = ((yi % period) + period) % period;
  const x1 = (x0 + 1) % period;
  const y1 = (y0 + 1) % period;
  const a = g[y0 * period + x0];
  const b = g[y0 * period + x1];
  const c = g[y1 * period + x0];
  const d = g[y1 * period + x1];
  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
}

function fbm(layers, u, v, ridged) {
  let sum = 0;
  let amp = 0.5;
  let norm = 0;
  for (const { g, period } of layers) {
    let n = valueNoise(g, period, u * period, v * period);
    if (ridged) {
      n = 1 - Math.abs(n * 2 - 1);
      n *= n;
    }
    sum += n * amp;
    norm += amp;
    amp *= 0.5;
  }
  return sum / norm;
}

export function getNoiseTexture() {
  if (texture) return texture;
  const octaves = (seed) => [8, 16, 32, 64].map((period, i) => ({ period, g: lattice(period, seed + i * 97) }));
  const a = octaves(11);
  const b = octaves(29);
  const c = octaves(53);
  const fine = [{ period: 64, g: lattice(64, 71) }];
  const data = new Uint8Array(SIZE * SIZE * 4);
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const u = x / SIZE;
      const v = y / SIZE;
      const i = (y * SIZE + x) * 4;
      data[i] = fbm(a, u, v, false) * 255;
      data[i + 1] = fbm(b, u, v, true) * 255;
      data[i + 2] = fbm(c, u, v, false) * 255;
      data[i + 3] = fbm(fine, u, v, false) * 255;
    }
  }
  texture = new THREE.DataTexture(data, SIZE, SIZE, THREE.RGBAFormat, THREE.UnsignedByteType);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.colorSpace = THREE.NoColorSpace;
  texture.needsUpdate = true;
  return texture;
}
