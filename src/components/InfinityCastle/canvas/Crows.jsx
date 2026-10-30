"use client";

import { useEffect, useMemo, useState } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { clone as cloneSkinned } from "three/examples/jsm/utils/SkeletonUtils.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import { CROWS } from "../config";
import { emitAudio, journey } from "../state";

/**
 * Crows wheeling through the castle's open spaces: small flocks cross the
 * view (or overtake you from behind, close enough to hear their wings),
 * beating and gliding, cawing now and then — panned to where they are.
 *
 * The bird is a model you provide at CROWS.url (README → Crows): it should
 * face +Z (Blender: -Y), be in metres, and carry a looping "flap" action
 * (an optional "glide" action is used between bursts). No file → no crows.
 */

const rand = (a, b) => a + Math.random() * (b - a);

// black feathers on a black void disappear: a warm lantern-lit rim keeps the silhouette
function addRim(material) {
  const m = material.clone();
  m.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <emissivemap_fragment>",
      `#include <emissivemap_fragment>
      totalEmissiveRadiance += vec3(1.0, 0.5, 0.18) * 0.16 * pow(1.0 - abs(dot(normalize(normal), normalize(vViewPosition))), 3.5);`,
    );
  };
  m.customProgramCacheKey = () => "ic-crow-rim";
  return m;
}

function createFlock(gltf) {
  const template = gltf.scene;
  const materials = new Map();
  template.traverse((o) => {
    if (!o.isMesh) return;
    const src = Array.isArray(o.material) ? o.material : [o.material];
    const out = src.map((mat) => {
      if (!materials.has(mat)) materials.set(mat, addRim(mat));
      return materials.get(mat);
    });
    o.material = Array.isArray(o.material) ? out : out[0];
    o.frustumCulled = false; // skinned bounds don't follow the wings
  });
  // Blender exports from frame 1 (t = 1/24 s); a loop that starts there holds its first pose each cycle
  for (const a of gltf.animations) {
    const t0 = Math.min(...a.tracks.map((t) => t.times[0]));
    if (t0 > 0) for (const t of a.tracks) t.shift(-t0);
    a.resetDuration();
  }
  const clip = (re) => gltf.animations.find((a) => re.test(a.name));
  const flapClip = clip(/flap|fly/i) || gltf.animations[0] || null;
  const glideClip = clip(/glide|soar/i) || null;

  const group = new THREE.Group();
  group.name = "Crows";
  const birds = Array.from({ length: CROWS.pool }, () => {
    const obj = cloneSkinned(template);
    obj.scale.setScalar(CROWS.scale);
    obj.visible = false;
    group.add(obj);
    const mixer = flapClip ? new THREE.AnimationMixer(obj) : null;
    const flap = mixer && mixer.clipAction(flapClip);
    const glide = mixer && glideClip ? mixer.clipAction(glideClip) : null;
    flap?.play();
    glide?.play();
    glide?.setEffectiveWeight(0);
    return { obj, mixer, flap, glide, active: false, pos: new THREE.Vector3(), dir: new THREE.Vector3(), up: new THREE.Vector3(0, 1, 0), speed: 8, age: 0, flapLeft: 0, glideLeft: 0, turn: 0, cawAt: -1, whooshed: false };
  });

  const right = new THREE.Vector3();
  const up = new THREE.Vector3();
  const fwd = new THREE.Vector3();
  const v = new THREE.Vector3();
  const look = new THREE.Vector3();
  const q = new THREE.Quaternion();
  let nextFlock = rand(3, 7);

  // beating ↔ gliding: switch to the glide action, or slow the flap almost to a hold
  const setGliding = (b, gliding) => {
    if (!b.flap) return;
    if (b.glide) {
      b.flap.setEffectiveWeight(gliding ? 0 : 1);
      b.glide.setEffectiveWeight(gliding ? 1 : 0);
    } else b.flap.setEffectiveTimeScale(gliding ? 0.08 : 1);
  };

  function spawnFlock(cam) {
    const free = birds.filter((b) => !b.active);
    if (!free.length) return;
    const n = Math.min(free.length, Math.round(rand(CROWS.flock[0], CROWS.flock[1])));
    const overtake = Math.random() < 0.25; // from behind and overhead, close
    const s = Math.random() < 0.5 ? -1 : 1;
    const start = cam.position.clone();
    const dir = new THREE.Vector3();
    if (overtake) {
      start.addScaledVector(fwd, -rand(6, 12)).addScaledVector(up, rand(2.5, 5)).addScaledVector(right, rand(-3, 3));
      dir.copy(fwd).addScaledVector(right, rand(-0.25, 0.25)).addScaledVector(up, rand(-0.05, 0.08));
    } else {
      start.addScaledVector(fwd, rand(12, 32)).addScaledVector(right, s * rand(20, 30)).addScaledVector(up, rand(-3, 9));
      dir.copy(right).multiplyScalar(-s).addScaledVector(fwd, rand(-0.35, 0.35)).addScaledVector(up, rand(-0.08, 0.12));
    }
    dir.normalize();
    const speed = rand(CROWS.speed[0], CROWS.speed[1]);
    const caw = Math.random() < CROWS.cawChance;
    for (let i = 0; i < n; i++) {
      const b = free[i];
      b.active = true;
      b.obj.visible = true;
      b.age = 0;
      b.whooshed = false;
      b.pos.copy(start).add(v.set(rand(-2.5, 2.5), rand(-1.2, 1.2), rand(-2.5, 2.5)));
      b.dir.copy(dir).add(v.set(rand(-0.06, 0.06), rand(-0.03, 0.03), rand(-0.06, 0.06))).normalize();
      b.up.copy(up);
      b.speed = speed * rand(0.92, 1.08);
      b.flapLeft = rand(0.6, 1.8);
      b.glideLeft = 0;
      b.turn = rand(-0.12, 0.12);
      b.cawAt = caw && i === 0 ? rand(0.2, 2.2) : Math.random() < 0.2 ? rand(1, 4) : -1;
      if (b.flap) b.flap.time = rand(0, flapClip.duration); // out of step with each other
      setGliding(b, false);
    }
  }

  return {
    group,
    update(dt, cam) {
      right.set(1, 0, 0).applyQuaternion(cam.quaternion);
      up.set(0, 1, 0).applyQuaternion(cam.quaternion);
      fwd.set(0, 0, -1).applyQuaternion(cam.quaternion);

      nextFlock -= dt;
      if (nextFlock <= 0) {
        nextFlock = rand(CROWS.every[0], CROWS.every[1]);
        if (journey.started && journey.void >= CROWS.minVoid && !journey.blackout) spawnFlock(cam);
      }

      for (const b of birds) {
        if (!b.active) continue;
        b.age += dt;
        // a slow wheeling turn around the bird's own up
        b.dir.applyQuaternion(q.setFromAxisAngle(b.up, b.turn * dt)).normalize();
        b.pos.addScaledVector(b.dir, b.speed * dt);

        if (b.flapLeft > 0) {
          b.flapLeft -= dt;
          if (b.flapLeft <= 0) {
            b.glideLeft = rand(0.4, 1.4);
            setGliding(b, true);
          }
        } else {
          b.glideLeft -= dt;
          if (b.glideLeft <= 0) {
            b.flapLeft = rand(0.6, 1.6);
            setGliding(b, false);
          }
        }
        b.mixer?.update(dt);

        b.obj.position.copy(b.pos);
        b.obj.up.copy(b.up);
        b.obj.lookAt(look.copy(b.pos).add(b.dir));
        b.obj.rotateZ(-b.turn * 2.2);

        const toBird = v.copy(b.pos).sub(cam.position);
        const dist = toBird.length();
        const pan = dist > 0.01 ? THREE.MathUtils.clamp(toBird.dot(right) / dist, -1, 1) * 0.85 : 0;
        if (b.cawAt >= 0 && b.age >= b.cawAt) {
          b.cawAt = Math.random() < 0.3 ? b.age + rand(1.5, 4) : -1;
          emitAudio("crow", THREE.MathUtils.clamp(1.4 - dist / 40, 0.25, 1), { pan });
        }
        if (!b.whooshed && dist < 6) {
          b.whooshed = true;
          emitAudio("wings", THREE.MathUtils.clamp(1.3 - dist / 6, 0.3, 1), { pan });
        }
        if (dist > 80 || b.age > 22) {
          b.active = false;
          b.obj.visible = false;
        }
      }
    },
    shift(off) {
      for (const b of birds) b.pos.sub(off);
    },
    /** Compile the bird's shaders now, not mid-journey when the first flock appears. */
    precompile(gl, camera) {
      birds[0].obj.visible = true;
      gl.compileAsync?.(group, camera).catch(() => {});
      birds[0].obj.visible = birds[0].active;
    },
    dispose() {
      for (const b of birds) b.mixer?.stopAllAction();
      for (const m of materials.values()) m.dispose();
    },
  };
}

function Flock({ world, gltf }) {
  const flock = useMemo(() => createFlock(gltf), [gltf]);
  const gl = useThree((s) => s.gl);
  const camera = useThree((s) => s.camera);
  useEffect(() => world.onRebase((off) => flock.shift(off)), [world, flock]);
  useEffect(() => () => flock.dispose(), [flock]);
  useEffect(() => flock.precompile(gl, camera), [flock, gl, camera]);
  useFrame((state, delta) => flock.update(Math.min(delta, 1 / 20), state.camera));
  return <primitive object={flock.group} />;
}

export default function Crows({ world }) {
  const [gltf, setGltf] = useState(null);
  useEffect(() => {
    let alive = true;
    fetch(CROWS.url, { method: "HEAD" })
      .then((r) => (r.ok && !/text\/html/.test(r.headers.get("content-type") || "") ? new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).loadAsync(CROWS.url) : null))
      .then((g) => alive && g && setGltf(g))
      .catch(() => {}); // no model: no crows
    return () => {
      alive = false;
    };
  }, []);
  return gltf ? <Flock world={world} gltf={gltf} /> : null;
}
