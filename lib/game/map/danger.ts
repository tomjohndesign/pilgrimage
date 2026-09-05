import { TERRAIN, type TerrainId } from "./terrain"
import type { GameMap } from "./types"

/**
 * Danger — the risk field that decides whether travellers brave a route or
 * turn back. Pure data: no three.js, no React.
 *
 * Two layers sum into one number per tile:
 *
 *  - Ambient danger from the woods. Every tile takes the weighted share of
 *    woods in its 5×5 neighbourhood: ordinary forest counts a little (the
 *    unease of trees pressing in), dark forest counts fully. So the main
 *    road, which skirts the old growth, reads "uneasy" at worst, while the
 *    tracks cut through it read "perilous" — the compartmentalising the
 *    terrain was built for.
 *
 *  - Threat sources. Placed dangers — bandit camps, wolf dens — each add
 *    their own intensity, fading linearly to nothing at their radius. None
 *    are generated yet; the type exists so future raiders plug into this
 *    same field instead of growing a second danger system. `kind` will
 *    eventually flavour the encounter (a robbery is not a wolf attack), but
 *    how *scared* a tile makes travellers is always just the summed field.
 *
 * The sim consults the field tile by tile as travellers walk: danger sets how
 * often trouble is met, and who the traveller is (see route-choice.ts) sets
 * whether they press on or turn back. Keeping "how dangerous is here"
 * separate from "what lives here" means the HUD forecast, the sim, and the
 * future encounter system all read the same number.
 */

/** What a placed threat is. Drives encounter flavour later, never the maths. */
export type ThreatKind = "bandit-camp" | "wolf-den"

export interface ThreatSource {
  id: string
  kind: ThreatKind
  /** Tile the threat lives on. */
  x: number
  z: number
  /** Distance in tiles at which its influence has faded to nothing. */
  radius: number
  /** Danger added at the source itself (0–1), fading linearly with distance. */
  intensity: number
}

/** Neighbourhood half-width for ambient danger (2 ⇒ a 5×5 window). */
export const DANGER_RADIUS = 2

/** How much each terrain contributes to the ambient field, per tile. */
const TERRAIN_DANGER: Partial<Record<TerrainId, number>> = {
  forest: 0.15,
  darkwood: 1,
}

/**
 * Per-tile chance of meeting trouble at danger 1. The curve is squared, so
 * the low ambient unease of ordinary woods barely registers over a long road
 * while a short stretch of old growth is a real gauntlet. Tuned so that on a
 * default map about nine in ten pilgrims walk the road end to end, but only
 * six in ten survive a track; knights fare far better on both.
 */
export const ENCOUNTER_CHANCE = 0.16

/** Chance of an encounter on one tile of the given danger. */
export function encounterChance(danger: number): number {
  return ENCOUNTER_CHANCE * danger * danger
}

/**
 * Danger per tile, indexed like `map.tiles`, clamped to [0, 1]. Deterministic
 * in the map and threats — no RNG — so it can be recomputed anywhere (HUD,
 * sim, tests) and always agree.
 */
export function computeDangerField(map: GameMap, threats: ThreatSource[] = []): Float64Array {
  const { width, depth, tiles } = map
  const field = new Float64Array(width * depth)

  // Ambient layer: weighted woods share of the neighbourhood. Off-map cells
  // are simply excluded (divide by the in-bounds count) so map edges aren't
  // spuriously wild — the frontier's danger should come from its trees.
  for (let z = 0; z < depth; z++) {
    for (let x = 0; x < width; x++) {
      let sum = 0
      let cells = 0
      for (let dz = -DANGER_RADIUS; dz <= DANGER_RADIUS; dz++) {
        for (let dx = -DANGER_RADIUS; dx <= DANGER_RADIUS; dx++) {
          const nx = x + dx
          const nz = z + dz
          if (nx < 0 || nz < 0 || nx >= width || nz >= depth) continue
          cells++
          sum += TERRAIN_DANGER[tiles[nz * width + nx]] ?? 0
        }
      }
      field[z * width + x] = sum / cells
    }
  }

  // Threat layer: linear falloff inside each radius, summed on top and clamped.
  for (const threat of threats) {
    const minX = Math.max(0, Math.floor(threat.x - threat.radius))
    const maxX = Math.min(width - 1, Math.ceil(threat.x + threat.radius))
    const minZ = Math.max(0, Math.floor(threat.z - threat.radius))
    const maxZ = Math.min(depth - 1, Math.ceil(threat.z + threat.radius))
    for (let z = minZ; z <= maxZ; z++) {
      for (let x = minX; x <= maxX; x++) {
        const dist = Math.hypot(x - threat.x, z - threat.z)
        if (dist >= threat.radius) continue
        const i = z * width + x
        field[i] = Math.min(1, field[i] + threat.intensity * (1 - dist / threat.radius))
      }
    }
  }

  return field
}

/** Thresholds where a tile's reputation changes. Shared by label and HUD. */
export const DANGER_THRESHOLDS = {
  uneasy: 0.12,
  dangerous: 0.4,
  perilous: 0.7,
} as const

export type DangerLabel = "Safe" | "Uneasy" | "Dangerous" | "Perilous"

/** The traveller's-word version of a danger value, for HUD and flavour text. */
export function dangerLabel(danger: number): DangerLabel {
  if (danger >= DANGER_THRESHOLDS.perilous) return "Perilous"
  if (danger >= DANGER_THRESHOLDS.dangerous) return "Dangerous"
  if (danger >= DANGER_THRESHOLDS.uneasy) return "Uneasy"
  return "Safe"
}

/** Danger at each tile of a route, in walking order. */
export function routeDanger(
  field: Float64Array,
  map: GameMap,
  route: ReadonlyArray<{ x: number; z: number }>,
): number[] {
  return route.map((p) => field[p.z * map.width + p.x])
}

/**
 * Closed-form probability that a traveller with the given nerve — their
 * chance of pressing on when trouble is met — walks the whole route: the
 * product over tiles of (1 − chance of a journey-ending encounter). Exactly
 * the distribution the sim samples from, so the HUD can forecast arrivals
 * without simulating anyone.
 */
export function arrivalOdds(
  field: Float64Array,
  map: GameMap,
  route: ReadonlyArray<{ x: number; z: number }>,
  nerve: number,
): number {
  let odds = 1
  for (const danger of routeDanger(field, map, route)) {
    odds *= 1 - encounterChance(danger) * (1 - nerve)
  }
  return odds
}

/** True for terrain travellers actually walk on; the field covers all tiles. */
export function isWalkable(id: TerrainId): boolean {
  return TERRAIN[id].passable
}
