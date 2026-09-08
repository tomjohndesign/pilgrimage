import * as THREE from "three"
import { generateElement, type BoulderSize, type EnvironmentKind, type PrimitiveKind } from "./elements"

/** The original environment geometry remains the editable source for sprite bakes. */
export function elementGeometry(kind: PrimitiveKind): THREE.BufferGeometry {
  if (kind !== "blade") return new THREE.IcosahedronGeometry(1, kind === "foliage" ? 1 : 0)
  const blade = new THREE.ConeGeometry(1, 2, 3, 2)
  const positions = blade.getAttribute("position")
  for (let i = 0; i < positions.count; i++) {
    const t = (positions.getY(i) + 1) / 2
    positions.setX(i, positions.getX(i) + t * t * 0.55)
  }
  blade.computeVertexNormals()
  return blade
}

export function environmentModel(kind: EnvironmentKind, seed: number, unlit = false, boulderSize?: BoulderSize) {
  const root = new THREE.Group()
  const geometries = new Map<PrimitiveKind, THREE.BufferGeometry>()
  const materials: THREE.Material[] = []
  for (const part of generateElement(kind, seed, boulderSize)) {
    if (!geometries.has(part.primitive)) geometries.set(part.primitive, elementGeometry(part.primitive))
    const color = new THREE.Color(part.color).multiplyScalar(part.shade)
    const material = unlit ? new THREE.MeshBasicMaterial({ color }) : new THREE.MeshLambertMaterial({ color, flatShading: true })
    materials.push(material)
    const mesh = new THREE.Mesh(geometries.get(part.primitive), material)
    mesh.position.set(part.x, part.y, part.z)
    mesh.rotation.y = part.yaw
    mesh.scale.set(part.rx, part.ry, part.rz)
    root.add(mesh)
  }
  return { root, dispose() { geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose()) } }
}
