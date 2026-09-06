import { tileAt, tileToWorldX, tileToWorldZ, worldToTileX, worldToTileZ, type GameMap } from "../map/types"
import type { Puller } from "./assets"
import { buildingAt } from "../settlement"

export interface Point { x: number; z: number }
import { STALL, stallPoint, stallObstacles, type StallObstacle } from "./stall"

export interface StallRoute {
  entry: Point[]; exit: Point[]; park: Point; heading: number; side: 1 | -1; returnProgress: number
  frontage: Point; entranceProgress: number; obstacles: StallObstacle[]
}
export function routeLength(route: readonly Point[]) {
  return route.slice(1).reduce((sum, p, i) => sum + Math.hypot(p.x - route[i].x, p.z - route[i].z), 0)
}
export function routePoint(route: readonly Point[], distance: number) {
  for (let i = 1; i < route.length; i++) {
    const a = route[i - 1], b = route[i], length = Math.hypot(b.x - a.x, b.z - a.z)
    if (distance <= length || i === route.length - 1) {
      const t = length ? Math.min(1, Math.max(0, distance / length)) : 1
      return { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t, heading: Math.atan2(b.x - a.x, b.z - a.z), moving: distance < length }
    }
    distance -= length
  }
  throw new Error("A route needs at least two points")
}
/** Sample short tangent arcs once; runtime sampling uses their measured lengths,
 * so easing a turn cannot accidentally accelerate the feet or the cart. */
export function roundRoute(points: Point[], radius = 0.22): Point[] {
  const result = [points[0]]
  for (let i = 1; i < points.length - 1; i++) {
    const a = points[i - 1], b = points[i], c = points[i + 1]
    const incoming = Math.hypot(b.x - a.x, b.z - a.z), outgoing = Math.hypot(c.x - b.x, c.z - b.z)
    const r = Math.min(radius, incoming / 2, outgoing / 2)
    if (r < 1e-6) continue
    const start = { x: b.x + (a.x - b.x) * r / incoming, z: b.z + (a.z - b.z) * r / incoming }
    const end = { x: b.x + (c.x - b.x) * r / outgoing, z: b.z + (c.z - b.z) * r / outgoing }
    result.push(start)
    for (let j = 1; j <= 12; j++) {
      const t = j / 12, u = 1 - t
      result.push({ x: u * u * start.x + 2 * u * t * b.x + t * t * end.x, z: u * u * start.z + 2 * u * t * b.z + t * t * end.z })
    }
  }
  result.push(points.at(-1)!)
  return result
}

/** Park behind the roadside display, with the long frontage on the first grass row
 * and the cart on the second, mirrored when the clear verge is on the opposite side. */
export function roadsideManeuver(start: Point, forward: Point, lateral: number, side: 1 | -1, wheelbase: number) {
  const normal = { x: forward.z * side, z: -forward.x * side }
  const offset = 2 - lateral * side, settle = Math.max(1.6, wheelbase * 2)
  const point = (along: number, across: number) => ({ x: start.x + forward.x * along + normal.x * across, z: start.z + forward.z * along + normal.z * across })
  const park = point(0.35 + offset + settle, offset)
  const end = point(0.35 + offset * 2 + settle + 0.3, 0)
  return {
    entry: roundRoute([start, point(0.35, 0), point(0.35 + offset, offset), park]),
    exit: roundRoute([park, point(0.35 + offset + settle + 0.3, offset), end, point(0.35 + offset * 2 + settle + 0.6, 0)]),
    park, heading: Math.atan2(forward.x, forward.z), side,
    advance: 0.35 + offset * 2 + settle + 0.6,
  }
}

/** Only leave a straight, clear stretch of the main road. The full maneuver and
 * the 3 × 2 stall must fit; an unsuitable verge means trying farther along. */
export function roadsideStall(map: GameMap, from: Point, progress: number, direction: 1 | -1, wheelbase: number, scale = 1.5, puller: Puller = "horse"): StallRoute | null {
  const road = map.road
  if (!road || progress < 0 || progress >= road.length - 1) return null
  const index = Math.floor(progress), a = road[index], b = road[index + 1]
  const forward = { x: (b.x - a.x) * direction, z: (b.z - a.z) * direction }
  if (Math.abs(forward.x) + Math.abs(forward.z) !== 1) return null
  const centre = { x: tileToWorldX(map, a.x) + (b.x - a.x) * (progress - index), z: tileToWorldZ(map, a.z) + (b.z - a.z) * (progress - index) }
  const lateral = (from.x - centre.x) * forward.z - (from.z - centre.z) * forward.x
  const clear = (p: Point) => {
    const x = worldToTileX(map, p.x), z = worldToTileZ(map, p.z), t = tileAt(map, x, z)
    return (t === "grass" || t === "clearing" || t === "dirt") && !buildingAt(map, x, z)
  }
  for (const side of [1, -1] as const) {
    const plan = roadsideManeuver(from, forward, lateral, side, wheelbase)
    const returnProgress = progress + direction * plan.advance
    if (returnProgress < 0 || returnProgress >= road.length - 1) continue
    let suitable = true
    for (let i = Math.floor(Math.min(progress, returnProgress)); i <= Math.ceil(Math.max(progress, returnProgress)); i++) {
      const p = road[i], along = (i - progress) * direction
      if (!p || Math.abs(tileToWorldX(map, p.x) - centre.x - forward.x * along) > 0.01 || Math.abs(tileToWorldZ(map, p.z) - centre.z - forward.z * along) > 0.01) suitable = false
    }
    // Check both clear verge rows along the approach, stall and exit.
    for (let along = 0.6; along <= plan.advance; along += 0.25) for (const depth of [1, 2]) {
      if (!clear({ x: centre.x + forward.x * along + forward.z * side * depth, z: centre.z + forward.z * along - forward.x * side * depth })) suitable = false
    }
    if (suitable) {
      const axle = { x: plan.park.x - forward.x * wheelbase, z: plan.park.z - forward.z * wheelbase }
      const frontage = stallPoint(axle, plan.heading, side, scale, STALL.customer)
      return { ...plan, returnProgress, frontage,
        entranceProgress: progress + direction * ((frontage.x - from.x) * forward.x + (frontage.z - from.z) * forward.z),
        obstacles: stallObstacles(axle, plan.heading, side, scale, puller) }
    }
  }
  return null
}
