import * as THREE from "three";

/**
 * Screen-space "stable fluids" solver (after Jos Stam; shader structure
 * adapted from Pavel Dobryakov's WebGL-Fluid-Simulation, MIT licence).
 *
 * Every frame: divergence → Jacobi pressure solve (from zero) → gradient
 * subtraction → advection of velocity and dye. The cursor injects
 * velocity + violet dye ("splats"). Particles read `velocity` to be carried
 * by the flow; the dye is the liquid thickness the glass effect refracts.
 *
 * Velocity is stored in sim-texels per second; multiply by `velocityTexel`
 * to get screen-UV per second.
 */

const vertex = /* glsl */ `
uniform vec2 texelSize;
varying vec2 vUv;
varying vec2 vL;
varying vec2 vR;
varying vec2 vT;
varying vec2 vB;
void main() {
  vUv = position.xy * 0.5 + 0.5;
  vL = vUv - vec2(texelSize.x, 0.0);
  vR = vUv + vec2(texelSize.x, 0.0);
  vT = vUv + vec2(0.0, texelSize.y);
  vB = vUv - vec2(0.0, texelSize.y);
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

const head = /* glsl */ `
precision highp float;
varying vec2 vUv;
varying vec2 vL;
varying vec2 vR;
varying vec2 vT;
varying vec2 vB;
`;

const shaders = {
  splat: `${head}
    uniform sampler2D uTarget;
    uniform float aspectRatio;
    uniform vec3 color;
    uniform vec2 point;
    uniform float radius;
    void main() {
      vec2 p = vUv - point;
      p.x *= aspectRatio;
      vec3 splat = exp(-dot(p, p) / radius) * color;
      gl_FragColor = vec4(texture2D(uTarget, vUv).xyz + splat, 1.0);
    }`,

  advection: `${head}
    uniform sampler2D uVelocity;
    uniform sampler2D uSource;
    uniform vec2 velocityTexel;
    uniform float dt;
    uniform float dissipation;
    void main() {
      vec2 coord = vUv - dt * texture2D(uVelocity, vUv).xy * velocityTexel;
      gl_FragColor = texture2D(uSource, coord) / (1.0 + dissipation * dt);
    }`,

  divergence: `${head}
    uniform sampler2D uVelocity;
    void main() {
      float L = texture2D(uVelocity, vL).x;
      float R = texture2D(uVelocity, vR).x;
      float T = texture2D(uVelocity, vT).y;
      float B = texture2D(uVelocity, vB).y;
      vec2 C = texture2D(uVelocity, vUv).xy;
      if (vL.x < 0.0) L = -C.x;
      if (vR.x > 1.0) R = -C.x;
      if (vT.y > 1.0) T = -C.y;
      if (vB.y < 0.0) B = -C.y;
      gl_FragColor = vec4(0.5 * (R - L + T - B), 0.0, 0.0, 1.0);
    }`,

  pressure: `${head}
    uniform sampler2D uPressure;
    uniform sampler2D uDivergence;
    void main() {
      float L = texture2D(uPressure, vL).x;
      float R = texture2D(uPressure, vR).x;
      float T = texture2D(uPressure, vT).x;
      float B = texture2D(uPressure, vB).x;
      float divergence = texture2D(uDivergence, vUv).x;
      gl_FragColor = vec4((L + R + B + T - divergence) * 0.25, 0.0, 0.0, 1.0);
    }`,

  // Precomputed "liquid glass" field at dye resolution, so the full-screen
  // pass only needs one read: xy = image offset (refraction),
  // z = specular highlight, w = edge (fresnel) — both masked to the liquid.
  glass: `${head}
    uniform sampler2D uDensity;
    uniform float refraction;
    uniform float normalScale;
    uniform vec2 texelSize;
    float thickness(vec2 p) {
      float d = texture2D(uDensity, p).r;
      return d / (1.0 + d);
    }
    void main() {
      vec2 e = texelSize * 3.0;
      float h = thickness(vUv);
      float tl = thickness(vUv + vec2(-e.x, e.y));
      float tc = thickness(vUv + vec2(0.0, e.y));
      float tr = thickness(vUv + vec2(e.x, e.y));
      float ml = thickness(vUv + vec2(-e.x, 0.0));
      float mr = thickness(vUv + vec2(e.x, 0.0));
      float bl = thickness(vUv + vec2(-e.x, -e.y));
      float bc = thickness(vUv + vec2(0.0, -e.y));
      float br = thickness(vUv + vec2(e.x, -e.y));
      vec2 grad = vec2((tr + 2.0 * mr + br) - (tl + 2.0 * ml + bl), (tl + 2.0 * tc + tr) - (bl + 2.0 * bc + br)) * 0.25;
      vec2 bend = -grad * refraction;
      vec3 N = normalize(vec3(-grad * normalScale * 10.0, 1.0));
      vec3 L = normalize(vec3(-0.45, 0.65, 0.62));
      float spec = pow(max(dot(reflect(-L, N), vec3(0.0, 0.0, 1.0)), 0.0), 48.0);
      float wet = smoothstep(0.01, 0.1, h);
      gl_FragColor = vec4(bend, spec * wet, clamp(1.0 - N.z, 0.0, 1.0) * wet);
    }`,

  gradient: `${head}
    uniform sampler2D uPressure;
    uniform sampler2D uVelocity;
    void main() {
      float L = texture2D(uPressure, vL).x;
      float R = texture2D(uPressure, vR).x;
      float T = texture2D(uPressure, vT).x;
      float B = texture2D(uPressure, vB).x;
      vec2 velocity = texture2D(uVelocity, vUv).xy - vec2(R - L, T - B);
      gl_FragColor = vec4(velocity, 0.0, 1.0);
    }`,
};

const clearColor = new THREE.Color();

/**
 * Once the cursor stops, the flow coasts for SETTLE_DELAY s, then eases out
 * at SETTLE_RATE (1/s) — so it reaches ~zero before the solver sleeps and
 * clears it, instead of vanishing (and snapping the particles) in one frame.
 */
const SETTLE_DELAY = 0.15;
const SETTLE_RAMP = 0.45;
const SETTLE_RATE = 4;
const SETTLED_AFTER = SETTLE_DELAY + SETTLE_RAMP + 7 / SETTLE_RATE; // ≈ e^-7 left

function makeTarget(w, h, filter) {
  return new THREE.WebGLRenderTarget(w, h, {
    type: THREE.HalfFloatType,
    format: THREE.RGBAFormat,
    minFilter: filter,
    magFilter: filter,
    wrapS: THREE.ClampToEdgeWrapping,
    wrapT: THREE.ClampToEdgeWrapping,
    depthBuffer: false,
    stencilBuffer: false,
  });
}

function makeDouble(w, h, filter) {
  const pair = { read: makeTarget(w, h, filter), write: makeTarget(w, h, filter) };
  pair.swap = () => {
    const t = pair.read;
    pair.read = pair.write;
    pair.write = t;
  };
  pair.dispose = () => {
    pair.read.dispose();
    pair.write.dispose();
  };
  return pair;
}

function resolutionFor(base, aspect) {
  const a = aspect < 1 ? 1 / aspect : aspect;
  const min = Math.round(base);
  const max = Math.round(base * a);
  return aspect >= 1 ? [max, min] : [min, max];
}

export class FluidSim {
  constructor(renderer, { resolution = 128, dyeResolution = 512, iterations = 20 } = {}) {
    this.renderer = renderer;
    this.resolution = resolution;
    this.dyeResolution = dyeResolution;
    this.iterations = iterations;
    this.aspect = 0;

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
    this.quad = new THREE.Mesh(geometry);
    this.quad.frustumCulled = false;
    this.scene = new THREE.Scene();
    this.scene.add(this.quad);
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

    this.materials = {};
    for (const [name, fragmentShader] of Object.entries(shaders)) {
      this.materials[name] = new THREE.ShaderMaterial({
        uniforms: {
          texelSize: { value: new THREE.Vector2() },
          uTarget: { value: null },
          aspectRatio: { value: 1 },
          color: { value: new THREE.Vector3() },
          point: { value: new THREE.Vector2() },
          radius: { value: 0 },
          uVelocity: { value: null },
          uSource: { value: null },
          velocityTexel: { value: new THREE.Vector2() },
          dt: { value: 0 },
          dissipation: { value: 0 },
          uPressure: { value: null },
          uDivergence: { value: null },
          uDensity: { value: null },
          refraction: { value: 0 },
          normalScale: { value: 0 },
        },
        vertexShader: vertex,
        fragmentShader,
        depthTest: false,
        depthWrite: false,
        blending: THREE.NoBlending,
        toneMapped: false,
      });
    }
    this.velocityTexel = new THREE.Vector2();
    this.dyeTexel = new THREE.Vector2();
    this.awake = false;
    this.idle = Infinity;
  }

  /** (Re)allocate buffers when the canvas aspect changes. */
  ensureSize(aspect) {
    if (Math.abs(aspect - this.aspect) < 0.01 && this.velocity) return;
    this.aspect = aspect;
    this.disposeTargets();
    const [sw, sh] = resolutionFor(this.resolution, aspect);
    const [dw, dh] = resolutionFor(this.dyeResolution, aspect);
    this.velocity = makeDouble(sw, sh, THREE.LinearFilter);
    this.dye = makeDouble(dw, dh, THREE.LinearFilter);
    this.pressureT = makeDouble(sw, sh, THREE.NearestFilter);
    this.divergenceT = makeTarget(sw, sh, THREE.NearestFilter);
    this.glassT = makeTarget(dw, dh, THREE.LinearFilter);
    this.velocityTexel.set(1 / sw, 1 / sh);
    this.dyeTexel.set(1 / dw, 1 / dh);
    this.clearTargets();
  }

  clearTargets() {
    this.clear([this.velocity.read, this.velocity.write, this.dye.read, this.dye.write, this.pressureT.read, this.pressureT.write, this.glassT]);
  }

  /** Fill targets with zeros. */
  clear(targets) {
    const r = this.renderer;
    const prev = r.getRenderTarget();
    r.getClearColor(clearColor);
    const alpha = r.getClearAlpha();
    r.setClearColor(0x000000, 0);
    for (const t of targets) {
      r.setRenderTarget(t);
      r.clear(true, false, false);
    }
    r.setRenderTarget(prev);
    r.setClearColor(clearColor, alpha);
  }

  blit(target, material, texel) {
    material.uniforms.texelSize.value.copy(texel);
    this.quad.material = material;
    this.renderer.setRenderTarget(target);
    this.renderer.render(this.scene, this.camera);
  }

  /** Inject velocity (dx, dy in sim units) and dye at screen uv (x, y). */
  splat(x, y, dx, dy, color, radius) {
    const m = this.materials.splat;
    const u = m.uniforms;
    u.aspectRatio.value = this.aspect;
    u.point.value.set(x, y);
    u.radius.value = this.aspect > 1 ? radius * this.aspect : radius;
    u.uTarget.value = this.velocity.read.texture;
    u.color.value.set(dx, dy, 0);
    this.blit(this.velocity.write, m, this.velocityTexel);
    this.velocity.swap();
    if (color) {
      u.uTarget.value = this.dye.read.texture;
      u.color.value.set(color.r, color.g, color.b);
      this.blit(this.dye.write, m, this.dyeTexel);
      this.dye.swap();
    }
  }

  step(dt, { dyeDissipation }, velocityDissipation) {
    const M = this.materials;
    const vt = this.velocityTexel;

    M.divergence.uniforms.uVelocity.value = this.velocity.read.texture;
    this.blit(this.divergenceT, M.divergence, vt);

    // Jacobi solve starts from zero pressure every frame
    this.clear([this.pressureT.read]);
    M.pressure.uniforms.uDivergence.value = this.divergenceT.texture;
    for (let i = 0; i < this.iterations; i++) {
      M.pressure.uniforms.uPressure.value = this.pressureT.read.texture;
      this.blit(this.pressureT.write, M.pressure, vt);
      this.pressureT.swap();
    }

    M.gradient.uniforms.uPressure.value = this.pressureT.read.texture;
    M.gradient.uniforms.uVelocity.value = this.velocity.read.texture;
    this.blit(this.velocity.write, M.gradient, vt);
    this.velocity.swap();

    const adv = M.advection.uniforms;
    adv.velocityTexel.value.copy(vt);
    adv.dt.value = dt;
    adv.uVelocity.value = this.velocity.read.texture;
    adv.uSource.value = this.velocity.read.texture;
    adv.dissipation.value = velocityDissipation;
    this.blit(this.velocity.write, M.advection, vt);
    this.velocity.swap();

    adv.uVelocity.value = this.velocity.read.texture;
    adv.uSource.value = this.dye.read.texture;
    adv.dissipation.value = dyeDissipation;
    this.blit(this.dye.write, M.advection, this.dyeTexel);
    this.dye.swap();
  }

  /** Build the liquid-glass field (offsets + highlight + edge) at dye res. */
  computeGlass({ refraction, normalScale }) {
    const m = this.materials.glass;
    const u = m.uniforms;
    u.uDensity.value = this.dye.read.texture;
    u.refraction.value = refraction;
    u.normalScale.value = normalScale;
    this.blit(this.glassT, m, this.dyeTexel);
  }

  /**
   * Run splats + a solver step (+ the glass field) without disturbing the main
   * render state. The solver sleeps once the trail has faded and the flow
   * has settled: buffers cleared, and nothing runs until the next cursor
   * move. Returns whether the fluid is currently awake.
   */
  update(dt, params, splats, glass, sleepAfter = 2) {
    if (splats.length) {
      this.idle = 0;
      this.awake = true;
    } else {
      this.idle += dt;
    }
    if (!this.awake) return false;

    const r = this.renderer;
    const prevTarget = r.getRenderTarget();
    const prevAutoClear = r.autoClear;
    r.autoClear = false;
    for (const s of splats) this.splat(s.x, s.y, s.dx, s.dy, s.color, s.radius);
    const k = Math.min(Math.max((this.idle - SETTLE_DELAY) / SETTLE_RAMP, 0), 1);
    this.step(dt, params, SETTLE_RATE * k * k * (3 - 2 * k));
    if (glass) this.computeGlass(glass);
    r.setRenderTarget(prevTarget);
    r.autoClear = prevAutoClear;

    if (this.idle > Math.max(sleepAfter, SETTLED_AFTER)) {
      this.clearTargets();
      this.awake = false;
    }
    return this.awake;
  }

  get glassTexture() {
    return this.glassT.texture;
  }

  get velocityTexture() {
    return this.velocity.read.texture;
  }

  get dyeTexture() {
    return this.dye.read.texture;
  }

  disposeTargets() {
    this.velocity?.dispose();
    this.dye?.dispose();
    this.pressureT?.dispose();
    this.divergenceT?.dispose();
    this.glassT?.dispose();
  }

  dispose() {
    this.disposeTargets();
    Object.values(this.materials).forEach((m) => m.dispose());
    this.quad.geometry.dispose();
  }
}
