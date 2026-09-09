import * as THREE from "three"
import type { CrossSection } from "../transport/geometry"

/** Update the same connected surface without allocating new meshes or geometry.
 * Normals come straight from each ring's ellipse: the radial direction scaled by
 * the inverse radii, which is the smooth normal of a lofted tube without the
 * per-triangle pass of `computeVertexNormals`. Posing runs this for every
 * visible animal every tick, so it has to be cheap. */
export function fitHide(geometry: THREE.BufferGeometry, sections: CrossSection[], sides = 8) {
  const position = geometry.attributes.position as THREE.BufferAttribute
  const normal = geometry.attributes.normal as THREE.BufferAttribute | undefined
  sections.forEach((section, i) => {
    const a = sections[Math.max(0, i - 1)].at, b = sections[Math.min(sections.length - 1, i + 1)].at
    const dy = b[1] - a[1], dz = b[2] - a[2], length = Math.hypot(dy, dz) || 1
    const ny = dz / length, nz = -dy / length
    for (let j = 0; j < sides; j++) {
      const angle = j / sides * Math.PI * 2, c = Math.cos(angle), sn = Math.sin(angle)
      const radius = c >= 0 ? section.top : section.bottom ?? section.top
      const depth = c * radius
      position.setXYZ(i * sides + j, section.at[0] + sn * section.width, section.at[1] + depth * ny, section.at[2] + depth * nz)
      if (normal) {
        const rx = sn / Math.max(1e-6, section.width), rd = c / Math.max(1e-6, radius)
        const inverse = 1 / (Math.hypot(rx, rd) || 1)
        normal.setXYZ(i * sides + j, rx * inverse, rd * ny * inverse, rd * nz * inverse)
      }
    }
  })
  position.needsUpdate = true
  if (normal) normal.needsUpdate = true; else geometry.computeVertexNormals()
  geometry.computeBoundingSphere()
}
