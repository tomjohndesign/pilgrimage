import { WALK_STANCE_FRACTION } from "../base-person/pose"
import { ANIMAL_PROFILES, RIG_TO_WORLD, type QuadrupedProfile } from "../transport/assets"

export const WILDLIFE_SPECIES = ["deer", "sheep", "goat", "rabbit", "hawk", "sparrow", "boar", "fox"] as const
export type WildlifeSpecies = typeof WILDLIFE_SPECIES[number]
export type WildlifeKind = WildlifeSpecies | "buck"
export const isBird = (kind: WildlifeKind) => kind === "hawk" || kind === "sparrow"
export const isDomestic = (kind: WildlifeKind) => kind === "sheep" || kind === "goat"

/** Existing movement settings share rig units and foot timing.
 * Mammal proportions and bone landmarks are authored separately in anatomy.ts. */
export const WILDLIFE_PROFILES: Record<WildlifeKind, QuadrupedProfile> = {
  deer: { ...ANIMAL_PROFILES.donkey, label: "Doe", twist: 0.09, legHeight: 0.83, legSpread: 0.19, legZ: 0.58, stride: 0.21, cyclesPerSecond: 0.9 },
  buck: { ...ANIMAL_PROFILES.donkey, label: "Buck", twist: 0.10, legHeight: 0.92, legSpread: 0.22, legZ: 0.65, stride: 0.24, cyclesPerSecond: 0.86 },
  sheep: { ...ANIMAL_PROFILES.donkey, label: "Sheep", twist: 0.065, legHeight: 0.59, legSpread: 0.22, legZ: 0.43, stride: 0.13, lift: 0.035, cyclesPerSecond: 0.95 },
  goat: { ...ANIMAL_PROFILES.donkey, label: "Goat", twist: 0.085, legHeight: 0.69, legSpread: 0.17, legZ: 0.44, stride: 0.16, lift: 0.045, cyclesPerSecond: 1.05 },
  rabbit: { ...ANIMAL_PROFILES.donkey, label: "Rabbit", twist: 0.04, legHeight: 0.23, legSpread: 0.105, legZ: 0.20, stride: 0.045, lift: 0.02, sway: 0.004, bob: 0.003, cyclesPerSecond: 2.8 },
  boar: { ...ANIMAL_PROFILES.donkey, label: "Boar", twist: 0.06, legHeight: 0.53, legSpread: 0.25, legZ: 0.52, stride: 0.12, lift: 0.035, cyclesPerSecond: 1.15 },
  fox: { ...ANIMAL_PROFILES.donkey, label: "Fox", twist: 0.11, legHeight: 0.44, legSpread: 0.12, legZ: 0.43, stride: 0.10, lift: 0.03, sway: 0.01, bob: 0.01, cyclesPerSecond: 1.6 },
  hawk: { ...ANIMAL_PROFILES.donkey, label: "Hawk" },
  sparrow: { ...ANIMAL_PROFILES.donkey, label: "Sparrow" },
}
export function wildlifeStride(kind: WildlifeKind, scale: number) {
  return 2 * WILDLIFE_PROFILES[kind].stride / WALK_STANCE_FRACTION * RIG_TO_WORLD * scale
}
export function wildlifeSpeed(kind: WildlifeKind, scale: number) {
  return wildlifeStride(kind, scale) * WILDLIFE_PROFILES[kind].cyclesPerSecond
}
