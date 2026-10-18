"use client";

import { useEffect } from "react";
import { useThree } from "@react-three/fiber";
import { RENDERER } from "../config";
import { useConfigVersion } from "../controls/configStore";

/** Applies RENDERER edits to the live renderer / camera. */
export default function RendererSync() {
  const get = useThree((s) => s.get);
  const version = useConfigVersion("RENDERER");

  useEffect(() => {
    const { gl, camera } = get();
    gl.toneMappingExposure = RENDERER.exposure;
    camera.near = RENDERER.near;
    camera.far = RENDERER.far;
    camera.updateProjectionMatrix();
  }, [get, version]);

  return null;
}
