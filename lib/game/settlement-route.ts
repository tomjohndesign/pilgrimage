import { ROUTE_DIRS } from "./map/route"
import { isWoods, TERRAIN } from "./map/terrain"
import { tileAt, type BuildingDef, type GameMap, type TilePos } from "./map/types"

/** Walk around water and footprints; woodcutters may enter the woods to work. */
export function settlementRoute(
  map: GameMap,
  buildings: readonly BuildingDef[],
  start: TilePos,
  goal: TilePos,
  logging = false,
): TilePos[] | null {
  const key = (p: TilePos) => p.z * map.width + p.x
  const origin = key(start)
  const end = key(goal)
  const parents = new Map<number, number>([[origin, -1]])
  const queue = [start]
  for (let head = 0; head < queue.length; head++) {
    const p = queue[head]
    const current = key(p)
    if (current === end) {
      const result: TilePos[] = []
      for (let i = end; i !== -1; i = parents.get(i)!) {
        result.push({ x: i % map.width, z: Math.floor(i / map.width) })
      }
      return result.reverse()
    }
    for (const [dx, dz] of ROUTE_DIRS) {
      const next = { x: p.x + dx, z: p.z + dz }
      const terrain = tileAt(map, next.x, next.z)
      if (!terrain || !(TERRAIN[terrain].passable || (logging && isWoods(terrain)))) continue
      if (buildings.some((b) => !b.id.startsWith("lumberCamp-") && next.x >= b.x && next.x < b.x + b.w && next.z >= b.z && next.z < b.z + b.d)) continue
      const index = key(next)
      if (parents.has(index)) continue
      parents.set(index, current)
      queue.push(next)
    }
  }
  return null
}
