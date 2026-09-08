import { CHARACTER_PIXEL_SIZE } from "./pixel-scale"
export const TERRAIN_EDGE_GRAIN_URL = "/textures/terrain-edge-grain-v1.png"
export const TERRAIN_EDGE_GLSL = /* glsl */ `
  uniform sampler2D terrainEdgeGrain;
  vec3 terrainGrain(vec2 world) {
    vec2 pixel = floor(world / ${CHARACTER_PIXEL_SIZE});
    return texture2D(terrainEdgeGrain, (pixel + 0.5) / 128.0).rgb;
  }
  // A shared displacement gives hard stippled boundaries without bright seams
  // between identical neighbours. Artwork itself stays on its native pixel grid.
  vec2 terrainPaintWorld(vec2 world) {
    return world + (terrainGrain(world).rg - 0.5) * ${6 * CHARACTER_PIXEL_SIZE};
  }
`
