/**
 * Per-tile records the terrain shader looks up, stacked as map-sized layers in
 * one float texture so they share a single texture unit (the terrain program
 * sits close to the 16-unit limit common on desktop GPUs).
 */
export const TERRAIN_RECORD_LAYER = {
  /** Ground paint: rgb palette colour, a = paint code (see groundPaintCode). */
  ground: 0,
  /** Water colour and the packed depth corner, wet flag and shoreline bits. */
  water: 1,
  /** Dirt-floor mask (see dirtFloorMask), each byte stored as byte / 255. */
  floor: 2,
} as const
export const TERRAIN_RECORD_LAYERS = 3

/** Packed water/shore records are shared by terrain paint and ripple clipping. */
export const TERRAIN_WATER_GLSL = /* glsl */ `
  uniform sampler2D terrainRecords;
  uniform vec2 groundPaletteSize;
  // Fetching the clamped cell reads exactly the texel a nearest, clamp-to-edge
  // lookup of a separate map-sized texture would, without bleeding between layers.
  vec4 terrainRecord(vec2 cell, float layer) {
    vec2 texel = clamp(cell, vec2(0.0), groundPaletteSize - 1.0);
    return texelFetch(terrainRecords, ivec2(texel) + ivec2(0, int(layer * groundPaletteSize.y)), 0);
  }
  vec4 waterRecord(vec2 cell) {
    return terrainRecord(cell, ${TERRAIN_RECORD_LAYER.water}.0);
  }
  float terrainWaterCover(vec2 world, float donor) {
    vec2 grid = terrainPaintWorld(world) + groundPaletteSize * 0.5;
    vec2 cell = floor(grid), local = fract(grid);
    if (donor > 0.5) {
      float index = donor - 1.0;
      return step(8.0, mod(waterRecord(vec2(mod(index, groundPaletteSize.x), floor(index / groundPaletteSize.x))).a, 16.0));
    }
    float code = waterRecord(cell).a;
    float wet = step(8.0, mod(code, 16.0));
    vec4 corners = mod(floor(floor(code / 16.0) / vec4(1.0, 2.0, 4.0, 8.0)), 2.0);
    if (shorelineInset(local, corners) > 0.0) wet = 1.0 - wet;
    return wet;
  }
`
