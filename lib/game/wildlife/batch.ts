import * as THREE from "three"
import { encodeObjectId, wildlifeObjectId } from "../render/outline"

/** Connected animated hides are packed into one bounded buffer per species.
 * Both colour and selection passes consume the identical deformed vertices. */
export function wildlifeGeometry(parts: THREE.Mesh[], ids: number[], coats: readonly string[] = []) {
  const vertices = parts.reduce((sum, part) => sum + part.geometry.attributes.position.count, 0)
  const indices = parts.reduce((sum, part) => sum + (part.geometry.index?.count ?? part.geometry.attributes.position.count), 0)
  const geometry = new THREE.BufferGeometry(), idGeometry = new THREE.BufferGeometry()
  const position = new THREE.BufferAttribute(new Float32Array(vertices * ids.length * 3), 3).setUsage(THREE.DynamicDrawUsage)
  const normal = new THREE.BufferAttribute(new Float32Array(vertices * ids.length * 3), 3).setUsage(THREE.DynamicDrawUsage)
  const color = new Float32Array(vertices * ids.length * 3), idColor = new Float32Array(color.length), index: number[] = []
  let offset = 0
  for (const [animal, id] of ids.entries()) for (const part of parts) {
    const coat = new THREE.Color(coats[animal] ?? "#ffffff")
    const source = part.geometry, count = source.attributes.position.count, tint = encodeObjectId(wildlifeObjectId(id))
    for (let i = 0; i < count; i++) {
      color.set([source.attributes.color.getX(i) * coat.r, source.attributes.color.getY(i) * coat.g, source.attributes.color.getZ(i) * coat.b], (offset + i) * 3)
      idColor.set(tint, (offset + i) * 3)
    }
    for (let i = 0; i < (source.index?.count ?? count); i++) index.push(offset + (source.index?.getX(i) ?? i))
    offset += count
  }
  geometry.setIndex(index); geometry.setAttribute("position", position); geometry.setAttribute("normal", normal); geometry.setAttribute("color", new THREE.BufferAttribute(color, 3))
  geometry.index!.setUsage(THREE.DynamicDrawUsage)
  idGeometry.setIndex(geometry.index); idGeometry.setAttribute("position", position); idGeometry.setAttribute("color", new THREE.BufferAttribute(idColor, 3))
  const sourceIndex = geometry.index!.array.slice()
  const visible = ids.map((_, i) => i)
  let dirty = false
  const matrix = new THREE.Matrix4(), normalMatrix = new THREE.Matrix3(), point = new THREE.Vector3()
  return { geometry, idGeometry, trianglesPerAnimal: indices / 3,
    animalAtFace(face: number) { return visible[Math.floor(face / (indices / 3))] },
    /** Keep stable vertex slots/IDs, but submit indices only for visible animals.
     * Repack only when visibility changes, retaining the resident GPU buffers. */
    setVisible(animals: readonly number[]) {
      if (visible.length === animals.length && visible.every((animal, i) => animal === animals[i])) return
      visible.length = 0; visible.push(...animals)
      const target = geometry.index!
      for (let i = 0; i < animals.length; i++) {
        const start = animals[i] * indices
        target.array.set(sourceIndex.subarray(start, start + indices), i * indices)
      }
      if (animals.length) {
        target.clearUpdateRanges(); target.addUpdateRange(0, animals.length * indices); target.needsUpdate = true
      }
      geometry.setDrawRange(0, animals.length * indices)
      idGeometry.setDrawRange(0, animals.length * indices)
    },
    write(animal: number, root: THREE.Matrix4, concealed = false) {
      let offset = animal * vertices
      for (const part of parts) {
        matrix.multiplyMatrices(root, part.matrixWorld); normalMatrix.getNormalMatrix(matrix)
        const source = part.geometry
        for (let i = 0; i < source.attributes.position.count; i++, offset++) {
          point.fromBufferAttribute(source.attributes.position, i).applyMatrix4(matrix)
          position.setXYZ(offset, concealed ? 0 : point.x, concealed ? -1000 : point.y, concealed ? 0 : point.z)
          point.fromBufferAttribute(source.attributes.normal, i).applyNormalMatrix(normalMatrix)
          normal.setXYZ(offset, point.x, point.y, point.z)
        }
      }
      position.addUpdateRange(animal * vertices * 3, vertices * 3)
      normal.addUpdateRange(animal * vertices * 3, vertices * 3)
      dirty = true
    },
    /**
     * Publish the frame's vertices. `bounds` covers the animals actually
     * written; without it the sphere is measured from the buffer, which walks
     * every vertex of every animal in the species and costs more than posing
     * the visible ones. Nothing culls by these bounds — the meshes draw
     * unconditionally — so they only need to enclose what can be clicked.
     */
    finish(bounds?: THREE.Sphere) {
      if (dirty) { position.needsUpdate = true; normal.needsUpdate = true; dirty = false }
      if (bounds) (geometry.boundingSphere ??= new THREE.Sphere()).copy(bounds)
      else geometry.computeBoundingSphere()
      idGeometry.boundingSphere = geometry.boundingSphere
    },
    dispose() { geometry.dispose(); idGeometry.dispose() },
  }
}
