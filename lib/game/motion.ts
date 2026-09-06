export interface WalkTuning {
  sync: boolean
  /** World tiles per complete left/right cycle at the reference size. */
  stride: number
}

export interface MovementTuning {
  variation: number
  pathEase: number
  acceleration: number
}

/** Zero tuning retains the original simulation for callers and saved tests. */
export const LINEAR_MOVEMENT: MovementTuning = { variation: 0, pathEase: 0, acceleration: 0 }
export const DEFAULT_MOVEMENT: MovementTuning = { variation: 0.08, pathEase: 0.65, acceleration: 0.35 }

/** Smooth, bounded changes in pace, with a repeatable rhythm for each person. */
export function paceVariation(id: number, seconds: number, amount: number): number {
  const phase = ((Math.imul(id + 1, 2654435761) >>> 0) / 4294967296) * Math.PI * 2
  return 1 + amount * (0.7 * Math.sin(seconds * 0.73 + phase) + 0.3 * Math.sin(seconds * 1.93 + phase * 1.7))
}

export function easeSpeed(current: number, target: number, dt: number, seconds: number): number {
  return seconds <= 0 ? target : target + (current - target) * Math.exp(-dt / seconds)
}

export function easeProgress(t: number, amount: number): number {
  return t + (t * t * (3 - 2 * t) - t) * amount
}

type Point = { x: number; z: number }

/** A short quadratic arc stays within the adjoining road tiles, with no overshoot. */
export function roundedCorner(a: Point, b: Point, c: Point, offset: number, amount: number): Point | null {
  const radius = Math.min(1, Math.max(0, amount)) * 0.35
  if (radius === 0 || Math.abs(offset) >= radius) return null
  const t = (offset + radius) / (2 * radius)
  const u = 1 - t
  return {
    x: b.x + (a.x - b.x) * radius * u * u + (c.x - b.x) * radius * t * t,
    z: b.z + (a.z - b.z) * radius * u * u + (c.z - b.z) * radius * t * t,
  }
}

/** Distance mode is independent of render rate; fixed mode preserves the FPS dial. */
export function advanceWalkPhase(phase: number, distance: number, dt: number, frames: number,
  fps: number, stride: number, sync = true): number {
  const cycles = sync ? distance / Math.max(0.01, stride) : dt * fps / frames
  return (phase + cycles) % 1
}
