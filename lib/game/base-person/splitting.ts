import type { Point3 } from "./pose"

export const SPLITTING_FRAMES = 64
export const SPLITTING_CONTACT = 26
export const SPLITTING_LANDED = 36
export const SPLITTING_PICKUP = 44
export const SPLITTING_PLACED = 54

const clamp = (n: number) => Math.max(0, Math.min(1, n))
const smooth = (n: number) => { const t = clamp(n); return t * t * (3 - 2 * t) }
export const splittingFrame = (phase: number) => ((phase % 1 + 1) % 1) * SPLITTING_FRAMES

type BodyKey = { frame: number; lean: number; twist: number; drop: number }
const bodyKeys: BodyKey[] = [
  { frame: 0, lean: 0.18, twist: 0, drop: -0.08 },
  { frame: 4, lean: 0.03, twist: -0.8, drop: -0.06 },
  { frame: 10, lean: -0.08, twist: -1.1, drop: -0.04 },
  { frame: 16, lean: -0.12, twist: -1.1, drop: -0.04 },
  { frame: 22, lean: -0.04, twist: -0.65, drop: -0.02 },
  { frame: 26, lean: 0.30, twist: 0.1, drop: -0.12 },
  { frame: 29, lean: 0.34, twist: 0.16, drop: -0.14 },
  { frame: 34, lean: 0.22, twist: 0, drop: -0.08 },
  { frame: 38, lean: 0.4, twist: 0.25, drop: -0.18 },
  { frame: 44, lean: 0.78, twist: 0.3, drop: -0.57 },
  { frame: 50, lean: 0.72, twist: 0.15, drop: -0.32 },
  { frame: 54, lean: 0.70, twist: 0, drop: -0.26 },
  { frame: 57, lean: 0.20, twist: 0, drop: -0.08 },
  { frame: 60, lean: 0.18, twist: 0, drop: -0.08 },
  { frame: 64, lean: 0.18, twist: 0, drop: -0.08 },
]

function sample<T extends { frame: number }>(keys: T[], frame: number): T {
  const next = keys.findIndex(key => key.frame > frame)
  const a = keys[Math.max(0, next - 1)], b = keys[next < 0 ? keys.length - 1 : next]
  const t = b.frame === a.frame ? 0 : clamp((frame - a.frame) / (b.frame - a.frame))
  // The final stroke accelerates into the wood; preparation and recovery ease at their ends.
  const u = b.frame === SPLITTING_CONTACT ? t * t : smooth(t)
  return Object.fromEntries(Object.keys(a).map(key => {
    const k = key as keyof T
    return [key, Number(a[k]) + (Number(b[k]) - Number(a[k])) * u]
  })) as T
}

export function splittingMotion(phase: number) {
  const frame = splittingFrame(phase)
  return {
    ...sample(bodyKeys, frame), frame,
    impact: frame >= SPLITTING_CONTACT && frame < SPLITTING_CONTACT + 2,
    falling: clamp((frame - SPLITTING_CONTACT) / (SPLITTING_LANDED - SPLITTING_CONTACT)),
    carryingLog: frame >= SPLITTING_PICKUP && frame <= SPLITTING_PLACED,
    logTravel: smooth((frame - SPLITTING_PICKUP) / (SPLITTING_PLACED - SPLITTING_PICKUP)),
    // The left hand leaves the axe, reaches down, then returns after placing the round.
    release: smooth((frame - 30) / 8) * (1 - smooth((frame - SPLITTING_PLACED) / 6)),
    reachLog: smooth((frame - 36) / (SPLITTING_PICKUP - 36)),
    parked: smooth((frame - 29) / 7) * (1 - smooth((frame - SPLITTING_PLACED) / 6)),
    striking: frame >= 22 && frame < SPLITTING_CONTACT,
    glint: frame >= 20 && frame < 23,
  }
}

/** Unwrapped angles carry the axe down the side, behind the shoulder and over the crown. */
export function splittingTool(phase: number, shoulder: number, hip: number, contact: Point3) {
  const [x, y, z] = contact
  const turn = Math.PI * 2
  // Let the head hang below the right fist, with the blade facing out from the leg.
  const parked = { x: -0.40, y: hip + 0.20, z: 0.18, pitch: turn + Math.PI, yaw: Math.PI / 2, roll: 0 }
  const ready = { x, y: y + 0.10, z: z + 0.03, pitch: 1.2, yaw: 0, roll: 0 }
  return sample([
    { frame: 0, ...ready },
    { frame: 4, x: -0.22, y: shoulder - 0.15, z: 0.16, pitch: 2.9, yaw: 0, roll: 0 },
    { frame: 10, x: -0.24, y: shoulder - 0.08, z: 0.13, pitch: 4.4, yaw: 0, roll: 0.12 },
    { frame: 16, x: -0.25, y: shoulder + 0.02, z: 0.13, pitch: 4.7, yaw: 0, roll: 0.18 },
    { frame: 22, x: -0.14, y: shoulder + 0.04, z: 0.24, pitch: 6.0, yaw: 0, roll: 0.3 },
    { frame: 26, x, y, z, pitch: turn + Math.PI / 2, yaw: 0, roll: 0 },
    { frame: 29, x, y: y - 0.035, z, pitch: turn + Math.PI / 2, yaw: 0, roll: 0 },
    { frame: 36, ...parked },
    { frame: 54, ...parked },
    { frame: 60, ...ready, pitch: turn + ready.pitch },
    { frame: 64, ...ready, pitch: turn + ready.pitch },
  ], splittingFrame(phase))
}
