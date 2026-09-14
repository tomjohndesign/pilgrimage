import { tileToWorldX, tileToWorldZ, type GameMap } from "../map/types"
import type { HorseStanding } from "../horse-standing"
import type { Puller } from "./assets"
import { alignCart, cartOnRoute, followCart, type CartPose } from "./follow"
import { convoyBuildingsClear, convoyPoint, parkingTree, type ParkingContext, type ShrineParking } from "./navigation"
import { roundRoute, routeLength, routePoint, type Point } from "./roadside"

/** Stands on the same side of the lane keep this much lane between their heads. */
const STAND_SPACING = 0.9
/** A trunk this close to an animal's head or a wagon's body takes the stand. */
const TRUNK_CLEARANCE = 0.7

/** Sample the whole rigid convoy along a route, stopping at the first sample
 * that fails the check. Returns the final pose, or null when blocked. */
function sampleRoute(pose: CartPose, route: readonly Point[], wheelbase: number, clear: (pose: CartPose) => boolean) {
  const length = routeLength(route)
  for (let d = 0.04; d < length + 0.04; d += 0.04) {
    pose = followCart(pose, routePoint(route, Math.min(d, length)), wheelbase)
    if (!clear(pose)) return null
  }
  return pose
}

/** Ride up the branch from the junction and out along the lane of the
 * horse-standing, and leave the horse or wagon a tile off the lane; then
 * come back down to rejoin the road just past the fork. Stands are taken
 * nearest the branch first, on whichever side is free, and only another
 * animal or a trunk takes a stand: the lane is a place people know, not a
 * structure, so nothing else is checked there. The track is as public as the
 * road, so the ride up and back is checked for structures only, as playback
 * does. Leaving is a forward loop back onto the lane, so a wagon never
 * reverses. No standing, or a covered fork, fails, sending the rider back to
 * the roadside verge instead. */
export function enclaveParking(map: GameMap, standing: HorseStanding | null, progress: number, direction: 1 | -1, wheelbase: number, puller: Puller, scale: number,
  occupied: readonly CartPose[] = [], context: ParkingContext = { trees: [] }): ShrineParking | null {
  const site = map.site, road = map.road
  if (!site || !road || !standing || standing.lane.length < 3) return null
  const returnProgress = site.junction + direction * 1.5
  if (returnProgress < 0 || returnProgress > road.length - 1) return null
  const world = (p: { x: number; z: number }) => ({ x: tileToWorldX(map, p.x), z: tileToWorldZ(map, p.z) })
  const track = site.branch.slice(0, standing.fork + 1).map(world), fork = track[standing.fork]
  const lane = standing.lane.map(world)
  const u = { x: lane[1].x - fork.x, z: lane[1].z - fork.z }, heading = Math.atan2(u.x, u.z)
  const initial = cartOnRoute(progress, direction, wheelbase, p => convoyPoint(map, p, scale, direction))
  const structures = (pose: CartPose) => convoyBuildingsClear(map, pose, puller, scale)
  // Along the road to the fork, then up the track tile by tile.
  const approach: Point[] = []
  const steps = Math.max(1, Math.ceil(Math.abs(site.junction - progress) / 0.5))
  for (let i = 0; i < steps; i++) approach.push(convoyPoint(map, progress + (site.junction - progress) * i / steps, scale, direction))
  const roadExit = [convoyPoint(map, site.junction + direction, scale, direction), convoyPoint(map, returnProgress, scale, direction)]
  // The way in: is the ride up the track and to the lane's mouth clear of structures?
  const arrival = sampleRoute(initial, roundRoute([...approach, ...track], 0.45), wheelbase, structures)
  if (!arrival) return null
  // Points along the lane and across from it, in tiles from the fork.
  const at = (along: number, across: number, side: number) => ({ x: fork.x + u.x * along + u.z * across * side, z: fork.z + u.z * along - u.x * across * side })
  const taken = (p: Point) => occupied.some(pose => Math.hypot(pose.hitch.x - p.x, pose.hitch.z - p.z) < STAND_SPACING)
    || context.trees.some(tree => !tree.walking && Math.hypot(tree.x - p.x, tree.z - p.z) < TRUNK_CLEARANCE)
  const lastTurnOff = standing.lane.length - 1 - 2 - Math.ceil(wheelbase)
  for (let j = 0; j <= lastTurnOff; j++) for (const side of [1, -1]) {
    // Turn off the lane at tile j and stand parallel to it, a tile across, the
    // whole convoy straightened out ahead of the turn.
    const park = at(j + 2 + wheelbase, 1, side), body = at(j + 2 + wheelbase / 2, 1, side)
    if (taken(park) || (wheelbase > 0 && taken(body))) continue
    const parked = alignCart(park, heading, wheelbase)
    const entry = roundRoute([...approach, ...track, ...lane.slice(1, j + 1), at(j + 0.4, 0, side), at(j + 1.4, 1, side), park], 0.45)
    // Pull forward and turn about out into the field, then drop back onto the lane facing the branch.
    const radius = 0.75, loop: Point[] = []
    for (let i = 0; i <= 8; i++) {
      const angle = i / 8 * Math.PI
      loop.push(at(j + 2.6 + wheelbase + Math.sin(angle) * radius, 1 + radius * (1 - Math.cos(angle)), side))
    }
    const back = j > 0 ? lane.slice(1, j).reverse() : []
    const exit = roundRoute([park, ...loop, at(j + 0.6, 0, side), ...back, ...track.slice(0, standing.fork).reverse(), ...roadExit], 0.45)
    const tree = puller === "hand" ? undefined : parkingTree(map, parked, context.trees)
    return { tree, entry, exit, pose: initial, parked, returnProgress, distance: 0, walking: false }
  }
  return null
}
