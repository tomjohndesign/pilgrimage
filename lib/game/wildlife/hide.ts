import * as THREE from "three"
import type { CrossSection } from "../transport/geometry"

/** Update the same connected surface without allocating new meshes or geometry. */
export function fitHide(geometry: THREE.BufferGeometry, sections: CrossSection[], sides = 8) {
  const position = geometry.attributes.position as THREE.BufferAttribute
  sections.forEach((section, i) => {
    const a = sections[Math.max(0, i - 1)].at, b = sections[Math.min(sections.length - 1, i + 1)].at
    const dy = b[1] - a[1], dz = b[2] - a[2], length = Math.hypot(dy, dz) || 1
    for (let j = 0; j < sides; j++) {
      const angle = j / sides * Math.PI * 2, c = Math.cos(angle)
      const depth = c * (c >= 0 ? section.top : section.bottom ?? section.top)
      position.setXYZ(i * sides + j, section.at[0] + Math.sin(angle) * section.width, section.at[1] + depth * dz / length, section.at[2] - depth * dy / length)
    }
  })
  position.needsUpdate = true; geometry.computeVertexNormals(); geometry.computeBoundingSphere()
}
