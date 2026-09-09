import { DEFAULT_WALK_SPEED } from "./base-person/gait"

export const TILES_PER_DAY = 144
/** One day at the reference person's uninterrupted walking pace. */
export const GAME_DAY_SECONDS = TILES_PER_DAY / DEFAULT_WALK_SPEED
export const GAME_HOUR_SECONDS = GAME_DAY_SECONDS / 24
export const START_TIME = 0

const MONTHS = ["January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"]

/** Julian calendar, starting March 1, AD 825; independent of browser timezone. */
export function gameDate(time: number): { day: number; month: number; year: number } {
  let remaining = Math.max(0, Math.floor(Number.isFinite(time) ? time : 0)) + 59
  // Every four-year block beginning in 825 has exactly 1461 days.
  const cycles = Math.floor(remaining / 1461)
  let year = 825 + cycles * 4
  remaining %= 1461
  while (remaining >= (year % 4 === 0 ? 366 : 365)) {
    remaining -= year % 4 === 0 ? 366 : 365
    year++
  }
  const lengths = [31, year % 4 === 0 ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
  let month = 0
  while (remaining >= lengths[month]) remaining -= lengths[month++]
  return { day: remaining + 1, month: month + 1, year }
}

export function formatGameTime(time: number): string {
  const { day, month, year } = gameDate(time)
  return `${MONTHS[month - 1]} ${day}, ${year} AD`
}
