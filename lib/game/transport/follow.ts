import type { Point } from "./roadside"
export interface CartPose extends Point { heading: number; hitch: Point; distance: number }
export function alignCart(hitch: Point, heading: number, wheelbase: number): CartPose {
  return { x: hitch.x - Math.sin(heading) * wheelbase, z: hitch.z - Math.cos(heading) * wheelbase, heading, hitch: { ...hitch }, distance: 0 }
}
/** Keep the axle on the road behind its puller while preserving the rigid
 * drawbar length. A freely trailing axle cuts across narrow road corners. */
export function cartOnRoute(progress: number, direction: 1 | -1, wheelbase: number, pointAt: (progress: number) => Point): CartPose {
  const hitch = pointAt(progress)
  let near = 0, far = 0
  // Find the first crossing behind the hitch, including closely spaced bends.
  do {
    near = far; far += 0.25
    const p = pointAt(progress - direction * far)
    if (Math.hypot(p.x - hitch.x, p.z - hitch.z) >= wheelbase) break
  } while (far < wheelbase * 4 + 4)
  const behind = pointAt(progress - direction * far)
  // A route shorter than the rig (or a closed loop) may have no crossing.
  // Keep the hitch attached even when no road-constrained pose is possible.
  if (Math.hypot(behind.x - hitch.x, behind.z - hitch.z) < wheelbase) {
    return alignCart(hitch, Math.atan2(hitch.x - behind.x, hitch.z - behind.z), wheelbase)
  }
  for (let i = 0; i < 20; i++) {
    const middle = (near + far) / 2, p = pointAt(progress - direction * middle)
    if (Math.hypot(p.x - hitch.x, p.z - hitch.z) < wheelbase) near = middle
    else far = middle
  }
  const axle = pointAt(progress - direction * (near + far) / 2)
  return { ...axle, hitch, heading: Math.atan2(hitch.x - axle.x, hitch.z - axle.z), distance: 0 }
}
/** A rigid drawbar with a trailing axle. Integrate by distance, not frame time:
 * the hitch leads, the axle follows its own shorter inside curve. */
export function followCart(previous: CartPose, hitch: Point, wheelbase: number): CartPose {
  const travel = Math.hypot(hitch.x - previous.hitch.x, hitch.z - previous.hitch.z)
  if (travel < 1e-8) return { ...previous, distance: 0 }
  let { x, z } = previous, distance = 0
  const steps = Math.max(1, Math.ceil(travel / 0.005))
  for (let i = 1; i <= steps; i++) {
    const hx = previous.hitch.x + (hitch.x - previous.hitch.x) * i / steps
    const hz = previous.hitch.z + (hitch.z - previous.hitch.z) * i / steps
    const dx = hx - x, dz = hz - z, length = Math.hypot(dx, dz)
    if (length < 1e-8) continue
    const nx = hx - dx / length * wheelbase, nz = hz - dz / length * wheelbase
    distance += Math.hypot(nx - x, nz - z); x = nx; z = nz
  }
  return { x, z, heading: Math.atan2(hitch.x - x, hitch.z - z), hitch: { ...hitch }, distance }
}
