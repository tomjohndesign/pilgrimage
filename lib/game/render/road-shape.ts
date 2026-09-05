/**
 * Road coverage in tile-local XZ. Opposite entrances share a straight track;
 * adjacent entrances share a radius-0.5 arc tangent to both tile boundaries.
 * Taking the union of each track's ruts lets wheels wear through the grass
 * median when paths cross, without drawing an edge through the junction.
 * Junctions have a worn apron and rounded shoulders extending onto grass.
 *
 * Returns (bare coverage, distance inward from the combined road boundary).
 * Connections use +x, -x, +z, -z; filled corners use ++, +-, -+, --.
 */
export const ROAD_SHAPE_GLSL = /* glsl */ `
  vec2 roadStrip(float distanceToTrack, float edge, float inner, float roughness) {
    float d = 0.5 - distanceToTrack;
    float dn = d + roughness;
    float outer = smoothstep(edge - 0.06, edge + 0.12, dn);
    float middle = smoothstep(inner - 0.06, inner + 0.04, dn);
    return vec2(outer * (1.0 - middle), d);
  }

  // Keep the two nearest tracks so their shoulders can be rounded together.
  // Sorting distances makes the result independent of entrance/rotation order.
  vec3 addRoadStrip(vec3 shape, vec2 strip) {
    return vec3(max(shape.x, strip.x), max(shape.y, strip.y), max(shape.z, min(shape.y, strip.y)));
  }

  vec2 roadShoulder(vec2 p, vec2 corner, float code, float edge, float roughness) {
    if (code < 0.5) return vec2(0.0, -1.0);
    vec2 direction = vec2(code < 2.5 ? 1.0 : -1.0, mod(code, 2.0) > 0.5 ? 1.0 : -1.0);
    vec2 q = (p - corner) * direction;
    vec2 inset = q + edge;
    // A concave circular curb, tangent to both verges. Limit the footprint
    // to this corner so it cannot spread into another lane or grass median.
    float radius = 0.45;
    float depth = min(radius - max(inset.x, inset.y), length(inset - radius) - radius);
    depth = min(depth, 0.48 - max(abs(q.x), abs(q.y)));
    return vec2(smoothstep(-0.06, 0.12, depth + roughness), depth + edge);
  }

  vec2 roadShoulders(vec2 p, vec4 corners, float edge, float roughness) {
    vec2 shape = roadShoulder(p, vec2(1.0, 1.0), corners.x, edge, roughness);
    shape = max(shape, roadShoulder(p, vec2(1.0, 0.0), corners.y, edge, roughness));
    shape = max(shape, roadShoulder(p, vec2(0.0, 1.0), corners.z, edge, roughness));
    return max(shape, roadShoulder(p, vec2(0.0, 0.0), corners.w, edge, roughness));
  }

  vec2 roadShape(vec2 p, vec4 connected, vec4 filledCorners, float edge, float inner, float roughness) {
    vec3 shape = vec3(0.0, -1.0, -1.0);
    if (connected.x * connected.y > 0.5)
      shape = addRoadStrip(shape, roadStrip(abs(p.y - 0.5), edge, inner, roughness));
    if (connected.z * connected.w > 0.5)
      shape = addRoadStrip(shape, roadStrip(abs(p.x - 0.5), edge, inner, roughness));
    if (connected.x * connected.z > 0.5)
      shape = addRoadStrip(shape, roadStrip(abs(length(p - vec2(1.0, 1.0)) - 0.5), edge, inner, roughness));
    if (connected.x * connected.w > 0.5)
      shape = addRoadStrip(shape, roadStrip(abs(length(p - vec2(1.0, 0.0)) - 0.5), edge, inner, roughness));
    if (connected.y * connected.z > 0.5)
      shape = addRoadStrip(shape, roadStrip(abs(length(p - vec2(0.0, 1.0)) - 0.5), edge, inner, roughness));
    if (connected.y * connected.w > 0.5)
      shape = addRoadStrip(shape, roadStrip(abs(length(p) - 0.5), edge, inner, roughness));

    float entrances = dot(connected, vec4(1.0));
    if (entrances > 2.5) {
      // Turning traffic fans out at the mouth of a junction. Round the union
      // of its shoulders and wear an apron through the crossing wheel tracks,
      // rather than preserving overlapping grass medians as tiny islands.
      // Both effects fade out before the tile boundary, matching every lane.
      float boundary = min(min(p.x, p.y), min(1.0 - p.x, 1.0 - p.y));
      float fade = smoothstep(0.0, 0.2, boundary);
      float rounding = 0.22 * fade;
      float h = max(rounding - (shape.y - shape.z), 0.0) / max(rounding, 0.00001);
      float rounded = shape.y + h * h * rounding * 0.25;
      float oldOuter = smoothstep(edge - 0.06, edge + 0.12, shape.y + roughness);
      float outer = smoothstep(edge - 0.06, edge + 0.12, rounded + roughness);
      shape.x = max(shape.x, outer - oldOuter);
      shape.y = rounded;

      // For a T, bias the apron toward the side road; the main road's far
      // verge remains intact. A crossroads wears evenly around its centre.
      vec2 branch = vec2(connected.x - connected.y, connected.z - connected.w);
      vec2 local = p - 0.5 - branch * 0.06;
      float radius = length(local) / 0.46;
      float apron = (1.0 - smoothstep(0.2, 1.0, radius)) * fade;
      shape.x = mix(shape.x, outer, apron);
    }

    // Rounded ends, including a lone road tile, stop at the tile centre.
    if (entrances < 1.5) {
      vec2 direction = vec2(connected.x - connected.y, connected.z - connected.w);
      vec2 local = p - 0.5;
      float along = clamp(dot(local, direction), 0.0, 0.5);
      shape.xy = roadStrip(length(local - direction * along), edge, inner, roughness);
    }

    // A 2x2 road patch is continuous ground, not four separate curves with a
    // grass pinhole where they meet. Each tile agrees on the shared corner.
    vec2 local = p - 0.5;
    float fill = -1.0;
    if (filledCorners.x > 0.5) fill = max(fill, min(local.x, local.y));
    if (filledCorners.y > 0.5) fill = max(fill, min(local.x, -local.y));
    if (filledCorners.z > 0.5) fill = max(fill, min(-local.x, local.y));
    if (filledCorners.w > 0.5) fill = max(fill, min(-local.x, -local.y));
    shape.xy = max(shape.xy, vec2(smoothstep(-0.06, 0.06, fill), fill + edge));
    return shape.xy;
  }
`
