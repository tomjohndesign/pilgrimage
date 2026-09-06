import type { PersonDesign } from "./design"

/** A long wind-up and a short accelerating strike end on a held contact frame. */
export function woodcuttingProfile(design?: Pick<PersonDesign, "bodyType" | "walkStyle">) {
  if (design?.bodyType === "Female") return { playbackRate: 0.45, liftEnd: 0.72, strikeEnd: 23 / 24, axeScale: 0.72, logScale: 0.72, reach: 0.6, lean: 0.64 }
  if (design?.walkStyle === "Devotional") return { playbackRate: 0.42, liftEnd: 0.76, strikeEnd: 23 / 24, axeScale: 0.9, logScale: 0.9, reach: 0.48, lean: 0.52 }
  return { playbackRate: 0.55, liftEnd: 0.70, strikeEnd: 23 / 24, axeScale: 1, logScale: 1, reach: 0.72, lean: 0.72 }
}

export function woodcuttingMotion(phase: number, profile = woodcuttingProfile()) {
  const p = ((phase % 1) + 1) % 1
  const rise = Math.min(1, p / profile.liftEnd)
  const stroke = Math.max(0, Math.min(1, (p - profile.liftEnd) / (profile.strikeEnd - profile.liftEnd)))
  const lift = p < profile.liftEnd ? rise * rise * (3 - 2 * rise) : 1 - stroke ** 3
  return {
    lift,
    yaw: 0.18 - lift * 2.43,
    twist: 0.32 - lift * 1.37,
    striking: stroke > 0 && stroke < 1,
    glint: p >= profile.liftEnd - 0.09 && p <= profile.liftEnd,
    // The final baked frame holds the blow and its radiating impact lines.
    impact: p >= profile.strikeEnd - 1e-8,
    split: p < profile.strikeEnd ? 0 : 0.35,
  }
}

/** Detect contact even when fast playback skips over the single impact frame. */
export function crossedWoodcuttingImpact(previousFrame: number, frame: number, columns: number, profile = woodcuttingProfile()) {
  const contact = Math.ceil(profile.strikeEnd * columns)
  return Math.floor((frame - contact) / columns) > Math.floor((previousFrame - contact) / columns)
}
