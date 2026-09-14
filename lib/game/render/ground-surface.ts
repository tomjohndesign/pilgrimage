import { GROWTH_CELL_PIXELS, GROWTH_CELL_SIZE, GROWTH_SPRITE_SIZE, GROWTH_ATLAS_COLUMNS, GROWTH_ATLAS_ROWS } from "../environment/ground-growth"
import { CHARACTER_PIXEL_SIZE } from "./pixel-scale"
import { SWARD_TEXTURE_REFERENCE } from "./ground-palette"

/** Shared by terrain and building previews: one source texel per character pixel. */
export const TERRAIN_SPRITE_SIZE = 128
export const GROUND_UV_SCALE = 1 / (TERRAIN_SPRITE_SIZE * CHARACTER_PIXEL_SIZE)
export const ROAD_UV_SCALE = GROUND_UV_SCALE
export const GRASS_UV_SCALE = GROUND_UV_SCALE
export const GRASS_TEXTURE_URL = "/textures/grass-sprites.png"
export const GROUND_SURFACE_GLSL = `
  uniform vec3 grassBaseColor;
  uniform float grassBrightness;
  uniform float grassSaturation;
  uniform float grassShading;
  uniform float grassCanopyShade;
  float tileHash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
  }
  float tileNoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(tileHash(i), tileHash(i + vec2(1.0, 0.0)), f.x),
      mix(tileHash(i + vec2(0.0, 1.0)), tileHash(i + vec2(1.0, 1.0)), f.x),
      f.y
    );
  }
  // Sample whole sprites on a shared world grid. Rotating and cross-fading
  // copies smears their shapes and changes the apparent pixel size.
  vec4 sampleTiled(sampler2D map, vec2 uv, vec2 world) {
    return texture2D(map, uv);
  }

  uniform sampler2D swardField;
  uniform vec2 swardFieldSize;
  uniform vec2 swardFieldOrigin;

  // Every tile evaluates the same neighbouring plant records, including stamps
  // anchored outside that tile. Colony edges come from habitat, not image borders.
  vec3 sampleSward(sampler2D map, vec2 world) {
    // Use the shared turf color, converted from sRGB to linear shader values.
    vec3 result = grassBaseColor;
    vec2 cell = floor(world / ${GROWTH_CELL_SIZE});
    // Atlas addresses jump between frames; derivatives must follow continuous
    // world coordinates or mip selection reveals the placement grid.
    vec2 gradientX = dFdx(world) / ${GROWTH_SPRITE_SIZE} / vec2(${GROWTH_ATLAS_COLUMNS}.0, ${GROWTH_ATLAS_ROWS}.0);
    vec2 gradientY = dFdy(world) / ${GROWTH_SPRITE_SIZE} / vec2(${GROWTH_ATLAS_COLUMNS}.0, ${GROWTH_ATLAS_ROWS}.0);
    for (int z = -1; z <= 1; z++) for (int x = -1; x <= 1; x++) {
      vec2 neighbour = cell + vec2(float(x), float(z));
      vec4 stamp;
      if (swardFieldSize.x > 0.5) {
        vec2 address = neighbour - swardFieldOrigin;
        if (any(lessThan(address, vec2(0.0))) || any(greaterThanEqual(address, swardFieldSize))) continue;
        stamp = texture2D(swardField, (address + 0.5) / swardFieldSize);
        if (stamp.a < 0.5) continue;
        stamp.xyz = floor(stamp.xyz * 255.0 + 0.5);
      } else {
        // Standalone building aprons use quiet turf, at the same pixel density.
        stamp = vec4(floor(vec2(tileHash(neighbour), tileHash(neighbour + 37.0)) * ${GROWTH_CELL_PIXELS}.0), mod(neighbour.x + neighbour.y, 3.0), 1.0);
      }
      vec2 anchor = (neighbour * ${GROWTH_CELL_PIXELS}.0 + stamp.xy) * ${CHARACTER_PIXEL_SIZE};
      vec2 local = (world - anchor) / ${GROWTH_SPRITE_SIZE} + 0.5;
      if (any(lessThan(local, vec2(0.0))) || any(greaterThanEqual(local, vec2(1.0)))) continue;
      vec2 frame = vec2(mod(stamp.z, ${GROWTH_ATLAS_COLUMNS}.0), ${GROWTH_ATLAS_ROWS - 1}.0 - floor(stamp.z / ${GROWTH_ATLAS_COLUMNS}.0));
      // Clamp within a frame so neighbouring atlas cells never bleed at its rim.
      local = clamp(local, vec2(0.5 / 32.0), vec2(1.0 - 0.5 / 32.0));
      vec4 plant = textureGrad(map, (frame + local) / vec2(${GROWTH_ATLAS_COLUMNS}.0, ${GROWTH_ATLAS_ROWS}.0), gradientX, gradientY);
      // Cool the atlas greens without tinting flowers, seed heads or bare soil.
      if (plant.g > plant.r * 1.02 && plant.g > plant.b * 1.08) {
        plant.rgb *= vec3(0.56, 0.80, 1.22);
      }
      // Keep plant shapes readable while easing their contrast against the turf.
      result = mix(result, plant.rgb, plant.a * 0.78);
    }
    float luminance = dot(result, vec3(0.2126, 0.7152, 0.0722));
    return max(vec3(0.0), mix(vec3(luminance), result, grassSaturation)) * grassBrightness;
  }

  // Tint the whole plant palette together, preserving the contrast of its leaves.
  vec3 swardColor(vec3 texel, vec4 overlay) {
    return texel * mix(vec3(1.0), overlay.rgb / vec3(${SWARD_TEXTURE_REFERENCE.toArray().join(",")}), overlay.a);
  }

// Soil grain uses the established character pixel grid in game and asset previews.
vec3 buildingDirtColor(vec3 color, vec2 world) {
  vec2 pixel = floor(world / ${CHARACTER_PIXEL_SIZE});
  vec2 ground = pixel * ${CHARACTER_PIXEL_SIZE};
  float grain = tileHash(pixel + 19.7);
  float damp = tileNoise(ground * 6.7);
  float shade = mix(.78, 1.10, damp);
  shade *= grain < .09 ? .67 : grain > .93 ? 1.20 : 1.0;
  return color * shade;
}

vec3 roadSurfaceColor(vec4 texel, float shade, vec4 overlay, vec3 tint) {
  return mix(texel.rgb * shade, overlay.rgb, overlay.a) * tint;
}
`
