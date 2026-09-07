import * as THREE from "three"
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js"

/** Merge coloured static details within each joint, keeping animation instanced and bounded. */
export function mergeJoint(group: THREE.Group) {
  const meshes = group.children.filter((child): child is THREE.Mesh<THREE.BufferGeometry, THREE.MeshLambertMaterial> => child instanceof THREE.Mesh)
  if (!meshes.length) return
  const parts = meshes.map(mesh => {
    mesh.updateMatrix()
    const source = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone()
    const geometry = source.applyMatrix4(mesh.matrix)
    geometry.deleteAttribute("uv")
    const colors = new Float32Array(geometry.attributes.position.count * 3)
    for (let i = 0; i < colors.length; i += 3) mesh.material.color.toArray(colors, i)
    if (!geometry.attributes.color) geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3))
    return geometry
  })
  const geometry = mergeGeometries(parts)
  parts.forEach(part => part.dispose())
  if (!geometry) throw new Error("Wildlife joint geometry could not be merged")
  meshes.forEach(mesh => { group.remove(mesh); mesh.geometry.dispose() })
  const mesh = new THREE.Mesh(geometry, new THREE.MeshLambertMaterial({ vertexColors: true }))
  group.add(mesh)
}
