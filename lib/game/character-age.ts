/** Gameplay ages favor young adults, with a few older privileged or religious characters. */
export const GREY_HAIR_AGE = 40
export const GREY_HAIR_COLOR = "#a8aaa5"
export const OLDER_TRAVELER_TYPES = ["knight", "friar"] as const

/** One roll preserves the random stream for other identity and movement attributes. */
export function rollCharacterAge(rng: () => number, allowsElders = false): number {
  const roll = rng()
  if (allowsElders && roll >= 0.8) return 40 + Math.min(25, Math.floor((roll - 0.8) / 0.2 * 26))
  const youngRoll = allowsElders ? roll / 0.8 : roll
  return 18 + Math.floor(youngRoll * youngRoll * 22)
}
