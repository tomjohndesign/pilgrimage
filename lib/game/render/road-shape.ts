import { ROAD_CORNER_SHOULDER_RADIUS } from "../map/road"
import { DIRT_START, DIRT_FULL } from "./path-appearance"

/**
 * Road coverage in tile-local XZ. Opposite entrances share a straight track;
 * adjacent entrances share a radius-0.5 arc tangent to both tile boundaries.
 * Alternating bends straighten into diagonals, transitioning back to arcs
 * at their ends so the shared entrances remain continuous.
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
    float radius = ${ROAD_CORNER_SHOULDER_RADIUS.toFixed(2)};
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

  uniform sampler2D roadSegments;
  uniform vec2 roadSegmentTextureSize;

  vec4 roadSegmentTexel(float index) {
    vec2 uv = (vec2(mod(index, roadSegmentTextureSize.x), floor(index / roadSegmentTextureSize.x)) + 0.5) / roadSegmentTextureSize;
    return texture2D(roadSegments, uv);
  }

  vec2 diagonalRoadShape(vec2 p, vec2 range, float edgeNoise, float targetEdge, float roughness, out float segmentOpacity, out float grassWear) {
    vec2 distanceToTrack = vec2(100.0);
    float cartDistance = 100.0;
    float mainOpacity = 0.0, trackOpacity = 0.0, cartOpacity = 0.0;
    vec2 mainWear = vec2(0.0);
    vec2 trackWear = vec2(0.0);
    float localDistance = 100.0;
    vec4 localWear = vec4(0.0);
    vec2 contacts = vec2(0.0, -100.0);
    float contactOpacity = 0.0;
    grassWear = 0.0;
    for (int segment = 0; segment < int(range.y); segment++) {
      float index = range.x + float(segment) * 2.0;
      vec4 endpoints = roadSegmentTexel(index);
      vec4 wear = roadSegmentTexel(index + 1.0);
      vec2 along = endpoints.zw - endpoints.xy;
      float t = clamp(dot(p - endpoints.xy, along) / max(dot(along, along), 0.000001), 0.0, 1.0);
      float distance = length(p - endpoints.xy - along * t);
      if (wear.z > 3.5) {
        // Each segment is one actual foot lane or wheel, never a mirrored
        // pair. Union coverage so independently worn lanes retain their gap.
        vec2 contact = roadStrip(distance, wear.x + edgeNoise, 1.0, roughness);
        float dirt = smoothstep(${DIRT_START}, ${DIRT_FULL}, wear.y);
        grassWear = max(grassWear, contact.x * wear.w * (1.0 - dirt));
        contacts.x = max(contacts.x, contact.x * wear.w * dirt);
        if (dirt * wear.w > 0.001) contacts.y = max(contacts.y, contact.y - wear.x - edgeNoise);
        if (contact.x > 0.001) contactOpacity = max(contactOpacity, wear.w * dirt);
      } else if (wear.z > 2.5) {
        if (distance < cartDistance) { cartDistance = distance; cartOpacity = wear.w; }
      } else if (wear.z > 1.5) {
        // Nearest centreline first: overlapping end caps must not paint rings
        // across a continuing rut's grassy median. Keep that segment's wear.
        if (distance < localDistance - 0.00001 || (abs(distance - localDistance) < 0.00001 && wear.y > localWear.y)) {
          localDistance = distance;
          localWear = wear;
        }
      } else if (wear.z < 0.5) {
        distanceToTrack.x = min(distanceToTrack.x, distance);
        mainWear = wear.xy;
        mainOpacity = wear.w;
      } else {
        distanceToTrack.y = min(distanceToTrack.y, distance);
        trackWear = wear.xy;
        trackOpacity = wear.w;
      }
    }
    // Union centreline distances before drawing ruts; overlapping caps must
    // not draw rings through the median. Overflow keeps its source traffic.
    vec2 main = roadStrip(distanceToTrack.x, mainWear.x + edgeNoise, mainWear.y, roughness);
    vec2 track = roadStrip(distanceToTrack.y, trackWear.x + edgeNoise, trackWear.y, roughness);
    vec2 local = roadStrip(localDistance, localWear.x + edgeNoise, localWear.y, roughness);
    // Very light footsteps remain translucent and fully abandoned segments disappear.
    main.x *= mainOpacity;
    track.x *= trackOpacity;
    local.x *= localWear.w;
    // Express both boundaries relative to the receiving tile's edge value,
    // so its outline follows the source wear too, including on grass tiles.
    // Cart ruts add faded wear without changing the road boundary.
    float cartWear = cartOpacity * 0.68 * (1.0 - smoothstep(0.045, 0.12, cartDistance + roughness * 0.2));
    segmentOpacity = max(max(main.x > 0.001 ? mainOpacity : 0.0, track.x > 0.001 ? trackOpacity : 0.0),
      max(max(local.x > 0.001 ? localWear.w : 0.0, cartWear > 0.001 ? cartOpacity : 0.0), contactOpacity));
    float mainBoundary = mix(-100.0, main.y - mainWear.x - edgeNoise, step(0.001, mainOpacity));
    float trackBoundary = mix(-100.0, track.y - trackWear.x - edgeNoise, step(0.001, trackOpacity));
    float localBoundary = mix(-100.0, local.y - localWear.x - edgeNoise, step(0.001, localWear.w));
    return vec2(max(max(max(max(main.x, track.x), local.x), cartWear), contacts.x),
      max(max(max(mainBoundary, trackBoundary), localBoundary), contacts.y) + targetEdge);
  }

  vec2 roadShape(vec2 p, vec4 connected, vec4 diagonal, vec4 filledCorners, float edge, float inner, float roughness) {
    vec3 shape = vec3(0.0, -1.0, -1.0);
    if (connected.x * connected.y > 0.5)
      shape = addRoadStrip(shape, roadStrip(abs(p.y - 0.5), edge, inner, roughness));
    if (connected.z * connected.w > 0.5)
      shape = addRoadStrip(shape, roadStrip(abs(p.x - 0.5), edge, inner, roughness));
    if (connected.x * connected.z > 0.5 && diagonal.x + diagonal.z < 0.5)
      shape = addRoadStrip(shape, roadStrip(abs(length(p - vec2(1.0, 1.0)) - 0.5), edge, inner, roughness));
    if (connected.x * connected.w > 0.5 && diagonal.x + diagonal.w < 0.5)
      shape = addRoadStrip(shape, roadStrip(abs(length(p - vec2(1.0, 0.0)) - 0.5), edge, inner, roughness));
    if (connected.y * connected.z > 0.5 && diagonal.y + diagonal.z < 0.5)
      shape = addRoadStrip(shape, roadStrip(abs(length(p - vec2(0.0, 1.0)) - 0.5), edge, inner, roughness));
    if (connected.y * connected.w > 0.5 && diagonal.y + diagonal.w < 0.5)
      shape = addRoadStrip(shape, roadStrip(abs(length(p - vec2(0.0)) - 0.5), edge, inner, roughness));

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
