
export const MAX_RIPPLES = 16;

export const waterVertex = /* glsl */ `
uniform mat4 uTextureMatrix;
varying vec3 vWorld;
varying vec4 vReflCoord;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWorld = w.xyz;
  vReflCoord = uTextureMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * viewMatrix * w;
}
`;

export const waterFragment = /* glsl */ `
uniform sampler2D tNoise;  // shared tileable noise (B channel = swell)
uniform float uTime;
uniform sampler2D uHeight;
uniform vec2  uHeightRange;     // decoded ground height range (m)
uniform vec4  uBounds;          // x0, x1, z0, z1
uniform float uLevel;
uniform sampler2D uReflection;
uniform float uHasReflection;
uniform vec2  uReflectionTexel;
uniform vec4  uRipples[${MAX_RIPPLES}];  // x, z, start time, strength
uniform float uRippleIntensity;
uniform float uRippleSpeed;
uniform float uRippleScale;
uniform float uRoughness;
uniform float uStretch;
uniform float uWaterIntensity;
uniform vec3  uDeep;
uniform vec3  uTint;
uniform vec3  uPortalCenter;
varying vec3 vWorld;
varying vec4 vReflCoord;

void main() {
  // ---- where is there water? (floor + rubble heights baked from the model)
  vec2 huv = vec2((vWorld.x - uBounds.x) / (uBounds.y - uBounds.x), (vWorld.z - uBounds.z) / (uBounds.w - uBounds.z));
  float ground = mix(uHeightRange.x, uHeightRange.y, texture2D(uHeight, huv).r);
  float depth = uLevel - ground;
  float mask = smoothstep(0.0, 0.01, depth);
  mask *= smoothstep(0.0, 0.05, huv.x) * smoothstep(1.0, 0.95, huv.x) * smoothstep(0.0, 0.015, huv.y) * smoothstep(1.0, 0.94, huv.y);
  if (mask < 0.002) discard;

  // ---- surface slope: barely-moving ambient swell + cursor / drip ripples
  vec2 xz = vWorld.xz;
  vec2 grad = vec2(0.0);
  float e = 0.06;
  float t = uTime * 0.22;
  // barely-moving swell from the noise texture (two drifting layers)
  vec2 q = xz * 0.11 + vec2(t * 0.05, t * 0.035);
  float h0 = texture2D(tNoise, q).b;
  grad.x += (texture2D(tNoise, q + vec2(e * 0.11, 0.0)).b - h0) / e * 0.012;
  grad.y += (texture2D(tNoise, q + vec2(0.0, e * 0.11)).b - h0) / e * 0.012;
  grad += vec2(cos(xz.x * 3.1 + uTime * 0.6), cos(xz.y * 2.3 - uTime * 0.45)) * 0.004;

  vec2 rgrad = vec2(0.0);
  for (int i = 0; i < ${MAX_RIPPLES}; i++) {
    vec4 r = uRipples[i];
    float age = uTime - r.z;
    if (age < 0.0 || age > 4.0 || r.w <= 0.0) continue;
    vec2 d = xz - r.xy;
    float dist = length(d) + 1e-4;
    float front = age * uRippleSpeed;
    float width = 0.16 + age * 0.12;
    float env = exp(-pow((dist - front) / width, 2.0)) * exp(-age * 1.05) * r.w;
    float phase = (dist - front) * uRippleScale;
    // d/dx of A·sin(phase): concentric rings travelling outwards
    rgrad += (d / dist) * cos(phase) * env * 0.075;
  }
  grad += rgrad * uRippleIntensity;
  vec3 N = normalize(vec3(-grad.x, 1.0, -grad.y));

  // ---- Fresnel (water F0 ≈ 0.02): strong at grazing angles near the portal
  vec3 V = normalize(cameraPosition - vWorld);
  float ndv = max(dot(N, V), 0.0);
  float fres = 0.02 + 0.98 * pow(1.0 - ndv, 5.0);

  // ---- surface roughness: patches of rougher water blur and dim the image
  float rough = smoothstep(0.3, 0.75, texture2D(tNoise, xz * 0.045 + 0.31).r) * uRoughness;

  // ---- planar reflection of the portal + energy, distorted by the ripples
  // and streaked vertically (longer streaks on rough patches)
  vec3 refl = vec3(0.0);
  if (uHasReflection > 0.5) {
    vec2 ruv = vReflCoord.xy / vReflCoord.w + N.xz * (0.09 + rough * 0.05);
    vec2 o = uReflectionTexel * (1.5 + 2.5 * clamp(length(vWorld - cameraPosition) / 18.0, 0.0, 1.0)) * (1.0 + rough * 2.0);
    vec2 sy = vec2(o.x * 0.5, o.y * 2.0 * (1.0 + uStretch));
    refl = texture2D(uReflection, ruv).rgb * 0.36
         + texture2D(uReflection, ruv + sy).rgb * 0.22
         + texture2D(uReflection, ruv - sy).rgb * 0.22
         + texture2D(uReflection, ruv + sy * 2.2).rgb * 0.1
         + texture2D(uReflection, ruv - sy * 2.2).rgb * 0.1;
    refl *= 1.0 - rough * 0.55;
  }

  // strongest near the portal, fading into darkness towards the viewer
  float nearPortal = smoothstep(4.5, -10.5, vWorld.z);
  float centre = exp(-pow(vWorld.x / 3.2, 2.0));
  vec3 col = uDeep * (0.55 + 0.45 * nearPortal);
  col += uTint * nearPortal * centre * 0.12;
  col += refl * fres * mix(0.12, 1.0, nearPortal * nearPortal) * 1.6; // fades towards the viewer
  col *= uWaterIntensity;

  // shallow edges let the dark stones show through
  float alpha = mask * mix(0.55, 0.93, smoothstep(0.0, 0.045, depth));
  gl_FragColor = vec4(col, alpha);
}
`;
