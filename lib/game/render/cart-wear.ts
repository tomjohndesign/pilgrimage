import { BASE_CHARACTER_SCALE } from "../base-person/gait"
import { bridgeLayout } from "../map/bridges"
import { tileAt, tileToWorldX, tileToWorldZ, type GameMap } from "../map/types"
import { cartOffset, CART_WHEEL_X, CART_WIDTH_SCALE, RIG_TO_WORLD } from "../transport/assets"
import { cartOnRoute, followCart, type CartPose } from "../transport/follow"
import { cartRoute, cartRoutePoint } from "../transport/route"
import { distanceToRoadSegments, type RoadSegment } from "./road-segments"

/** Actual left/right wheel centres, keeping the grass between the ruts. */
export function cartWheelContacts(pose: CartPose) {
  const halfTrack = CART_WHEEL_X * CART_WIDTH_SCALE * RIG_TO_WORLD * BASE_CHARACTER_SCALE
  return [-1, 1].map(side => ({ x: pose.x + side * Math.cos(pose.heading) * halfTrack,
    z: pose.z - side * Math.sin(pose.heading) * halfTrack }))
}

/** Paired wheel ruts on the inside of ordinary corners, sampled from the
 * trailing axle of a horse cart. Kind 3 is wear only, without a road edge.
 * This adds surface colour; it never edits tiles or pedestrian routes. */
export function cartCornerWear(map: GameMap, excluded: ReadonlySet<number> = new Set()): Map<number, RoadSegment[]> {
  const bins = new Map<number, RoadSegment[]>(), fullRoute = cartRoute(map), road = map.road ?? []
  // Surface wear needs fewer samples than steering. Keep the segment texture
  // compact while preserving long straights and the ends of each turn.
  const route = fullRoute.filter((p, i) => !i || i === fullRoute.length - 1 || i % 5 === 0 ||
    Math.abs(p.distance - fullRoute[i - 1].distance) > 0.12 || Math.abs(fullRoute[i + 1].distance - p.distance) > 0.12)
  if (route.length < 2) return bins
  const original: RoadSegment[] = road.slice(1).map((p, i) => [tileToWorldX(map, road[i].x), tileToWorldZ(map, road[i].z), tileToWorldX(map, p.x), tileToWorldZ(map, p.z), 0])
  const layout = bridgeLayout(map), wheelbase = -cartOffset("horse") * BASE_CHARACTER_SCALE
  const blocked = new Set(excluded)
  for (const b of map.buildings) for (let z = b.z; z < b.z + b.d; z++) for (let x = b.x; x < b.x + b.w; x++) blocked.add(z * map.width + x)
  const bin = (a: {x: number; z: number}, b: {x: number; z: number}) => {
    const ax = a.x + map.width / 2, az = a.z + map.depth / 2, bx = b.x + map.width / 2, bz = b.z + map.depth / 2
    const reach = 0.12
    for (let z = Math.floor(Math.min(az, bz) - reach); z <= Math.floor(Math.max(az, bz) + reach); z++) {
      for (let x = Math.floor(Math.min(ax, bx) - reach); x <= Math.floor(Math.max(ax, bx) + reach); x++) {
        const index = z * map.width + x, terrain = tileAt(map, x, z)
        if (blocked.has(index) || layout.rise[index] || !["grass", "clearing", "dirt", "path", "track"].includes(terrain ?? "")) continue
        const segments = bins.get(index) ?? []
        segments.push([ax - x, az - z, bx - x, bz - z, 3]); bins.set(index, segments)
      }
    }
  }
  // One coherent pair follows the canonical road direction. Unioning both
  // directional axle sweeps would erase the grassy median at tight bends.
  let pose = cartOnRoute(route[0].progress, 1, wheelbase, p => cartRoutePoint(map, p)), travelled = 0
  for (let i = 1; i < route.length; i++) {
    const a = route[i - 1], b = route[i], steps = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 0.12))
    for (let j = 1; j <= steps; j++) {
      const hitch = { x: a.x + (b.x - a.x) * j / steps, z: a.z + (b.z - a.z) * j / steps }
      const next = followCart(pose, hitch, wheelbase)
      travelled += Math.hypot(hitch.x - pose.hitch.x, hitch.z - pose.hitch.z)
      if (travelled >= wheelbase && distanceToRoadSegments((pose.x + next.x) / 2, (pose.z + next.z) / 2, original) >= 0.16) {
        const before = cartWheelContacts(pose), after = cartWheelContacts(next)
        for (let wheel = 0; wheel < 2; wheel++) bin(before[wheel], after[wheel])
      }
      pose = next
    }
  }
  return bins
}
