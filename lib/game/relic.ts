import { deriveSeed, makeRng, SEED_STREAM } from "./rng"
import type { StatRange, Traveler, TravelerAttributes } from "./travelers"

/**
 * The relic: what the monks carried here and what every traveler on the road
 * might turn aside for. Pure data — no three.js, no React — generated from the
 * world seed like everything else, so seed 12345 always enshrines the same
 * bone in the same hovel.
 *
 * Its stats are the other half of the draw equation. A traveler's piety says
 * how much they want *a* relic; these say how much they want *this* one:
 *  - sanctity: how holy it is held to be — multiplies piety's pull.
 *  - spectacle: how outlandish the claim — draws the curious and the idle
 *    even when their piety is thin.
 *  - doubt: how shaky the provenance — the learned and the high-born sniff
 *    at it, and it caps how far renown can honestly climb.
 *  - renown: how widely it is known. Starts small; visitors spread the word.
 */

export type RelicKind = "bone" | "wood" | "cloth" | "hair" | "stone" | "metal" | "vial"

export const RELIC_KIND_COLORS: Record<RelicKind, string> = {
  bone: "#ece2c8",
  wood: "#6f4b2c",
  cloth: "#7f93c8",
  hair: "#caa24a",
  stone: "#8f8a80",
  metal: "#d9b654",
  vial: "#a83a3a",
}

export interface RelicDef {
  name: string
  kind: RelicKind
  sanctity: StatRange
  spectacle: StatRange
  doubt: StatRange
}

/** Uniform integer in an inclusive range. */
function roll(rng: () => number, range: StatRange): number {
  return range.min + Math.floor(rng() * (range.max - range.min + 1))
}

const r = (min: number, max: number): StatRange => ({ min, max })

/**
 * Thirty relics, from the venerable to the frankly suspicious. Ranges lean the
 * way the claim does: the True Cross is holy and hard to doubt, the breath of
 * the Holy Spirit is a marvel in a bottle that nobody serious believes.
 */
export const RELICS: readonly RelicDef[] = [
  { name: "the pelvis of St. John", kind: "bone", sanctity: r(55, 80), spectacle: r(30, 55), doubt: r(25, 50) },
  { name: "a thorn of the Crown", kind: "wood", sanctity: r(80, 100), spectacle: r(40, 60), doubt: r(10, 35) },
  { name: "a toe bone of Moses", kind: "bone", sanctity: r(50, 75), spectacle: r(45, 70), doubt: r(55, 85) },
  { name: "the veil of the Holy Mother", kind: "cloth", sanctity: r(85, 100), spectacle: r(35, 55), doubt: r(10, 30) },
  { name: "a splinter of the True Cross", kind: "wood", sanctity: r(85, 100), spectacle: r(30, 50), doubt: r(15, 40) },
  { name: "the jawbone of Samson's ass", kind: "bone", sanctity: r(25, 50), spectacle: r(75, 100), doubt: r(60, 90) },
  { name: "a feather from the wing of Gabriel", kind: "hair", sanctity: r(60, 85), spectacle: r(80, 100), doubt: r(65, 95) },
  { name: "the left sandal of St. Peter", kind: "cloth", sanctity: r(55, 75), spectacle: r(25, 45), doubt: r(30, 55) },
  { name: "a vial of the Virgin's milk", kind: "vial", sanctity: r(70, 90), spectacle: r(60, 85), doubt: r(45, 75) },
  { name: "the tooth of St. Apollonia", kind: "bone", sanctity: r(45, 65), spectacle: r(20, 40), doubt: r(20, 45) },
  { name: "a lock of Mary Magdalene's hair", kind: "hair", sanctity: r(55, 80), spectacle: r(40, 60), doubt: r(30, 55) },
  { name: "the finger of Doubting Thomas", kind: "bone", sanctity: r(65, 85), spectacle: r(50, 70), doubt: r(25, 50) },
  { name: "a stone from the tomb of Lazarus", kind: "stone", sanctity: r(60, 80), spectacle: r(30, 50), doubt: r(35, 60) },
  { name: "the rope that bound Isaac", kind: "cloth", sanctity: r(45, 70), spectacle: r(50, 70), doubt: r(60, 85) },
  { name: "a scale of Jonah's whale", kind: "bone", sanctity: r(30, 55), spectacle: r(80, 100), doubt: r(70, 95) },
  { name: "the tip of Goliath's sword", kind: "metal", sanctity: r(30, 50), spectacle: r(70, 90), doubt: r(50, 80) },
  { name: "a loaf from the feeding of the five thousand", kind: "stone", sanctity: r(50, 70), spectacle: r(65, 90), doubt: r(70, 95) },
  { name: "the staff of Aaron", kind: "wood", sanctity: r(65, 85), spectacle: r(45, 65), doubt: r(45, 70) },
  { name: "one of the thirty pieces of silver", kind: "metal", sanctity: r(35, 60), spectacle: r(60, 80), doubt: r(40, 65) },
  { name: "a swaddling cloth of the Nativity", kind: "cloth", sanctity: r(80, 100), spectacle: r(40, 60), doubt: r(25, 50) },
  { name: "the skull of St. Denis", kind: "bone", sanctity: r(60, 80), spectacle: r(55, 75), doubt: r(20, 45) },
  { name: "a tear of St. Peter, kept in glass", kind: "vial", sanctity: r(60, 85), spectacle: r(55, 80), doubt: r(55, 85) },
  { name: "the girdle of St. Thomas", kind: "cloth", sanctity: r(65, 85), spectacle: r(30, 50), doubt: r(25, 50) },
  { name: "the breath of the Holy Spirit, in a flask", kind: "vial", sanctity: r(40, 70), spectacle: r(90, 100), doubt: r(85, 100) },
  { name: "a sliver of Noah's Ark", kind: "wood", sanctity: r(45, 65), spectacle: r(55, 75), doubt: r(60, 85) },
  { name: "the shinbone of St. Christopher", kind: "bone", sanctity: r(50, 70), spectacle: r(35, 55), doubt: r(30, 55) },
  { name: "the tablecloth of the Last Supper", kind: "cloth", sanctity: r(75, 95), spectacle: r(45, 65), doubt: r(35, 60) },
  { name: "a pebble from David's sling", kind: "stone", sanctity: r(35, 55), spectacle: r(50, 70), doubt: r(55, 80) },
  { name: "the eyelid of St. Lucy", kind: "bone", sanctity: r(45, 65), spectacle: r(70, 90), doubt: r(35, 60) },
  { name: "the tail of Balaam's ass", kind: "hair", sanctity: r(20, 45), spectacle: r(80, 100), doubt: r(70, 95) },
  { name: "a drop of the blood of St. Januarius", kind: "vial", sanctity: r(70, 90), spectacle: r(65, 85), doubt: r(30, 55) },
]

/** A relic that is known to a few and no more, until pilgrims spread the word. */
const STARTING_RENOWN: StatRange = { min: 4, max: 14 }

export interface RelicStats {
  sanctity: number
  spectacle: number
  doubt: number
  renown: number
}

export interface Relic {
  /** Index into RELICS; stable per seed. */
  id: number
  name: string
  kind: RelicKind
  color: string
  stats: RelicStats
}

/** Capitalise the first letter for use at the start of a sentence or title. */
export function relicTitle(relic: Relic): string {
  return relic.name.charAt(0).toUpperCase() + relic.name.slice(1)
}

/**
 * How strongly this relic pulls one traveler off the road, 0–100ish. The
 * devout are drawn by sanctity — sharply, so the truly pious feel it far more
 * than the merely observant — the idle and curious by spectacle, and the
 * high-born are put off in proportion to the doubt over it. Renown scales the
 * whole, since few turn aside for a relic they've barely heard of; as word
 * spreads, the same relic draws a wider crowd. See the module note for what
 * each stat means.
 */
export function relicDraw(who: TravelerAttributes, stats: RelicStats): number {
  const piety = who.piety / 100
  const devotion = stats.sanctity * piety * piety
  const curiosity = stats.spectacle * (1 - piety) * 0.8
  const scepticism = who.status * (stats.doubt / 100) * 0.4
  const renown = 0.75 + (stats.renown / 100) * 0.5
  return (devotion + curiosity - scepticism) * renown
}

/** Draw at or above this, and a traveler turns aside at the junction. */
export const TURN_ASIDE_DRAW = 40

/** Would this traveler leave the road for the relic? */
export function turnsAside(traveler: Traveler, relic: Relic): boolean {
  return relicDraw(traveler.attributes, relic.stats) >= TURN_ASIDE_DRAW
}

/**
 * The travelers who walk the branch to the relic. A different crowd from the
 * road's, and a smaller one — this is the traffic the track to the hovel
 * wears under, as opposed to the road.
 */
export function relicBound(travelers: readonly Traveler[], relic: Relic): Traveler[] {
  return travelers.filter((t) => turnsAside(t, relic))
}

export function generateRelic(seed: number): Relic {
  const rng = makeRng(deriveSeed(seed, SEED_STREAM.relic))
  const id = Math.floor(rng() * RELICS.length)
  const def = RELICS[id]
  return {
    id,
    name: def.name,
    kind: def.kind,
    color: RELIC_KIND_COLORS[def.kind],
    stats: {
      sanctity: roll(rng, def.sanctity),
      spectacle: roll(rng, def.spectacle),
      doubt: roll(rng, def.doubt),
      renown: roll(rng, STARTING_RENOWN),
    },
  }
}
