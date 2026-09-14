import { describe, expect, it } from "vitest"
import { rotatedFootprint, type BuildingRotation } from "./building-rotation"
import { BUILDING_KINDS } from "./buildings"
import { MARKET_DEPTH, MARKET_STALL_WIDTH, MARKET_WIDTH, marketBayContains, marketLayout } from "./market-layout"
import { workPost } from "./work-posts"

function stall(rotation: BuildingRotation, layoutSeed?: number) {
  return { ...BUILDING_KINDS.market, ...rotatedFootprint(BUILDING_KINDS.market, rotation), id: "market", buildType: "market", x: 10, z: 10, rotation, layoutSeed }
}

describe("market layout", () => {
  it("sets the original two-column stall beside a one-tile bay", () => {
    expect([MARKET_WIDTH, MARKET_DEPTH, MARKET_STALL_WIDTH]).toEqual([3, 2, 2])
    const layout = marketLayout(3, 2)
    expect(layout).toMatchObject({ hand: 1, stallWidth: 2, stallX: -.5, bayWidth: 1, bayX: 1 })
    expect(marketLayout(3, 2, 1)).toMatchObject({ hand: -1, stallX: .5, bayX: -1 })
    expect(marketLayout(2, 2)).toMatchObject({ stallWidth: 2, stallX: 0, bayWidth: 0 })
  })

  it.each([0, 1, 2, 3] as const)("finds the bay tile beside the stall at rotation %s", rotation => {
    const building = stall(rotation)
    const tiles = []
    for (let z = building.z; z < building.z + building.d; z++) for (let x = building.x; x < building.x + building.w; x++) {
      if (marketBayContains(building, { x, z })) tiles.push({ x, z })
    }
    expect(tiles).toHaveLength(2)
    // The bay is one tile wide along the stall's whole depth.
    expect(new Set(tiles.map(t => rotation % 2 ? t.z : t.x)).size).toBe(1)
    expect(marketBayContains(building, { x: building.x - 1, z: building.z })).toBe(false)
    expect(marketBayContains({ ...building, buildType: "house" }, tiles[0])).toBe(false)
  })

  it("mirrors the bay with the layout hand", () => {
    expect(marketBayContains(stall(0), { x: 12, z: 10 })).toBe(true)
    expect(marketBayContains(stall(0), { x: 10, z: 10 })).toBe(false)
    expect(marketBayContains(stall(0, 1), { x: 10, z: 10 })).toBe(true)
    expect(marketBayContains(stall(0, 1), { x: 12, z: 10 })).toBe(false)
  })

  it("keeps the keeper's post behind the counter inside the stall", () => {
    for (const seed of [undefined, 1]) {
      const post = workPost("market", 0, 3, 2, seed)!, layout = marketLayout(3, 2, seed)
      expect(Math.abs(post.x - layout.stallX)).toBeLessThan(1)
      expect(post.x * layout.hand).toBeLessThan(.5)
    }
  })
})
