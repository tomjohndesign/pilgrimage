import { buildingStepAllowed, shrineGates } from "./building-navigation"
import { surfaceHeight } from "./map/bridges"
import { elevationStep } from "./map/elevation"
import { ROUTE_DIRS } from "./map/route"
import { TERRAIN } from "./map/terrain"
import { tileAt, tileToWorldX, tileToWorldZ, worldToTileX, worldToTileZ, type GameMap } from "./map/types"
import { buildingAt } from "./settlement"

export interface WanderSpot { x: number; y: number; z: number }

/** Only the open ground connected to the shrine door belongs to its grounds. */
export function monkWander(map: GameMap, radius = 3) {
  const hovel = map.buildings.find(b => b.id === map.site?.hovelId)
  const centre = hovel ? {
    x: tileToWorldX(map, hovel.x) + (hovel.w - 1) / 2,
    z: tileToWorldZ(map, hovel.z) + (hovel.d - 1) / 2,
  } : null
  const candidates = new Map<number, WanderSpot>()
  if (hovel) for (let z = hovel.z - radius; z < hovel.z + hovel.d + radius; z++) {
    for (let x = hovel.x - radius; x < hovel.x + hovel.w + radius; x++) {
      const terrain = tileAt(map, x, z)
      const building = buildingAt(map, x, z)
      if (!terrain || !TERRAIN[terrain].passable || (building && building.id !== hovel.id)) continue
      if (x === hovel.x + Math.floor(hovel.w / 2) && z === hovel.z + Math.floor(hovel.d / 2)) continue
      candidates.set(z * map.width + x, { x: tileToWorldX(map, x), y: surfaceHeight(map, x, z), z: tileToWorldZ(map, z) })
    }
  }
  const neighbours = (i: number) => ROUTE_DIRS.flatMap(([dx, dz]) => {
    const x = i % map.width + dx, z = Math.floor(i / map.width) + dz, n = z * map.width + x
    if (x < 0 || x >= map.width || !candidates.has(n)) return []
    if (!buildingStepAllowed(map, map.buildings, { x: i % map.width, z: Math.floor(i / map.width) }, { x, z }, true)) return []
    if (map.tiles[i] !== "bridge" && map.tiles[n] !== "bridge" && !Number.isFinite(elevationStep(map.elevation, i, n))) return []
    return [n]
  })
  const door = map.site ? map.site.door.z * map.width + map.site.door.x : -1
  const reachable = new Set<number>()
  const queue: number[] = []
  if (candidates.has(door)) { reachable.add(door); queue.push(door) }
  for (let head = 0; head < queue.length; head++) for (const n of neighbours(queue[head])) {
    if (!reachable.has(n)) { reachable.add(n); queue.push(n) }
  }
  const key = (p: WanderSpot) => worldToTileZ(map, p.z) * map.width + worldToTileX(map, p.x)
  return {
    centre,
    spots: queue.filter(i => !buildingAt(map, i % map.width, Math.floor(i / map.width))).map(i => candidates.get(i)!),
    prayerSpots: hovel ? shrineGates(hovel).map(g => g.inside.z * map.width + g.inside.x)
      .filter(i => reachable.has(i)).map(i => candidates.get(i)!) : [],
    /** Follow neighbouring tile centres, including the shrine gate crossings. */
    route(start: WanderSpot, goal: WanderSpot): WanderSpot[] {
      const a = key(start), b = key(goal)
      if (!reachable.has(a) || !reachable.has(b)) return []
      if (a === b) return [candidates.get(b)!]
      const parents = new Map<number, number>([[a, -1]]), open = [a]
      for (let head = 0; head < open.length; head++) {
        const current = open[head]
        if (current === b) break
        for (const n of neighbours(current)) if (!parents.has(n)) {
          parents.set(n, current); open.push(n)
        }
      }
      if (!parents.has(b)) return []
      const path: WanderSpot[] = []
      for (let i = b; i !== -1; i = parents.get(i)!) path.push(candidates.get(i)!)
      return path.reverse()
    },
  }
}
