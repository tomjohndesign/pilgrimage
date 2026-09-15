import { offsetRoadsideSignposts } from "./signpost"
import { bridgeLayout } from "./bridges"
import { roadLanePoint } from "./road-lane"
import { clearMainRoadVerge, mainRoadWidthAt } from "./road-width"
import { tileAt, type GameMap } from "./types"

/** Lay actual path nodes under the shared rendered/walking corridor. A straight
 * road occupies two adjacent rows, with its median on their shared tile edge.
 * The ordered route remains the reference for junction and journey progress. */
export function layMainRoadTiles(map: GameMap): void {
  if ((map.mainRoadWidth ?? 1) <= 1 || !map.road?.length || map.mainRoadGround) return
  clearMainRoadVerge(map)
  map.mainRoadGround = {}
  const road = map.road, bridges = bridgeLayout(map), occupied = new Set<number>()
  for (const building of map.buildings)
    for (let z = building.z; z < building.z + building.d; z++)
      for (let x = building.x; x < building.x + building.w; x++) occupied.add(z * map.width + x)
  for (const crossroad of map.crossroads ?? []) if (crossroad.arms.length > 3) occupied.add(crossroad.center.z * map.width + crossroad.center.x)
  const nodes = new Set<number>()
  for (let progress = 0; progress <= road.length - 1; progress += .125) {
    const centre = roadLanePoint(map, road, progress, 0)
    if (!centre) continue
    const radius = mainRoadWidthAt(map, progress) / 2
    for (let z = Math.ceil(centre.z - radius - .5); z <= Math.floor(centre.z + radius + .5); z++) {
      for (let x = Math.ceil(centre.x - radius - .5); x <= Math.floor(centre.x + radius + .5); x++) {
        const index = z * map.width + x, terrain = tileAt(map, x, z)
        if (occupied.has(index) || bridges.rise[index] > 0 || !terrain
          || !["grass", "clearing", "dirt", "sand"].includes(terrain)) continue
        // Reserve every tile whose interior the road crosses, including the
        // partial cells at diagonals. A tangent at a straight verge does not
        // claim the next grass row.
        const dx = Math.max(0, Math.abs(x - centre.x) - .5)
        const dz = Math.max(0, Math.abs(z - centre.z) - .5)
        if (Math.hypot(dx, dz) < radius - 1e-6) nodes.add(index)
      }
    }
  }
  // Publish after sampling, so the topology cannot change partway through laying.
  for (const index of nodes) {
    map.mainRoadGround[index] = map.tiles[index]
    map.tiles[index] = "path"
  }
  offsetRoadsideSignposts(map)
}
