import * as THREE from "three"

export type Point = [number, number, number]
export interface CrossSection { at: Point; width: number; top: number; bottom?: number }

/** Authored cross sections define the topline, belly, chest, jaw and taper. */
export function loft(sections: CrossSection[], sides = 12) {
  const vertices: number[] = [], indices: number[] = []
  sections.forEach((section, i) => {
    const a = sections[Math.max(0, i - 1)].at, b = sections[Math.min(sections.length - 1, i + 1)].at
    const dy = b[1] - a[1], dz = b[2] - a[2], length = Math.hypot(dy, dz) || 1
    for (let j = 0; j < sides; j++) {
      const angle = j / sides * Math.PI * 2, c = Math.cos(angle)
      const depth = c * (c >= 0 ? section.top : section.bottom ?? section.top)
      vertices.push(section.at[0] + Math.sin(angle) * section.width, section.at[1] + depth * dz / length, section.at[2] - depth * dy / length)
      if (i) {
        const k = i * sides + j, next = i * sides + (j + 1) % sides
        indices.push(k - sides, k, next - sides, next - sides, k, next)
      }
    }
  })
  for (let j = 1; j < sides - 1; j++) {
    indices.push(0, j, j + 1)
    const end = (sections.length - 1) * sides
    indices.push(end, end + j + 1, end + j)
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3)); geometry.setIndex(indices); geometry.computeVertexNormals()
  return geometry
}
export function model() {
  const root = new THREE.Group()
  const materials = new Map<string, THREE.MeshLambertMaterial>()
  function mesh(geometry: THREE.BufferGeometry, color: string, at: Point, parent = root) {
    let material = materials.get(color)
    if (!material) { material = new THREE.MeshLambertMaterial({ color }); materials.set(color, material) }
    const object = new THREE.Mesh(geometry, material)
    object.position.set(...at); parent.add(object)
    return object
  }
  function box(at: Point, size: Point, color: string, parent = root) { return mesh(new THREE.BoxGeometry(...size), color, at, parent) }
  function oval(at: Point, size: Point, color: string, parent = root) {
    const object = mesh(new THREE.SphereGeometry(1, 10, 8), color, at, parent)
    object.scale.set(...size); return object
  }
  function bar(a: Point, b: Point, radius: number, color: string, parent = root) {
    const start = new THREE.Vector3(...a), end = new THREE.Vector3(...b), delta = end.clone().sub(start)
    const object = mesh(new THREE.CylinderGeometry(radius, radius, delta.length(), 8), color, start.add(end).multiplyScalar(0.5).toArray() as Point, parent)
    object.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), delta.normalize()); return object
  }
  return { root, mesh, box, oval, bar, dispose() {
    root.traverse(o => { if (o instanceof THREE.Mesh) o.geometry.dispose() })
    materials.forEach(m => m.dispose())
  } }
}
