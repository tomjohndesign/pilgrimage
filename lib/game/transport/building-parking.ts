import { buildingYaw, rotateBuildingPoint, rotatedFootprint } from "../building-rotation"
import { marketLayout } from "../market-layout"
import { MinHeap } from "../map/route"
import { tileToWorldX, tileToWorldZ, type BuildingDef, type GameMap } from "../map/types"
import { cartOffset, type Puller } from "./assets"
import { alignCart, followCart, type CartPose } from "./follow"
import { parkingClear, type ParkingContext, type ShrineParking } from "./navigation"
import type { Point } from "./roadside"

export interface MarketParking extends ShrineParking { buildingId: string }

/** Sample the full rigid convoy along a hitch segment, including the animal's
 * turn. Planning and playback use the same distance-driven trailer motion. */
export function driveSegment(pose: CartPose, to: Point, wheelbase: number, clear: (pose: CartPose, heading: number) => boolean): CartPose | null {
  const from = pose.hitch, distance = Math.hypot(to.x - from.x, to.z - from.z)
  const heading = distance > 1e-8 ? Math.atan2(to.x - from.x, to.z - from.z) : pose.heading
  const steps = Math.max(1, Math.ceil(distance / .04))
  for (let i = 1; i <= steps; i++) {
    pose = followCart(pose, { x: from.x + (to.x - from.x) * i / steps, z: from.z + (to.z - from.z) * i / steps }, wheelbase)
    if (!clear(pose, heading)) return null
  }
  return pose
}

/** Bounded forward-only search. Heading is part of the state: a pedestrian
 * route around a corner is not necessarily traversable with a trailing axle. */
export function cartPath(map: GameMap, initial: CartPose, goal: Point, puller: Puller, scale: number,
  context: ParkingContext, goalHeading?: number): { entry: Point[]; parked: CartPose } | null {
  const wheelbase = -cartOffset(puller) * scale
  const clear = (pose: CartPose, heading: number) => parkingClear(map, pose, puller, scale, context, false, heading)
  if (!clear(initial, initial.heading)) return null
  const headings = goalHeading === undefined ? Array.from({ length: 8 }, (_, i) => i * Math.PI / 4) : [goalHeading]
  if (!headings.some(heading => clear(alignCart(goal, heading, wheelbase), heading))) return null
  const turn = (a: number, b: number) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)))
  const key = (p: CartPose, heading: number) => `${Math.round(p.hitch.x * 2)}:${Math.round(p.hitch.z * 2)}:${Math.round(heading * 8 / Math.PI)}:${Math.round(p.heading * 8 / Math.PI)}`
  const heuristic = (p: Point) => Math.hypot(p.x - goal.x, p.z - goal.z)
  const nodes = [{ pose: initial, heading: initial.heading, parent: -1, cost: 0 }]
  const costs = new Map<string, number>([[key(initial, initial.heading), 0]])
  const queue = new MinHeap(); queue.push(0, heuristic(initial.hitch))
  for (let visited = 0; queue.size && visited < 2000; visited++) {
    const index = queue.pop(), node = nodes[index], { pose, heading } = node
    if (node.cost > costs.get(key(pose, heading))!) continue
    const distance = heuristic(pose.hitch), toward = Math.atan2(goal.x - pose.hitch.x, goal.z - pose.hitch.z)
    if (distance <= 1 && (distance < .01 || turn(toward, heading) <= Math.PI / 4) &&
      (goalHeading === undefined || turn(toward, goalHeading) < .2)) {
      const parked = driveSegment(pose, goal, wheelbase, clear)
      if (parked && (goalHeading === undefined || turn(parked.heading, goalHeading) < .25)) {
        const entry: Point[] = [goal]
        for (let i = index; i >= 0; i = nodes[i].parent) entry.push(nodes[i].pose.hitch)
        return { entry: entry.reverse(), parked }
      }
    }
    for (const delta of [0, -Math.PI / 8, Math.PI / 8, -Math.PI / 4, Math.PI / 4]) {
      const nextHeading = Math.atan2(Math.sin(heading + delta), Math.cos(heading + delta))
      const to = { x: pose.hitch.x + Math.sin(nextHeading) * .5, z: pose.hitch.z + Math.cos(nextHeading) * .5 }
      // Keep failed searches local to the journey rather than exploring the map.
      if (heuristic(to) > heuristic(initial.hitch) + 8) continue
      const next = driveSegment(pose, to, wheelbase, clear)
      if (!next) continue
      const cost = node.cost + .5 + Math.abs(delta) * .15, id = key(next, nextHeading)
      if (cost >= (costs.get(id) ?? Infinity)) continue
      costs.set(id, cost)
      nodes.push({ pose: next, heading: nextHeading, parent: index, cost })
      queue.push(nodes.length - 1, cost + heuristic(to) * 1.15)
    }
  }
  return null
}

/** Park lengthwise across the open rear yard, approaching from either side.
 * The parked pose is the actual arrival pose, never a snapped replacement. */
export function marketParking(map: GameMap, building: BuildingDef, initial: CartPose, puller: Puller, scale: number,
  context: ParkingContext): MarketParking | null {
  const size = rotatedFootprint(building, building.rotation), layout = marketLayout(size.w, size.d)
  if (layout.yardDepth < 2 || size.w < 4) return null
  const local = (x: number, z: number) => {
    const p = rotateBuildingPoint(x, z, building.rotation)
    return { x: tileToWorldX(map, building.x) + (building.w - 1) / 2 + p.x,
      z: tileToWorldZ(map, building.z) + (building.d - 1) / 2 + p.z }
  }
  const sides = [1, -1].sort((a, b) => {
    const x = local(-a * size.w / 2, layout.yardZ), y = local(-b * size.w / 2, layout.yardZ)
    return Math.hypot(x.x - initial.hitch.x, x.z - initial.hitch.z) - Math.hypot(y.x - initial.hitch.x, y.z - initial.hitch.z)
  })
  for (const side of sides) {
    const goal = local(side * .6, layout.yardZ), heading = side * Math.PI / 2 + buildingYaw(building.rotation)
    if (!parkingClear(map, alignCart(goal, heading, -cartOffset(puller) * scale), puller, scale, context)) continue
    const route = cartPath(map, initial, goal, puller, scale, context, heading)
    if (route) return { ...route, buildingId: building.id, pose: initial, exit: [], returnProgress: 0, distance: 0, walking: false }
  }
  return null
}
