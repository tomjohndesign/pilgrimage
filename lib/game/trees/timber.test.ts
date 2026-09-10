import { describe, expect, it } from "vitest"
import { makeRng } from "../rng"
import { growTreePlacements } from "./dimensions"
import { TREE_SPECIES, TREE_SPECIES_ORDER, generateTree } from "./species"
import type { TreePlacement } from "./placement"
import { fallenTimberDimensions, pileLogCount, treeResource, WOOD_PER_LOG, TIMBER_LOAD, stackWood, type WoodPile } from "./timber"

const base: TreePlacement = { x: 0, y: 0.2, z: 0, species: "oak" }

describe("timber tuning and dimensions", () => {
  it("uses the very same individual shape for the forest and its resources", () => {
    const placements = TREE_SPECIES_ORDER.map((species) => ({ ...base, species }))
    const grown = growTreePlacements(placements, 42)
    const rng = makeRng(42)
    for (let i = 0; i < grown.length; i++) {
      expect(grown[i].shape).toEqual(generateTree(TREE_SPECIES[grown[i].species], rng))
      const resource = treeResource(grown[i], i, 1234)
      expect(resource.trunkRadius).toBe(grown[i].shape!.trunkRadius)
      expect(resource.trunkHeight).toBe(grown[i].shape!.trunkHeight)
      // A supplied shape is authoritative; another seed cannot change its yield.
      expect(treeResource(grown[i], 999, 999).wood).toBe(resource.wood)
    }
  })

  it("derives yield from height, radius, taper and cubic scale", () => {
    const shape = { ...generateTree(TREE_SPECIES.oak, makeRng(2)), trunkRadius: 0.1, trunkHeight: 1 }
    const tree = { ...base, shape, trunkTaper: 1 }
    const ordinary = treeResource(tree, 0)
    const taller = treeResource({ ...tree, shape: { ...shape, trunkHeight: 2 } }, 0)
    const thicker = treeResource({ ...tree, shape: { ...shape, trunkRadius: 0.2 } }, 0)
    const scaled = treeResource({ ...tree, scale: 2 }, 0)
    const tapered = treeResource({ ...tree, trunkTaper: 0.5 }, 0)
    expect(taller.trunkVolume).toBeCloseTo(ordinary.trunkVolume * 2)
    expect(thicker.trunkVolume).toBeCloseTo(ordinary.trunkVolume * 4)
    expect(scaled.trunkVolume).toBeCloseTo(ordinary.trunkVolume * 8)
    expect(taller.wood).toBeGreaterThan(ordinary.wood)
    expect(thicker.wood).toBeGreaterThan(taller.wood)
    expect(scaled.wood).toBeGreaterThan(thicker.wood)
    expect(tapered.wood).toBeLessThan(ordinary.wood)
  })

  it("produces more wood, takes less felling time and yields whole ten-wood logs", () => {
    const shape = { ...generateTree(TREE_SPECIES.oak, makeRng(2)), trunkRadius: 0.105, trunkHeight: 0.615 }
    const ordinary = treeResource({ ...base, shape }, 0)
    expect(ordinary.wood).toBeGreaterThan(16)
    expect(ordinary.fellingHours).toBe(8)
    expect(TIMBER_LOAD).toBe(WOOD_PER_LOG)
    for (const species of TREE_SPECIES_ORDER) {
      for (const scale of [0.7, 1, 1.45]) {
        const resource = treeResource({ ...base, species, scale }, 0)
        expect(resource.wood % 10).toBe(0)
        expect(resource.wood).toBeGreaterThanOrEqual(10)
      }
    }
  })

  it("keeps the fallen trunk and its cut ends inside the former footprint", () => {
    for (const species of TREE_SPECIES_ORDER) {
      for (let index = 0; index < 30; index++) {
        const tree = treeResource({ ...base, species, scale: 0.7 + index / 20 }, index, 42)
        const fallen = fallenTimberDimensions(tree)
        expect(fallen.radius).toBe(tree.trunkRadius)
        expect(fallen.length).toBeLessThanOrEqual(tree.trunkHeight)
        expect(Math.hypot(fallen.length / 2 + 0.007, fallen.radius + fallen.offsetZ)).toBeLessThanOrEqual(tree.footprintRadius + 1e-10)
        expect(fallen.stumpHeight).toBeLessThanOrEqual(tree.trunkHeight * 0.3)
      }
    }
  })

  it("counts every stored log independently of the visual fullness cap", () => {
    expect(pileLogCount(0)).toBe(0)
    expect(pileLogCount(10)).toBe(1)
    expect(pileLogCount(40)).toBe(4)
    expect(pileLogCount(240)).toBe(24)
    expect(pileLogCount(600)).toBe(60)
    expect(pileLogCount(15)).toBe(2) // One full log and one visibly short partial log.
  })

  it("fills all rows evenly from the first deliveries and preserves overflow", () => {
    const piles = new Map<string, WoodPile>()
    for (let delivery = 1; delivery <= 200; delivery++) {
      stackWood(piles, "hut", TIMBER_LOAD)
      const amounts = Array.from(piles.values(), pile => pile.wood)
      expect(amounts.reduce((sum, wood) => sum + wood, 0)).toBe(delivery * TIMBER_LOAD)
      expect(amounts).toHaveLength(Math.min(4, delivery))
      expect(Math.max(...amounts) - Math.min(...amounts)).toBeLessThanOrEqual(WOOD_PER_LOG)
    }
  })

  it("levels old uneven stock, retaining row identities and partial loads", () => {
    const old = { id: "old-pile", campId: "hut", slot: 2, wood: 243 }
    const other = { id: "other-pile", campId: "store", slot: 0, wood: 50 }
    const piles = new Map([[old.id, old], [other.id, other]])
    stackWood(piles, "hut", 10)
    expect(piles.get(old.id)?.wood).toBe(60)
    expect(piles.get(other.id)).toEqual(other)
    const stock = Array.from(piles.values()).filter(pile => pile.campId === "hut")
    expect(stock.map(pile => pile.slot).sort()).toEqual([0, 1, 2, 3])
    expect(stock.reduce((sum, pile) => sum + pile.wood, 0)).toBe(253)
    expect(Math.max(...stock.map(pile => pile.wood)) - Math.min(...stock.map(pile => pile.wood))).toBeLessThanOrEqual(WOOD_PER_LOG)
  })
})
