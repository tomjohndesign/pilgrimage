import { describe, expect, it } from "vitest"

import { makeRng } from "../rng"
import {
  cloneSpeciesTable,
  generateTree,
  groveNoise,
  habitatWeight,
  pickSpecies,
  sampleCount,
  sampleRange,
  TREE_SPECIES,
  TREE_SPECIES_ORDER,
  treeHeight,
  type TreeSpeciesId,
} from "./species"

const HEX = /^#[0-9a-f]{6}$/i

describe("tree species table", () => {
  it("lists every species exactly once, in display order", () => {
    expect(new Set(TREE_SPECIES_ORDER).size).toBe(TREE_SPECIES_ORDER.length)
    expect(TREE_SPECIES_ORDER.sort()).toEqual(Object.keys(TREE_SPECIES).sort())
    for (const id of TREE_SPECIES_ORDER) expect(TREE_SPECIES[id].id).toBe(id)
  })

  it("has sane ranges and colours", () => {
    for (const def of Object.values(TREE_SPECIES)) {
      for (const range of [def.trunk.height, def.trunk.radius, def.crown.blobs, def.crown.radius, def.crown.squash]) {
        expect(range.min).toBeGreaterThan(0)
        expect(range.max).toBeGreaterThanOrEqual(range.min)
      }
      expect(def.crown.blobs.min).toBeGreaterThanOrEqual(1)
      expect(def.trunk.taper).toBeGreaterThan(0)
      expect(def.trunk.taper).toBeLessThanOrEqual(1)
      expect(def.trunk.color).toMatch(HEX)
      expect(def.crown.color).toMatch(HEX)
      expect(def.habitat.weight).toBeGreaterThan(0)
      expect(Math.abs(def.habitat.edgeBias)).toBeLessThanOrEqual(1)
      expect(def.habitat.grouping).toBeGreaterThanOrEqual(0)
      expect(def.habitat.grouping).toBeLessThanOrEqual(1)
      expect(def.habitat.groveSize).toBeGreaterThanOrEqual(1)
      expect(def.habitat.footprint).toBeGreaterThan(0)
      expect(Number.isInteger(def.habitat.perTile)).toBe(true)
      expect(def.habitat.perTile).toBeGreaterThanOrEqual(1)
    }
  })

  it("gives the big crowns a tile to themselves and lets scrub crowd in", () => {
    expect(TREE_SPECIES.oak.habitat.perTile).toBe(1)
    expect(TREE_SPECIES.beech.habitat.perTile).toBe(1)
    expect(TREE_SPECIES.birch.habitat.perTile).toBeGreaterThan(1)
    expect(TREE_SPECIES.hawthorn.habitat.perTile).toBeGreaterThan(1)
    expect(TREE_SPECIES.oak.habitat.footprint).toBeGreaterThan(TREE_SPECIES.birch.habitat.footprint)
    expect(TREE_SPECIES.beech.habitat.footprint).toBeGreaterThan(TREE_SPECIES.hawthorn.habitat.footprint)
  })

  it("clones deeply so tuning never touches the defaults", () => {
    const clone = cloneSpeciesTable()
    clone.oak.trunk.height.max = 99
    expect(TREE_SPECIES.oak.trunk.height.max).not.toBe(99)
  })
})

describe("sampling", () => {
  it("stays inside the range at full variance and collapses to the midpoint at zero", () => {
    const range = { min: 2, max: 4 }
    const rng = makeRng(7)
    for (let i = 0; i < 200; i++) {
      const v = sampleRange(range, rng)
      expect(v).toBeGreaterThanOrEqual(2)
      expect(v).toBeLessThanOrEqual(4)
    }
    expect(sampleRange(range, rng, 0)).toBe(3)
  })

  it("reaches both ends of an integer range and never returns zero", () => {
    const rng = makeRng(11)
    const seen = new Set<number>()
    for (let i = 0; i < 500; i++) seen.add(sampleCount({ min: 1, max: 3 }, rng))
    expect([...seen].sort()).toEqual([1, 2, 3])
    expect(sampleCount({ min: 0.2, max: 0.4 }, rng)).toBe(1)
  })
})

describe("generateTree", () => {
  it("is deterministic in the seed", () => {
    const a = generateTree(TREE_SPECIES.oak, makeRng(42))
    const b = generateTree(TREE_SPECIES.oak, makeRng(42))
    expect(a).toEqual(b)
    const c = generateTree(TREE_SPECIES.oak, makeRng(43))
    expect(c).not.toEqual(a)
  })

  it("keeps every individual within its species' ranges", () => {
    const rng = makeRng(3)
    for (const def of Object.values(TREE_SPECIES)) {
      for (let i = 0; i < 50; i++) {
        const tree = generateTree(def, rng)
        expect(tree.species).toBe(def.id)
        expect(tree.trunkHeight).toBeGreaterThanOrEqual(def.trunk.height.min)
        expect(tree.trunkHeight).toBeLessThanOrEqual(def.trunk.height.max)
        expect(tree.trunkRadius).toBeGreaterThanOrEqual(def.trunk.radius.min)
        expect(tree.trunkRadius).toBeLessThanOrEqual(def.trunk.radius.max)
        expect(tree.leanAngle).toBeLessThanOrEqual(def.trunk.lean)
        expect(tree.crown.length).toBeGreaterThanOrEqual(def.crown.blobs.min)
        expect(tree.crown.length).toBeLessThanOrEqual(def.crown.blobs.max)
        // The core blob is full size; satellites may shrink but not grow.
        expect(tree.crown[0].rx).toBeLessThanOrEqual(def.crown.radius.max)
        for (const part of tree.crown) expect(part.rx).toBeLessThanOrEqual(def.crown.radius.max)
        expect(treeHeight(tree)).toBeGreaterThan(tree.trunkHeight)
      }
    }
  })

  it("makes clones at zero variance", () => {
    const rng = makeRng(5)
    const a = generateTree(TREE_SPECIES.beech, rng, 0)
    const b = generateTree(TREE_SPECIES.beech, rng, 0)
    expect(a.trunkHeight).toBe(b.trunkHeight)
    expect(a.crown.length).toBe(b.crown.length)
    expect(a.leanAngle).toBe(0)
  })

  it("reads as the intended silhouettes: pine tallest, hawthorn shortest, oak widest", () => {
    const mean = (id: TreeSpeciesId, pick: (h: ReturnType<typeof generateTree>) => number) => {
      const rng = makeRng(9)
      let sum = 0
      for (let i = 0; i < 100; i++) sum += pick(generateTree(TREE_SPECIES[id], rng))
      return sum / 100
    }
    const heights = Object.fromEntries(
      TREE_SPECIES_ORDER.map((id) => [id, mean(id, treeHeight)]),
    ) as Record<TreeSpeciesId, number>
    const tallest = TREE_SPECIES_ORDER.reduce((a, b) => (heights[a] > heights[b] ? a : b))
    const shortest = TREE_SPECIES_ORDER.reduce((a, b) => (heights[a] < heights[b] ? a : b))
    expect(tallest).toBe("scotsPine")
    expect(["hawthorn", "holly"]).toContain(shortest)

    const width = (id: TreeSpeciesId) =>
      mean(id, (t) => Math.max(...t.crown.map((p) => Math.hypot(p.x, p.z) + p.rx)))
    expect(width("oak")).toBeGreaterThan(width("birch"))
    expect(width("oak")).toBeGreaterThan(width("scotsPine"))
  })
})

describe("habitat", () => {
  /** The table with grouping switched off, so only weight and edge bias act. */
  const scattered = () => {
    const table = cloneSpeciesTable()
    for (const id of TREE_SPECIES_ORDER) table[id].habitat.grouping = 0
    return table
  }

  it("weights edge-loving species up on the edge and down inside", () => {
    const birch = TREE_SPECIES.birch
    expect(habitatWeight(birch, true)).toBeGreaterThan(habitatWeight(birch, false))
    const beech = TREE_SPECIES.beech
    expect(habitatWeight(beech, false)).toBeGreaterThan(habitatWeight(beech, true))
    expect(habitatWeight({ ...birch, habitat: { ...birch.habitat, weight: 1, edgeBias: 1 } }, false)).toBe(0)
  })

  it("picks species in proportion to their weights when nothing groups", () => {
    const table = scattered()
    const rng = makeRng(21)
    const counts: Record<string, number> = {}
    const N = 4000
    for (let i = 0; i < N; i++) {
      const id = pickSpecies(table, { x: i % 60, z: Math.floor(i / 60), onEdge: false, seed: 5 }, rng)
      counts[id] = (counts[id] ?? 0) + 1
    }
    const total = TREE_SPECIES_ORDER.reduce((s, id) => s + habitatWeight(table[id], false), 0)
    for (const id of TREE_SPECIES_ORDER) {
      const expected = (habitatWeight(table[id], false) / total) * N
      expect(Math.abs((counts[id] ?? 0) - expected)).toBeLessThan(N * 0.03)
    }
  })

  it("falls back to oak when every weight is zero", () => {
    const table = cloneSpeciesTable()
    for (const id of TREE_SPECIES_ORDER) table[id].habitat.weight = 0
    expect(pickSpecies(table, false, makeRng(1))).toBe("oak")
  })
})

describe("groves", () => {
  it("grove noise is smooth, bounded, and seeded", () => {
    for (let i = 0; i < 200; i++) {
      const v = groveNoise(i * 0.37, i * 0.11, 9)
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThanOrEqual(1)
    }
    // Neighbouring samples barely differ; different seeds do.
    expect(Math.abs(groveNoise(3.2, 4.1, 9) - groveNoise(3.21, 4.1, 9))).toBeLessThan(0.05)
    expect(groveNoise(3.2, 4.1, 9)).not.toBe(groveNoise(3.2, 4.1, 10))
    expect(groveNoise(3.2, 4.1, 9)).toBe(groveNoise(3.2, 4.1, 9))
  })

  /**
   * How much likelier two neighbours are to share a species than two random
   * tiles of the same forest would be. 1 = no spatial structure at all.
   */
  const clustering = (table: typeof TREE_SPECIES, seed: number) => {
    const size = 48
    const rng = makeRng(seed)
    const grid: TreeSpeciesId[] = []
    const counts: Record<string, number> = {}
    for (let z = 0; z < size; z++) {
      for (let x = 0; x < size; x++) {
        const id = pickSpecies(table, { x, z, onEdge: false, seed }, rng)
        grid.push(id)
        counts[id] = (counts[id] ?? 0) + 1
      }
    }
    let same = 0
    let pairs = 0
    for (let z = 0; z < size; z++) {
      for (let x = 0; x < size; x++) {
        if (x + 1 < size) {
          pairs++
          if (grid[z * size + x] === grid[z * size + x + 1]) same++
        }
        if (z + 1 < size) {
          pairs++
          if (grid[z * size + x] === grid[(z + 1) * size + x]) same++
        }
      }
    }
    const n = size * size
    const byChance = Object.values(counts).reduce((sum, c) => sum + (c / n) ** 2, 0)
    return same / pairs / byChance
  }

  it("makes neighbours far more likely to share a species than chance", () => {
    const grouped = clustering(TREE_SPECIES, 77)
    const table = cloneSpeciesTable()
    for (const id of TREE_SPECIES_ORDER) table[id].habitat.grouping = 0
    const random = clustering(table, 77)
    expect(random).toBeGreaterThan(0.9)
    expect(random).toBeLessThan(1.1)
    expect(grouped).toBeGreaterThan(1.3)
  })

  it("still lets every species appear somewhere on a map", () => {
    const seen = new Set<TreeSpeciesId>()
    const rng = makeRng(3)
    for (let z = 0; z < 64; z++) {
      for (let x = 0; x < 64; x++) seen.add(pickSpecies(TREE_SPECIES, { x, z, onEdge: x % 7 === 0, seed: 3 }, rng))
    }
    expect([...seen].sort()).toEqual([...TREE_SPECIES_ORDER].sort())
  })

  it("grouping at full strength nearly silences a species outside its groves", () => {
    const def = { ...TREE_SPECIES.birch, habitat: { ...TREE_SPECIES.birch.habitat, grouping: 1, groveSize: 6 } }
    const weights: number[] = []
    for (let x = 0; x < 60; x++) weights.push(habitatWeight(def, { x, z: 0, onEdge: true, seed: 1 }))
    expect(Math.min(...weights)).toBeLessThan(habitatWeight(def, true) * 0.1)
    expect(Math.max(...weights)).toBeGreaterThan(habitatWeight(def, true))
  })
})
