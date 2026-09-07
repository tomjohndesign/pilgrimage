/** Visual thresholds are separate from navigation's record of every passage. */
export const FIRST_PASS_WEAR = .04
export const GRASS_WEAR_FULL = .22
export const DIRT_START = .16
export const DIRT_FULL = .4

export function contactAppearance(wear: number) {
  const depth = Number.isFinite(wear) ? Math.max(0, Math.min(1, wear)) : 0
  const opacity = depth <= FIRST_PASS_WEAR + 1e-6 ? 0
    : Math.pow(Math.min(1, (depth - FIRST_PASS_WEAR) / (GRASS_WEAR_FULL - FIRST_PASS_WEAR)), 1.7)
  const t = Math.max(0, Math.min(1, (depth - DIRT_START) / (DIRT_FULL - DIRT_START)))
  const dirt = t * t * (3 - 2 * t)
  return { opacity, dirt, grass: opacity * (1 - dirt) }
}
