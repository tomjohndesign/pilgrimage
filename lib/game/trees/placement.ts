import { computeDarkShade, computeForestShade } from "../map/forest-field"
import { isWoods, TILE_HEIGHT } from "../map/terrain"
import { tileAt, tileToWorldX, tileToWorldZ, type GameMap } from "../map/types"
import { deriveSeed, makeRng, SEED_STREAM } from "../rng"
import { pickSpecies, type TreeSpeciesDef, type TreeSpeciesId, type TreeShape } from "./species"

/**
 * Where the trees stand. Pure data — no three.js, no React — so the stand can
 * be unit-tested; `Trees` in components/game renders what this returns.
 *
 * Every woods tile is offered a few *slots*: one at the forest rim, up to
 * three at its heart (dark forest starts at two). Each slot draws a species,
 * weighted by habitat and grove, and then has to earn its place:
 *
 *  - Density. A species has a per-tile cap. Oak and beech get a tile to
 *    themselves; birch, hawthorn and holly crowd two or three to a tile. A
 *    slot whose species is already at its cap on this tile is dropped, which
 *    is what keeps a pure beech stand open under its big crowns while a birch
 *    drift packs tight.
 *  - Footprint. Every tree claims a radius around its trunk where no other
 *    trunk may stand; between two neighbours the larger footprint wins. The
 *    footprint scales with the individual, so old growth holds more ground
 *    and the shrunken trees of the rim can stand closer. A slot tries a few
 *    spots on its tile and is dropped if none has room.
 *
 * Trees still overlap crowns — that is a closed canopy — but no two trunks
 * ever stand inside one another's footprint, so each tree reads as a tree.
 *
 * The stand fades at its rim: the outermost trees are a little shorter and
 * lighter, following the forest-shade field the ground colour also reads, so
 * the woods taper into grassland instead of stopping at a wall. Old growth
 * runs the other way — taller and darker — and the dark-shade field feathers
 * that into the woods around it so the heart of a forest never has a hard rim.
 */

export interface TreePlacement {
  /** World position of the tree's base. */
  x: number
  y: number
  z: number
  species: TreeSpeciesId
  /** Shared sampled geometry, attached after placement for the game scene. */
  shape?: TreeShape
  trunkTaper?: number
  footprint?: number
  /** Whole-tree size multiplier; edge trees are smaller. Defaults to 1. */
  scale?: number
  /** Brightness multiplier on bark and foliage; edge trees are lighter. Defaults to 1. */
  brightness?: number
  /** Runtime Ent motion; moving trees cannot be claimed for felling. */
  walking?: boolean
}

/** Edge trees scale down to this fraction of a core tree's size. */
export const EDGE_SIZE_SCALE = 0.7

/** Old growth stands this much taller than the woods around it, at full dark shade. */
export const DARK_HEIGHT_SCALE = 1.45
/** And this much darker. */
export const DARK_BRIGHTNESS = 0.6

/** Slots a tile is offered, at most. Species caps and footprints prune from here. */
export const MAX_TREES_PER_TILE = 3
/** Chance of each extra slot at the very heart of the woods; fades to 0 at the rim. */
export const EXTRA_SLOT_CHANCE = 0.5

/**
 * Largest footprint the placement can honour, in tiles, after scaling by the
 * individual. Room is checked against the 3 × 3 tiles around a slot, and a
 * trunk two tiles over is at least this far away.
 */
export const MAX_FOOTPRINT = 1.2

/** Trunks scatter across this much of the tile so a full tile reads as trees, not a lattice. */
const SCATTER = 0.8
/** Spots a slot tries before giving up on a crowded tile. */
const PLACE_ATTEMPTS = 6

/** Woods tiles that touch open ground; the map edge does not count. */
export function isForestEdge(map: GameMap, x: number, z: number): boolean {
  for (const [dx, dz] of [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ]) {
    const neighbour = tileAt(map, x + dx, z + dz)
    if (neighbour !== null && !isWoods(neighbour)) return true
  }
  return false
}

/** The distance two trunks must keep: the larger of the two footprints, as grown. */
export function requiredSpacing(
  a: TreeSpeciesDef,
  aScale: number,
  b: TreeSpeciesDef,
  bScale: number,
): number {
  return Math.max(a.habitat.footprint * aScale, b.habitat.footprint * bScale)
}

export function placeTrees(
  map: GameMap,
  species: Record<TreeSpeciesId, TreeSpeciesDef>,
): TreePlacement[] {
  const seed = map.seed ?? 0
  const shade = computeForestShade(map)
  const darkShade = computeDarkShade(map)
  // Slot counts get their own stream so species and jitter (from the `trees`
  // stream) stay independent of the coin flips.
  const rngCount = makeRng(deriveSeed(seed, SEED_STREAM.treeCount))
  const rng = makeRng(deriveSeed(seed, SEED_STREAM.trees))

  const out: TreePlacement[] = []
  // Indices into `out` of the trees on each tile, for the cap and the room check.
  const byTile: (number[] | undefined)[] = new Array(map.width * map.depth)

  const hasRoom = (px: number, pz: number, def: TreeSpeciesDef, scale: number, x: number, z: number) => {
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx
        const nz = z + dz
        if (nx < 0 || nz < 0 || nx >= map.width || nz >= map.depth) continue
        const near = byTile[nz * map.width + nx]
        if (!near) continue
        for (const i of near) {
          const other = out[i]
          const gap = requiredSpacing(def, scale, species[other.species], other.scale ?? 1)
          if (Math.hypot(other.x - px, other.z - pz) < gap) return false
        }
      }
    }
    return true
  }

  for (let z = 0; z < map.depth; z++) {
    for (let x = 0; x < map.width; x++) {
      const index = z * map.width + x
      if (!isWoods(map.tiles[index])) continue
      const depth = shade[index]
      const dark = darkShade[index]
      const oldGrowth = map.tiles[index] === "darkwood"

      // Slots: the rim gets one, the heart up to MAX; old growth starts at two.
      let slots = oldGrowth ? 2 : 1
      const chance = EXTRA_SLOT_CHANCE * (oldGrowth ? dark : depth)
      for (let k = slots; k < MAX_TREES_PER_TILE; k++) if (rngCount() < chance) slots++

      const scale =
        (EDGE_SIZE_SCALE + (1 - EDGE_SIZE_SCALE) * depth) * (1 + (DARK_HEIGHT_SCALE - 1) * dark)
      // Edge growth reads younger and sunlit — a touch lighter than the core;
      // old growth darker still, feathered by the dark shade.
      const brightness = (1.1 - 0.15 * depth) * (1 - (1 - DARK_BRIGHTNESS) * dark)
      const site = { x, z, onEdge: isForestEdge(map, x, z), seed }
      const cx = tileToWorldX(map, x)
      const cz = tileToWorldZ(map, z)

      for (let t = 0; t < slots; t++) {
        const id = pickSpecies(species, site, rng)
        const def = species[id]

        // Density: the tile holds only so many of this species.
        let here = byTile[index]
        let same = 0
        if (here) for (const i of here) if (out[i].species === id) same++
        if (same >= def.habitat.perTile) continue

        // Footprint: try a few spots; a crowded tile simply loses the slot.
        for (let attempt = 0; attempt < PLACE_ATTEMPTS; attempt++) {
          const px = cx + (rng() - 0.5) * SCATTER
          const pz = cz + (rng() - 0.5) * SCATTER
          if (!hasRoom(px, pz, def, scale, x, z)) continue
          if (!here) byTile[index] = here = []
          here.push(out.length)
          out.push({ x: px, y: TILE_HEIGHT, z: pz, species: id, scale, brightness })
          break
        }
      }
    }
  }
  return out
}
