import * as THREE from "three"
import { buildingPartGeometry } from "./part-geometry"
import type { BuildingPart } from "./geometry"

export function buildingPartDetail(part: BuildingPart): 0 | 1 | 2 {
  if (part.maxSceneryDetail !== undefined) return part.maxSceneryDetail
  if (part.layer === "interior" || /^(straw-bed-|wool-cover-|rolled-blanket-|grain-sack)/.test(part.name)) return 0
  if (/(?:^|-)(?:reed|(?:signpost|cross)-grain|thatch-(?:grain|highlight|edge-grain|uphill-edges|fringe))-/.test(part.name)
    || /-weave-/.test(part.name)) return 1
  return 2
}

/** Preserve every authored triangle, normal and linear color in one draw. */
export function mergedBuildingGeometry(parts: readonly BuildingPart[]) {
  const shapes = parts.map(part => {
    const original = buildingPartGeometry(part), shape = original.index ? original.toNonIndexed() : original
    if (shape !== original) original.dispose()
    shape.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(...part.position),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(...part.rotation ?? [0, 0, 0])), new THREE.Vector3(1, 1, 1)))
    return { shape, color: new THREE.Color(part.color), detail: buildingPartDetail(part) }
  })
  const count = shapes.reduce((n, s) => n + s.shape.getAttribute("position").count, 0)
  const positions = new Float32Array(count * 3), normals = new Float32Array(count * 3), colors = new Float32Array(count * 3)
  const ranges: Array<{ start: number; count: number; detail: number }> = []
  let offset = 0
  for (const { shape, color, detail } of shapes) {
    const position = shape.getAttribute("position"), normal = shape.getAttribute("normal")
    positions.set(position.array, offset * 3); normals.set(normal.array, offset * 3)
    for (let i = 0; i < position.count; i++) color.toArray(colors, (offset + i) * 3)
    ranges.push({ start: offset, count: position.count, detail })
    offset += position.count; shape.dispose()
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3))
  geometry.setAttribute("normal", new THREE.BufferAttribute(normals, 3))
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3))
  geometry.userData.detailRanges = ranges
  geometry.computeBoundingSphere()
  return geometry
}

/** Resident index buffers drop interiors, then roof grain, without rebuilding
 * or uploading the shared positions/normals/colors during a camera gesture. */
export function buildingGeometryLevels(parts: readonly BuildingPart[]): THREE.BufferGeometry[] {
  const full = mergedBuildingGeometry(parts)
  const ranges = full.userData.detailRanges as Array<{ start: number; count: number; detail: number }>
  return [full, ...[1, 2].map(detail => {
    const indices: number[] = []
    for (const range of ranges) if (range.detail >= detail)
      for (let i = range.start; i < range.start + range.count; i++) indices.push(i)
    if (indices.length === full.getAttribute("position").count) return full
    const geometry = new THREE.BufferGeometry()
    for (const [name, attribute] of Object.entries(full.attributes)) geometry.setAttribute(name, attribute)
    geometry.setIndex(indices)
    geometry.boundingSphere = full.boundingSphere?.clone() ?? null
    return geometry
  })]
}
