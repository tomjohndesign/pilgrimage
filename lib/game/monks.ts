import { deriveSeed, makeRng, SEED_STREAM } from "./rng"

/**
 * The brothers who carried the relic here and keep it. They live at the hovel
 * from day one — the settlement's first residents, and the reason the place
 * never looks abandoned. Pure data; the scene animates them.
 */

export const MONK_COUNT = 4

export interface MonkAttributes {
  /** Years. */
  age: number
  /** Devotion, 0–100 — a monk's is never in doubt. */
  piety: number
  /** The trades a brother brought with him; the settlement's first labour. */
  skills: string[]
}

export interface Monk {
  id: number
  name: string
  /** Office within the brotherhood; the first monk is always the relic's keeper. */
  duty: string
  attributes: MonkAttributes
}

const DUTIES = ["Keeper of the Relic", "Cellarer", "Chanter", "Almoner", "Infirmarian", "Gardener"]
const SKILLS = ["letters", "chant", "healing", "brewing", "herb lore", "carpentry", "masonry", "illumination"]
const AGE = { min: 22, max: 68 }
const PIETY = { min: 75, max: 100 }
const SKILL_COUNT = { min: 1, max: 3 }

/** What a brother is up to, for the HUD; set by the scene's ambient loop. */
export type MonkActivity = "vigil" | "walking" | "resting" | "flying"

export const MONK_ACTIVITY_LABELS: Record<MonkActivity, string> = {
  vigil: "Keeping vigil at the relic",
  walking: "About the grounds",
  resting: "At rest",
  flying: "Flying with rocket boosters",
}

/**
 * Bridge to the HUD, like the sim registry: the scene writes each brother's
 * current activity here at frame rate and the monk panel polls it.
 */
export const monkRegistry: { current: Map<number, MonkActivity> | null } = { current: null }

const NAMES = [
  "Anselm", "Bede", "Cuthbert", "Dunstan", "Eadmer", "Felix", "Gildas", "Hugh",
  "Ivo", "Jerome", "Kentigern", "Lanfranc", "Maurus", "Ninian", "Odo", "Paulinus",
  "Rumwold", "Swithun", "Theodore", "Wulfstan",
]

/** Uniform integer in an inclusive range. */
function roll(rng: () => number, range: { min: number; max: number }): number {
  return range.min + Math.floor(rng() * (range.max - range.min + 1))
}

/** Partial Fisher–Yates over a copy: the first `count` entries are the pick. */
function pickDistinct<T>(rng: () => number, items: readonly T[], count: number): T[] {
  const pool = [...items]
  for (let i = 0; i < count && i < pool.length; i++) {
    const j = i + Math.floor(rng() * (pool.length - i))
    ;[pool[i], pool[j]] = [pool[j], pool[i]]
  }
  return pool.slice(0, count)
}

export function generateMonks(seed: number, count = MONK_COUNT): Monk[] {
  const rng = makeRng(deriveSeed(seed, SEED_STREAM.monks))
  const names = pickDistinct(rng, NAMES, count)
  // The keeper comes first; the other offices are drawn without repeats.
  const duties = [DUTIES[0], ...pickDistinct(rng, DUTIES.slice(1), count - 1)]
  return names.map((name, i) => ({
    id: i,
    name: `Brother ${name}`,
    duty: duties[i],
    attributes: {
      age: roll(rng, AGE),
      piety: roll(rng, PIETY),
      skills: pickDistinct(rng, SKILLS, roll(rng, SKILL_COUNT)),
    },
  }))
}
