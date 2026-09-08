import { animalWalkSpeed } from "./transport/assets"
import { COATS } from "./transport/coats"
import { DEFAULT_WALK_CADENCE, personWalkStride } from "./base-person/gait"
import { KNIGHT, knightDesign, squireDesign } from "./knight/design"

let squireStride: number | undefined
const knightStrides = new Map<number, number>()

/** Authored rigs are immutable; derive each stride once, rather than cloning
 * the complete person recipe for every knight on every simulation tick. */
export function knightWalkStride(variant: number) {
  const key = variant % KNIGHT.variants
  let stride = knightStrides.get(key)
  if (stride === undefined) { stride = personWalkStride(knightDesign(key)); knightStrides.set(key, stride) }
  return stride
}

export interface HorseRest { x: number; y: number; z: number; heading: number; tree?: import("./trees/placement").TreePlacement }

/** Stable entourage variety does not consume the simulation's random stream. */
export function knightLoadout(id: number) {
  const hash = Math.imul(id + 1, 2654435761) >>> 0
  return { coat: COATS.horse[hash % COATS.horse.length].id, squire: hash % 3 === 0 }
}

export function knightMounted(activity: string, horse?: HorseRest) {
  return !horse && ["toParking", "fromParking", "walking", "seeking", "fleeing", "toCamp", "fromCamp", "toShop", "fromShop", "toRelic", "fromRelic", "toListen", "listening", "fromListening"].includes(activity)
}

/** A walking attendant limits the horse's cadence, retaining both authored strides. */
export function knightTravelSpeed(scale: number, squire: boolean) {
  const horse = animalWalkSpeed("horse", scale, "noble")
  return squire ? Math.min(horse, (squireStride ??= personWalkStride(squireDesign())) * scale * DEFAULT_WALK_CADENCE) : horse
}

export interface TrailPoint { x: number; z: number; heading: number }
/** Follow the actual travelled polyline around corners, with bounded history. */
export function followKnight(trail: TrailPoint[], point: TrailPoint, gap: number, reset = false) {
  if (reset || !trail.length || Math.hypot(point.x - trail.at(-1)!.x, point.z - trail.at(-1)!.z) > 2) {
    trail.splice(0, trail.length, { x: point.x - Math.sin(point.heading) * gap, z: point.z - Math.cos(point.heading) * gap, heading: point.heading }, { ...point })
  } else if (Math.hypot(point.x - trail.at(-1)!.x, point.z - trail.at(-1)!.z) > 1e-6) {
    // Keep a live endpoint for smooth movement, compacting the older samples.
    const previous = trail.at(-2)
    if (previous && Math.hypot(point.x - previous.x, point.z - previous.z) < 0.015) trail[trail.length - 1] = { ...point }
    else trail.push({ ...point })
  }
  let remaining = gap
  for (let i = trail.length - 1; i > 0; i--) {
    const a = trail[i - 1], b = trail[i], length = Math.hypot(b.x - a.x, b.z - a.z)
    if (length >= remaining) {
      const t = length ? remaining / length : 0
      const result = { x: b.x + (a.x - b.x) * t, z: b.z + (a.z - b.z) * t, heading: Math.atan2(b.x - a.x, b.z - a.z) }
      trail.splice(0, Math.max(0, i - 1))
      return result
    }
    remaining -= length
  }
  return { ...trail[0] }
}
