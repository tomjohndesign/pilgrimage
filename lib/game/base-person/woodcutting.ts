import type { PersonDesign } from "./design"

/** Each cycle reserves time for lifting the tool and recovering after the blow. */
export function woodcuttingProfile(design?: Pick<PersonDesign, "bodyType" | "walkStyle">) {
  if (design?.bodyType === "Female") return { playbackRate: 0.25, liftEnd: 0.4, strikeEnd: 0.58, axeScale: 0.72, logScale: 0.72, reach: 0.6, lean: 0.64 }
  if (design?.walkStyle === "Devotional") return { playbackRate: 0.3, liftEnd: 0.52, strikeEnd: 0.72, axeScale: 0.9, logScale: 0.9, reach: 0.48, lean: 0.52 }
  return { playbackRate: 0.4, liftEnd: 0.5, strikeEnd: 0.7, axeScale: 1, logScale: 1, reach: 0.72, lean: 0.72 }
}

export function woodcuttingMotion(phase: number, profile = woodcuttingProfile()) {
  const p = ((phase % 1) + 1) % 1
  const rise = Math.min(1, p / profile.liftEnd)
  const stroke = Math.max(0, Math.min(1, (p - profile.liftEnd) / (profile.strikeEnd - profile.liftEnd)))
  const lift = p < profile.liftEnd ? rise * rise * (3 - 2 * rise) : 1 - stroke * stroke
  return {
    lift,
    striking: stroke > 0 && stroke < 1,
    glint: p >= profile.liftEnd - 0.09 && p <= profile.liftEnd,
    // One of the 24 baked frames catches the contact flash for every profile.
    impact: p >= profile.strikeEnd && p < profile.strikeEnd + 1 / 24,
    split: p < profile.strikeEnd ? 0 : Math.min(1, (p - profile.strikeEnd) / 0.18),
  }
}
