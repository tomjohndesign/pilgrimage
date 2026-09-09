import type { Point3 } from "./pose"

export const DRINKING_FRAMES = 24
export const DRINKING_SECONDS = 4

/** Lower the cup, lift to the lips, take a sip and lower it again. */
export function drinkingMotion(phase: number, low: boolean, b: {
  hipHeight: number; shoulderHeight: number; headCenter: number; shoulderOffset: number
}) {
  const p = ((phase % 1 + 1) % 1)
  const smooth = (t: number) => { const v = Math.max(0, Math.min(1, t)); return v * v * (3 - 2 * v) }
  const lift = smooth((p - .12) / .23) * (1 - smooth((p - .7) / .22))
  const drop = low ? .22 - b.hipHeight : 0
  const mouth = b.headCenter - .10 + drop
  const dip = low ? .10 : b.shoulderHeight - .42
  return {
    right: [-.04, dip + (mouth - dip) * lift, (low ? .52 : .36) * (1 - lift) + .23 * lift] as Point3,
    left: [b.shoulderOffset, b.hipHeight + drop + .03, .23] as Point3,
    tilt: -.6 * lift,
    nod: -.055 * lift,
    sipping: p >= .35 && p <= .7,
  }
}
