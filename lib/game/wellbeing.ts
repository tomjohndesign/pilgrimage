import { DEFAULT_BALANCE, type GameBalance } from "./balance"
import { GAME_HOUR_SECONDS } from "./calendar"

export const CHURCH_GRACE_HOURS = 24
export const HAPPINESS_THRESHOLD = 60
export const TAVERN_HAPPINESS_GAIN = 30

export interface DevotionState {
  piety: number
  hoursSinceChurch?: number
}

/** Church attendance protects devotion for a day; absence then costs less than a point per day. */
export function stepDevotion(s: DevotionState, dt: number, inChurch: boolean, praying = false,
  balance: GameBalance = DEFAULT_BALANCE): void {
  if (dt <= 0) return
  const hours = dt / GAME_HOUR_SECONDS
  const before = s.hoursSinceChurch ?? 0
  s.hoursSinceChurch = inChurch ? 0 : before + hours
  const absence = inChurch ? 0 : Math.max(0, s.hoursSinceChurch - CHURCH_GRACE_HOURS)
    - Math.max(0, before - CHURCH_GRACE_HOURS)
  s.piety = Math.max(0, Math.min(100, s.piety + (praying ? balance.rules.prayerPiety * hours : 0)
    - (praying ? 0 : balance.rules.pietyDecay * absence)))
}

/** A fulfilled visit lifts spirits; steady employment sustains a contented life. */
export const RELIC_HAPPINESS_GAIN = 20
export const EMPLOYED_HAPPINESS = 85
export function stepHappiness(s: { happiness: number }, hours: number, employed: boolean,
  socializing: boolean, balance: GameBalance = DEFAULT_BALANCE): void {
  if (hours <= 0 || socializing) return
  s.happiness = employed
    ? s.happiness + (EMPLOYED_HAPPINESS - s.happiness) * (1 - Math.exp(-hours / 6))
    : Math.max(0, s.happiness - balance.rules.happinessDecay * hours)
}
