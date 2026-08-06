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
