import type { BuildingDef, TilePos } from "./map/types"

const BLOCK = 8
const cellKey = (x: number, z: number) => x >= -4096 && x < 4096 && z >= -4096 && z < 4096
  ? (x + 4096) * 8192 + z + 4096 : `${x}:${z}`
const EMPTY: readonly BuildingDef[] = []
interface BuildingIndex {
  bounds: number[]; sources: BuildingDef[]; query: (point: TilePos) => readonly BuildingDef[]
}
const indexes = new WeakMap<readonly BuildingDef[], Map<number, BuildingIndex>>()

/** Validate once per navigation operation, then inspect just the footprints
 * beside each path sample. Live construction progress does not change bounds. */
export function buildingSpatialQuery(buildings: readonly BuildingDef[], padding = 0) {
  const variants = indexes.get(buildings) ?? new Map<number, BuildingIndex>()
  const cached = variants.get(padding)
  if (cached && cached.bounds.length === buildings.length * 4 && buildings.every((b, i) =>
    cached.sources[i] === b && cached.bounds[i * 4] === b.x && cached.bounds[i * 4 + 1] === b.z
    && cached.bounds[i * 4 + 2] === b.w && cached.bounds[i * 4 + 3] === b.d)) return cached.query
  const cells = new Map<number | string, BuildingDef[]>(), bounds: number[] = []
  for (const b of buildings) {
    bounds.push(b.x, b.z, b.w, b.d)
    for (let z = Math.floor((b.z - .5 - padding) / BLOCK); z <= Math.floor((b.z + b.d - .5 + padding) / BLOCK); z++)
      for (let x = Math.floor((b.x - .5 - padding) / BLOCK); x <= Math.floor((b.x + b.w - .5 + padding) / BLOCK); x++) {
        const key = cellKey(x, z), cell = cells.get(key) ?? []
        cell.push(b); cells.set(key, cell)
      }
  }
  const query = (p: TilePos) => cells.get(cellKey(Math.floor(p.x / BLOCK), Math.floor(p.z / BLOCK))) ?? EMPTY
  variants.set(padding, { bounds, sources: [...buildings], query })
  indexes.set(buildings, variants)
  return query
}
