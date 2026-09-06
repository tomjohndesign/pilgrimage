/** Reach out, collect, return to the basket, release, and settle before repeating. */
export function gatheringMotion(phase: number) {
  const p = ((phase % 1) + 1) % 1
  const ease = (t: number) => t * t * (3 - 2 * t)
  const reach = p < 0.4 ? ease(p / 0.4) : p < 0.55 ? 1 : p < 0.85 ? 1 - ease((p - 0.55) / 0.3) : 0
  return { reach, holding: p >= 0.5 && p < 0.85, deposited: p >= 0.85 }
}
