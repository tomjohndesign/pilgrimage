import type { TravelerTypeId } from "./travelers"

/**
 * Who dares the dark track, and who holds their nerve when trouble comes.
 * Pure functions of a traveller's calling and their live stats, so the sim
 * evaluates them at the moment of choice — a pilgrim who refused the track
 * fresh this morning may take it exhausted tonight.
 *
 * The rules, as designed:
 *  - Merchants, vendors, minstrels, and peasants never take the track. Carts
 *    and stock go the safe way; minstrels have nowhere they need to be, and
 *    peasants know better than anyone what lives in the old growth.
 *  - Knights sometimes do — a flat roll.
 *  - Pilgrims and friars only when very pious (the relics outweigh the fear)
 *    or worn out (too tired to judge well). Friars' faith stays their fear
 *    the same way; their piety floor just means more of them qualify.
 *
 * There is deliberately no "courage" attribute: piety and stamina already
 * say everything these rules need.
 */

/** Piety at or above this counts as very pious. */
export const PIOUS_PIETY = 85
/** Stamina below this counts as worn out — "not thinking straight". */
export const WEARY_STAMINA = 25

const KNIGHT_TRACK_CHANCE = 0.55
const PIOUS_TRACK_CHANCE = 0.5
const WEARY_TRACK_CHANCE = 0.5
const PIOUS_AND_WEARY_TRACK_CHANCE = 0.75

/** Chance of pressing on when trouble is met, by calling and state. */
const BASE_NERVE: Record<TravelerTypeId, number> = {
  pilgrim: 0.35,
  friar: 0.4,
  merchant: 0.3,
  vendor: 0.3,
  minstrel: 0.25,
  peasant: 0.3,
  knight: 0.85,
}
/** Very pious travellers hold their nerve this much better. */
const PIOUS_NERVE_BONUS = 0.3

export interface RouteState {
  type: TravelerTypeId
  /** Devotion, 0–100. Fixed at birth. */
  piety: number
  /** 0–100, live from the sim. */
  stamina: number
}

export function isPious(piety: number): boolean {
  return piety >= PIOUS_PIETY
}

export function isWeary(stamina: number): boolean {
  return stamina < WEARY_STAMINA
}

/** Probability this traveller turns onto a track when they reach its mouth. */
export function trackChance({ type, piety, stamina }: RouteState): number {
  switch (type) {
    case "merchant":
    case "vendor":
    case "minstrel":
    case "peasant":
      return 0
    case "knight":
      return KNIGHT_TRACK_CHANCE
    case "pilgrim":
    case "friar": {
      const pious = isPious(piety)
      const weary = isWeary(stamina)
      if (pious && weary) return PIOUS_AND_WEARY_TRACK_CHANCE
      if (pious) return PIOUS_TRACK_CHANCE
      if (weary) return WEARY_TRACK_CHANCE
      return 0
    }
  }
}

/** Resolve the choice with a roll in [0, 1). */
export function takesTrack(state: RouteState, roll: number): boolean {
  return roll < trackChance(state)
}

/** Probability of pressing on rather than turning back when trouble is met. */
export function nerve({ type, piety }: RouteState): number {
  return Math.min(1, BASE_NERVE[type] + (isPious(piety) ? PIOUS_NERVE_BONUS : 0))
}

/** Resolve an encounter with a roll in [0, 1): true means they press on. */
export function holdsNerve(state: RouteState, roll: number): boolean {
  return roll < nerve(state)
}
