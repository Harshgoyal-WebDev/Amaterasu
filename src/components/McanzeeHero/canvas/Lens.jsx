"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { MeshTransmissionMaterial, useFBO } from "@react-three/drei";
import * as THREE from "three";
import { COLORS, KNOBS, LENS, LIGHTS, SOUNDWAVE, getAperture } from "../config";
import { useConfigVersion } from "../controls/configStore";
import { FX_UNIFORMS } from "../fx";
import { heroState } from "../heroState";

const noop = () => {};

/**
 * Biconvex profile (two spherical caps meeting at a thin rim), revolved
 * around Y and turned so the optical axis is local Z.
 */
function createLensGeometry({ radius, bulge, edge, segments }) {
  const cap = radius * Math.max(bulge - edge, 0.001); // sag of each cap
  const rim = radius * edge;
  const sphere = (radius * radius + cap * cap) / (2 * cap); // cap sphere radius
  const steps = Math.max(Math.round(segments / 2), 4);
  const front = [];
  for (let i = 0; i <= steps; i++) {
    const r = radius * Math.sin((i / steps) * (Math.PI / 2)); // denser toward the rim
    front.push(new THREE.Vector2(r, rim + Math.sqrt(sphere * sphere - r * r) - (sphere - cap)));
  }
  const back = front.map((p) => new THREE.Vector2(p.x, -p.y));
  const profile = [...back, ...front.reverse()];
  return new THREE.LatheGeometry(profile, segments).rotateX(Math.PI / 2);
}

function createRimMaterial() {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    toneMapped: false,
    uniforms: {
      uColor: { value: new THREE.Color() },
      uIntensity: { value: 1 },
      uWidth: { value: 0.03 },
      uRadius: { value: 1 },
    },
    vertexShader: /* glsl */ `
      varying vec2 vPos;
      void main() {
        vPos = position.xy;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      uniform float uIntensity;
      uniform float uWidth;
      uniform float uRadius;
      varying vec2 vPos;
      void main() {
        float r = length(vPos) / uRadius;
        float core = exp(-pow((r - 1.0) / uWidth, 2.0));
        float bloom = exp(-abs(r - 1.0) / (uWidth * 4.0)) * 0.35;
        gl_FragColor = vec4(uColor, (core + bloom) * uIntensity);
        #include <colorspace_fragment>
      }
    `,
  });
}

/**
 * The portal's "convex lens": a glass disc in the aperture that refracts the
 * scene behind it (MeshTransmissionMaterial with chromatic dispersion), plus
 * a glowing rim and a blue light that spills onto the rocks and water.
 *
 * The refraction buffer is rendered here, once per frame, with the lens
 * hidden and the water's reflection pass frozen (it reuses last frame's
 * reflection) — so the lens costs one extra scene render, not two.
 */
export default function Lens({ tier }) {
  const mover = useRef(null);
  const glass = useRef(null);
  const rim = useRef(null);
  const light = useRef(null);
  const lake = useRef(null);
  const version = useConfigVersion("LENS", "ENV_MODEL", "LIGHTS", "COLORS");

  const aperture = getAperture();
  const radius = aperture.radius * LENS.fill;
  const position = aperture.center.map((v, i) => v + aperture.normal[i] * LENS.offset);
  // Local +Z = aperture axis (toward the camera side).
  const rotationY = Math.atan2(aperture.normal[0], aperture.normal[2]);
  const { bulge, edge, segments } = LENS;

  const settings = LENS.buffer[tier];
  const width = useThree((s) => s.size.width * s.viewport.dpr);
  const height = useThree((s) => s.size.height * s.viewport.dpr);
  const fbo = useFBO(Math.round(width * settings.scale), Math.round(height * settings.scale));

  const geometry = useMemo(
    () => createLensGeometry({ radius, bulge, edge, segments }),
    [radius, bulge, edge, segments],
  );
  const rimGeometry = useMemo(
    () => new THREE.RingGeometry(radius * 0.8, radius * 1.2, segments, 1),
    [radius, segments],
  );
  const rimMaterial = useMemo(() => createRimMaterial(), []);

  useEffect(() => {
    const u = rim.current.material.uniforms;
    u.uColor.value.set(LENS.rim.color);
    u.uWidth.value = LENS.rim.width;
    u.uRadius.value = radius;
  }, [radius, version]);

  useEffect(() => () => geometry.dispose(), [geometry]);
  useEffect(() => () => rimGeometry.dispose(), [rimGeometry]);
  useEffect(() => () => rimMaterial.dispose(), [rimMaterial]);

  useFrame(({ gl, scene, camera }) => {
    const glow = KNOBS.lensGlow * heroState.lensGlow;
    const flash =
      1 + SOUNDWAVE.lensFlash * KNOBS.soundwaveIntensity * Math.exp(-FX_UNIFORMS.uPulseAge.value * 3);

    mover.current.position.z = heroState.lensForward;
    mover.current.scale.setScalar(heroState.lensScale);
    rim.current.material.uniforms.uIntensity.value = LENS.rim.intensity * glow * flash;
    light.current.intensity = LIGHTS.lens.intensity * glow * (0.85 + 0.15 * flash);

    // Refraction buffer: everything except the lens itself. (Only the meshes
    // are hidden — hiding the light would change the light count and force
    // every material to recompile.) The water can be rebuilt by the panel,
    // so re-find it once it has left the scene.
    if (!lake.current?.parent) lake.current = scene.getObjectByName("lake") ?? null;
    const lakeHook = lake.current?.onBeforeRender;
    if (lake.current) lake.current.onBeforeRender = noop;
    glass.current.visible = rim.current.visible = false;
    gl.setRenderTarget(fbo);
    gl.render(scene, camera);
    gl.setRenderTarget(null);
    glass.current.visible = rim.current.visible = true;
    if (lake.current) lake.current.onBeforeRender = lakeHook;
  });

  return (
    <group position={position} rotation-y={rotationY}>
      <group ref={mover}>
        <mesh ref={glass} geometry={geometry}>
          <MeshTransmissionMaterial
            {...LENS.material}
            buffer={fbo.texture}
            samples={settings.samples}
            transmission={1}
          />
        </mesh>
        <mesh ref={rim} geometry={rimGeometry} material={rimMaterial} renderOrder={2} />
        <pointLight
          ref={light}
          color={COLORS.lensLight}
          distance={LIGHTS.lens.distance}
          decay={LIGHTS.lens.decay}
          // Just behind the glass: floods the tunnel and the rocks with blue
          // without leaving a specular dot on the lens's front face.
          position={[0, 0, -radius * 0.5]}
        />
      </group>
    </group>
  );
}
