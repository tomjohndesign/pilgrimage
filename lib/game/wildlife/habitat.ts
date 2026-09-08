import { walkingSurface } from "../map/walking-surface"
import { isWoods } from "../map/terrain"
import { tileAt, tileToWorldX, tileToWorldZ, worldToTileX, worldToTileZ, type GameMap } from "../map/types"
import type { TreePlacement } from "../trees/placement"
import { isDomestic, type WildlifeKind } from "./species"
import { buildingSpatialQuery } from "../building-spatial"

export interface Point { x: number; z: number }
/** Distance fields make habitat queries constant-time even on large maps. */
function distanceField(map: GameMap, accepts: (i: number) => boolean) {
  const distance = new Uint16Array(map.tiles.length).fill(65535), queue: number[] = []
  map.tiles.forEach((_, i) => { if (accepts(i)) { distance[i] = 0; queue.push(i) } })
  for (let q = 0; q < queue.length; q++) {
    const i = queue[q], x = i % map.width, z = Math.floor(i / map.width)
    for (const [dx, dz] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
      const nx = x + dx, nz = z + dz, n = nz * map.width + nx
      if (nx < 0 || nz < 0 || nx >= map.width || nz >= map.depth || distance[n] <= distance[i] + 1) continue
      distance[n] = distance[i] + 1; queue.push(n)
    }
  }
  return distance
}
export function wildlifeHabitat(map: GameMap, trees: readonly TreePlacement[]) {
  const forest = distanceField(map, i => isWoods(map.tiles[i]))
  const roads = distanceField(map, i => ["path", "track", "bridge"].includes(map.tiles[i]))
  const trunks = new Map<number, TreePlacement[]>()
  trees.forEach(tree => {
    const i = worldToTileZ(map, tree.z) * map.width + worldToTileX(map, tree.x)
    const list = trunks.get(i) ?? []; list.push(tree); trunks.set(i, list)
  })
  return { map, forest, roads, trunks }
}
export type WildlifeHabitat = ReturnType<typeof wildlifeHabitat>

/** Optional finite clearance queries only need nearby footprints. Keep the
 * signed distance inside buildings so animals can retreat after construction. */
export function buildingDistance(map: GameMap, point: Point, limit = Infinity,
  nearby?: ReturnType<typeof buildingSpatialQuery>) {
  let distance = limit
  const buildings = nearby ? nearby({ x: point.x + map.width / 2 - .5, z: point.z + map.depth / 2 - .5 }) : map.buildings
  for (const b of buildings) {
    const x = tileToWorldX(map, b.x) - 0.5, z = tileToWorldZ(map, b.z) - 0.5
    const dx = Math.max(x - point.x, point.x - x - b.w), dz = Math.max(z - point.z, point.z - z - b.d)
    const signed = dx <= 0 && dz <= 0 ? Math.max(dx, dz) : Math.hypot(Math.max(0, dx), Math.max(0, dz))
    distance = Math.min(distance, signed)
  }
  return distance
}

/** Wild animals use quiet open ground; foxes and boars keep to the forest margin. */
export function habitatAllows(habitat: WildlifeHabitat, kind: WildlifeKind, point: Point, map = habitat.map, clearance = 0.18, buildingBuffer = isDomestic(kind) ? clearance + 0.25 : 3,
  nearbyBuildings?: ReturnType<typeof buildingSpatialQuery>) {
  const tx = worldToTileX(map, point.x), tz = worldToTileZ(map, point.z)
  const tile = tileAt(map, tx, tz), i = tz * map.width + tx
  if (!tile || !["grass", "clearing", "dirt", "hills"].includes(tile)) return false
  if (Math.abs(point.x) > map.width / 2 - clearance || Math.abs(point.z) > map.depth / 2 - clearance) return false
  if (buildingDistance(map, point, buildingBuffer, nearbyBuildings) < buildingBuffer - 1e-6) return false
  if (!isDomestic(kind) && habitat.roads[i] < 3) return false
  if ((kind === "fox" || kind === "boar") && habitat.forest[i] > 3) return false
  if ((kind === "deer" || kind === "buck") && habitat.forest[i] < 1) return false
  // Bodies, not just centres, must clear water and tree trunks.
  for (const [dx, dz] of [[clearance, 0], [-clearance, 0], [0, clearance], [0, -clearance]]) {
    const t = tileAt(map, worldToTileX(map, point.x + dx), worldToTileZ(map, point.z + dz))
    if (!t || ["water", "bridge"].includes(t)) return false
  }
  for (let z = tz - 1; z <= tz + 1; z++) for (let x = tx - 1; x <= tx + 1; x++) {
    for (const tree of habitat.trunks.get(z * map.width + x) ?? []) {
      if (Math.hypot(tree.x - point.x, tree.z - point.z) < clearance + (tree.shape?.trunkRadius ?? 0.1) * (tree.scale ?? 1)) return false
    }
  }
  return true
}

/** Sample the entire segment so two valid endpoints cannot shortcut a river or cliff. */
export function wildlifeSegmentClear(habitat: WildlifeHabitat, kind: WildlifeKind, from: Point, to: Point, map = habitat.map, clearance = 0.18,
  nearbyBuildings?: ReturnType<typeof buildingSpatialQuery>) {
  const steps = Math.max(1, Math.ceil(Math.hypot(to.x - from.x, to.z - from.z) / 0.12))
  let lastHeight = walkingSurface(map, from.x, from.z).height
  const limit = isDomestic(kind) ? clearance + 0.25 : 3
  let buildingBuffer = buildingDistance(map, from, limit, nearbyBuildings)
  for (let i = 1; i <= steps; i++) {
    const point = { x: from.x + (to.x - from.x) * i / steps, z: from.z + (to.z - from.z) * i / steps }
    // Construction can overtake an animal's quiet buffer. Allow it to walk out,
    // monotonically increasing its distance, instead of trapping it there forever.
    if (!habitatAllows(habitat, kind, point, map, clearance, buildingBuffer, nearbyBuildings)) return false
    buildingBuffer = buildingDistance(map, point, limit, nearbyBuildings)
    const height = walkingSurface(map, point.x, point.z).height
    if (Math.abs(height - lastHeight) > 0.16) return false
    lastHeight = height
  }
  return true
}
