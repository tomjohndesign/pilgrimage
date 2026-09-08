/** Same half-tile triangles as shorelineInset, shared by water paint and ripple clipping. */
export const SHORELINE_SHAPE_GLSL = /* glsl */ `
  float shorelineInset(vec2 p, vec4 corners) {
    vec4 inset = vec4(p.x + p.y - 1.0, p.x - p.y,
      p.y - p.x, 1.0 - p.x - p.y);
    inset = mix(vec4(-1.0), inset, corners);
    return max(max(inset.x, inset.y), max(inset.z, inset.w));
  }
`
