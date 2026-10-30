"use client";

import { useEffect, useMemo } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { PALETTE } from "../config";
import { createBackgroundMaterial } from "../assets/materials";
import { createRng } from "../world/rng";

/**
 * Distant silhouettes (IC19 background set + a few towers) 120-420 m out in
 * every direction, including above and below. Instances live in a 900 m
 * volume that wraps around the camera, so the castle never ends; their
 * materials skip the scene fog and fade on their own, so wrapping (and any
 * instance passing too close) is invisible. Real parallax: far ones barely
 * move, nearer ones drift.
 */

const BOX = 900;
const SET = [
  ["IC19_BG_Tower_L", 1.2],
  ["IC19_BG_Tower_M", 1.4],
  ["IC19_BG_Tower_S", 1.2],
  ["IC19_BG_Block_Wide", 1.4],
  ["IC19_BG_Suspended_Cluster", 1.5],
  ["IC19_BG_Balcony_Row", 1.3],
  ["IC19_BG_Corridor_Distant", 0.8],
];

const _m = new THREE.Matrix4();
const _p = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _e = new THREE.Euler();

function createBackground(registry, count) {
  const rng = createRng(4242);
  const materials = new Map();
  const bgMat = (m) => {
    if (!materials.has(m)) materials.set(m, createBackgroundMaterial(m, PALETTE.fog));
    return materials.get(m);
  };
  const byName = new Map();
  for (let i = 0; i < count; i++) {
    const name = rng.weighted(SET);
    _e.set(rng.chance(0.12) ? Math.PI : rng.range(-0.08, 0.08), rng.range(0, Math.PI * 2), rng.chance(0.08) ? Math.PI / 2 : 0);
    const it = {
      base: new THREE.Vector3(rng.range(-BOX / 2, BOX / 2), rng.range(-BOX / 2, BOX / 2), rng.range(-BOX / 2, BOX / 2)),
      q: new THREE.Quaternion().setFromEuler(_e),
      s: rng.range(1.4, 3.2),
    };
    if (!byName.has(name)) byName.set(name, []);
    byName.get(name).push(it);
  }
  const groups = [];
  for (const [name, list] of byName) {
    if (!registry.has(name)) continue;
    const meshes = registry.get(name).flatParts.map((part) => {
      const im = new THREE.InstancedMesh(part.geometry, bgMat(part.material), list.length);
      im.frustumCulled = false;
      im.renderOrder = -2;
      return im;
    });
    groups.push({ list, meshes });
  }
  const all = groups.flatMap((g) => g.meshes);
  const last = new THREE.Vector3(1e9, 0, 0);
  let frame = 0;
  const wrap = (base, c) => c + ((((base - c + BOX / 2) % BOX) + BOX) % BOX) - BOX / 2;

  return {
    attach: (scene) => scene.add(...all),
    detach: (scene) => scene.remove(...all),
    update(camera) {
      // re-wrap only every few frames or when the camera has moved
      if (frame++ % 4 && camera.position.distanceToSquared(last) < 4) return;
      last.copy(camera.position);
      const c = camera.position;
      for (const { list, meshes } of groups) {
        list.forEach((it, i) => {
          _p.set(wrap(it.base.x, c.x), wrap(it.base.y, c.y), wrap(it.base.z, c.z));
          _m.compose(_p, _q.copy(it.q), _s.setScalar(it.s));
          for (const im of meshes) im.setMatrixAt(i, _m);
        });
        for (const im of meshes) im.instanceMatrix.needsUpdate = true;
      }
    },
    dispose() {
      all.forEach((m) => m.dispose());
      materials.forEach((m) => m.dispose());
    },
  };
}

export default function BackgroundArchitecture({ registry, quality }) {
  const scene = useThree((s) => s.scene);
  const background = useMemo(() => createBackground(registry, quality.bgCount), [registry, quality.bgCount]);

  useEffect(() => {
    background.attach(scene);
    return () => {
      background.detach(scene);
      background.dispose();
    };
  }, [scene, background]);

  useFrame(({ camera }) => background.update(camera));
  return null;
}
