import { BASE_CHARACTER_SCALE } from "../base-person/gait"
import { CART_WIDTH_SCALE, RIG_TO_WORLD, cartOffset } from "./assets"
import { alignCart, followCart } from "./follow"

export interface CornerEnvelope { step: number; widths: number[]; reach: number; edge: Array<{x:number;z:number;distance:number}> }
const cache = new Map<string, CornerEnvelope>()

/** Sweep the real convoy through a local elbow. Only keep the inside quadrant;
 * the two existing straight decks already cover the rest. The resulting edge
 * follows the trailing cart, including the narrow tail as its wheels straighten. */
export function cartCornerEnvelope(radius: number, half: number, available: number): CornerEnvelope {
  const key = `${radius}:${half}:${available}`, cached = cache.get(key)
  if (cached) return cached
  const step = 0.025, count = Math.floor(available / step), widths = Array(count + 1).fill(0) as number[]
  const unit = RIG_TO_WORLD * BASE_CHARACTER_SCALE, margin = 0.035
  const stamp = (cx: number, cz: number, heading: number, width: number, back: number, front: number) => {
    const sin = Math.sin(heading), cos = Math.cos(heading)
    const polygon = [[-width,-back],[width,-back],[width,front],[-width,front]].map(([x,z]) => ({x:cx+cos*x+sin*z,z:cz-sin*x+cos*z}))
    // Mirror the sweep for traffic approaching from the other arm.
    for (const points of [polygon, polygon.map(p => ({x:p.z,z:p.x}))]) {
      const minZ = Math.min(...points.map(p => p.z)), maxZ = Math.max(...points.map(p => p.z))
      for (let i = Math.max(0, Math.floor((minZ-half)/step)); i <= Math.min(count, Math.ceil((maxZ-half)/step)); i++) {
        const z = half + i * step
        for (let j = 0; j < points.length; j++) {
          const a = points[j], b = points[(j+1)%points.length]
          if (Math.abs(b.z-a.z) < 1e-9 || z < Math.min(a.z,b.z)-1e-8 || z > Math.max(a.z,b.z)+1e-8) continue
          const x = a.x + (b.x-a.x)*(z-a.z)/(b.z-a.z)
          widths[i] = Math.max(widths[i], Math.min(available, x-half))
        }
      }
    }
  }
  for (const puller of ["hand", "donkey", "horse"] as const) {
    const wheelbase = -cartOffset(puller) * BASE_CHARACTER_SCALE
    let pose = alignCart({x:available+wheelbase+2,z:0}, -Math.PI/2, wheelbase)
    const length = pose.hitch.x-radius + radius*Math.PI/2 + available+wheelbase+2-radius
    const start = pose.hitch.x, arcEnd = start-radius+radius*Math.PI/2
    for (let d = 0; d <= length; d += 0.01) {
      let hitch: {x:number;z:number}, heading: number
      if (d < start-radius) { hitch={x:start-d,z:0}; heading=-Math.PI/2 }
      else if (d < arcEnd) {
        const angle = (d-start+radius)/radius
        hitch={x:radius-radius*Math.sin(angle),z:radius-radius*Math.cos(angle)}; heading=angle-Math.PI/2
      } else { hitch={x:0,z:radius+d-arcEnd}; heading=0 }
      pose = followCart(pose,hitch,wheelbase)
      stamp(pose.x,pose.z,pose.heading,1.06*CART_WIDTH_SCALE*unit+margin,1.02*unit+margin,1.02*unit+margin)
      stamp(pose.x,pose.z,pose.heading,0.68*unit+margin,margin,wheelbase+margin)
      if (puller !== "hand") stamp(hitch.x,hitch.z,heading,0.5*unit+margin,1.1*unit+margin,1.75*unit+margin)
    }
  }
  // Fill between the swept edge and the elbow; avoid holes and little notches.
  for (let i = count-1; i >= 0; i--) widths[i] = Math.max(widths[i], widths[i+1])
  // A small conservative filter rounds raster steps without cutting into the sweep.
  const smooth = widths.map((width,i) => Math.max(width, (widths[Math.max(0,i-1)]+width+widths[Math.min(count,i+1)])/3))
  const last = Math.min(count, smooth.findLastIndex(w => w > 1e-5)+1), trimmed = smooth.slice(0,last+1)
  const edge: CornerEnvelope["edge"] = []
  for (let i = last; i >= 0; i--) {
    const x = half+trimmed[i], z = half+i*step, before = edge.at(-1)
    edge.push({x,z,distance:(before?.distance ?? 0)+(before ? Math.hypot(x-before.x,z-before.z) : 0)})
  }
  const envelope = {step,widths:trimmed,reach:half+last*step,edge}
  cache.set(key,envelope)
  return envelope
}
