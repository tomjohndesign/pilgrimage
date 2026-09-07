import type { ActionClip } from "./pose"
import { deriveSeed, makeRng, SEED_STREAM } from "../rng"
import type { TravelerTypeDef, TravelerTypeId } from "../travelers"
import { DEFAULT_DESIGN, DESIGN_CONTROLS, validatePersonDesign, type DesignKey, type PersonDesign } from "./design"

/** Six authored variations share the editor's skeleton, joints and bounded controls. */
export const POPULATION_PROFILES = [
  { id: "male-regular", bodyType: "Male", hair: "Cropped", deltas: { head: -0.05, armSwing: 0.1 } },
  { id: "male-tall", bodyType: "Male", hair: "Wavy", deltas: { build: -0.1, torsoHeight: 0.15, legs: 0.15, upperArm: 0.1, forearm: 0.05, neckHeight: 0.1 } },
  { id: "male-broad", bodyType: "Male", hair: "Cropped", deltas: { build: 0.15, torsoHeight: -0.05, legs: -0.05, armSpacing: 0.05, sleeves: 0.15, hands: 0.1, feet: 0.1, elbowBend: 4 } },
  { id: "female-regular", bodyType: "Female", hair: "Braids", deltas: { hem: 0.1, head: -0.05, armAngle: 2 } },
  { id: "female-tall", bodyType: "Female", hair: "Ponytail", deltas: { build: -0.05, torsoHeight: 0.15, legs: 0.15, upperArm: 0.1, forearm: 0.1, neckHeight: 0.1, hem: 0.05 } },
  { id: "female-broad", bodyType: "Female", hair: "Bun", deltas: { build: 0.15, torsoHeight: -0.05, legs: -0.05, sleeves: 0.1, hem: 0.15, feet: 0.05, elbowBend: 4 } },
] as const

export interface TravelerAppearance { variant: number; scale: number; bodyType: PersonDesign["bodyType"] }

/** Independent of crowd order/count and the simulation's random stream. Pairs mix both bodies. */
export function travelerAppearance(seed: number, id: number): TravelerAppearance {
  const root = deriveSeed(seed, SEED_STREAM.characterAppearance)
  const pair = makeRng(deriveSeed(root, Math.floor(id / 2)))()
  const female = ((id & 1) ^ (pair < 0.5 ? 0 : 1)) === 1
  const random = makeRng(deriveSeed(root, id + 104729))
  return { variant: (female ? 3 : 0) + Math.floor(random() * 3),
    scale: 1, bodyType: female ? "Female" : "Male" }
}

export function populationDesign(type: Pick<TravelerTypeDef, "id" | "color">, variant: number, base: PersonDesign = DEFAULT_DESIGN): PersonDesign {
  const profile = POPULATION_PROFILES[variant]
  const minstrel = type.id === "minstrel"
  const design: PersonDesign = { ...base, footwear: type.id === "peasant" ? "Sandals" as const : "Boots" as const, bodyType: profile.bodyType, tunicColor: type.color,
    hat: minstrel ? "Cloth cap" : base.hat !== "None" ? base.hat : variant === 0 || variant === 4 ? "Wool cap" : variant === 3 ? "Coif" : "None",
    satchel: base.satchel || (!minstrel && variant % 3 !== 1),
    walkingStick: base.walkingStick || (type.id === "peasant" && profile.bodyType === "Male"),
    lute: base.lute || minstrel, tunicStyle: base.tunicStyle,
    hairStyle: profile.hair, beard: profile.bodyType === "Male" && (base.beard || variant === 2) }
  for (const [key, delta] of Object.entries(profile.deltas) as [DesignKey, number][]) {
    const range = DESIGN_CONTROLS[key]
    design[key] = Math.min(range.max, Math.max(range.min, Math.round((base[key] + delta) / range.step) * range.step))
    design[key] = Number(design[key].toFixed(3))
  }
  if (minstrel) { design.hem = 1.2; design.tunicLength = 1.15 }
  return validatePersonDesign(design)
}

export interface PopulationPack {
  walkStrides?: number
  actionFrames?: Partial<Record<ActionClip, number>>
  frameCounts?: Partial<Record<import("./pose").BaseClip, number>>
  templateVersion: number
  depthEncoding?: string
  cellSize: number
  anchor: number[]
  rows: number
  callings: Record<TravelerTypeId, { walk: string; idle: string; designs: PersonDesign[]; actions?: Partial<Record<ActionClip, string>>; depths?: Partial<Record<import("./pose").BaseClip, string>> }>
  greyCallings?: Partial<PopulationPack["callings"]>
  shadows: { walk: string; idle: string; actions?: Partial<Record<ActionClip, string>> }
  strideRatios: number[]
}
