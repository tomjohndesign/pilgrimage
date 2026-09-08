/** Packed water/shore records are shared by terrain paint and ripple clipping. */
export const TERRAIN_WATER_GLSL = /* glsl */ `
  uniform sampler2D waterPalette;
  uniform vec2 groundPaletteSize;
  vec4 waterRecord(vec2 cell) {
    return texture2D(waterPalette, (clamp(cell, vec2(0.0), groundPaletteSize - 1.0) + 0.5) / groundPaletteSize);
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
