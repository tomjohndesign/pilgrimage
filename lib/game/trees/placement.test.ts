import { describe, expect, it } from "vitest"

import { parseAsciiMap } from "../map/prototype-map"
import { tileToWorldX, tileToWorldZ, worldToTileX, worldToTileZ, type GameMap } from "../map/types"
import {
  DARK_HEIGHT_SCALE,
  MAX_FOOTPRINT,
  MAX_TREES_PER_TILE,
  placeTrees,
  requiredSpacing,
  type TreePlacement,
} from "./placement"
import {
  cloneSpeciesTable,
  TREE_SPECIES,
  TREE_SPECIES_ORDER,
  type TreeSpeciesDef,
  type TreeSpeciesId,
} from "./species"

/** A square block of woods with a margin of grass, so it has both rim and heart. */
function woodsBlock(size: number, seed: number, char = "F"): GameMap {
  const row = (fill: string) => fill.repeat(size)
  const rows: string[] = []
  for (let z = 0; z < size; z++) {
    rows.push(z < 3 || z >= size - 3 ? row(".") : ".".repeat(3) + char.repeat(size - 6) + ".".repeat(3))
  }
  return { ...parseAsciiMap(rows), seed }
}

/** Trees grouped by the tile their trunk stands on. */
function byTile(map: GameMap, trees: TreePlacement[]): Map<number, TreePlacement[]> {
  const tiles = new Map<number, TreePlacement[]>()
  for (const tree of trees) {
    const x = worldToTileX(map, tree.x)
    const z = worldToTileZ(map, tree.z)
    const key = z * map.width + x
    const list = tiles.get(key) ?? []
    list.push(tree)
    tiles.set(key, list)
  }
  return tiles
}

/** A table where only one species can be picked. */
function only(id: TreeSpeciesId): Record<TreeSpeciesId, TreeSpeciesDef> {
  const table = cloneSpeciesTable()
  for (const other of TREE_SPECIES_ORDER) {
    table[other].habitat.weight = other === id ? 1 : 0
    table[other].habitat.grouping = 0
  }
  return table
}

describe("placeTrees", () => {
  const map = woodsBlock(40, 11)
  const trees = placeTrees(map, TREE_SPECIES)

  it("is deterministic in the seed and fills the woods", () => {
    expect(trees.length).toBeGreaterThan(34 * 34)
    expect(placeTrees(map, TREE_SPECIES)).toEqual(trees)
    expect(placeTrees({ ...map, seed: 12 }, TREE_SPECIES)).not.toEqual(trees)
  })

  it("keeps every trunk on a woods tile, inside the tile", () => {
    for (const tree of trees) {
      const x = worldToTileX(map, tree.x)
      const z = worldToTileZ(map, tree.z)
      expect(map.tiles[z * map.width + x]).toBe("forest")
      expect(Math.abs(tree.x - tileToWorldX(map, x))).toBeLessThan(0.5)
      expect(Math.abs(tree.z - tileToWorldZ(map, z))).toBeLessThan(0.5)
    }
  })

  it("never stands one trunk inside another's footprint", () => {
    // Brute force over every pair: the placement's 3 × 3 shortcut must agree.
    for (let i = 0; i < trees.length; i++) {
      for (let j = i + 1; j < trees.length; j++) {
        const a = trees[i]
        const b = trees[j]
        const d = Math.hypot(a.x - b.x, a.z - b.z)
        if (d >= MAX_FOOTPRINT) continue
        const gap = requiredSpacing(
          TREE_SPECIES[a.species],
          a.scale ?? 1,
          TREE_SPECIES[b.species],
          b.scale ?? 1,
        )
        expect(d).toBeGreaterThanOrEqual(gap)
      }
    }
  })

  it("holds no tile past its species caps or the slot ceiling", () => {
    for (const list of byTile(map, trees).values()) {
      expect(list.length).toBeLessThanOrEqual(MAX_TREES_PER_TILE)
      const counts: Partial<Record<TreeSpeciesId, number>> = {}
      for (const tree of list) counts[tree.species] = (counts[tree.species] ?? 0) + 1
      for (const id of TREE_SPECIES_ORDER) {
        expect(counts[id] ?? 0).toBeLessThanOrEqual(TREE_SPECIES[id].habitat.perTile)
      }
    }
  })

  it("gives oaks a tile each but lets birch crowd in", () => {
    const oaks = placeTrees(map, only("oak"))
    for (const list of byTile(map, oaks).values()) expect(list.length).toBe(1)

    const birches = placeTrees(map, only("birch"))
    const crowded = [...byTile(map, birches).values()].filter((list) => list.length >= 2)
    expect(crowded.length).toBeGreaterThan(50)
    expect(birches.length).toBeGreaterThan(oaks.length * 1.3)
  })

  it("thins toward the rim: fewer trees per tile on the edge than at the heart", () => {
    const birches = placeTrees(map, only("birch"))
    const tiles = byTile(map, birches)
    let rim = 0
    let rimTiles = 0
    let heart = 0
    let heartTiles = 0
    for (let z = 3; z < 37; z++) {
      for (let x = 3; x < 37; x++) {
        const n = tiles.get(z * map.width + x)?.length ?? 0
        const inset = Math.min(x - 3, z - 3, 36 - x, 36 - z)
        if (inset === 0) {
          rim += n
          rimTiles++
        } else if (inset >= 8) {
          heart += n
          heartTiles++
        }
      }
    }
    // The shade field is a centred window, so even the outermost row reads as
    // half-wooded; the thinning is real but gentle.
    expect(heart / heartTiles).toBeGreaterThan((rim / rimTiles) * 1.2)
    // Rim trees are smaller and lighter.
    const rimTree = tiles.get(3 * map.width + 3)![0]
    const heartTree = tiles.get(20 * map.width + 20)![0]
    expect(rimTree.scale!).toBeLessThan(heartTree.scale!)
    expect(rimTree.brightness!).toBeGreaterThan(heartTree.brightness!)
  })

  it("lets a big old-growth oak hold more ground than a rim oak", () => {
    const oak = TREE_SPECIES.oak
    expect(requiredSpacing(oak, DARK_HEIGHT_SCALE, oak, DARK_HEIGHT_SCALE)).toBeGreaterThan(
      requiredSpacing(oak, 0.7, oak, 0.7),
    )
    // The larger footprint wins between neighbours of different kinds.
    const birch = TREE_SPECIES.birch
    expect(requiredSpacing(oak, 1, birch, 1)).toBe(oak.habitat.footprint)
    expect(requiredSpacing(birch, 1, oak, 1)).toBe(oak.habitat.footprint)
  })

  it("keeps every default footprint inside the room check's reach, even grown", () => {
    for (const id of TREE_SPECIES_ORDER) {
      expect(TREE_SPECIES[id].habitat.footprint * DARK_HEIGHT_SCALE).toBeLessThanOrEqual(MAX_FOOTPRINT)
    }
  })

  it("packs old growth denser than ordinary woods of the same kind", () => {
    const dark = placeTrees(woodsBlock(40, 11, "D"), only("birch"))
    const light = placeTrees(woodsBlock(40, 11, "F"), only("birch"))
    expect(dark.length).toBeGreaterThan(light.length)
    expect(Math.max(...dark.map((t) => t.scale ?? 1))).toBeGreaterThan(1.2)
  })
})
