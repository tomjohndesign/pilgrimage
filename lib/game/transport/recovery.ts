import type { GameMap } from "../map/types"
import { cartOffset, type Puller } from "./assets"
import { roadCartPose } from "./bridge-guide"
import { cartPath, driveSegment } from "./building-parking"
import type { CartPose } from "./follow"
import { convoyBuildingsClear, parkingClear, type ParkingContext } from "./navigation"
import { advanceCartProgress } from "./route"
import { routeLength } from "./roadside"
import type { WalkingShortcut } from "../walking-shortcuts"

/** Rejoin nearby traffic after a construction edit invalidates a maneuver.
 * Only a convoy already inside a new footprint may be set down elsewhere;
 * otherwise every step of the replacement route must pass normal clearance. */
export function recoverCart(map: GameMap, initial: CartPose, progress: number, direction: 1 | -1,
  puller: Puller, scale: number, context: ParkingContext): { pose: CartPose; progress: number; route?: WalkingShortcut } | null {
  const wheelbase = -cartOffset(puller) * scale
  const embedded = !convoyBuildingsClear(map, initial, puller, scale)
  // People can move away while a convoy rejoins. Parked assets cannot.
  const fixed = { trees: context.trees, obstacles: context.obstacles }
  const starts = [initial]
  if (!embedded) for (const back of [.5, 1, 2, 3]) {
    const pose = driveSegment(initial, { x: initial.hitch.x - Math.sin(initial.heading) * back,
      z: initial.hitch.z - Math.cos(initial.heading) * back }, wheelbase,
    (p, heading) => parkingClear(map, p, puller, scale, fixed, false, heading) && parkingClear(map, p, puller, scale, fixed))
    if (!pose) break
    starts.push(pose)
  }
  for (const start of starts) {
    for (const sign of embedded ? [1, -1] : [1]) {
      for (let distance = 2; distance <= 16; distance += 2) {
        const end = advanceCartProgress(map, progress, direction * distance * sign)
        if (end <= 0 || end >= (map.road?.length ?? 1) - 1) continue
        const pose = roadCartPose(map, end, direction, wheelbase, scale)
        if (!parkingClear(map, pose, puller, scale, fixed)) continue
        if (embedded) return { pose, progress: end }
        const drive = cartPath(map, start, pose.hitch, puller, scale, fixed, pose.heading)
        if (drive) {
          const entry = start === initial ? drive.entry : [initial.hitch, ...drive.entry]
          return { pose: initial, progress, route: { from: initial.hitch, to: pose.hitch,
            start: progress, end, via: entry.slice(1, -1), length: routeLength(entry), distance: 0 } }
        }
      }
    }
  }
  return null
}
