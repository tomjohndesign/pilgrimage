import { mapBuildingQuery } from "../building-spatial"
import type { GameMap } from "../map/types"
import type { WalkingShortcut } from "../walking-shortcuts"
import { cartOffset, type Puller } from "./assets"
import { cartPath } from "./building-parking"
import { roadCartPose } from "./bridge-guide"
import type { CartPose } from "./follow"
import { convoyBuildingsClear, convoyPoint, type ParkingContext } from "./navigation"
import { advanceCartProgress } from "./route"
import { routeLength } from "./roadside"

/** Notice walls with the whole moving convoy, including the axle cutting the
 * inside of a bend whose road tiles are all open to pedestrians. */
export function cartRoadDiversion(map: GameMap, initial: CartPose, progress: number, direction: 1 | -1,
  puller: Puller, scale: number, getContext: () => ParkingContext): WalkingShortcut | null {
  const wheelbase = -cartOffset(puller) * scale, lookahead = wheelbase + 4
  const nearby = mapBuildingQuery(map, Math.ceil(lookahead + wheelbase + 2))
  if (!nearby({ x: initial.hitch.x + (map.width - 1) / 2, z: initial.hitch.z + (map.depth - 1) / 2 }).length) return null
  const last = (map.road?.length ?? 1) - 1
  let pose = initial, at = progress, blocked: number | undefined
  for (let distance = .1; distance <= lookahead; distance += .1) {
    const next = advanceCartProgress(map, at, direction * .1)
    if (next < 0 || next > last) break
    const hitch = convoyPoint(map, next)
    const heading = Math.atan2(hitch.x - pose.hitch.x, hitch.z - pose.hitch.z)
    pose = roadCartPose(map, next, direction, wheelbase, scale, pose)
    if (!convoyBuildingsClear(map, pose, puller, scale, heading) || !convoyBuildingsClear(map, pose, puller, scale)) {
      blocked = next
      break
    }
    at = next
  }
  if (blocked === undefined) return null
  const context = getContext()
  // Rejoin beyond the obstruction with the axle already facing down the road.
  // A pedestrian's nearest free tile can leave the cart scraping the same wall.
  for (let beyond = wheelbase + 2; beyond <= wheelbase + 12; beyond += 2) {
    const end = advanceCartProgress(map, blocked, direction * beyond)
    if (end < 0 || end > last) break
    const to = convoyPoint(map, end), ahead = convoyPoint(map, advanceCartProgress(map, end, direction * .1))
    const heading = Math.atan2(ahead.x - to.x, ahead.z - to.z)
    const drive = cartPath(map, initial, to, puller, scale, context, heading)
    if (!drive) continue
    return { from: initial.hitch, to, start: progress, end,
      via: drive.entry.slice(1, -1), length: routeLength(drive.entry), distance: 0 }
  }
  return null
}
