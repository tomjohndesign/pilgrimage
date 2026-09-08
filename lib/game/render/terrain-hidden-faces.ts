import type * as THREE from "three"
import type { GameMap } from "../map/types"

/** Bits +X, -X, +Z, -Z identify faces completely buried by the next tile.
 * Keep both sides beside a diagonal cut: its reduced footprint can expose a
 * neighbour's wall. Every outer edge, cliff and sloping gap stays intact. */
export function terrainHiddenFaces(map: Pick<GameMap, "width" | "depth" | "elevation">, cuts: ReadonlyMap<number, unknown>): Uint8Array {
  const { width, depth } = map, corners = map.elevation?.corners
  const masks = new Uint8Array(width * depth)
  const edges = [[1, 1, 3, 0, 2], [-1, 0, 2, 1, 3], [width, 2, 3, 0, 1], [-width, 0, 1, 2, 3]]
  for (let z = 0; z < depth; z++) for (let x = 0; x < width; x++) {
    const i = z * width + x
    if (cuts.has(i)) continue
    for (let side = 0; side < 4; side++) {
      if (side === 0 && x + 1 === width || side === 1 && x === 0 || side === 2 && z + 1 === depth || side === 3 && z === 0) continue
      const [offset, a, b, c, d] = edges[side], n = i + offset
      if (cuts.has(n)) continue
      if ((corners?.[i * 4 + a] ?? 0) <= (corners?.[n * 4 + c] ?? 0)
        && (corners?.[i * 4 + b] ?? 0) <= (corners?.[n * 4 + d] ?? 0)) masks[i] |= 1 << side
    }
  }
  return masks
}

const boxIndices = new WeakMap<THREE.BufferGeometry, number[]>()

/** Remove whole face groups when every tile in a draw already hides them.
 * Retain the same instance buffers and surviving triangle order. A single
 * exposed edge keeps that face for the batch; its shader masks the other tiles. */
export function compactTerrainFaces(geometry: THREE.BufferGeometry, count: number) {
  const index = geometry.index!, surface = geometry.getAttribute("aSurface"), normal = geometry.getAttribute("normal")
  let original = boxIndices.get(geometry)
  if (!original) { original = Array.from(index.array); boxIndices.set(geometry, original) }
  let hidden = 15, next = 0
  for (let i = 0; i < count && hidden; i++) hidden &= Math.floor(surface.getY(i) / 2)
  if (count) for (let i = 0; i < original.length; i += 3) {
    const vertex = original[i], y = normal.getY(vertex)
    if (y < -.5) continue
    const face = normal.getX(vertex) > .5 ? 1 : normal.getX(vertex) < -.5 ? 2 : normal.getZ(vertex) > .5 ? 4 : 8
    if (Math.abs(y) < .5 && (hidden & face)) continue
    index.setX(next++, original[i]); index.setX(next++, original[i + 1]); index.setX(next++, original[i + 2])
  }
  index.needsUpdate = true
  geometry.setDrawRange(0, next)
}
