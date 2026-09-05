/**
 * Seeded RNG (mulberry32). Everything random in the game must come from one of
 * these, never from `Math.random()` — determinism is what makes the simulation
 * replayable, testable, and saveable.
 */
export function makeRng(seed: number): () => number {
  let a = seed >>> 0
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** The world seed everything defaults to before the player supplies one. */
export const DEFAULT_WORLD_SEED = 20250805

/**
 * Split one world seed into independent streams (tile jitter, trees, …) so
 * consumers never share RNG state yet all reproduce from the single seed.
 */
export function deriveSeed(seed: number, stream: number): number {
  return ((seed >>> 0) ^ Math.imul(stream + 1, 0x9e3779b1)) >>> 0
}

/**
 * Parse player input into a seed. Accepts any digits (pasted values included),
 * normalised to uint32 space; returns null when the input isn't a number.
 */
export function parseSeed(input: string): number | null {
  const trimmed = input.trim()
  if (!/^\d+$/.test(trimmed)) return null
  const value = Number(trimmed)
  if (!Number.isFinite(value)) return null
  return value >>> 0
}

/** Stream ids for deriveSeed — central so no two consumers collide. */
export const SEED_STREAM = {
  tileJitter: 1,
  trees: 2,
  travelers: 3,
  treeCount: 4,
  relic: 5,
  monks: 6,
  /** Runtime stream for the monks' ambient wandering around the hovel. */
  monkWander: 7,
  /** Individual tree shapes (trunk, crown, lean); placement uses `trees`. */
  treeShapes: 8,
  /**
   * Which line each traveler keeps along the road. Its own stream so adding
   * it preserves every seed's cast (names, callings, stats).
   */
  lanes: 9,
} as const
