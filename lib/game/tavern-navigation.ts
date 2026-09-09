import { buildingEntry, rotateBuildingPoint, rotatedFootprint, buildingDoorOffset } from "./building-rotation"
import { tavernLayout, tavernLocalPoint, tavernSegmentClear, TAVERN_CLEARANCE } from "./tavern-layout"
import { tileToWorldX, tileToWorldZ, worldToTileX, worldToTileZ, type BuildingDef, type GameMap, type TilePos } from "./map/types"
import { surfaceHeight } from "./map/bridges"
import { settlementRoute } from "./settlement-route"

export interface TavernWalkPoint { x: number; y: number; z: number }
const same = (a: TilePos, b: TilePos) => Math.hypot(a.x - b.x, a.z - b.z) < 1e-6

/** A small visibility graph resolves aisles narrower than a world tile. */
export function tavernInteriorRoute(building: BuildingDef, from: TilePos, to: TilePos, seat?: string): TilePos[] | null {
  const { w, d } = rotatedFootprint(building, building.rotation)
  const { obstacles, benches } = tavernLayout(w, d)
  const inside = (p: TilePos) => Math.abs(p.x) <= w / 2 - .13 && Math.abs(p.z) <= d / 2 - .13
  if (!inside(from) || !inside(to)) return null
  const startingBench = benches.find(b => Math.abs(from.x - b.x) <= b.w / 2 + .01 && Math.abs(from.z - b.z) <= b.d / 2 + .01)?.id
  const clear = (a: TilePos, b: TilePos) => tavernSegmentClear(obstacles, a, b,
    same(a, from) && startingBench ? startingBench : same(b, to) ? seat : undefined)
  const nodes = [from, to]
  for (const rect of obstacles) for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const p = { x: rect.x + sx * (rect.w / 2 + TAVERN_CLEARANCE + .005),
      z: rect.z + sz * (rect.d / 2 + TAVERN_CLEARANCE + .005) }
    if (inside(p) && tavernSegmentClear(obstacles, p, p)) nodes.push(p)
  }
  const distance = nodes.map(() => Infinity), previous = nodes.map(() => -1), visited = new Set<number>()
  distance[0] = 0
  for (let step = 0; step < nodes.length; step++) {
    let current = -1
    for (let i = 0; i < nodes.length; i++) if (!visited.has(i) && (current < 0 || distance[i] < distance[current])) current = i
    if (current < 0 || !Number.isFinite(distance[current])) return null
    if (current === 1) {
      const path: TilePos[] = []
      for (let i = 1; i !== -1; i = previous[i]) path.push(nodes[i])
      return path.reverse()
    }
    visited.add(current)
    for (let i = 0; i < nodes.length; i++) {
      if (visited.has(i) || !clear(nodes[current], nodes[i])) continue
      const candidate = distance[current] + Math.hypot(nodes[current].x - nodes[i].x, nodes[current].z - nodes[i].z)
      if (candidate < distance[i]) { distance[i] = candidate; previous[i] = current }
    }
  }
  return null
}

function local(map: GameMap, building: BuildingDef, p: TilePos): TilePos {
  return tavernLocalPoint(building, { x: p.x + map.width / 2 - .5, z: p.z + map.depth / 2 - .5 })
}
export function tavernWorldPoint(map: GameMap, building: BuildingDef, p: TilePos): TavernWalkPoint {
  const offset = rotateBuildingPoint(p.x, p.z, building.rotation)
  const x = tileToWorldX(map, building.x) + (building.w - 1) / 2 + offset.x
  const z = tileToWorldZ(map, building.z) + (building.d - 1) / 2 + offset.z
  return { x, z, y: surfaceHeight(map, worldToTileX(map, x), worldToTileZ(map, z)) }
}
function tavernAt(map: GameMap, p: TilePos) {
  return map.buildings.find(b => b.buildType === "tavern" && (!b.construction || b.construction.work >= b.construction.required)
    && Math.abs(local(map, b, p).x) < rotatedFootprint(b, b.rotation).w / 2
    && Math.abs(local(map, b, p).z) < rotatedFootprint(b, b.rotation).d / 2)
}

/** Undefined delegates ordinary travel; null means the tavern trip is blocked. */
export function tavernWalkingRoute(map: GameMap, from: TavernWalkPoint, to: TavernWalkPoint, seat?: string): TavernWalkPoint[] | null | undefined {
  const start = tavernAt(map, from), end = tavernAt(map, to)
  if (!start && !end) {
    const exterior = map.buildings.some(b => {
      if (b.buildType !== "tavern") return false
      const { w, d } = rotatedFootprint(b, b.rotation)
      return tavernLayout(w, d).exteriorBenches.some(bench =>
        same(local(map, b, from), bench) || same(local(map, b, to), bench))
    })
    if (!exterior) return undefined
    const route = settlementRoute(map, map.buildings,
      { x: worldToTileX(map, from.x), z: worldToTileZ(map, from.z) },
      { x: worldToTileX(map, to.x), z: worldToTileZ(map, to.z) }, false, true)
    return route ? [from, ...route.map(p => ({ x: tileToWorldX(map, p.x), z: tileToWorldZ(map, p.z),
      y: surfaceHeight(map, p.x, p.z) })), to] : null
  }
  if (start && start === end) return tavernInteriorRoute(start, local(map, start, from), local(map, start, to), seat)
    ?.map(p => tavernWorldPoint(map, start, p)) ?? null
  const options = (building: BuildingDef | undefined, point: TavernWalkPoint, leaving: boolean) => {
    if (!building) return [{ outside: point, route: [point] }]
    const { w, d } = rotatedFootprint(building, building.rotation)
    return ([1, -1] as const).flatMap(side => {
      const door = { x: buildingDoorOffset(w, "tavern"), z: side * (d / 2 - .16) }
      const path = tavernInteriorRoute(building, leaving ? local(map, building, point) : door,
        leaving ? door : local(map, building, point), leaving ? undefined : seat)
      if (!path) return []
      const entry = buildingEntry(building, false, side)
      const outside = { x: tileToWorldX(map, entry.x), z: tileToWorldZ(map, entry.z), y: surfaceHeight(map, entry.x, entry.z) }
      const route = path.map(p => tavernWorldPoint(map, building, p))
      return [{ outside, route: leaving ? [...route, outside] : [outside, ...route] }]
    })
  }
  let best: TavernWalkPoint[] | null = null, length = Infinity
  for (const a of options(start, from, true)) for (const b of options(end, to, false)) {
    const path = settlementRoute(map, map.buildings,
      { x: worldToTileX(map, a.outside.x), z: worldToTileZ(map, a.outside.z) },
      { x: worldToTileX(map, b.outside.x), z: worldToTileZ(map, b.outside.z) }, false, true)
    if (!path) continue
    const route = [...a.route, ...path.map(p => ({ x: tileToWorldX(map, p.x), z: tileToWorldZ(map, p.z), y: surfaceHeight(map, p.x, p.z) })), ...b.route]
    const distance = route.reduce((sum, p, i) => sum + (i ? Math.hypot(p.x - route[i - 1].x, p.z - route[i - 1].z) : 0), 0)
    if (distance < length) { best = route; length = distance }
  }
  return best
}
