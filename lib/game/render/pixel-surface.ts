import { CHARACTER_PIXEL_SIZE } from "./pixel-scale"
import { pixelNoiseTexture, PIXEL_NOISE_SIZE } from "./pixel-noise"

/** Shared live art controls and one resident noise lookup for every surface. */
export const surfaceAppearanceUniforms = {
  terrainTexture: { value: 1 },
  terrainInclineStyle: { value: 1 },
  surfaceNoiseMap: { value: pixelNoiseTexture },
}

/** Sample once per shaded pixel, then reuse grain, threshold and footprint. */
export const PIXEL_SURFACE_GLSL = /* glsl */ `
  uniform float terrainTexture;
  uniform float terrainInclineStyle;
  uniform sampler2D surfaceNoiseMap;
  // Existing terrain placement motifs retain their original deterministic hash.
  float tileHash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
  }
  vec2 surfacePixel(vec2 surface) {
    return floor(floor(surface / ${CHARACTER_PIXEL_SIZE} * 256.0 + 0.5) / 256.0);
  }
  float surfacePixelVisibility(vec2 world) {
    vec2 dx = dFdx(world), dy = dFdy(world);
    float footprint = sqrt(abs(dx.x * dy.y - dx.y * dy.x)) / ${CHARACTER_PIXEL_SIZE};
    return 1.0 - smoothstep(1.5, 3.0, footprint);
  }
  float surfaceBayer2(vec2 pixel) {
    vec2 bit = mod(pixel, 2.0);
    return 2.0 * bit.x + 3.0 * bit.y - 4.0 * bit.x * bit.y;
  }
  float surfaceOrderedThreshold(vec2 pixel) {
    return (4.0 * surfaceBayer2(pixel) + surfaceBayer2(floor(pixel / 2.0)) + 0.5) / 16.0;
  }
  vec4 surfaceNoise(vec2 pixel) {
    return texture2D(surfaceNoiseMap, (mod(pixel, ${PIXEL_NOISE_SIZE}.0) + 0.5) / ${PIXEL_NOISE_SIZE}.0);
  }
  // Effects only need a threshold, without the surface footprint or grain work.
  float surfaceThreshold(vec2 pixel) {
    if (terrainInclineStyle > 1.5) return surfaceOrderedThreshold(pixel);
    return (surfaceNoise(pixel).a * 255.0 + 0.5) / 256.0;
  }
  struct SurfaceSample { float visibility; float threshold; vec3 noise; };
  SurfaceSample sampleSurface(vec2 surface, vec2 pixel) {
    SurfaceSample result;
    result.visibility = surfacePixelVisibility(surface);
    result.threshold = 0.5;
    result.noise = vec3(0.0);
    if (result.visibility <= 0.0 || (terrainTexture <= 0.0 && terrainInclineStyle < 0.5)) return result;
    vec4 noise = surfaceNoise(pixel);
    result.noise = noise.rgb - 0.5;
    result.threshold = terrainInclineStyle > 1.5 ? surfaceOrderedThreshold(pixel) : (noise.a * 255.0 + 0.5) / 256.0;
    return result;
  }
  float surfaceGrain(SurfaceSample detailSample, float water) {
    if (detailSample.visibility <= 0.0 || terrainTexture <= 0.0) return 1.0;
    float detail = detailSample.noise.r * 0.065 + mix(detailSample.noise.g * 0.095, detailSample.noise.b * 0.07, water);
    return 1.0 + detail * terrainTexture * detailSample.visibility;
  }
  // Used for the authored canopy shade of baked tree sprites, not per live light.
  float surfaceDitherLight(float light, float level, SurfaceSample detailSample) {
    if (terrainInclineStyle < 0.5 || detailSample.visibility <= 0.0) return light;
    float band = floor((light - level) / 0.16);
    float low = clamp(level + band * 0.16, 0.0, 1.0);
    float high = clamp(level + (band + 1.0) * 0.16, 0.0, 1.0);
    float coverage = floor(clamp((light - low) / max(high - low, 0.0001), 0.0, 1.0) * 1024.0 + 0.5) / 1024.0;
    return mix(light, mix(low, high, step(detailSample.threshold, coverage)), detailSample.visibility);
  }
  // Quantize the combined illumination once, preserving hue and mean luminance.
  vec3 surfaceDitherColor(vec3 color, SurfaceSample detailSample) {
    if (terrainInclineStyle < 0.5 || detailSample.visibility <= 0.0) return color;
    float luma = dot(color, vec3(0.2126, 0.7152, 0.0722));
    if (luma < 0.0001) return color;
    float tone = floor(sqrt(luma) * 40.0);
    vec2 bounds = vec2(tone, tone + 1.0) / 40.0;
    bounds *= bounds;
    float coverage = (luma - bounds.x) / (bounds.y - bounds.x);
    float quantized = mix(bounds.x, bounds.y, step(detailSample.threshold, coverage));
    return color * mix(1.0, quantized / luma, detailSample.visibility);
  }
`
