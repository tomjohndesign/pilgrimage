/** Shared by paths and dirt-floor previews: world-space sampling prevents tile seams. */
export const ROAD_UV_SCALE = .5
export const GRASS_UV_SCALE = 1 / 3
export const GROUND_SURFACE_GLSL = `
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
  // A seamless texture still repeats: sample it twice, the second copy
  // turned and rescaled so its repeats never line up with the first,
  // and let slow world noise pick between them. Alpha comes along, for
  // the road surfaces that let the ground show through.
  vec4 sampleTiled(sampler2D map, vec2 uv, vec2 world) {
    vec4 a = texture2D(map, uv);
    vec4 b = texture2D(map, mat2(0.6, 0.8, -0.8, 0.6) * uv * 0.83 + vec2(0.37, 0.61));
    float pick = tileNoise(world * 0.31) * 0.7 + tileNoise(world * 1.1) * 0.3;
    return mix(a, b, smoothstep(0.35, 0.65, pick));
  }

vec3 roadSurfaceColor(vec4 texel, float shade, vec4 overlay, vec3 tint) {
  return mix(texel.rgb * shade, overlay.rgb, overlay.a) * tint;
}
`
