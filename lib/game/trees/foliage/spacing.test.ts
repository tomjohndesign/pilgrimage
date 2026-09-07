import { describe, expect, it } from "vitest"
import { generateMap } from "../../map/generate-map"
import { placeTrees } from "../placement"
import { TREE_SPECIES, TREE_SPECIES_ORDER } from "../species"
import { FOLIAGE_FOOTPRINT, foliageSpacing } from "./spacing"

describe("foliage sprite spacing", () => {
  it("gives every species one tree per tile with a crown-sized footprint, leaving the rest of the habitat alone", () => {
    const spaced = foliageSpacing(TREE_SPECIES)
    for (const id of TREE_SPECIES_ORDER) {
      expect(spaced[id].habitat).toEqual({ ...TREE_SPECIES[id].habitat, footprint: FOLIAGE_FOOTPRINT[id], perTile: 1 })
      expect(spaced[id].crown).toBe(TREE_SPECIES[id].crown)
    }
    expect(TREE_SPECIES.birch.habitat.perTile).toBeGreaterThan(1)
  })

  it("thins the stand so the unstretched sprites have room", () => {
    const map = generateMap({ seed: 42, width: 64, depth: 64 })
    const dense = placeTrees(map, TREE_SPECIES), sparse = placeTrees(map, foliageSpacing(TREE_SPECIES))
    expect(sparse.length).toBeGreaterThan(0)
    expect(sparse.length).toBeLessThan(dense.length)
  })
})
