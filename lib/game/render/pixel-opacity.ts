import type * as THREE from "three"
import { PIXEL_SURFACE_GLSL, surfaceAppearanceUniforms } from "./pixel-surface"

/** Smoke and glow fade by native-pixel coverage, sharing the scene's dither style. */
export function pixelOpacityShader(shader: Parameters<THREE.Material["onBeforeCompile"]>[0], pixels: { value: THREE.Vector2 }, seed: number | string = 0) {
  Object.assign(shader.uniforms, surfaceAppearanceUniforms, {
    effectPixels: pixels,
    effectSeed: { value: typeof seed === "number" ? seed : 0 },
  })
  shader.fragmentShader = shader.fragmentShader
    .replace("#include <common>", `#include <common>\n${PIXEL_SURFACE_GLSL}\nuniform vec2 effectPixels;\nuniform float effectSeed;`)
    .replace("#include <alphatest_fragment>", `
      if (diffuseColor.a < 0.001) discard;
      if (terrainInclineStyle > 0.5) {
        // Stabilize texel boundaries when a full sprite becomes a cropped quad.
        vec2 pixel = floor(floor(vMapUv * effectPixels * 256.0 + 0.5) / 256.0);
        float threshold = surfaceThreshold(pixel + ${typeof seed === "string" ? seed : "effectSeed"});
        float bands = diffuseColor.a / 0.45;
        diffuseColor.a = min(1.0, (floor(bands) + step(threshold, fract(bands))) * 0.45);
        if (diffuseColor.a < 0.001) discard;
      }
      #include <alphatest_fragment>`)
}
