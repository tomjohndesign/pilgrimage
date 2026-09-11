/**
 * Who raises a building, and how fast. Construction is paid in worker-seconds
 * (see construction.ts): a builder's rate is the share of a second they add to
 * the site while standing at its wall.
 *
 * The brothers put up the first shelters themselves, and still do whenever
 * nobody else is free, but they are copyists and gardeners before they are
 * wrights. Every settler outbuilds them and a trained one outbuilds them by a
 * long way, so the enclave shifts off monk labour of its own accord as the road
 * brings trades in.
 */

/** A willing but untrained pair of hands: the rate every other rate is read against. */
export const SETTLER_BUILD_RATE = 1
/**
 * A brother's rate, flat: the slowest on any site, whatever he brought with him.
 * Held close to plain hands so the founding years, when the brothers are all
 * there is, are not a crawl — the relief comes from the trades, not from them.
 */
export const MONK_BUILD_RATE = 0.75
/** However many trades one builder knows, they are still only one builder. */
export const MAX_BUILD_RATE = 2

/** Trades that speed a raising, and what knowing one adds to a builder's rate. */
const BUILDING_TRADES: Record<string, number> = {
  carpentry: 0.5,
  masonry: 0.5,
  thatching: 0.3,
  labour: 0.25,
  woodcutting: 0.2,
  mending: 0.15,
}

/** What a settler contributes per second at a site, given the trades they know. */
export function builderRate(skills: readonly string[] = []): number {
  return Math.min(MAX_BUILD_RATE,
    skills.reduce((rate, skill) => rate + (BUILDING_TRADES[skill] ?? 0), SETTLER_BUILD_RATE))
}

/** How the HUD names a builder's pace beside their trades. */
export function builderPaceLabel(rate: number): string {
  if (rate < SETTLER_BUILD_RATE) return "Slow"
  if (rate >= SETTLER_BUILD_RATE + 0.5) return "Skilled"
  return rate > SETTLER_BUILD_RATE ? "Handy" : "Ordinary"
}
