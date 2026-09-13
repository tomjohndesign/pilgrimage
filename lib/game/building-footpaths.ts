import { buildingApproach, buildingEntry, wellApproaches } from "./building-rotation"
import { footpathEdgeKey, markGroundChanged, type Footpaths } from "./footpaths"
import { settlementRoute, shrineRoadHead } from "./settlement-route"
import { shortcutCost } from "./walking-shortcuts"
import { tileToWorldX, tileToWorldZ, type BuildingDef, type GameMap, type TilePos } from "./map/types"

const connections = new WeakMap<Footpaths, { buildings: GameMap["buildings"]; tiles: GameMap["tiles"]; elevation: GameMap["elevation"] }>()

/** Connect new construction to the settlement with invisible walking preferences.
 * Rebuild after placement/removal so routes go around the current footprints.
 * Only real footsteps create wear; rebuilding never paints or erases a path. */
export function syncBuildingFootpaths(map: GameMap): void {
  const paths = map.footpaths
  if (!paths) return
  const previous = connections.get(paths)
  if (previous?.buildings === map.buildings && previous.tiles === map.tiles && previous.elevation === map.elevation) return
  connections.set(paths, { buildings: map.buildings, tiles: map.tiles, elevation: map.elevation })
  paths.planned.clear()
  for (const building of map.buildings) {
    if (building.supportId) continue
    if (building.buildType === "well") addWellPerimeter(map, paths, building)
    const entries = building.buildType === "well" ? wellApproaches(building)
      : [buildingApproach(map, building) ?? buildingEntry(building, false, building.churchId ? -1 : 1)]
    const town = building.townId && map.towns?.find(town => town.id === building.townId)
    const root = town && map.road?.[town.junction] || map.site?.door
      || map.road?.reduce((best, point) => distance(point, entries[0]) < distance(best, entries[0]) ? point : best)
    if (!root) continue
    let best: TilePos[] | null = null
    for (const entry of entries) {
      const route = settlementRoute(map, map.buildings, root, entry)
      if (route && (!best || route.length < best.length)) best = route
    }
    if (best) addRoute(paths, map.width, best)
  }
  // The founding approach also belongs to this network if later construction
  // covers its old track and forces a new way in from the road.
  const head = shrineRoadHead(map)
  if (head && map.site) {
    const route = settlementRoute(map, map.buildings, head, map.site.door)
    if (route) addRoute(paths, map.width, route)
  }
  markGroundChanged(paths)
}

/** Join every side of the curb, including corners, without manufacturing wear.
 * Blocked stretches stay out of the network; the remaining sides still work. */
function addWellPerimeter(map: GameMap, paths: Footpaths, well: BuildingDef): void {
  const left = well.x - 1, right = well.x + well.w, top = well.z - 1, bottom = well.z + well.d
  const ring: TilePos[] = []
  for (let x = left; x < right; x++) ring.push({ x, z: top })
  for (let z = top; z < bottom; z++) ring.push({ x: right, z })
  for (let x = right; x > left; x--) ring.push({ x, z: bottom })
  for (let z = bottom; z > top; z--) ring.push({ x: left, z })
  const world = (p: TilePos) => ({ x: tileToWorldX(map, p.x), z: tileToWorldZ(map, p.z) })
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i], b = ring[(i + 1) % ring.length]
    if (Number.isFinite(shortcutCost(map, world(a), world(b), true))) addRoute(paths, map.width, [a, b])
  }
}

function distance(a: TilePos, b: TilePos): number { return Math.abs(a.x - b.x) + Math.abs(a.z - b.z) }

function addRoute(paths: Footpaths, width: number, route: TilePos[]): void {
  for (let i = 1; i < route.length; i++) {
    const a = route[i - 1], b = route[i]
    paths.planned.add(footpathEdgeKey(a.z * width + a.x, b.z * width + b.x))
  }
}
