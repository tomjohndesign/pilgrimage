import { GREY_HAIR_COLOR } from "../character-age"
import { HAIR_SHADES, SKIN_SHADES, shade, type PersonDesign } from "./design"

/**
 * Individual colouring for one person, rolled from the world seed.
 *
 * The cast is early-medieval England: a Northern European range of fair to
 * sun-worked complexions, and hair from flaxen through ginger to raven. Later
 * map areas will add their own peoples; those belong in their own tables.
 */
export interface Complexion { skin: string; hair: string }

export interface SkinTone { id: string; name: string; color: string; weight: number }
export interface HairColor { id: string; name: string; color: string; weight: number
  /** Where this hair usually sits on the skin range, 0 palest to 1 most weathered. */
  fairness: number }

/** Ordered palest to most weathered; outdoor labour is the common case. */
export const SKIN_TONES: readonly SkinTone[] = [
  { id: "pale", name: "Pale", color: "#e0bb9c", weight: 9 },
  { id: "fair", name: "Fair", color: "#d7ac8b", weight: 14 },
  { id: "rosy", name: "Rosy", color: "#d6a288", weight: 11 },
  { id: "warm", name: "Warm", color: "#c99a72", weight: 19 },
  { id: "olive", name: "Olive", color: "#bd9268", weight: 16 },
  { id: "tanned", name: "Tanned", color: "#b0855e", weight: 17 },
  { id: "weathered", name: "Weathered", color: "#a3774f", weight: 14 },
]

/** Ordered fairest to darkest, weighted for the region rather than evenly. */
export const HAIR_COLORS: readonly HairColor[] = [
  { id: "flaxen", name: "Flaxen", color: "#c6ab6d", weight: 9, fairness: 0.1 },
  { id: "golden", name: "Golden", color: "#a67f42", weight: 12, fairness: 0.2 },
  { id: "ginger", name: "Ginger", color: "#a9512a", weight: 7, fairness: 0.1 },
  { id: "auburn", name: "Auburn", color: "#7c3d23", weight: 10, fairness: 0.35 },
  { id: "chestnut", name: "Chestnut", color: "#6b4a2b", weight: 16, fairness: 0.5 },
  { id: "brown", name: "Brown", color: "#573a25", weight: 20, fairness: 0.6 },
  { id: "dark", name: "Dark brown", color: "#4a3221", weight: 17, fairness: 0.7 },
  { id: "raven", name: "Raven", color: "#2e241d", weight: 9, fairness: 0.8 },
]

/** How strongly hair pulls skin toward its usual range; a leaning, never a rule. */
const HAIR_SKIN_AFFINITY = 0.6

function pick<T>(rng: () => number, items: readonly T[], weights: readonly number[]): T {
  const total = weights.reduce((sum, weight) => sum + weight, 0)
  let roll = rng() * total
  for (let i = 0; i < items.length; i++) {
    roll -= weights[i]
    if (roll < 0) return items[i]
  }
  return items[items.length - 1]
}

/** Two rolls, hair first: fair heads are usually fair-skinned, but any pairing can turn up. */
export function rollComplexion(rng: () => number): Complexion {
  const hair = pick(rng, HAIR_COLORS, HAIR_COLORS.map(entry => entry.weight))
  const skin = pick(rng, SKIN_TONES, SKIN_TONES.map((tone, index) =>
    tone.weight * (1 - HAIR_SKIN_AFFINITY * Math.abs(index / (SKIN_TONES.length - 1) - hair.fairness))))
  return { skin: skin.color, hair: hair.color }
}

export interface ComplexionSwap { from: string[]; to: string[] }

/**
 * The baked lit steps of this design's skin and hair, paired with the same steps
 * of the individual's colouring. Only the body can reach these entries — the bake
 * reserves them (see PALETTE_TONES) — so a staff, a robe or a boot is never
 * caught by the swap. Ink and edge pixels sit on shared entries and stay put, so
 * outlines keep their weight. Grey hair is its own baked atlas and is left alone.
 */
export function complexionSwap(design: Pick<PersonDesign, "skinColor" | "hairColor"> | undefined,
  complexion: Complexion | undefined): ComplexionSwap {
  const swap: ComplexionSwap = { from: [], to: [] }
  if (!design || !complexion) return swap
  const add = (from: string, to: string, factors: readonly number[]) => {
    if (from === to) return
    for (const factor of factors) { swap.from.push(shade(from, factor)); swap.to.push(shade(to, factor)) }
  }
  add(design.skinColor, complexion.skin, SKIN_SHADES)
  if (design.hairColor !== GREY_HAIR_COLOR) add(design.hairColor, complexion.hair, HAIR_SHADES)
  return swap
}

/** Fixed shader slots: five skin steps and three hair steps. */
export const COMPLEXION_SLOTS = SKIN_SHADES.length + HAIR_SHADES.length
