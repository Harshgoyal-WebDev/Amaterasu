"use client";

import { useEffect, useMemo } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { LIGHTS } from "../config";
import { emitAudio, journey } from "../state";

const _fwd = new THREE.Vector3();
const _d = new THREE.Vector3();

/**
 * Lanterns are the light sources, but only a handful of real lights exist:
 * a fixed pool of point lights re-assigned every few frames to the nearest
 * LightAnchors (weighted towards what's ahead of the camera), fading in/out
 * so reassignment never pops. Everything else glows through emissive
 * materials. The light count never changes, so no shader ever recompiles.
 */
function createLanternLights(world, count) {
  const lights = Array.from({ length: count }, (_, i) => {
    const l = new THREE.PointLight(LIGHTS.color, 0, LIGHTS.distance, LIGHTS.decay);
    l.userData = { anchor: null, next: null, level: 0, phase: i * 2.399 };
    return l;
  });
  const fill = new THREE.PointLight("#ffa866", LIGHTS.cameraLight, LIGHTS.cameraLightDistance, 1.4);
  const ambient = new THREE.AmbientLight(LIGHTS.ambientColor, LIGHTS.ambientBase);
  const hemi = new THREE.HemisphereLight(LIGHTS.hemiSky, LIGHTS.hemiGround, LIGHTS.ambient);
  const under = new THREE.DirectionalLight(LIGHTS.underGlow, 0);
  under.position.set(0.35, -1, 0.25);
  const best = [];
  let frame = 0;
  let nextGutter = LIGHTS.flickerEvery[0];

  function assign(cam) {
    // nearest-N anchors, ahead preferred
    _fwd.set(0, 0, -1).applyQuaternion(cam.quaternion);
    best.length = 0;
    let worst = Infinity;
    world.forEachAnchor((a) => {
      _d.subVectors(a.p, cam.position);
      let score = _d.lengthSq();
      if (score > 3600) return;
      if (_d.dot(_fwd) < -1) score *= 3;
      score /= a.power * a.power;
      if (best.length < count) {
        best.push({ a, score });
        if (best.length === count) {
          best.sort((x, y) => x.score - y.score);
          worst = best[count - 1].score;
        }
      } else if (score < worst) {
        best[count - 1] = { a, score };
        best.sort((x, y) => x.score - y.score);
        worst = best[count - 1].score;
      }
    });
    // keep lights whose anchor is still wanted, hand the rest the free anchors
    const chosen = new Set(best.map((e) => e.a));
    const kept = new Set();
    for (const l of lights) if (l.userData.anchor && chosen.has(l.userData.anchor)) kept.add(l.userData.anchor);
    const free = best.map((e) => e.a).filter((a) => !kept.has(a));
    for (const l of lights) {
      const u = l.userData;
      u.next = u.anchor && kept.has(u.anchor) ? u.anchor : free.shift() || null;
    }
  }

  return {
    attach: (scene) => scene.add(ambient, hemi, under, fill, ...lights),
    detach: (scene) => scene.remove(ambient, hemi, under, fill, ...lights),
    update(state, delta) {
      const dt = Math.min(delta, 1 / 20);
      const cam = state.camera;
      fill.position.copy(cam.position);
      // open voids get a little warm sky so timber silhouettes read against the dark
      hemi.intensity = LIGHTS.ambient * (1 + 3.2 * journey.void);
      under.intensity = LIGHTS.underGlowIntensity * journey.void * journey.void;
      fill.intensity = LIGHTS.cameraLight * (1 + 0.8 * journey.void);
      fill.distance = LIGHTS.cameraLightDistance + 8 * journey.void;
      if (frame++ % 3 === 0) assign(cam);
      const t = state.clock.elapsedTime;

      // now and then the nearest lantern gutters, as if something passed it
      if (journey.started && t > nextGutter) {
        const [lo, hi] = LIGHTS.flickerEvery;
        nextGutter = t + lo + Math.random() * (hi - lo) * (journey.alive ? 0.6 : 1);
        let pick = null;
        for (const l of lights) if (l.userData.anchor && l.userData.level > 0.8 && (!pick || l.position.distanceToSquared(cam.position) < pick.position.distanceToSquared(cam.position))) pick = l;
        if (pick) {
          pick.userData.gutter = t;
          emitAudio("flicker", 0.9);
        }
      }
      const k = 1 - Math.exp(-dt * LIGHTS.fadeRate);
      for (const l of lights) {
        const u = l.userData;
        if (u.next !== u.anchor) {
          // fade out, then jump to the new anchor and fade back in
          u.level -= u.level * k;
          if (u.level < 0.03) {
            u.anchor = u.next;
            u.level = 0;
          }
        } else if (u.anchor) {
          u.level += (1 - u.level) * k;
        }
        if (u.anchor) l.position.copy(u.anchor.p);
        let flicker = 0.88 + 0.08 * Math.sin(t * 7.3 + u.phase) + 0.04 * Math.sin(t * 17.1 + u.phase * 2);
        const g = u.gutter != null ? t - u.gutter : 99;
        if (g < 1.1) flicker *= 0.2 + 0.8 * Math.abs(Math.sin(g * 31 + Math.sin(g * 57) * 2)) * (0.4 + 0.6 * (g / 1.1));
        l.intensity = u.anchor ? LIGHTS.intensity * u.level * u.anchor.power * flicker : 0;
      }
    },
    dispose() {
      lights.forEach((l) => l.dispose());
      fill.dispose();
      ambient.dispose();
      hemi.dispose();
      under.dispose();
    },
  };
}

export default function LanternLights({ world, count }) {
  const scene = useThree((s) => s.scene);
  const system = useMemo(() => createLanternLights(world, count), [world, count]);

  useEffect(() => {
    system.attach(scene);
    return () => {
      system.detach(scene);
      system.dispose();
    };
  }, [scene, system]);

  useFrame((state, delta) => system.update(state, delta));
  return null;
}
