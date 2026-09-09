import * as THREE from "three"
import type { CrossSection } from "../transport/geometry"

/** Update the same connected surface without allocating new meshes or geometry.
 * Normals come from the lofted surface itself: the cross product of each ring's
 * tangent with the tangent along the spine through the same vertex, which is
 * the smooth normal `computeVertexNormals` would average out of the triangles,
 * without its per-triangle pass. Posing runs this for every visible animal
 * every tick, so it has to be cheap. */
export function fitHide(geometry: THREE.BufferGeometry, sections: CrossSection[], sides = 8) {
  const position = geometry.attributes.position as THREE.BufferAttribute
  const normal = geometry.attributes.normal as THREE.BufferAttribute | undefined
  const count = sections.length
  // Ring frames: the depth axis is perpendicular to the spine within the y/z plane.
  const frames = ringFrames(count)
  for (let i = 0; i < count; i++) {
    const section = sections[i], a = sections[Math.max(0, i - 1)].at, b = sections[Math.min(count - 1, i + 1)].at
    const dy = b[1] - a[1], dz = b[2] - a[2], length = Math.hypot(dy, dz) || 1
    frames[i * 2] = dz / length; frames[i * 2 + 1] = -dy / length
    for (let j = 0; j < sides; j++) {
      const angle = j / sides * Math.PI * 2, c = Math.cos(angle), sn = Math.sin(angle)
      const depth = c * (c >= 0 ? section.top : section.bottom ?? section.top)
      position.setXYZ(i * sides + j, section.at[0] + sn * section.width, section.at[1] + depth * frames[i * 2], section.at[2] + depth * frames[i * 2 + 1])
    }
  }
  if (normal) for (let i = 0; i < count; i++) {
    const section = sections[i], ny = frames[i * 2], nz = frames[i * 2 + 1]
    const before = Math.max(0, i - 1), after = Math.min(count - 1, i + 1)
    for (let j = 0; j < sides; j++) {
      const angle = j / sides * Math.PI * 2, c = Math.cos(angle), sn = Math.sin(angle)
      const radius = c >= 0 ? section.top : section.bottom ?? section.top
      // Ring tangent (derivative along the ellipse) and spine tangent through this vertex.
      const ux = c * section.width, ud = -sn * radius
      const uy = ud * ny, uz = ud * nz
      const k = i * sides + j, ka = before * sides + j, kb = after * sides + j
      const tx = position.getX(kb) - position.getX(ka), ty = position.getY(kb) - position.getY(ka), tz = position.getZ(kb) - position.getZ(ka)
      // Spine tangent crossed with ring tangent: the winding the loft's triangles use.
      let x = ty * uz - tz * uy, y = tz * ux - tx * uz, z = tx * uy - ty * ux
      const rx = sn, rd = c, ry = rd * ny, rz = rd * nz
      // End rings also carry the cap fans, which pull their normals along the spine.
      if (i === 0 || i === count - 1) {
        const spine = 1 / (Math.hypot(tx, ty, tz) || 1), m = Math.hypot(x, y, z) || 1, sign = i === 0 ? -1 : 1
        x = x / m + sign * tx * spine; y = y / m + sign * ty * spine; z = z / m + sign * tz * spine
      }
      const inverse = 1 / (Math.hypot(x, y, z) || 1)
      if (!Number.isFinite(inverse) || inverse === 1 && x === 0 && y === 0 && z === 0) normal.setXYZ(k, rx, ry, rz)
      else normal.setXYZ(k, x * inverse, y * inverse, z * inverse)
    }
  }
  position.needsUpdate = true
  if (normal) normal.needsUpdate = true; else geometry.computeVertexNormals()
  geometry.computeBoundingSphere()
}

const frameScratch: Float64Array[] = []
function ringFrames(count: number) {
  return frameScratch[count] ??= new Float64Array(count * 2)
}