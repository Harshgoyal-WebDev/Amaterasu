"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { useGLTF, useTexture } from "@react-three/drei";
import * as THREE from "three";
import { BOULDER } from "../../config";
import { pointer } from "../../hooks/usePointer";
import { heroState } from "../../state";
import { pointerRay } from "../pointerRay";
import { createRevealLayer, patchBoulderMaterial } from "./boulderMaterial";
import { boulderPose } from "./journeyPath";
import { mulberry32 } from "./voidEffects";

const MOTES = 64;
const localRay = new THREE.Ray();
const frontPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), -BOULDER.front.z); // boulder-local
const hitLocal = new THREE.Vector3();
const smooth = (a, b, x) => {
  const t = Math.min(Math.max((x - a) / (b - a), 0), 1);
  return t * t * (3 - 2 * t);
};

/** Boulder-local front point → atlas uv (the front is planar in UV). */
function frontUv(x, y, out) {
  const [u0, x0, ku] = BOULDER.front.u;
  const [v0, y0, kv] = BOULDER.front.v;
  out.x = u0 + (x - x0) * ku;
  out.y = v0 + (y - y0) * kv;
  return out;
}

/* ---------------- dust motes puffing off the stone ---------------- */
const moteVertex = /* glsl */ `
attribute float aLife;
uniform float uPixel;
varying float vLife;
void main() {
  vLife = aLife;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = aLife > 0.0 ? clamp(0.02 * uPixel / -mv.z, 1.0, 6.0) : 0.0;
}
`;
const moteFragment = /* glsl */ `
varying float vLife;
void main() {
  vec2 c = gl_PointCoord * 2.0 - 1.0;
  float d = dot(c, c);
  if (d > 1.0 || vLife <= 0.0) discard;
  gl_FragColor = vec4(vec3(0.55, 0.48, 0.62) * exp(-d * 2.5) * vLife * 0.9, 1.0);
}
`;

function createMotes() {
  const positions = new Float32Array(MOTES * 3);
  const life = new Float32Array(MOTES);
  const velocity = new Float32Array(MOTES * 3);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage));
  geometry.setAttribute("aLife", new THREE.BufferAttribute(life, 1).setUsage(THREE.DynamicDrawUsage));
  const material = new THREE.ShaderMaterial({
    uniforms: { uPixel: { value: 500 } },
    vertexShader: moteVertex,
    fragmentShader: moteFragment,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  });
  let next = 0;
  let alive = 0;
  return {
    geometry,
    material,
    /** A puff at a boulder-local point. */
    emit(at, n = 2) {
      for (let k = 0; k < n; k++) {
        const i = next++ % MOTES;
        positions.set([at.x, at.y, at.z + 0.03], i * 3);
        velocity.set([(Math.random() - 0.5) * 0.6, Math.random() * 0.3, 0.2 + Math.random() * 0.4], i * 3);
        life[i] = 1;
      }
      alive = 1.4;
    },
    update(dt, pixel) {
      material.uniforms.uPixel.value = pixel;
      if (alive <= 0) return;
      alive -= dt;
      for (let i = 0; i < MOTES; i++) {
        if (life[i] <= 0) continue;
        life[i] = Math.max(0, life[i] - dt * 0.8);
        velocity[i * 3 + 1] -= dt * 0.25; // settles
        for (let a = 0; a < 3; a++) positions[i * 3 + a] += velocity[i * 3 + a] * dt;
      }
      geometry.attributes.position.needsUpdate = true;
      geometry.attributes.aLife.needsUpdate = true;
    },
    dispose() {
      geometry.dispose();
      material.dispose();
    },
  };
}

/* ---------------- gravel covering the skills ---------------- */
/** A small low-poly pebble (flat-shaded, ~20 triangles). */
function pebbleGeometry() {
  const g = new THREE.IcosahedronGeometry(1, 0).toNonIndexed();
  const p = g.attributes.position;
  const rnd = mulberry32(91);
  const jitter = new Map();
  for (let i = 0; i < p.count; i++) {
    const key = `${p.getX(i).toFixed(3)},${p.getY(i).toFixed(3)},${p.getZ(i).toFixed(3)}`;
    if (!jitter.has(key)) jitter.set(key, 0.7 + rnd() * 0.5);
    const k = jitter.get(key);
    p.setXYZ(i, p.getX(i) * k, p.getY(i) * k * 0.75, p.getZ(i) * k);
  }
  g.computeVertexNormals();
  return g;
}

/** Each skill's area (logo + label, a little margin) and its pebbles. */
function createGravel() {
  const G = BOULDER.gravel;
  const rnd = mulberry32(2024);
  const pebbles = [];
  const skills = BOULDER.skills.map((skill, index) => {
    const [lx, ly, lz, lw, lh] = skill.logo;
    const [tx, ty, tz, tw, th] = skill.label;
    const x0 = Math.min(lx - lw / 2, tx - tw / 2) - 0.04;
    const x1 = Math.max(lx + lw / 2, tx + tw / 2) + 0.04;
    const y0 = ty - th / 2 - 0.04;
    const y1 = ly + lh / 2 + 0.04;
    const count = Math.round((x1 - x0) * (y1 - y0) * G.perSquareMetre);
    const first = pebbles.length;
    for (let i = 0; i < count; i++) {
      const x = x0 + rnd() * (x1 - x0);
      const y = y0 + rnd() * (y1 - y0);
      const z = tz + ((y - ty) / (ly - ty)) * (lz - tz); // the inscribed face, between label and logo
      const radius = G.size[0] + Math.pow(rnd(), 1.6) * (G.size[1] - G.size[0]);
      pebbles.push({
        skill: index,
        rest: new THREE.Vector3(x, y, z + radius * 0.55),
        quaternion: new THREE.Quaternion().setFromEuler(new THREE.Euler(rnd() * 6.28, rnd() * 6.28, rnd() * 6.28)),
        radius,
        flying: false,
        delay: 0,
        t: 0,
        velocity: new THREE.Vector3(),
        axis: new THREE.Vector3(rnd() - 0.5, rnd() - 0.5, rnd() - 0.5).normalize(),
        spin: 4 + rnd() * 8,
        gone: false,
      });
    }
    return { index, x0, x1, y0, y1, first, count, removed: 0, done: false };
  });

  const geometry = pebbleGeometry();
  const material = new THREE.MeshStandardMaterial({ color: G.color, roughness: 0.95, metalness: 0, flatShading: true });
  const mesh = new THREE.InstancedMesh(geometry, material, pebbles.length);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.frustumCulled = false;
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const pos = new THREE.Vector3();
  const scl = new THREE.Vector3();
  const color = new THREE.Color();
  pebbles.forEach((pb, i) => {
    mesh.setMatrixAt(i, m.compose(pb.rest, pb.quaternion, scl.setScalar(pb.radius)));
    mesh.setColorAt(i, color.set(G.color).multiplyScalar(0.7 + rnd() * 0.6));
  });

  /** Send one pebble flying off the stone (from boulder-local point `from`). */
  const kick = (pb, from, delay = 0) => {
    if (pb.flying || pb.gone) return;
    pb.flying = true;
    pb.delay = delay;
    pb.t = 0;
    const dx = pb.rest.x - from.x;
    const dy = pb.rest.y - from.y;
    const d = Math.hypot(dx, dy) || 1;
    const out = 0.5 + Math.random() * 0.9;
    pb.velocity.set((dx / d) * out + (Math.random() - 0.5) * 0.4, (dy / d) * out + Math.random() * 0.5, 0.9 + Math.random() * 1.4);
    skills[pb.skill].removed++;
  };

  return {
    mesh,
    skills,
    pebbles,
    kick,
    /** Kick everything within the cursor's reach; returns how many flew. */
    sweep(at) {
      const r2 = G.kickRadius * G.kickRadius;
      let n = 0;
      for (const sk of skills) {
        if (sk.done || at.x < sk.x0 - G.kickRadius || at.x > sk.x1 + G.kickRadius || at.y < sk.y0 - G.kickRadius || at.y > sk.y1 + G.kickRadius) continue;
        for (let i = sk.first; i < sk.first + sk.count; i++) {
          const pb = pebbles[i];
          if (pb.flying || pb.gone) continue;
          const dx = pb.rest.x - at.x;
          const dy = pb.rest.y - at.y;
          if (dx * dx + dy * dy < r2) {
            kick(pb, at);
            n++;
          }
        }
      }
      return n;
    },
    /** Clear all that's left of a skill (staggered, from its centre). */
    clearSkill(sk) {
      const centre = new THREE.Vector3((sk.x0 + sk.x1) / 2, (sk.y0 + sk.y1) / 2, 0);
      for (let i = sk.first; i < sk.first + sk.count; i++) kick(pebbles[i], centre, Math.random() * 0.35);
    },
    update(dt) {
      let moving = false;
      for (let i = 0; i < pebbles.length; i++) {
        const pb = pebbles[i];
        if (!pb.flying || pb.gone) continue;
        moving = true;
        if (pb.delay > 0) {
          pb.delay -= dt;
          continue;
        }
        pb.t += dt;
        pb.velocity.y -= dt * 1.2; // falls away
        pos.copy(pb.rest).addScaledVector(pb.velocity, pb.t);
        q.setFromAxisAngle(pb.axis, pb.t * pb.spin).multiply(pb.quaternion);
        const shrink = 1 - smooth(0.9, 1.5, pb.t);
        if (shrink <= 0) pb.gone = true;
        mesh.setMatrixAt(i, m.compose(pos, q, scl.setScalar(pb.radius * shrink)));
      }
      if (moving) mesh.instanceMatrix.needsUpdate = true;
    },
    dispose() {
      geometry.dispose();
      material.dispose();
      mesh.dispose();
    },
  };
}

/* ---------------- the burst ---------------- */
/** The GLB's fragments flying apart, then floating like the tunnel's rocks. */
function createBurst(scene) {
  const B = BOULDER.burst;
  const centre = new THREE.Vector3(...BOULDER.crack.centre);
  const rnd = mulberry32(77);
  const pieces = [];
  scene.traverse((o) => {
    if (!o.isMesh) return;
    const home = o.position.clone();
    const dir = new THREE.Vector3(home.x - centre.x, home.y - centre.y, 0);
    if (dir.lengthSq() < 1e-4) dir.set(rnd() - 0.5, rnd() - 0.5, 0);
    dir.normalize();
    dir.z = (rnd() - 0.5) * 1.2; // forward / backward too
    dir.normalize();
    // reach at least minRadius off the line of travel (so the camera passes clear)
    const speed = Math.max(B.speed[0] + rnd() * (B.speed[1] - B.speed[0]), (B.minRadius * B.drag) / Math.max(Math.hypot(dir.x, dir.y), 0.4));
    pieces.push({
      object: o,
      home,
      rest: o.quaternion.clone(),
      dir,
      speed,
      axis: new THREE.Vector3(rnd() - 0.5, rnd() - 0.5, rnd() - 0.5).normalize(),
      spin: B.spin[0] + rnd() * (B.spin[1] - B.spin[0]),
      drift: 0.1 + rnd() * 0.2,
    });
  });
  const q = new THREE.Quaternion();
  return {
    update(t) {
      const k = (1 - Math.exp(-B.drag * t)) / B.drag; // eased distance factor
      for (const pc of pieces) {
        pc.object.position.copy(pc.home).addScaledVector(pc.dir, pc.speed * k);
        q.setFromAxisAngle(pc.axis, pc.spin * k + pc.drift * t);
        pc.object.quaternion.copy(q).multiply(pc.rest);
      }
    },
  };
}

/**
 * Builds the boulder's controller: material patch, dust layer, gravel,
 * motes, crack spread and the burst — and the per-frame logic.
 */
function createBoulder(scene, masks, clean) {
  masks.flipY = false; // glTF atlas convention
  masks.colorSpace = THREE.NoColorSpace;
  clean.flipY = false;
  clean.colorSpace = THREE.SRGBColorSpace;
  masks.needsUpdate = true;
  clean.needsUpdate = true;
  const reveal = createRevealLayer();
  let uniforms = null;
  scene.traverse((o) => {
    if (o.isMesh && !uniforms) uniforms = patchBoulderMaterial(o.material, { masks, clean, reveal: reveal.texture });
  });
  boulderPose.toWorld(new THREE.Vector3(...BOULDER.crack.centre), uniforms.uCrackCentre.value);
  const motes = createMotes();
  const gravel = createGravel();
  const burst = createBurst(scene);
  const uv = new THREE.Vector2();
  const lastUv = new THREE.Vector2();
  const s = { over: false, wasOver: false, spread: 0, burstAt: -1, dom: null };

  const setDom = (dom, cursor, touch) => {
    if (dom.style.cursor !== cursor) dom.style.cursor = cursor;
    if (dom.style.touchAction !== touch) dom.style.touchAction = touch;
  };

  return {
    motes,
    gravel,
    frame({ camera, size, gl }, rawDt, group, points) {
      const j = heroState.journey;
      const dom = gl.domElement;
      s.dom = dom;
      group.visible = j.boulder;
      points.visible = j.boulder;
      if (!j.boulder) {
        setDom(dom, "", "");
        return;
      }
      const dt = Math.min(rawDt, 0.1);
      const time = heroState.time;
      uniforms.uTime.value = time;
      motes.update(dt, size.height * gl.getPixelRatio() * camera.projectionMatrix.elements[5] * 0.5);
      gravel.update(dt);

      // hover over the front: gravel flies, the dust underneath clears
      const active = j.arrived && !j.broken && s.burstAt < 0;
      s.over = false;
      if (active && pointer.active) {
        localRay.copy(pointerRay(camera)).applyMatrix4(boulderPose.inverse);
        if (localRay.intersectPlane(frontPlane, hitLocal)) {
          frontUv(hitLocal.x, hitLocal.y, uv);
          s.over = uv.x >= 0 && uv.x <= 1 && uv.y >= 0 && uv.y <= BOULDER.front.vMax;
        }
      }
      if (s.over) {
        const flew = gravel.sweep(hitLocal);
        if (flew) {
          reveal.stroke(s.wasOver ? lastUv.x : uv.x, s.wasOver ? lastUv.y : uv.y, uv.x, uv.y);
          motes.emit(hitLocal, Math.min(4, 1 + flew));
        }
        lastUv.copy(uv);
      }
      s.wasOver = s.over;
      setDom(dom, s.over ? "crosshair" : "", j.arrived ? "pan-y" : "");

      // skills: uncovered once most of their gravel is gone
      let uncovered = 0;
      for (const sk of gravel.skills) {
        if (!sk.done && sk.removed >= sk.count * BOULDER.gravel.clearedAt) {
          sk.done = true;
          gravel.clearSkill(sk);
          const a = frontUv(sk.x0, sk.y1, new THREE.Vector2());
          const b = frontUv(sk.x1, sk.y0, new THREE.Vector2());
          reveal.fill(a.x, a.y, b.x, b.y);
        }
        uncovered += sk.done ? 1 : Math.min(1, sk.removed / (sk.count * BOULDER.gravel.clearedAt));
      }
      uncovered /= gravel.skills.length;
      j.uncovered = uncovered;

      // cracks light up from the centre as skills are uncovered
      const C = BOULDER.crack;
      const allDone = gravel.skills.every((sk) => sk.done);
      if (allDone && s.burstAt < 0) s.burstAt = time;
      const sinceBurst = s.burstAt < 0 ? -1 : time - s.burstAt;
      const target = sinceBurst >= 0 ? C.reach * 1.4 : C.reach * uncovered;
      s.spread += (target - s.spread) * (1 - Math.exp(-2.2 * dt));
      uniforms.uSpread.value = s.spread;
      uniforms.uCrackGlow.value = C.glow * (sinceBurst >= 0 ? 1 + 1.5 * Math.exp(-Math.pow((sinceBurst - BOULDER.burst.delay) * 2, 2)) : 1);

      // the burst: after a beat, the fragments fly; then the scroll carries on
      if (sinceBurst >= BOULDER.burst.delay) {
        burst.update(sinceBurst - BOULDER.burst.delay);
        if (!j.broken && sinceBurst >= BOULDER.burst.delay + BOULDER.burst.hold) j.broken = true;
      }
    },
    dispose() {
      if (s.dom) setDom(s.dom, "", "");
      reveal.dispose();
      motes.dispose();
      gravel.dispose();
    },
  };
}

/**
 * The Skills Boulder (Blender asset, 10 fragments), placed in the tube by
 * the journey path, facing the camera at the stop. Its carved skills lie
 * under gravel and dust; once the camera has stopped in front of it, moving
 * the cursor over a skill flicks the gravel away and the engraving glows.
 * The cracks light up from the centre as the skills are uncovered; after the
 * last one the boulder bursts apart and the scroll carries on down the tube.
 */
export default function SkillsBoulder() {
  const { scene } = useGLTF(BOULDER.url, false, true);
  const [masks, clean] = useTexture([BOULDER.masks, BOULDER.clean]);
  const group = useRef(null);
  const motes = useRef(null);
  const boulder = useMemo(() => createBoulder(scene, masks, clean), [scene, masks, clean]);
  useEffect(() => () => boulder.dispose(), [boulder]);
  useFrame((state, dt) => boulder.frame(state, dt, group.current, motes.current));

  return (
    <group ref={group} position={boulderPose.position} quaternion={boulderPose.quaternion} visible={false}>
      <primitive object={scene} />
      <primitive object={boulder.gravel.mesh} />
      <points ref={motes} geometry={boulder.motes.geometry} material={boulder.motes.material} frustumCulled={false} renderOrder={4} />
    </group>
  );
}
