import * as THREE from "three";
import { NETWORK, PORTAL } from "../../config";

/** Small, fast, seeded PRNG so the web is identical on every load. */
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const smoothstep = (a, b, x) => {
  const t = Math.min(Math.max((x - a) / (b - a), 0), 1);
  return t * t * (3 - 2 * t);
};

const norm3 = (v) => {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
};

/**
 * Builds every particle once:
 *
 *  - web nodes: a dense band on the metal rim + inner voussoirs, a veil over
 *    the outer rings, a few inside the reveal, and tendrils wandering out
 *    across the stone and down onto the water (centre of the opening clear);
 *  - dust: free-floating motes around the portal and down the corridor.
 *
 * Each particle owns one texel of the GPU simulation (rest position + params);
 * threads store the texel coords of their two nodes so they follow them.
 *
 * Links: candidates closer than `connectDistance`, accepted shortest-first
 * while both nodes have < `maxDegree` links, with a share randomly dropped.
 */
export function buildNetwork({ density = 1 } = {}) {
  const rnd = mulberry32(NETWORK.seed);
  const gauss = () => {
    let u = 0;
    while (u === 0) u = rnd();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rnd());
  };

  const R = PORTAL.radius;
  const H = PORTAL.springY;
  const arcLen = Math.PI * R;
  const L = 2 * H + arcLen;
  const { faces, bands } = PORTAL;

  /** Point on the opening outline at arc length s, pushed outwards by r. */
  const outline = (s, r) => {
    if (s < H) return [-(R + r), s, -1, 0];
    if (s < H + arcLen) {
      const th = Math.PI - (s - H) / R;
      const c = Math.cos(th);
      const sn = Math.sin(th);
      return [(R + r) * c, H + (R + r) * sn, c, sn];
    }
    return [R + r, H - (s - H - arcLen), 1, 0];
  };
  const faceZ = (r) =>
    r < bands.rim ? faces.rim : r < bands.inner ? faces.inner : r < bands.outer ? faces.outer : r < bands.surround ? faces.surround : faces.wall;
  const inAperture = (x, y, margin) => (y < H ? Math.abs(x) < R - margin : Math.hypot(x, y - H) < R - margin);

  const nodes = [];
  const add = (x, y, z, extra) => {
    nodes.push({ x, y, z, seed: rnd(), ...extra });
    return nodes.length - 1;
  };

  /* ---------------- arch band ---------------- */
  const clumps = Array.from({ length: NETWORK.clumps }, () => rnd() * L);
  const archCount = Math.round(NETWORK.archNodes * density);
  for (let i = 0; i < archCount; i++) {
    let s = rnd() < 0.65 ? clumps[Math.floor(rnd() * clumps.length)] + gauss() * 0.5 : rnd() * L;
    s = Math.min(Math.max(s, 0), L);
    const kind = rnd();
    let r;
    let z;
    if (kind < 0.12) {
      r = -0.02 - rnd() * 0.12; // hugging the metal reveal
      z = faces.rim - 0.05 - rnd() * (PORTAL.rimDepth - 0.2);
    } else if (kind < 0.8) {
      r = Math.abs(gauss()) * 0.5 - 0.04; // dense band on the rim
      z = faceZ(r) + 0.04 + Math.abs(gauss()) * 0.26;
    } else {
      r = Math.min(0.5 + Math.abs(gauss()) * 1.5, 3.0); // veil
      z = faceZ(r) + 0.08 + Math.abs(gauss()) * 0.55;
    }
    const [x, y] = outline(s, r);
    if (y < 0.06) continue;
    if (y < 0.5 && rnd() < 0.4) continue;
    add(x, y, z, { kind: 0, phase: s / L, fade: 1, tendril: false, prev: -1 });
  }

  /* ---------------- tendrils ---------------- */
  const step = NETWORK.tendrilStep;
  /**
   * One wandering filament (+ occasional branches). `jitter` is how much it
   * meanders per step; `maxZ` how far towards the camera it may run; a
   * `strand` stops where it meets a side wall instead of turning back.
   */
  const grow = (start, dir0, length, phase0, depth, { jitter = 0.28, maxZ = -5.5, strand = false } = {}) => {
    let pos = start.slice();
    let dir = dir0;
    let prev = -1;
    const steps = Math.max(4, Math.round(length / step));
    for (let k = 0; k < steps; k++) {
      dir = norm3([dir[0] + gauss() * jitter, dir[1] + gauss() * jitter, dir[2] + gauss() * jitter * 0.43]);
      if (pos[1] < 0.09) {
        pos[1] = 0.06; // reached the floor: crawl over the water towards the camera
        dir = norm3([dir[0], Math.abs(dir[1]) * 0.15, Math.abs(dir[2]) + 0.25]);
      }
      if (pos[1] > 9.5) dir[1] = -Math.abs(dir[1]);
      if (Math.abs(pos[0]) > 5.3) {
        if (strand) break;
        dir[0] = -Math.sign(pos[0]) * Math.abs(dir[0]);
      }
      if (pos[2] < -11.9) dir[2] = Math.abs(dir[2]);
      pos = [pos[0] + dir[0] * step, pos[1] + dir[1] * step, pos[2] + dir[2] * step];
      if (pos[2] > maxZ) break;
      if (inAperture(pos[0], pos[1], 0.12) && pos[1] > 0.25 && pos[2] < -8.5) break;
      const t = k / steps;
      const idx = add(pos[0] + gauss() * 0.05, Math.max(0.06, pos[1] + gauss() * 0.05), pos[2] + gauss() * 0.04, {
        kind: 0,
        phase: phase0 + k * 0.012,
        fade: strand ? 0.45 + 0.55 * (1 - t) : 0.3 + 0.7 * (1 - t),
        tendril: true,
        prev,
      });
      prev = idx;
      if (depth < 2 && rnd() < 0.07) {
        const a = (rnd() - 0.5) * 1.6;
        const branch = norm3([dir[0] * Math.cos(a) - dir[1] * Math.sin(a), dir[0] * Math.sin(a) + dir[1] * Math.cos(a), dir[2]]);
        grow(pos, branch, length * (0.35 + rnd() * 0.3), phase0 + k * 0.012, depth + 1);
      }
    }
  };
  const tendrilCount = Math.round(NETWORK.tendrils * Math.max(density, 0.6));
  const [lenMin, lenMax] = NETWORK.tendrilLength;
  for (let i = 0; i < tendrilCount; i++) {
    const s = rnd() * L;
    const r = 0.35 + rnd() * 0.8;
    const [x, y, nx, ny] = outline(s, r);
    let dir = [nx + gauss() * 0.35, ny + gauss() * 0.35, 0.15 + rnd() * 0.35];
    if (rnd() < 0.3) dir = [nx * 0.6, -0.8, 0.3];
    grow([x, y, faceZ(r) + 0.1], norm3(dir), lenMin + rnd() * (lenMax - lenMin), s / L, 0);
  }

  /* ---------------- long strands ---------------- */
  // Few, straighter filaments leaving the upper arch sideways and running out
  // across the stone to the side walls / pillars.
  const [strandMin, strandMax] = NETWORK.strandLength;
  for (let i = 0; i < NETWORK.strands; i++) {
    const s = (0.18 + rnd() * 0.64) * L; // mid jambs → arch top
    const r = 0.7 + rnd() * 0.9;
    const [x, y] = outline(s, r);
    const side = x === 0 ? (rnd() < 0.5 ? -1 : 1) : Math.sign(x);
    const dir = norm3([side, 0.12 + gauss() * 0.3, 0.22 + rnd() * 0.15]);
    grow([x, y, faceZ(r) + 0.1], dir, strandMin + rnd() * (strandMax - strandMin), s / L, 0, {
      jitter: 0.1,
      maxZ: -3,
      strand: true,
    });
  }
  const webCount = nodes.length;

  /* ---------------- dust ---------------- */
  const dustCount = Math.round(NETWORK.dustCount * density);
  for (let i = 0; i < dustCount; i++) {
    let x;
    let y;
    let z;
    if (rnd() < 0.55) {
      // a cloud hanging around the arch
      const s = rnd() * L;
      const r = 0.1 + Math.abs(gauss()) * 1.5;
      [x, y] = outline(s, r);
      y += gauss() * 0.3;
      z = faces.rim + 0.15 + Math.abs(gauss()) * 1.7;
    } else {
      // thinner haze down the corridor, denser low and near the portal
      x = (rnd() * 2 - 1) * 5.4;
      y = 0.1 + Math.pow(rnd(), 1.6) * 8.5;
      z = -11.6 + Math.pow(rnd(), 1.4) * 10.5;
    }
    if (inAperture(x, y, -0.05) && z < -6.5 && rnd() < 0.85) continue; // keep the opening clear
    if (y < 0.05) y = 0.05 + rnd() * 0.1;
    nodes.push({ x, y, z, seed: rnd(), kind: 1, phase: rnd(), fade: 1, tendril: false, prev: -1 });
  }

  /* ---------------- per-particle data + simulation textures ---------------- */
  const n = nodes.length;
  const texSize = Math.ceil(Math.sqrt(n));
  const positions = new Float32Array(n * 3);
  const refs = new Float32Array(n * 2);
  const kinds = new Float32Array(n);
  const seeds = new Float32Array(n);
  const sizes = new Float32Array(n);
  const tones = new Float32Array(n);
  const glows = new Float32Array(n);
  const phases = new Float32Array(n);
  const fades = new Float32Array(n);
  const rest = new Float32Array(texSize * texSize * 4);
  const params = new Float32Array(texSize * texSize * 4);
  for (let i = n; i < texSize * texSize; i++) rest[i * 4 + 3] = -1; // unused texels

  const [nMin, nMax] = NETWORK.nodeSize;
  const [dMin, dMax] = NETWORK.dustSize;
  /** 1 = web node fixed to the gate edge (ignores the fluid), 0 = free. */
  const anchorOf = (p) => {
    const reach = NETWORK.anchorReach;
    if (reach <= 0 || p.z > faces.rim + 0.8) return 0;
    const edge = Math.abs(p.y < H ? Math.abs(p.x) - R : Math.hypot(p.x, p.y - H) - R);
    return 1 - smoothstep(reach, reach * 1.5, edge);
  };
  nodes.forEach((p, i) => {
    positions.set([p.x, p.y, p.z], i * 3);
    refs.set([((i % texSize) + 0.5) / texSize, (Math.floor(i / texSize) + 0.5) / texSize], i * 2);
    kinds[i] = p.kind;
    seeds[i] = p.seed;
    phases[i] = p.phase;
    fades[i] = p.fade;
    rest.set([p.x, p.y, p.z, p.kind], i * 4);
    const pick = rnd();
    if (p.kind === 0) {
      tones[i] = pick < 0.5 ? rnd() * 0.5 : pick < 0.9 ? 0.5 + rnd() * 0.3 : 0.85 + rnd() * 0.15;
      const highlight = rnd() < NETWORK.highlightRatio;
      sizes[i] = (nMin + Math.pow(rnd(), 3) * (nMax - nMin)) * (p.tendril ? 0.75 : 1) * (highlight ? 1.6 : 1);
      glows[i] = highlight ? 1.6 + rnd() * 1.0 : 0.45 + rnd() * 0.6;
      const free = 1 - anchorOf(p);
      // seed, spring scale, wander scale, fluid response
      params.set([p.seed, p.tendril ? 0.6 + rnd() * 0.3 : 0.8 + rnd() * 0.5, free, (0.75 + rnd() * 0.35) * free], i * 4);
    } else {
      tones[i] = pick < 0.85 ? 0.2 + rnd() * 0.6 : 0.85 + rnd() * 0.15;
      sizes[i] = dMin + Math.pow(rnd(), 2.4) * (dMax - dMin);
      glows[i] = rnd() < 0.04 ? 1.0 + rnd() * 0.8 : 0.12 + rnd() * 0.4;
      params.set([p.seed, 0.6 + rnd() * 0.8, 1.4, 0.6 + rnd() * 0.7], i * 4);
    }
  });

  /* ---------------- links (web nodes only) ---------------- */
  const D = NETWORK.connectDistance;
  const degree = new Uint8Array(webCount);
  const edges = [];
  const link = (a, b) => {
    edges.push(a, b);
    degree[a]++;
    degree[b]++;
  };
  for (let i = 0; i < webCount; i++) if (nodes[i].prev >= 0) link(nodes[i].prev, i);

  const grid = new Map();
  const cellKey = (x, y, z) => `${x},${y},${z}`;
  for (let i = 0; i < webCount; i++) {
    const a = nodes[i];
    const k = cellKey(Math.floor(a.x / D), Math.floor(a.y / D), Math.floor(a.z / D));
    if (!grid.has(k)) grid.set(k, []);
    grid.get(k).push(i);
  }
  const candidates = [];
  for (let i = 0; i < webCount; i++) {
    const a = nodes[i];
    const cx = Math.floor(a.x / D);
    const cy = Math.floor(a.y / D);
    const cz = Math.floor(a.z / D);
    for (let dx = -1; dx <= 1; dx++)
      for (let dy = -1; dy <= 1; dy++)
        for (let dz = -1; dz <= 1; dz++) {
          const cell = grid.get(cellKey(cx + dx, cy + dy, cz + dz));
          if (!cell) continue;
          for (const j of cell) {
            if (j <= i) continue;
            const b = nodes[j];
            const d2 = (a.x - b.x) ** 2 + (a.y - b.y) ** 2 + (a.z - b.z) ** 2;
            if (d2 < D * D) candidates.push([d2, i, j]);
          }
        }
  }
  candidates.sort((p, q) => p[0] - q[0]);
  for (const [, i, j] of candidates) {
    if (degree[i] >= NETWORK.maxDegree || degree[j] >= NETWORK.maxDegree) continue;
    if (rnd() < NETWORK.dropLinks) continue;
    link(i, j);
  }

  const m = edges.length / 2;
  const iA = new Float32Array(m * 3);
  const iB = new Float32Array(m * 3);
  const iRefA = new Float32Array(m * 2);
  const iRefB = new Float32Array(m * 2);
  const iRand = new Float32Array(m * 3);
  const iPhase = new Float32Array(m * 2);
  const iFade = new Float32Array(m * 2);
  for (let e = 0; e < m; e++) {
    const a = edges[e * 2];
    const b = edges[e * 2 + 1];
    iA.set(positions.subarray(a * 3, a * 3 + 3), e * 3);
    iB.set(positions.subarray(b * 3, b * 3 + 3), e * 3);
    iRefA.set(refs.subarray(a * 2, a * 2 + 2), e * 2);
    iRefB.set(refs.subarray(b * 2, b * 2 + 2), e * 2);
    iRand.set([rnd(), rnd(), rnd()], e * 3);
    iPhase.set([phases[a], phases[b]], e * 2);
    iFade.set([fades[a], fades[b]], e * 2);
  }

  return {
    texSize,
    rest,
    params,
    particles: { count: n, web: webCount, positions, refs, kinds, seeds, sizes, tones, glows, phases, fades },
    threads: { count: m, iA, iB, iRefA, iRefB, iRand, iPhase, iFade },
  };
}

/** Ribbon strip shared by every thread instance: (segments + 1) × 2 vertices. */
export function buildThreadGeometry(threads, segments) {
  const geometry = new THREE.InstancedBufferGeometry();
  const verts = (segments + 1) * 2;
  const aT = new Float32Array(verts);
  const aSide = new Float32Array(verts);
  for (let k = 0; k <= segments; k++) {
    aT[k * 2] = aT[k * 2 + 1] = k / segments;
    aSide[k * 2] = -1;
    aSide[k * 2 + 1] = 1;
  }
  const index = [];
  for (let k = 0; k < segments; k++) {
    const a = k * 2;
    index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }
  geometry.setIndex(index);
  geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(verts * 3), 3));
  geometry.setAttribute("aT", new THREE.BufferAttribute(aT, 1));
  geometry.setAttribute("aSide", new THREE.BufferAttribute(aSide, 1));
  geometry.setAttribute("iA", new THREE.InstancedBufferAttribute(threads.iA, 3));
  geometry.setAttribute("iB", new THREE.InstancedBufferAttribute(threads.iB, 3));
  geometry.setAttribute("iRefA", new THREE.InstancedBufferAttribute(threads.iRefA, 2));
  geometry.setAttribute("iRefB", new THREE.InstancedBufferAttribute(threads.iRefB, 2));
  geometry.setAttribute("iRand", new THREE.InstancedBufferAttribute(threads.iRand, 3));
  geometry.setAttribute("iPhase", new THREE.InstancedBufferAttribute(threads.iPhase, 2));
  geometry.setAttribute("iFade", new THREE.InstancedBufferAttribute(threads.iFade, 2));
  geometry.instanceCount = threads.count;
  return geometry;
}
