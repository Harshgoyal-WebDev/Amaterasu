"use client";

import { useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import { LAYERS, MODEL } from "../config";
import { heroState } from "../state";
import { requestShadowUpdate } from "./shadows";
import { applyStoneDetail, isStoneMaterial, syncStoneDetail } from "./stoneDetail";

/**
 * The Blender environment (corridor, hollow portal, pipes, rubble), used
 * as-is. Materials are baked PBR textures; this only switches on shadows,
 * sharpens textures seen at grazing angles, and puts the portal stones on
 * the reflection layer so the water can mirror them (lit violet). Masonry,
 * ground and rock get a procedural detail pass (stoneDetail.js).
 * Repeated rocks / brackets arrive as GPU instances (EXT_mesh_gpu_instancing).
 */
export default function PortalModel({ shadows = true, onReady }) {
  // Meshopt-compressed (decoded locally by drei), no Draco.
  const { scene } = useGLTF(MODEL.url, false, true);
  const gl = useThree((s) => s.gl);

  useEffect(() => {
    const anisotropy = Math.min(8, gl.capabilities.getMaxAnisotropy());
    scene.traverse((object) => {
      if (!object.isMesh) return;
      object.castShadow = shadows;
      object.receiveShadow = shadows;
      if (object.name.startsWith("PRT_") || object.parent?.name.startsWith("PRT_")) {
        object.layers.enable(LAYERS.reflection);
      }
      const material = object.material;
      if (isStoneMaterial(material)) applyStoneDetail(material);
      for (const key of ["map", "normalMap", "roughnessMap", "metalnessMap"]) {
        if (material[key]) {
          material[key].anisotropy = anisotropy;
          material[key].needsUpdate = true;
        }
      }
    });
    requestShadowUpdate(); // shadow maps are static: render them once now
    onReady?.();
  }, [scene, gl, shadows, onReady]);

  const root = useRef(null);
  useFrame(() => {
    // past the portal the corridor is behind the camera
    root.current.visible = heroState.journey.hero;
    if (root.current.visible) syncStoneDetail();
  });

  return (
    <group ref={root}>
      <primitive object={scene} />
    </group>
  );
}

useGLTF.preload(MODEL.url, false, true);
