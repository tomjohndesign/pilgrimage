import { smoothWalkingRoute } from "./walking-shortcuts"
import { footpathRouteCost } from "./footpaths"
import { shrineLayout } from "./shrine-layout"
import { buildingStepAllowed, containsTile, shrineFurnitureClear } from "./building-navigation"
import { surfaceHeight } from "./map/bridges"
import { walkingSurface } from "./map/walking-surface"
import { elevationStep } from "./map/elevation"
import { MinHeap, ROUTE_DIRS } from "./map/route"
import { TERRAIN } from "./map/terrain"
import { tileAt, tileToWorldX, tileToWorldZ, type GameMap, type TilePos } from "./map/types"
import { buildingAt } from "./settlement"

export interface WanderSpot { x: number; y: number; z: number }

/** The grounds use tile centres; half-tile interior lanes fit between the kneelers and altar. */
export function monkWander(map: GameMap, radius = 3) {
  const hovel = map.buildings.find(b => b.id === map.site?.hovelId)
  const layout = hovel ? shrineLayout(hovel, map.site?.door) : null
  const centre = layout ? { x: tileToWorldX(map, layout.altar.x), z: tileToWorldZ(map, layout.altar.z) } : null
  const key = (p: TilePos) => `${p.x},${p.z}`
  const candidates = new Map<string, { tile: TilePos; spot: WanderSpot; inside: boolean }>()
  const add = (x: number, z: number) => {
    const tx = Math.round(x), tz = Math.round(z), tile = { x, z }
    const terrain = tileAt(map, tx, tz), building = buildingAt(map, tx, tz)
    if (!terrain || !TERRAIN[terrain].passable || (building && building.id !== hovel?.id)) return
    const inside = !!hovel && containsTile(hovel, tile)
    if (inside && (!shrineFurnitureClear(hovel!, map.site?.door, tile, tile)
      || (x === layout!.altarTile.x && z === layout!.altarTile.z))) return
    const wx = tileToWorldX(map, x), wz = tileToWorldZ(map, z)
    candidates.set(key(tile), { tile, inside, spot: { x: wx, z: wz,
      y: inside ? walkingSurface(map, wx, wz).height : surfaceHeight(map, tx, tz) } })
  }
  if (hovel) {
    for (let z = hovel.z - radius; z < hovel.z + hovel.d + radius; z++) {
      for (let x = hovel.x - radius; x < hovel.x + hovel.w + radius; x++) add(x, z)
    }
    for (let z = hovel.z; z <= hovel.z + hovel.d - 1; z += .5) {
      for (let x = hovel.x; x <= hovel.x + hovel.w - 1; x += .5) add(x, z)
    }
  }
  const adjacent = new Map<string, string[]>()
  for (const [id, node] of candidates) {
    const links: string[] = []
    for (const step of node.inside ? [.5, 1] : [1]) for (const [dx, dz] of ROUTE_DIRS) {
      const tile = { x: node.tile.x + dx * step, z: node.tile.z + dz * step }
      const nextId = key(tile), next = candidates.get(nextId)
      if (!next || (step === 1 && node.inside && next.inside) || (step === .5 && !next.inside)) continue
      if (!buildingStepAllowed(map, map.buildings, node.tile, tile, true)) continue
      const a = Math.round(node.tile.z) * map.width + Math.round(node.tile.x)
      const b = Math.round(tile.z) * map.width + Math.round(tile.x)
      if (map.tiles[a] !== "bridge" && map.tiles[b] !== "bridge" && !Number.isFinite(elevationStep(map.elevation, a, b))) continue
      links.push(nextId)
    }
    adjacent.set(id, links)
  }
  const door = map.site ? key(map.site.door) : ""
  const reachable = new Set<string>(), queue: string[] = []
  if (candidates.has(door)) { reachable.add(door); queue.push(door) }
  for (let head = 0; head < queue.length; head++) for (const n of adjacent.get(queue[head])!) {
    if (!reachable.has(n)) { reachable.add(n); queue.push(n) }
  }
  const nodes = queue.map(id => candidates.get(id)!)
  const nodeIndices = new Map(queue.map((id, index) => [id, index]))
  const prayerSpots: WanderSpot[] = []
  if (layout) for (const [dx, dz] of ROUTE_DIRS) {
    const target = { x: tileToWorldX(map, layout.altarTile.x + dx), z: tileToWorldZ(map, layout.altarTile.z + dz) }
    const choices = nodes.filter(n => n.inside && !prayerSpots.includes(n.spot))
      .sort((a, b) => Math.hypot(a.spot.x - target.x, a.spot.z - target.z) - Math.hypot(b.spot.x - target.x, b.spot.z - target.z))
    if (choices[0]) prayerSpots.push(choices[0].spot)
  }
  const nearest = (p: WanderSpot) => {
    const tile = { x: p.x + map.width / 2 - .5, z: p.z + map.depth / 2 - .5 }
    // Replanning mid-step must not snap across a kneeler or a wall.
    return nodes.filter(n => Math.hypot(n.spot.x - p.x, n.spot.z - p.z) <= Math.SQRT1_2 + 1e-8
      && buildingStepAllowed(map, map.buildings, tile, n.tile, true))
      .sort((a, b) => Math.hypot(a.spot.x - p.x, a.spot.z - p.z) - Math.hypot(b.spot.x - p.x, b.spot.z - p.z))[0]
  }
  return {
    centre,
    spots: nodes.filter(n => !n.inside).map(n => n.spot),
    prayerSpots,
    route(start: WanderSpot, goal: WanderSpot, exploring = false): WanderSpot[] {
      const first = nearest(start), last = nearest(goal)
      if (!first || !last) return []
      const a = key(first.tile), b = key(last.tile)
      const parents = new Map<string, string | null>([[a, null]])
      const costs = new Map<string, number>([[a, 0]]), closed = new Set<string>(), open = new MinHeap()
      open.push(nodeIndices.get(a)!, 0)
      while (open.size) {
        const current = queue[open.pop()]
        if (closed.has(current)) continue
        closed.add(current)
        if (current === b) break
        const from = candidates.get(current)!.tile
        for (const n of adjacent.get(current)!) {
          const to = candidates.get(n)!.tile
          const cost = costs.get(current)! + Math.hypot(to.x - from.x, to.z - from.z)
            * footpathRouteCost(map, from, to)
          if (cost >= (costs.get(n) ?? Infinity)) continue
          costs.set(n, cost); parents.set(n, current); open.push(nodeIndices.get(n)!, cost)
        }
      }
      if (!parents.has(b)) return []
      const path: WanderSpot[] = []
      for (let i: string | null = b; i !== null; i = parents.get(i)!) path.push(candidates.get(i)!.spot)
      return smoothWalkingRoute(map, path.reverse(), exploring)
    },
  }
}
