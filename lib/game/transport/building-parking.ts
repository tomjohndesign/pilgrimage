import { buildingYaw, rotateBuildingPoint, rotatedFootprint } from "../building-rotation"
import { marketLayout } from "../market-layout"
import { MinHeap } from "../map/route"
import { tileToWorldX, tileToWorldZ, type BuildingDef, type GameMap } from "../map/types"
import { cartOffset, RIG_TO_WORLD, type Puller } from "./assets"
import { alignCart, followCart, type CartPose } from "./follow"
import { parkingClear, type ParkingContext, type ShrineParking } from "./navigation"
import { routePoint, type Point } from "./roadside"

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

/** Preserve every planned bend when one simulation tick crosses several
 * waypoints; a chord between tick endpoints can drag the axle into a wall. */
export function driveRouteSegment(pose: CartPose, route: readonly Point[], start: number, end: number,
  wheelbase: number, clear: (pose: CartPose, heading: number) => boolean): CartPose | null {
  let distance = 0
  for (let i = 1; i < route.length; i++) {
    distance += Math.hypot(route[i].x - route[i - 1].x, route[i].z - route[i - 1].z)
    if (distance >= end) break
    if (distance <= start) continue
    const next = driveSegment(pose, route[i], wheelbase, clear)
    if (!next) return null
    pose = next
  }
  return driveSegment(pose, routePoint(route, end), wheelbase, clear)
}

/** Heuristic weights for reaching a goal at a set heading, per radian of turn,
 * unit of sideways offset and unit the goal lies behind the hitch. */
const GUIDE = { turn: 2, lateral: 2, behind: 4 }

/** Bounded forward-only search. Heading is part of the state: a pedestrian
 * route around a corner is not necessarily traversable with a trailing axle. */
export function cartPath(map: GameMap, initial: CartPose, goal: Point, puller: Puller, scale: number,
  context: ParkingContext, goalHeading?: number): { entry: Point[]; parked: CartPose } | null {
  const wheelbase = -cartOffset(puller) * scale
  // Playback also checks the animal aligned with the shafts after each tick.
  // A route that only clears its instantaneous travel heading can jam mid-turn.
  const clear = (pose: CartPose, heading: number) => parkingClear(map, pose, puller, scale, context, false, heading) &&
    parkingClear(map, pose, puller, scale, context)
  if (!clear(initial, initial.heading)) return null
  const headings = goalHeading === undefined ? Array.from({ length: 8 }, (_, i) => i * Math.PI / 4) : [goalHeading]
  if (!headings.some(heading => clear(alignCart(goal, heading, wheelbase), heading))) return null
  const turn = (a: number, b: number) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)))
  const key = (p: CartPose, heading: number) => `${Math.round(p.hitch.x * 2)}:${Math.round(p.hitch.z * 2)}:${Math.round(heading * 8 / Math.PI)}:${Math.round(p.heading * 8 / Math.PI)}`
  const heuristic = (p: Point) => Math.hypot(p.x - goal.x, p.z - goal.z)
  // Arriving at a fixed heading also costs the turn, any sideways offset from
  // the goal's line, and a loop back when the goal lies behind the cart. Without
  // these the search burns its budget on near-goal poses that cannot straighten.
  const guide = (p: Point, heading: number) => {
    if (goalHeading === undefined) return 0
    const dx = goal.x - p.x, dz = goal.z - p.z, sx = Math.sin(goalHeading), cz = Math.cos(goalHeading)
    const along = dx * sx + dz * cz, lateral = Math.abs(dx * cz - dz * sx)
    return turn(heading, goalHeading) * GUIDE.turn + lateral * GUIDE.lateral + Math.max(0, -along) * GUIDE.behind
  }
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
      queue.push(nodes.length - 1, cost + heuristic(to) * 1.15 + guide(to, nextHeading))
    }
  }
  return null
}

/** The parked cart keeps this much off the stall's side, toward the open
 * ground, so a team that is still settling straight clears the counter. */
const MARKET_BAY_OUTWARD = .15

/** Pull nose-first into the open bay beside the stall from whichever end is
 * nearer, and stop with the convoy centred on it: a long team may overhang the
 * open ground at either end, which the clearance checks keep free of buildings.
 * The parked pose is the actual arrival pose, never a snapped replacement. */
export function marketParking(map: GameMap, building: BuildingDef, initial: CartPose, puller: Puller, scale: number,
  context: ParkingContext): MarketParking | null {
  const size = rotatedFootprint(building, building.rotation), layout = marketLayout(size.w, size.d, building.layoutSeed)
  if (!layout.bayWidth) return null
  const local = (x: number, z: number) => {
    const p = rotateBuildingPoint(x, z, building.rotation)
    return { x: tileToWorldX(map, building.x) + (building.w - 1) / 2 + p.x,
      z: tileToWorldZ(map, building.z) + (building.d - 1) / 2 + p.z }
  }
  // The convoy's reach ahead of and behind the hitch, as convoyBounds measures it.
  const unit = RIG_TO_WORLD * scale, wheelbase = -cartOffset(puller) * scale
  const ahead = puller === "hand" ? 0 : 1.75 * unit, behind = wheelbase + 1.02 * unit
  const bayX = layout.bayX + layout.hand * MARKET_BAY_OUTWARD
  const distance = (end: number) => { const p = local(bayX, end * size.d / 2); return Math.hypot(p.x - initial.hitch.x, p.z - initial.hitch.z) }
  for (const end of [1, -1].sort((a, b) => distance(a) - distance(b))) {
    // Entering from the front end means driving toward the rear, and vice versa.
    const heading = (end === 1 ? Math.PI : 0) + buildingYaw(building.rotation)
    const goal = local(bayX, -end * (behind - ahead) / 2)
    if (!parkingClear(map, alignCart(goal, heading, wheelbase), puller, scale, context)) continue
    const route = cartPath(map, initial, goal, puller, scale, context, heading)
    if (route) return { ...route, buildingId: building.id, pose: initial, exit: [], returnProgress: 0, distance: 0, walking: false }
  }
  return null
}
