import { tileAt, tileToWorldX, tileToWorldZ, worldToTileX, worldToTileZ, type GameMap } from "../map/types"
import { buildingAt } from "../settlement"
import type { Puller } from "./assets"
import { alignCart, cartOnRoute, followCart, type CartPose } from "./follow"
import { convoyBuildingsClear, convoyPoint, convoyBounds, parkingClear, parkingTree, type ParkingContext, type ShrineParking } from "./navigation"
import { roundRoute, routeLength, routePoint, type Point } from "./roadside"

/** How far from the shrine door, in tiles, a horse may be left standing. */
export const ENCLAVE_FIELD_RADIUS = 10
/** Keep the doorway, the gate walk and the shrine's own walls open. */
const DOOR_CLEARANCE = 2.5, WALL_CLEARANCE = 1.5

/** Sample the whole rigid convoy along a route, stopping at the first sample
 * that fails the check. Returns the final pose, or null when blocked. */
function sampleRoute(pose: CartPose, route: readonly Point[], wheelbase: number, clear: (pose: CartPose) => boolean,
  visit?: (pose: CartPose) => void) {
  const length = routeLength(route)
  for (let d = 0.04; d < length + 0.04; d += 0.04) {
    pose = followCart(pose, routePoint(route, Math.min(d, length)), wheelbase)
    if (!clear(pose)) return null
    visit?.(pose)
  }
  return pose
}

/** Ride up the branch from the junction and leave the horse or wagon standing
 * in the field beside the shrine, then drive back down to rejoin the road
 * just past the fork. The pull-off matches the roadside verge stop; leaving
 * is a forward loop back onto the track, so a wagon never reverses. The track
 * is as public as the road, so it is checked for structures only, as playback
 * does; the turn into the field and back must also clear trunks, people and
 * reserved stops. A covered fork fails every candidate, sending the rider
 * back to the roadside verge instead. */
export function enclaveParking(map: GameMap, progress: number, direction: 1 | -1, wheelbase: number, puller: Puller, scale: number,
  occupied: readonly CartPose[] = [], context: ParkingContext = { trees: [] }): ShrineParking | null {
  const site = map.site, road = map.road, shrine = map.buildings.find(b => b.id === site?.hovelId)
  if (!site || !road || !shrine || site.branch.length < 3) return null
  const returnProgress = site.junction + direction * 1.5
  if (returnProgress < 0 || returnProgress > road.length - 1) return null
  const reserved = { ...context, obstacles: [...(context.obstacles ?? []), ...occupied.flatMap(pose => convoyBounds(pose, "horse", scale))] }
  const track = site.branch.map(p => ({ x: tileToWorldX(map, p.x), z: tileToWorldZ(map, p.z) })), door = track.at(-1)!
  const initial = cartOnRoute(progress, direction, wheelbase, p => convoyPoint(map, p, scale, direction))
  const structures = (pose: CartPose) => convoyBuildingsClear(map, pose, puller, scale)
  // Woods and trunks crowd the track's edges; they only matter once the
  // convoy has actually left the track for the grass.
  const field = (pose: CartPose) => ["track", "path", "bridge", "ford"].includes(tileAt(map, worldToTileX(map, pose.hitch.x), worldToTileZ(map, pose.hitch.z)) ?? "")
    ? structures(pose) : parkingClear(map, pose, puller, scale, reserved)
  // Along the road to the fork, then up the track tile by tile.
  const approach: Point[] = []
  const steps = Math.max(1, Math.ceil(Math.abs(site.junction - progress) / 0.5))
  for (let i = 0; i < steps; i++) approach.push(convoyPoint(map, progress + (site.junction - progress) * i / steps, scale, direction))
  const roadExit = [convoyPoint(map, site.junction + direction, scale, direction), convoyPoint(map, returnProgress, scale, direction)]
  // Turn-offs lie on the last stretch of the track, up to the door tile itself
  // for a glade whose open ground lies beyond the gate walk. Ride that stretch
  // once, keeping the convoy's pose as it reaches each tile; a track that
  // clips a wall further on still serves the tiles before it.
  const last = track.length - 1
  let first = last
  while (first > 1 && Math.hypot(track[first - 1].x - door.x, track[first - 1].z - door.z) <= ENCLAVE_FIELD_RADIUS + 3) first--
  const reached = new Map<number, { pose: CartPose; gap: number }>()
  sampleRoute(initial, roundRoute([...approach, ...track.slice(0, last + 1)], 0.45), wheelbase, structures, pose => {
    for (let k = first; k <= last; k++) {
      const gap = Math.hypot(pose.hitch.x - track[k].x, pose.hitch.z - track[k].z)
      if (gap < (reached.get(k)?.gap ?? 0.5)) reached.set(k, { pose, gap })
    }
  })
  const standAllowed = (p: Point) => {
    const x = worldToTileX(map, p.x), z = worldToTileZ(map, p.z), terrain = tileAt(map, x, z)
    if ((terrain !== "grass" && terrain !== "clearing") || buildingAt(map, x, z)) return false
    const fromDoor = Math.hypot(p.x - door.x, p.z - door.z)
    if (fromDoor < DOOR_CLEARANCE || fromDoor > ENCLAVE_FIELD_RADIUS) return false
    const dx = Math.max(shrine.x - x, 0, x - (shrine.x + shrine.w - 1)), dz = Math.max(shrine.z - z, 0, z - (shrine.z + shrine.d - 1))
    return Math.hypot(dx, dz) >= WALL_CLEARANCE
  }
  // Closest to the door first.
  for (let k = last; k >= first; k--) {
    const arrival = reached.get(k)
    if (!arrival) continue
    // Pull off in the direction the convoy is already travelling at this tile.
    const heading = Math.atan2(track[k].x - track[k - 1].x, track[k].z - track[k - 1].z)
    const local = (along: number, across: number, side: number) => ({ x: track[k].x + Math.sin(heading) * along + Math.cos(heading) * across * side,
      z: track[k].z + Math.cos(heading) * along - Math.sin(heading) * across * side })
    for (const side of [1, -1]) for (const depth of [1.5, 2, 2.5, 3]) for (const shape of ["along", "across"] as const) {
      // Stand parallel to the track, as on a roadside verge, or nose-in across
      // it where the field is a narrow pocket. Leaving is a forward loop back
      // onto the track facing the road either way.
      if (shape === "across" && depth < 2) continue
      const park = shape === "along" ? local(2 + wheelbase, depth, side) : local(2, depth, side)
      const stand = shape === "along" ? heading : Math.atan2(Math.sin(heading + side * Math.PI / 2), Math.cos(heading + side * Math.PI / 2))
      if (!standAllowed(park) || !parkingClear(map, alignCart(park, stand, wheelbase), puller, scale, reserved, true)) continue
      const pullOff = shape === "along" ? [local(0.4, 0, side), local(1.4, depth, side), park]
        : [local(0.4, 0, side), local(1.4, 0.6, side), local(2, 1.4, side), park]
      const parked = sampleRoute(arrival.pose, roundRoute([arrival.pose.hitch, ...pullOff], 0.45), wheelbase, field)
      if (!parked || !parkingClear(map, parked, puller, scale, reserved, true)) continue
      const radius = Math.max(0.75, Math.min(1.25, depth / 2))
      const loops: Point[][] = []
      if (shape === "along") for (const turn of [-1, 1]) {
        // Pull forward and turn about, towards the track or out into the field.
        const loop: Point[] = []
        for (let i = 0; i <= 8; i++) {
          const angle = i / 8 * Math.PI
          loop.push(local(2.6 + wheelbase + Math.sin(angle) * radius, depth + turn * radius * (1 - Math.cos(angle)), side))
        }
        loops.push([park, ...loop, local(0.6, 0, side), track[k - 1]])
      } else {
        // Pull further out, swing round towards the road and drop back onto the track.
        const loop: Point[] = []
        for (let i = 0; i <= 8; i++) {
          const angle = i / 8 * Math.PI
          loop.push(local(2 - radius + Math.cos(angle) * radius, depth + 0.6 + Math.sin(angle) * radius, side))
        }
        loops.push([park, ...loop, local(2 - 2 * radius, 0.7, side), local(2 - 2 * radius - 0.7, 0, side), track[k - 1]])
      }
      for (const about of loops) {
        const merged = sampleRoute(parked, roundRoute(about, 0.45), wheelbase, field)
        if (!merged || !sampleRoute(merged, roundRoute([track[k - 1], ...track.slice(0, k - 1).reverse(), ...roadExit], 0.45), wheelbase, structures)) continue
        const tree = puller === "hand" ? undefined : parkingTree(map, parked, context.trees)
        return { tree, entry: roundRoute([...approach, ...track.slice(0, k + 1), ...pullOff], 0.45),
          exit: roundRoute([...about, ...track.slice(0, k - 1).reverse(), ...roadExit], 0.45),
          pose: initial, parked, returnProgress, distance: 0, walking: false }
      }
    }
  }
  return null
}
