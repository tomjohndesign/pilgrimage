import { COATS } from "./coats"
import { BASE_PERSON, WALK_STANCE_FRACTION } from "../base-person/pose"
import { DEFAULT_DESIGN } from "../base-person/design"
import { populationDesign } from "../base-person/population"
import { TRAVELER_TYPES } from "../travelers"
import { DEFAULT_WALK_SPEED, DEFAULT_WALK_CADENCE } from "../base-person/gait"

export const CARGO = ["produce", "bread", "pottery", "textiles"] as const
export type Cargo = typeof CARGO[number]
export const CART_MODES = ["hand", "donkey", "horse", "shop"] as const
export type Puller = "hand" | Animal
export type ShopState = "travel" | "opening" | "trading" | "packing"
export type CartMode = typeof CART_MODES[number] | "ox"
export type Animal = "donkey" | "horse" | "ox"
/** Additive transport art; existing equine and merchant bakes stay immutable. */
export const PARTY_TRANSPORT_VERSION = "v30"
export const PACK_ANIMAL_VERSION = "v29"
export const HORSE_VARIANTS = ["common", "noble"] as const
export type HorseVariant = typeof HORSE_VARIANTS[number]
/** Shared by loose, harnessed and ridden animals; recorded in every affected bake. */
export const ANIMAL_RIG_VERSION = 1
export const TRANSPORT = {
  version: "v26", cellSize: 128, anchor: [64, 78] as const,
  viewSize: BASE_PERSON.camera.viewSize * 2,
  scale: 0.74 * 128 / 48,
  wheelRadius: 0.46, wheelFrames: 24, animalFrames: 20, grazeFrames: 12, lowerFrames: 6, shopFrames: 12,
} as const
export const DRIVER_SEAT = { x: 0, y: 0.73, z: 1.24 } as const
/** Narrower chassis and wheel track; wheel diameter and drawbar length stay fixed. */
export const CART_WIDTH_SCALE = 0.8
/** Wheel centre offset in the source rig, before chassis width scaling. */
export const CART_WHEEL_X = 0.92
export const CART_COLUMNS = TRANSPORT.wheelFrames
export const ANIMAL_COLUMNS = TRANSPORT.animalFrames + TRANSPORT.grazeFrames + TRANSPORT.lowerFrames + 1
export const RIG_TO_WORLD = TRANSPORT.scale / TRANSPORT.viewSize
export const HAND_CART_Z = -2.18 * RIG_TO_WORLD
export const DONKEY_CART_Z = -2.95 * RIG_TO_WORLD

export const HORSE_CART_Z = -3.1 * RIG_TO_WORLD
export const SHOP_SECONDS = 4
export const CART = { directions: 16, cellSize: 160, anchor: [80, 94] } as const
export const SHOP = { cellSize: 256, anchor: [128, 142], footprint: [3, 2] } as const
export function cartOffset(puller: Puller) { return puller === "hand" ? HAND_CART_Z : puller === "horse" || puller === "ox" ? HORSE_CART_Z : DONKEY_CART_Z }
export function cartColumn(_cargo: Cargo, mode: CartMode, phase: number) {
  return mode === "shop" ? TRANSPORT.shopFrames - 1 : Math.floor(((phase % 1 + 1) % 1) * TRANSPORT.wheelFrames)
}
export function cartUrl(cargo: Cargo, mode: CartMode, side = 1, compact = false) { return `/textures/transport/${TRANSPORT.version}/cart-${cargo}-${mode === "ox" ? "horse" : mode}${mode === "shop" && compact ? "-small" : ""}${mode === "shop" && side < 0 ? "-mirrored" : ""}.png` }
export function animalUrl(kind: Animal, coat: string, hitched = false, pack = false) { return `/textures/transport/${pack ? PACK_ANIMAL_VERSION : PARTY_TRANSPORT_VERSION}/${kind}-${coat}${pack ? "-pack" : hitched ? "-hitched" : ""}.png` }

/** Stable visual variety, independent of the simulation's random stream. */
export function cartLoadout(id: number): { cargo: Cargo; puller: Puller; coat?: string } {
  const puller = (["hand", "donkey", "horse"] as const)[Math.floor(id / 4) % 3]
  return { cargo: CARGO[(Math.imul(id + 1, 2654435761) >>> 0) % CARGO.length], puller,
    coat: puller === "hand" ? undefined : COATS[puller][Math.floor(id / 12) % COATS[puller].length].id }
}

/** Four distinct footfalls per cycle; cadence changes never alter planted-foot travel. */
export const ANIMAL_PROFILES = {
  ox: { label: "Ox", cyclesPerSecond: 0.62, stride: 0.44, lift: 0.065, legHeight: 1.02, legSpread: 0.31, legZ: 0.55,
    sway: 0.018, bob: 0.008, pitch: 0.01, roll: 0.018, neckNod: 0.025, headNod: 0.022, walkNeckLean: 0.025, spineFlex: 0.01 },
  donkey: { label: "Donkey", cyclesPerSecond: 0.82, stride: 0.23, lift: 0.06, legHeight: 0.87, legSpread: 0.22, legZ: 0.62,
    sway: 0.020, bob: 0.013, pitch: 0.016, roll: 0.024, neckNod: 0.065, headNod: 0.06, walkNeckLean: 0.055, spineFlex: 0.018 },
  common: { label: "Common horse", cyclesPerSecond: 0.95, stride: 0.28, lift: 0.08, legHeight: 1.08, legSpread: 0.235, legZ: 0.75,
    sway: 0.025, bob: 0.016, pitch: 0.018, roll: 0.022, neckNod: 0.075, headNod: 0.06, walkNeckLean: 0.08, spineFlex: 0.022 },
  noble: { label: "Noble horse", cyclesPerSecond: 0.98, stride: 0.36, lift: 0.09, legHeight: 1.23, legSpread: 0.29, legZ: 0.78,
    sway: 0.025, bob: 0.018, pitch: 0.018, roll: 0.022, neckNod: 0.075, headNod: 0.06, walkNeckLean: 0.12, spineFlex: 0.025 },
} as const
export type QuadrupedProfile = { [K in Exclude<keyof typeof ANIMAL_PROFILES.donkey, "walkNeckLean" | "spineFlex">]: K extends "label" ? string : number } & { twist?: number; walkNeckLean?: number; spineFlex?: number }
export function quadrupedBody(p: QuadrupedProfile) {
  return { ...BASE_PERSON.body, ankleHeight: 0.07, legOffset: p.legSpread, stride: p.stride, footLift: p.lift, footLength: 0.19 }
}
export function animalProfile(kind: Animal, variant: HorseVariant = "common") { return ANIMAL_PROFILES[kind === "horse" ? variant : kind] }
export function animalBody(kind: Animal, variant: HorseVariant = "common") {
  return quadrupedBody(animalProfile(kind, variant))
}
export function animalStride(kind: Animal, scale: number, variant: HorseVariant = "common") {
  return 2 * animalBody(kind, variant).stride / WALK_STANCE_FRACTION * RIG_TO_WORLD * scale
}
export function animalWalkSpeed(kind: Animal, scale: number, variant: HorseVariant = "common") {
  return animalStride(kind, scale, variant) * animalProfile(kind, variant).cyclesPerSecond
}

/** Loaded merchants take 120 steps/minute, below the normal brisk cadence.
 * The slower partner sets the pace, while each rig retains its own stride. */
export const MERCHANT_CYCLES_PER_SECOND = 1
export function merchantWalkSpeed(puller: Puller, scale: number, personStride: number, variant: HorseVariant = "common") {
  const speed = personStride * MERCHANT_CYCLES_PER_SECOND
  return puller === "hand" ? speed * 0.7 : Math.min(speed, animalWalkSpeed(puller, scale, variant))
}

/** A donkey sets the convoy's walking speed; both sets of feet still use actual distance. */
export function vendorSpeedScale(id: number, scale: number, personSpeedScale: number) {
  const { puller } = cartLoadout(id)
  return merchantWalkSpeed(puller, scale, personSpeedScale * DEFAULT_WALK_SPEED / DEFAULT_WALK_CADENCE) / DEFAULT_WALK_SPEED
}

/** Arms rest on the shafts; the current population legs and stride are preserved. */
export function pullingDesign(variant: number) {
  return { ...populationDesign(TRAVELER_TYPES.vendor, variant, DEFAULT_DESIGN), armSwing: 0, armAngle: 0, elbowBend: 0 }
}
