import type { Point } from "./roadside"
export interface CartPose extends Point { heading: number; hitch: Point; distance: number }
export function alignCart(hitch: Point, heading: number, wheelbase: number): CartPose {
  return { x: hitch.x - Math.sin(heading) * wheelbase, z: hitch.z - Math.cos(heading) * wheelbase, heading, hitch: { ...hitch }, distance: 0 }
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
