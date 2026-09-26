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
  const positions = position.array as Float32Array
  const count = sections.length, { cos, sin } = ringAngles(sides)
  // Ring frames: the depth axis is perpendicular to the spine within the y/z plane.
  const frames = ringFrames(count)
  for (let i = 0; i < count; i++) {
    const section = sections[i], a = sections[Math.max(0, i - 1)].at, b = sections[Math.min(count - 1, i + 1)].at
    const dy = b[1] - a[1], dz = b[2] - a[2], length = Math.hypot(dy, dz) || 1
    const fy = frames[i * 2] = dz / length, fz = frames[i * 2 + 1] = -dy / length
    for (let j = 0; j < sides; j++) {
      const c = cos[j], sn = sin[j], at = (i * sides + j) * 3
      const depth = c * (c >= 0 ? section.top : section.bottom ?? section.top)
      positions[at] = section.at[0] + sn * section.width; positions[at + 1] = section.at[1] + depth * fy; positions[at + 2] = section.at[2] + depth * fz
    }
  }
  if (normal) {
    const normals = normal.array as Float32Array
    for (let i = 0; i < count; i++) {
      const section = sections[i], ny = frames[i * 2], nz = frames[i * 2 + 1]
      const before = Math.max(0, i - 1), after = Math.min(count - 1, i + 1)
      for (let j = 0; j < sides; j++) {
        const c = cos[j], sn = sin[j]
        const radius = c >= 0 ? section.top : section.bottom ?? section.top
        // Ring tangent (derivative along the ellipse) and spine tangent through this vertex.
        const ux = c * section.width, ud = -sn * radius
        const uy = ud * ny, uz = ud * nz
        const k = (i * sides + j) * 3, ka = (before * sides + j) * 3, kb = (after * sides + j) * 3
        const tx = positions[kb] - positions[ka], ty = positions[kb + 1] - positions[ka + 1], tz = positions[kb + 2] - positions[ka + 2]
        // Spine tangent crossed with ring tangent: the winding the loft's triangles use.
        let x = ty * uz - tz * uy, y = tz * ux - tx * uz, z = tx * uy - ty * ux
        const rx = sn, rd = c, ry = rd * ny, rz = rd * nz
        // End rings also carry the cap fans, which pull their normals along the spine.
        if (i === 0 || i === count - 1) {
          const spine = 1 / (Math.hypot(tx, ty, tz) || 1), m = Math.hypot(x, y, z) || 1, sign = i === 0 ? -1 : 1
          x = x / m + sign * tx * spine; y = y / m + sign * ty * spine; z = z / m + sign * tz * spine
        }
        const inverse = 1 / (Math.hypot(x, y, z) || 1)
        if (!Number.isFinite(inverse) || inverse === 1 && x === 0 && y === 0 && z === 0) { normals[k] = rx; normals[k + 1] = ry; normals[k + 2] = rz }
        else { normals[k] = x * inverse; normals[k + 1] = y * inverse; normals[k + 2] = z * inverse }
      }
    }
  }
  position.needsUpdate = true
  if (normal) normal.needsUpdate = true; else geometry.computeVertexNormals()
  // Game posing copies these vertices into a batch and never culls or picks the
  // template itself; previews that do recompute the sphere on demand.
  geometry.boundingSphere = null
}

const frameScratch: Float64Array[] = []
function ringFrames(count: number) {
  return frameScratch[count] ??= new Float64Array(count * 2)
}

const angleTables: Array<{ cos: Float64Array; sin: Float64Array }> = []
function ringAngles(sides: number) {
  let table = angleTables[sides]
  if (!table) {
    table = angleTables[sides] = { cos: new Float64Array(sides), sin: new Float64Array(sides) }
    for (let j = 0; j < sides; j++) { const angle = j / sides * Math.PI * 2; table.cos[j] = Math.cos(angle); table.sin[j] = Math.sin(angle) }
  }
  return table
}
