"use client";

import { useRef, useEffect, useState, Suspense, useMemo } from "react";
import { Canvas, useFrame, useThree, extend } from "@react-three/fiber";
import * as THREE from "three";
import { KTX2Loader } from "three/examples/jsm/loaders/KTX2Loader";
import BrainBlob from "@/components/Ametrasu/BrainBlob";

class ParallaxDepthMaterial extends THREE.ShaderMaterial {
  constructor() {
    super({
      transparent: true,
      depthWrite: false,
      uniforms: {
        uColor: { value: null },
        uDepth: { value: null },
        uNormal: { value: null },
        uScan: { value: null },
        uMouse: { value: new THREE.Vector2(0, 0) },
        uParallax: { value: 0.04 },
        uHasDepth: { value: 0.0 },
        uHasNormal: { value: 0.0 },
        uHasScan: { value: 0.0 },
        uHasColor: { value: 0.0 },
        uAmbientColor: { value: new THREE.Color(1, 1, 1) },
        uAmbientIntensity: { value: 0.4 },
        uLightColor: { value: new THREE.Color(0.659, 0.847, 1.0) },
        uLightIntensity: { value: 0.8 },
        uDirLightColor: { value: new THREE.Color(1, 1, 1) },
        uDirLightIntensity: { value: 1.0 },
        uDirLightDir: { value: new THREE.Vector3(0.4, 0.6, 0.6) },
        uDirLightSpecular: { value: 64.0 },
        uOpacity: { value: 1.0 },
      },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform sampler2D uColor;
        uniform sampler2D uDepth;
        uniform sampler2D uNormal;
        uniform sampler2D uScan;
        uniform vec2 uMouse;
        uniform float uParallax;
        uniform float uHasDepth;
        uniform float uHasNormal;
        uniform float uHasScan;
        uniform float uHasColor;
        uniform vec3 uAmbientColor;
        uniform float uAmbientIntensity;
        uniform vec3 uLightColor;
        uniform float uLightIntensity;
        uniform vec3 uDirLightColor;
        uniform float uDirLightIntensity;
        uniform vec3 uDirLightDir;
        uniform float uOpacity;
        varying vec2 vUv;

        void main() {
          float depth = 0.5;
          if (uHasDepth > 0.5) depth = texture2D(uDepth, vUv).r;

          vec2 warpedUv = clamp(vUv - (uMouse * depth * uParallax), 0.001, 0.999);

          if (uHasColor < 0.5) discard;

          vec4 col = texture2D(uColor, warpedUv);
          vec3 lightContrib = vec3(0.0);

          if (uHasNormal > 0.5) {
            vec3 nrm = normalize(texture2D(uNormal, warpedUv).rgb * 2.0 - 1.0);
            vec3 mouseDir = normalize(vec3(uMouse.x * 1.5, uMouse.y * 1.5, 1.0));
            float mDiff = max(dot(nrm, mouseDir), 0.0);
            lightContrib += uLightColor * uLightIntensity * mDiff;

            float dDiff = max(dot(nrm, uDirLightDir), 0.0);
            lightContrib += uDirLightColor * uDirLightIntensity * dDiff;
          }

          col.rgb *= (uAmbientColor * uAmbientIntensity + lightContrib);

          if (uHasScan > 0.5) {
            col.rgb += uDirLightColor * texture2D(uScan, warpedUv).r * 0.1;
          }

          col.a *= uOpacity;
          gl_FragColor = col;
        }
      `,
    });
  }
}
extend({ ParallaxDepthMaterial });

let _ktx2 = null;

function useKTX2(path, gl) {
  const [tex, setTex] = useState(null);

  useEffect(() => {
    if (!path || !gl) return;

    let mounted = true;

    if (!_ktx2) {
      _ktx2 = new KTX2Loader().setTranscoderPath("/basis/").detectSupport(gl);
    }

    _ktx2.load(path, (t) => {
      if (!mounted) return;
      t.needsUpdate = true;
      setTex(t);
    });

    return () => {
      mounted = false;
    };
  }, [path, gl]);

  return tex;
}

function ParallaxScene({
  scrollProgress,
  blobOpacityRef,
  planeZoomRef,
  planeOpacityRef,
  ...props
}) {
  const matRef = useRef();
  const planeRef = useRef();
  const smoothMouse = useRef(new THREE.Vector2());
  const targetMouse = useRef(new THREE.Vector2());

  const { gl } = useThree();

  const tColor = useKTX2(props.colorMap, gl);
  const tDepth = useKTX2(props.depthMap, gl);
  const tNormal = useKTX2(props.normalMap, gl);
  const tScan = useKTX2(props.scanMap, gl);

  useEffect(() => {
    const onMove = (e) => {
      targetMouse.current.set(
        (e.clientX / window.innerWidth - 0.5) * 2,
        -((e.clientY / window.innerHeight - 0.5) * 2),
      );
    };

    window.addEventListener("mousemove", onMove, { passive: true });
    return () => window.removeEventListener("mousemove", onMove);
  }, []);

  useEffect(() => {
    if (!matRef.current) return;
    const u = matRef.current.uniforms;

    if (tColor) {
      u.uColor.value = tColor;
      u.uHasColor.value = 1;
    }
    if (tDepth) {
      u.uDepth.value = tDepth;
      u.uHasDepth.value = 1;
    }
    if (tNormal) {
      u.uNormal.value = tNormal;
      u.uHasNormal.value = 1;
    }
    if (tScan) {
      u.uScan.value = tScan;
      u.uHasScan.value = 1;
    }
  }, [tColor, tDepth, tNormal, tScan]);

  useEffect(() => {
    if (!matRef.current) return;
    matRef.current.uniforms.uParallax.value = props.parallaxStrength ?? 0.04;
  }, [props.parallaxStrength]);

  useFrame((_, delta) => {
    if (!matRef.current || !planeRef.current) return;

    smoothMouse.current.lerp(targetMouse.current, 1 - Math.exp(-9 * delta));
    matRef.current.uniforms.uMouse.value.copy(smoothMouse.current);

    const zoom = planeZoomRef?.current ?? 0;
    const opacity = planeOpacityRef?.current ?? 1;

    planeRef.current.position.z = THREE.MathUtils.lerp(
      planeRef.current.position.z,
      zoom * 4.3,
      1,
    );

    matRef.current.uniforms.uOpacity.value = opacity;
  });

  return (
    <Suspense fallback={null}>
      <mesh scale={1.01} ref={planeRef} position={[0.08, -0.22, 0]}>
        <planeGeometry args={[props.width ?? 3, props.height ?? 4]} />
        <parallaxDepthMaterial ref={matRef} />
      </mesh>

      <BrainBlob
        scrollProgress={scrollProgress}
        mouseRef={smoothMouse}
        baseBloomIntensity={props.baseBloomIntensity}
        hoverBloomIntensity={props.hoverBloomIntensity}
        hoverRadius={props.hoverRadius}
        noiseStrength={props.noiseStrength}
        particleSize={props.particleSize}
        coreParticleSize={props.coreParticleSize}
        mouseMoveStrength={props.mouseMoveStrength}
        position={props.blobPosition ?? [-0.35, 0.2, 0.04]}
        opacityRef={blobOpacityRef}
      />
    </Suspense>
  );
}

export default function ParallaxCard(props) {
  const [scroll, setScroll] = useState(0);

  useEffect(() => {
    const handle = () => {
      const maxScroll =
        document.documentElement.scrollHeight - window.innerHeight;
      setScroll(maxScroll > 0 ? window.scrollY / maxScroll : 0);
    };

    handle();
    window.addEventListener("scroll", handle, { passive: true });
    window.addEventListener("resize", handle);

    return () => {
      window.removeEventListener("scroll", handle);
      window.removeEventListener("resize", handle);
    };
  }, []);

  return (
    <div
      className={props.className}
      style={{
        width: "100vw",
        height: "100vh",
        position: "fixed",
        top: 0,
        left: 0,
        ...props.style,
      }}
    >
      <Canvas
        dpr={[1, 1.5]}
        gl={{
          alpha: true,
          antialias: true,
          powerPreference: "high-performance",
        }}
        camera={{ position: [0, 0, 5], fov: 40 }}
      >
        <ParallaxScene scrollProgress={scroll} {...props} />
      </Canvas>
    </div>
  );
}