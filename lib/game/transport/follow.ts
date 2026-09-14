import type { Point } from "./roadside"
export interface CartPose extends Point { bridgeGuided?: boolean; heading: number; hitch: Point; distance: number }
export function alignCart(hitch: Point, heading: number, wheelbase: number): CartPose {
  return { x: hitch.x - Math.sin(heading) * wheelbase, z: hitch.z - Math.cos(heading) * wheelbase, heading, hitch: { ...hitch }, distance: 0 }
}
/** Reconstruct a trailing axle when joining an existing route. Only the hitch
 * follows the path; the axle rolls along its own inside curve. */
export function cartOnRoute(progress: number, direction: 1 | -1, wheelbase: number, pointAt: (progress: number) => Point): CartPose {
  const start = progress - direction * (wheelbase * 10 + 2)
  const steps = Math.ceil(Math.abs(progress - start) / 0.05)
  // Pack animals use this route with no trailing axle. Their final heading
  // depends only on the last moving segment, not forty earlier towing steps.
  // Retain reconstruction for a stationary endpoint, whose heading is inherited.
  if (wheelbase === 0 && steps > 0) {
    const before = pointAt(start + (progress - start) * (steps - 1) / steps)
    const hitch = pointAt(start + (progress - start) * steps / steps)
    if (Math.hypot(hitch.x - before.x, hitch.z - before.z) >= 1e-8) {
      return alignCart(hitch, Math.atan2(hitch.x - before.x, hitch.z - before.z), 0)
    }
  }
  const hitch = pointAt(start), ahead = pointAt(start + direction * 0.01)
  let pose = alignCart(hitch, Math.atan2(ahead.x - hitch.x, ahead.z - hitch.z), wheelbase)
  for (let i = 1; i <= steps; i++) pose = followCart(pose, pointAt(start + (progress - start) * i / steps), wheelbase)
  return { ...pose, distance: 0 }
}
/** A rigid drawbar with a trailing axle. Integrate by distance, not frame time:
 * the hitch leads, the axle follows its own shorter inside curve. */
export function followCart(previous: CartPose, hitch: Point, wheelbase: number): CartPose {
  const travel = Math.hypot(hitch.x - previous.hitch.x, hitch.z - previous.hitch.z)
  if (travel < 1e-8) return { ...previous, distance: 0 }
  // Exact no-slip trailer solution for this straight hitch step. Its axle
  // velocity is always parallel to the wheel plane, including inside turns.
  const heading = Math.atan2(hitch.x - previous.hitch.x, hitch.z - previous.hitch.z)
  const angle = Math.atan2(Math.sin(previous.heading - heading), Math.cos(previous.heading - heading))
  const start = Math.tan(angle / 2), end = start * Math.exp(-travel / wheelbase)
  const next = heading + 2 * Math.atan(end)
  const distance = Math.abs(travel + wheelbase * Math.log((1 + end * end) / (1 + start * start)))
  return { x: hitch.x - Math.sin(next) * wheelbase, z: hitch.z - Math.cos(next) * wheelbase,
    heading: Math.atan2(Math.sin(next), Math.cos(next)), hitch: { ...hitch }, distance }
}
