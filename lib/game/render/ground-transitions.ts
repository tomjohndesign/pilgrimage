import { GROUND_UV_SCALE } from "./ground-surface"
import { TERRAIN_RECORD_LAYER } from "./terrain-water"

/** Shared by plain ground, road verges and the dry corners painted into water. */
export const GROUND_TRANSITIONS_GLSL = /* glsl */ `
  // Reads the ground layer of the shared terrain records (TERRAIN_WATER_GLSL).
  uniform sampler2D sandMap;
  vec4 groundRecord(vec2 cell) {
    return terrainRecord(cell, ${TERRAIN_RECORD_LAYER.ground}.0);
  }
  vec3 waterSurface(vec2 world, float donor, SurfaceSample detail) {
    vec2 grid = terrainPaintWorld(world) + groundPaletteSize * .5;
    vec2 cell = floor(grid), local = fract(grid);
    if (donor > .5) {
      float index = donor - 1.0;
      cell = vec2(mod(index, groundPaletteSize.x), floor(index / groundPaletteSize.x));
    }
    vec4 record = waterRecord(cell);
    float corner = mod(record.a, 8.0) - 1.0;
    if (donor < .5 && corner >= 0.0) {
      vec2 direction = vec2(corner < 2.0 ? 1.0 : -1.0, mod(corner, 2.0) < .5 ? 1.0 : -1.0);
      if (dot(local - .5, direction) > 0.0)
        record = waterRecord(cell + vec2(direction.x, 0.0));
    }
    return record.rgb * surfaceGrain(detail, 1.0);
  }
  vec3 groundSprite(vec4 record, vec3 grass, vec3 mineral, vec3 sand) {
    float kind = mod(record.a, 8.0);
    if (kind < .5) return grass * max(vec3(0.0), mix(vec3(1.0), record.rgb, grassShading));
    if (kind > 2.5) return sand * record.rgb;
    return mineral * record.rgb;
  }
  vec3 groundSurface(vec2 world, vec3 grass, float donor, SurfaceSample detail) {
    vec2 grid = terrainPaintWorld(world) + groundPaletteSize * .5;
    vec2 cell = floor(grid), local = fract(grid);
    vec4 record = groundRecord(cell);
    float corner = floor(record.a / 8.0) - 1.0;
    if (donor > .5) {
      float index = donor - 1.0;
      record = groundRecord(vec2(mod(index, groundPaletteSize.x), floor(index / groundPaletteSize.x)));
    } else if (corner >= 0.0) {
      vec2 direction = vec2(corner < 2.0 ? 1.0 : -1.0, mod(corner, 2.0) < .5 ? 1.0 : -1.0);
      // Stipple the shared boundary; never the border of each texture frame.
      if (dot(local - .5, direction) > 0.0) record = groundRecord(cell + vec2(direction.x, 0.0));
    }
    vec3 mineral = texture2D(groundMap, world * ${GROUND_UV_SCALE}).rgb;
    // The coloured sand asset is normalized to its own average before the
    // terrain palette supplies shade. Native texels stay the same size as grass.
    vec3 sand = texture2D(sandMap, world * ${GROUND_UV_SCALE}).rgb / vec3(0.651406, 0.508881, 0.234551);
    float grain = surfaceGrain(detail, 0.0);
    return groundSprite(record, grass, mineral * grain, sand * grain);
  }
  vec3 groundSurface(vec2 world, vec3 grass, SurfaceSample detail) { return groundSurface(world, grass, 0.0, detail); }
`
