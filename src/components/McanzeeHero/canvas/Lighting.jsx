"use client";

import { LIGHTS } from "../config";
import { useConfigVersion } from "../controls/configStore";

/**
 * Four lights total: hemisphere ambient, a back/top key, a soft front fill.
 * The blue lens light lives in <Lens /> so it moves with the lens.
 * No shadow maps — composition and fog do that job for a fraction of the cost.
 */
export default function Lighting() {
  useConfigVersion("LIGHTS"); // re-render on panel edits
  const { hemisphere, key, fill } = LIGHTS;
  return (
    <>
      <hemisphereLight args={[hemisphere.sky, hemisphere.ground, hemisphere.intensity]} />
      <directionalLight color={key.color} intensity={key.intensity} position={key.position} />
      <directionalLight color={fill.color} intensity={fill.intensity} position={fill.position} />
    </>
  );
}
