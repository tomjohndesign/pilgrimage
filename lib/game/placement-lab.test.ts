import { describe, expect, it } from "vitest"
import { DEFAULT_BALANCE } from "./balance"
import { footprintGrading, groundHeight } from "./map/elevation"
import { generateRelic } from "./relic"
import { createSettlement, placementError, purchaseStructure, settlementMap } from "./settlement"
import { buildCatalog } from "./balance"
import { DEFAULT_PLACEMENT_LAB, normalizePlacementLab, placementLabBalance, placementLabMap } from "./placement-lab"

describe("placement playground", () => {
  it("founds a hillside study where the real purchase rules can grade ground", () => {
    const map = placementLabMap(DEFAULT_PLACEMENT_LAB)
    const balance = placementLabBalance(DEFAULT_BALANCE.rules.levellingLimit)
    const hovel = map.buildings[0]
    expect(map.site?.hovelId).toBe(hovel.id)
    expect(map.tiles[map.site!.door.z * map.width + map.site!.door.x]).toBe("track")
    expect(map.road?.every(tile => map.tiles[tile.z * map.width + tile.x] === "path")).toBe(true)
    expect(footprintGrading(map, hovel)).toMatchObject({ cut: 0, fill: 0, cliff: false })
    expect(map.elevation!.height.some(h => h > 0.5)).toBe(true)
    const house = buildCatalog(balance).find(def => def.id === "house")!
    const relic = generateRelic(map.seed!)
    let settlement = createSettlement(balance), graded = 0, refused = 0
    for (let z = 2; z < map.depth - 6; z += 3) for (let x = 2; x < map.width - 3; x += 3) {
      const live = settlementMap(map, settlement)
      const grading = footprintGrading(live, { x, z, ...house })
      const error = placementError(live, house, { x, z }, balance)
      if (error) { refused++; continue }
      const result = purchaseStructure(settlement, map, [], [relic], house.id, { x, z }, balance)
      expect(result.error).toBeNull()
      settlement = result.settlement
      if (Math.max(grading.cut, grading.fill) > 0.01) graded++
      const placed = settlementMap(map, settlement)
      for (let dz = 0; dz < house.d; dz++) for (let dx = 0; dx < house.w; dx++)
        expect(groundHeight(placed, x + dx, z + dz)).toBeCloseTo(grading.foundation + 0.2)
    }
    expect(graded).toBeGreaterThan(0)
    expect(refused).toBeGreaterThan(0)
  })

  it("clamps terrain settings to the study's ranges", () => {
    expect(normalizePlacementLab({ seed: 4.7, relief: 9, wavelength: 1 })).toEqual({ seed: 4, relief: 2.4, wavelength: 8 })
    expect(normalizePlacementLab({})).toEqual(DEFAULT_PLACEMENT_LAB)
  })
})
