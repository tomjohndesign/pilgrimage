import type { GameMap } from "../game/map/types"
import { traveledRoadSegments, type TraveledRoad } from "../game/render/road-segments"
import { coords, indexAt, pathEdgeIndex, stepAllowed, WALK_DIRS, WIDTH, DEPTH, type PathWorld } from "./simulation"

/** Feed the real terrain renderer only links with physical passage, using each link's own wear. */
export function townRoadSegments(world: PathWorld, map: GameMap) {
  const roads: TraveledRoad[] = []
  for (let from = 0; from < world.pathLinks.length; from++) {
    const a = coords(from)
    WALK_DIRS.forEach(([dx, dz], direction) => {
      if (!(world.pathLinks[from] & (1 << direction))) return
      const x = a.x + dx, z = a.z + dz, to = indexAt(x, z)
      if (x < 0 || z < 0 || x >= WIDTH || z >= DEPTH || to <= from || !stepAllowed(world.blocked, from, to)) return
      const wear = Math.min(world.edgeWear[pathEdgeIndex(from, to)], world.wear[from], world.wear[to])
      roads.push({ ax: a.x + .5, az: a.z + .5, bx: x + .5, bz: z + .5, wear })
    })
  }
  return traveledRoadSegments(map, roads)
}
