import { deriveSeed, makeRng, SEED_STREAM } from "./rng"
import type { GameMap } from "./map/types"

/**
 * Travelers on the road. Pure data — no three.js, no React — so identities can
 * be generated identically on both sides of the canvas boundary (the HUD names
 * the person the scene draws) and unit-tested headlessly.
 *
 * A traveler's identity is fixed at generation time; only their position along
 * the road changes per frame, and that lives in the render component. Identities
 * derive from the world seed, so seed 12345 always sends the same folk down the
 * same road.
 */

export type TravelerTypeId =
  | "peasant"
  | "pilgrim"
  | "merchant"
  | "friar"
  | "knight"
  | "minstrel"
  | "vendor"

/** Inclusive integer range for attribute rolls. */
export interface StatRange {
  min: number
  max: number
}

export interface TravelerTypeDef {
  id: TravelerTypeId
  label: string
  /** Block colour in the scene. */
  color: string
  /**
   * Share of the road, in percent. The weights sum to 100 so each one reads
   * directly as how much of the traffic that calling makes up.
   */
  weight: number
  /** Walking pace relative to the shared base speed. */
  paceMin: number
  paceMax: number
  /** Coin carried; what the town's stalls and tolls can hope to take. */
  gold: StatRange
  /** Social standing 0–100; who they expect to be received as. */
  status: StatRange
  /** Devotion 0–100; the pull of the relics themselves. */
  piety: StatRange
  /** Chance this traveler is out of work and might settle for it. */
  joblessChance: number
  /** How many trades they know, drawn from `skills`. */
  skillCount: StatRange
  /** The trades this calling can plausibly know. */
  skills: string[]
}

export const TRAVELER_TYPES: Record<TravelerTypeId, TravelerTypeDef> = {
  // The bulk of the road: local folk going about their business, poor and
  // half of them looking for work — the settlement's future labour.
  peasant: {
    id: "peasant",
    label: "Peasant",
    color: "#9c8b66",
    weight: 60,
    paceMin: 0.8,
    paceMax: 1.1,
    gold: { min: 0, max: 15 },
    status: { min: 5, max: 25 },
    piety: { min: 30, max: 80 },
    joblessChance: 0.6,
    skillCount: { min: 1, max: 2 },
    skills: ["farming", "herding", "woodcutting", "thatching", "milling", "labour"],
  },
  pilgrim: {
    id: "pilgrim",
    label: "Pilgrim",
    color: "#8a7f9e",
    weight: 16.5,
    paceMin: 0.8,
    paceMax: 1.1,
    gold: { min: 5, max: 40 },
    status: { min: 10, max: 40 },
    piety: { min: 60, max: 100 },
    joblessChance: 0.5,
    skillCount: { min: 0, max: 2 },
    skills: ["farming", "weaving", "carpentry", "cooking", "herb lore"],
  },
  merchant: {
    id: "merchant",
    label: "Merchant",
    color: "#b3762f",
    weight: 8.5,
    paceMin: 0.7,
    paceMax: 0.95,
    gold: { min: 60, max: 220 },
    status: { min: 40, max: 70 },
    piety: { min: 20, max: 60 },
    joblessChance: 0,
    skillCount: { min: 1, max: 3 },
    skills: ["haggling", "appraisal", "letters", "cart driving"],
  },
  friar: {
    id: "friar",
    label: "Friar",
    color: "#6d5638",
    weight: 5.5,
    paceMin: 0.75,
    paceMax: 1.0,
    gold: { min: 0, max: 10 },
    status: { min: 30, max: 60 },
    piety: { min: 70, max: 100 },
    joblessChance: 0,
    skillCount: { min: 1, max: 2 },
    skills: ["letters", "healing", "brewing", "chant"],
  },
  knight: {
    id: "knight",
    label: "Knight",
    color: "#96393a",
    weight: 3,
    paceMin: 1.1,
    paceMax: 1.4,
    gold: { min: 40, max: 120 },
    status: { min: 70, max: 100 },
    piety: { min: 30, max: 80 },
    joblessChance: 0,
    skillCount: { min: 1, max: 2 },
    skills: ["swordplay", "riding", "command", "falconry"],
  },
  minstrel: {
    id: "minstrel",
    label: "Minstrel",
    color: "#3f7d6c",
    weight: 5.5,
    paceMin: 0.9,
    paceMax: 1.2,
    gold: { min: 5, max: 30 },
    status: { min: 20, max: 50 },
    piety: { min: 10, max: 50 },
    joblessChance: 0.35,
    skillCount: { min: 1, max: 2 },
    skills: ["song", "lute", "juggling", "gossip"],
  },
  // Walks the road selling food and wine to the others (see lib/game/sim.ts).
  // Deliberately scarce — the generator still guarantees one per real crowd.
  vendor: {
    id: "vendor",
    label: "Vendor",
    color: "#d1a33c",
    weight: 1,
    paceMin: 0.7,
    paceMax: 0.95,
    gold: { min: 30, max: 120 },
    status: { min: 20, max: 50 },
    piety: { min: 10, max: 40 },
    joblessChance: 0,
    skillCount: { min: 1, max: 3 },
    skills: ["cooking", "brewing", "haggling", "cart driving"],
  },
}

/** Needs everyone shares regardless of calling; refill/decay comes later. */
const HUNGER: StatRange = { min: 20, max: 80 }
const THIRST: StatRange = { min: 20, max: 80 }
const STAMINA: StatRange = { min: 40, max: 100 }
const AGE: StatRange = { min: 16, max: 60 }

const FIRST_NAMES = [
  "Aldous", "Berta", "Cedric", "Dilys", "Edmund", "Frida", "Godwin", "Hawise",
  "Isolde", "Jocelin", "Kenrick", "Leofric", "Maude", "Norbert", "Osanna",
  "Piers", "Quenild", "Roger", "Sybil", "Tancred", "Ulric", "Venn", "Wilmot",
  "Ysabel",
]

const BYNAMES = [
  "of the Vale", "the Stout", "of Greyford", "the Lame", "Longstride",
  "of the Marsh", "the Pious", "Fairhair", "of Thornbury", "the Quiet",
  "Threefingers", "of the Downs", "the Red", "Farwalker", "of Ashwell",
  "the Younger",
]

/**
 * What a traveler carries, wants, and can do. This is the raw material for the
 * settlement loop: piety pulls them to the relics, gold is what they can spend
 * once there, hunger/thirst/stamina are the needs the town can sell answers to,
 * and jobless + skills decide whether they might stay and work.
 */
export interface TravelerAttributes {
  gold: number
  /** Social standing, 0–100. */
  status: number
  /** Needs, 0–100 — higher means more in need. */
  hunger: number
  thirst: number
  /** Devotion, 0–100. */
  piety: number
  /** 0–100 — the worn-out rest sooner. */
  stamina: number
  jobless: boolean
  skills: string[]
  /** Years. */
  age: number
}

export interface Traveler {
  /** Index into the generated batch; unique within one map's travelers. */
  id: number
  name: string
  type: TravelerTypeDef
  attributes: TravelerAttributes
  /** Starting position along the road as a fraction of its length, 0–1. */
  offset: number
  /** +1 walks west to east, -1 east to west. */
  direction: 1 | -1
  /** Personal multiplier on the shared base speed. */
  pace: number
}

const TYPE_LIST = Object.values(TRAVELER_TYPES)
const TOTAL_WEIGHT = TYPE_LIST.reduce((sum, t) => sum + t.weight, 0)

function pickType(rng: () => number): TravelerTypeDef {
  let roll = rng() * TOTAL_WEIGHT
  for (const type of TYPE_LIST) {
    roll -= type.weight
    if (roll < 0) return type
  }
  return TYPE_LIST[TYPE_LIST.length - 1]
}

/** Uniform integer in an inclusive range. */
function rollStat(rng: () => number, range: StatRange): number {
  return range.min + Math.floor(rng() * (range.max - range.min + 1))
}

function rollSkills(rng: () => number, type: TravelerTypeDef): string[] {
  const count = rollStat(rng, type.skillCount)
  // Partial Fisher–Yates over a copy: the first `count` entries are the pick.
  const pool = [...type.skills]
  for (let i = 0; i < count; i++) {
    const j = i + Math.floor(rng() * (pool.length - i))
    ;[pool[i], pool[j]] = [pool[j], pool[i]]
  }
  return pool.slice(0, count)
}

function rollAttributes(rng: () => number, type: TravelerTypeDef): TravelerAttributes {
  return {
    gold: rollStat(rng, type.gold),
    status: rollStat(rng, type.status),
    hunger: rollStat(rng, HUNGER),
    thirst: rollStat(rng, THIRST),
    piety: rollStat(rng, type.piety),
    stamina: rollStat(rng, STAMINA),
    jobless: rng() < type.joblessChance,
    skills: rollSkills(rng, type),
    age: rollStat(rng, AGE),
  }
}

/** Travelers per 128 × 128 tiles; also the count on the reference map. */
export const DEFAULT_TRAFFIC = 12

/** Convert the traffic density into a whole crowd using the generated map's area. */
export function travelerCountForMap(
  map: Pick<GameMap, "width" | "depth">,
  density: number = DEFAULT_TRAFFIC,
): number {
  if (!Number.isFinite(density) || density <= 0) return 0
  return Math.max(0, Math.round((map.width * map.depth * density) / (128 * 128)))
}

export function generateTravelers(seed: number, count: number): Traveler[] {
  const rng = makeRng(deriveSeed(seed, SEED_STREAM.travelers))
  const travelers: Traveler[] = []
  for (let i = 0; i < count; i++) {
    let type = pickType(rng)
    // Any real crowd includes someone selling to it: if the weighted rolls
    // produced no vendor, the last traveler becomes one. Deterministic, since
    // it's a pure function of the rolls before it.
    if (i === count - 1 && count >= 6 && !travelers.some((t) => t.type.id === "vendor")) {
      type = TRAVELER_TYPES.vendor
    }
    travelers.push({
      id: i,
      name: `${FIRST_NAMES[Math.floor(rng() * FIRST_NAMES.length)]} ${
        BYNAMES[Math.floor(rng() * BYNAMES.length)]
      }`,
      type,
      attributes: rollAttributes(rng, type),
      offset: rng(),
      direction: rng() < 0.5 ? 1 : -1,
      pace: type.paceMin + rng() * (type.paceMax - type.paceMin),
    })
  }
  return travelers
}
