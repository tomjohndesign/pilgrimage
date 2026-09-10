import { RIG_TO_WORLD, CART_WIDTH_SCALE, type Puller } from "./assets"
import type { Point } from "./roadside"

/** Authored rig coordinates. The long display runs along the cart, facing the
 * road; these same bounds drive animal clearance and the customer entrance. */
export const STALL = {
  display: { x: -2.25, z: -0.7, width: 1.25, length: 4.8 },
  sign: { x: -2.25, z: -3.3 },
  merchant: { x: -1.25, z: 0.2 },
  customer: { x: -3.45, z: 0.2 },
} as const
export const SMALL_STALL = {
  ...STALL,
  display: { ...STALL.display, z: -0.35, length: 2.2 },
  sign: { ...STALL.sign, z: -1.8 },
} as const
export function stallLayout(puller: Puller) { return puller === "hand" ? SMALL_STALL : STALL }
export const KEEPER_SEAT = { x: -0.85, z: -1.6 }
export interface StallObstacle extends Point { heading: number; halfWidth: number; halfLength: number }
export function stallPoint(axle: Point, heading: number, side: number, scale: number, local: Point): Point {
  const x = local.x * side * RIG_TO_WORLD * scale, z = local.z * RIG_TO_WORLD * scale
  return { x: axle.x + Math.cos(heading) * x + Math.sin(heading) * z, z: axle.z - Math.sin(heading) * x + Math.cos(heading) * z }
}
export function stallObstacles(axle: Point, heading: number, side: number, scale: number, puller: Puller = "horse"): StallObstacle[] {
  const layout = stallLayout(puller)
  const unit = RIG_TO_WORLD * scale
  return [
    { ...axle, heading, halfWidth: 1.06 * CART_WIDTH_SCALE * unit, halfLength: 1.02 * unit },
    { ...stallPoint(axle, heading, side, scale, layout.display), heading, halfWidth: layout.display.width / 2 * unit, halfLength: layout.display.length / 2 * unit },
    { ...stallPoint(axle, heading, side, scale, layout.sign), heading, halfWidth: 0.42 * unit, halfLength: 0.15 * unit },
  ]
}
export function animalClearance(puller: Puller, scale: number) { return (puller === "horse" ? 2 : 1.9) * RIG_TO_WORLD * scale }

/** Signed distance to a body: negative inside, positive outside. */
export function obstacleDistance(point: Point, box: StallObstacle) {
  const dx = point.x - box.x, dz = point.z - box.z
  const x = Math.abs(dx * Math.cos(box.heading) - dz * Math.sin(box.heading)) - box.halfWidth
  const z = Math.abs(dx * Math.sin(box.heading) + dz * Math.cos(box.heading)) - box.halfLength
  return Math.hypot(Math.max(0, x), Math.max(0, z)) + Math.min(0, Math.max(x, z))
}

/** Existing overlaps may only shrink while escaping a newly placed obstacle. */
export function pastureEscapeClear(a: Point, b: Point, obstacles: readonly StallObstacle[], clearance: number) {
  const steps = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / .04))
  return obstacles.every(box => {
    let previous = obstacleDistance(a, box)
    if (previous > clearance) return pastureSegmentClear(a, b, [box], clearance)
    for (let i = 1; i <= steps; i++) {
      const distance = obstacleDistance({ x: a.x + (b.x - a.x) * i / steps, z: a.z + (b.z - a.z) * i / steps }, box)
      if (distance < previous - 1e-8) return false
      previous = distance
    }
    return previous > clearance
  })
}
/** Segment vs expanded oriented boxes: check the whole body sweep, including
 * its head while grazing, rather than only the destination tile or hoof. */
export function pastureSegmentClear(a: Point, b: Point, obstacles: readonly StallObstacle[], clearance: number) {
  return obstacles.every(box => {
    const local = (p: Point) => ({ x: (p.x - box.x) * Math.cos(box.heading) - (p.z - box.z) * Math.sin(box.heading), z: (p.x - box.x) * Math.sin(box.heading) + (p.z - box.z) * Math.cos(box.heading) })
    const p = local(a), q = local(b)
    const dx = q.x - p.x, dz = q.z - p.z
    let enter = 0, exit = 1, intersects = true
    for (const [start, delta, radius] of [[p.x, dx, box.halfWidth], [p.z, dz, box.halfLength]]) {
      if (Math.abs(delta) < 1e-9) { if (Math.abs(start) > radius) intersects = false; continue }
      const lo = (-radius - start) / delta, hi = (radius - start) / delta
      enter = Math.max(enter, Math.min(lo, hi)); exit = Math.min(exit, Math.max(lo, hi))
    }
    if (intersects && enter <= exit) return false
    const pointDistance = (v: Point) => Math.hypot(Math.max(0, Math.abs(v.x) - box.halfWidth), Math.max(0, Math.abs(v.z) - box.halfLength))
    let distance = Math.min(pointDistance(p), pointDistance(q))
    for (const x of [-box.halfWidth, box.halfWidth]) for (const z of [-box.halfLength, box.halfLength]) {
      const t = Math.min(1, Math.max(0, ((x - p.x) * dx + (z - p.z) * dz) / Math.max(1e-12, dx * dx + dz * dz)))
      distance = Math.min(distance, Math.hypot(x - p.x - t * dx, z - p.z - t * dz))
    }
    return distance > clearance
  })
}
