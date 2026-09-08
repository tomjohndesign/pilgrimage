/** Empty needs slow a traveler without taking away their ability to seek help. */
export const WEARY_NEED_THRESHOLD = 25
export const MIN_WEARY_SPEED = 0.6

export function travelerWeariness(needs: { hunger: number; thirst: number; stamina: number }): number {
  return Math.max(0, Math.min(1, 1 - Math.min(needs.hunger, needs.thirst, needs.stamina) / WEARY_NEED_THRESHOLD))
}

/** A cadence change: stride length and planted foot contacts stay unchanged. */
export function wearySpeedScale(needs: { hunger: number; thirst: number; stamina: number }): number {
  return 1 - (1 - MIN_WEARY_SPEED) * travelerWeariness(needs)
}
