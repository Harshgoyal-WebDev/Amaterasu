"use client";

import { useEffect } from "react";
import { useThree } from "@react-three/fiber";

const TEXTURE_KEYS = ["map", "normalMap", "roughnessMap", "metalnessMap", "aoMap", "emissiveMap"];

/**
 * Mounted after the journey assets (rocks, boulder) have loaded, while the
 * user is still in the hero: uploads their textures and compiles their
 * shaders in the background, so nothing stalls the first frame they appear
 * mid-scroll. Objects hidden by the journey are briefly marked visible for
 * the compile (it happens synchronously) and restored straight after.
 */
export default function JourneyWarmup() {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera);

  useEffect(() => {
    const hidden = [];
    scene.traverse((o) => {
      if (!o.visible) {
        hidden.push(o);
        o.visible = true;
      }
      const materials = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
      for (const m of materials) {
        for (const key of TEXTURE_KEYS) if (m[key]) gl.initTexture(m[key]);
        if (m.uniforms) for (const u of Object.values(m.uniforms)) if (u.value?.isTexture) gl.initTexture(u.value);
      }
    });
    const done = gl.compileAsync(scene, camera);
    for (const o of hidden) o.visible = false;
    done.catch(() => {}); // a failed warm-up only means compiling on first use
  }, [gl, scene, camera]);

  return null;
}
