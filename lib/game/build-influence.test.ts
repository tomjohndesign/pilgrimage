import { describe, expect, it } from "vitest"
import { buildCatalog, DEFAULT_BALANCE } from "./balance"
import { buildInfluence, influenceRadius } from "./build-influence"
import type { BuildingDef, GameMap } from "./map/types"
import { createSettlement, placementError, purchaseStructure, settlementRenown } from "./settlement"

function world(): GameMap {
  return {
    width: 70, depth: 50, tiles: Array(3500).fill("grass"),
    buildings: [{ id: "hovel", label: "Shrine", x: 10, z: 20, w: 2, d: 2,
      height: 1, color: "tan", roofColor: "brown" }],
    site: { hovelId: "hovel", junction: 0, door: { x: 10, z: 22 },
      branch: Array.from({ length: 19 }, (_, i) => ({ x: 10, z: 40 - i })) },
    road: Array.from({ length: 70 }, (_, x) => ({ x, z: 40 })),
  }
}
function building(id: string, x: number, z: number): BuildingDef {
  const def = buildCatalog().find((def) => def.id === id)!
  return { ...def, id: `${id}-${x}-${z}`, buildType: id, x, z }
}
const shelter = buildCatalog().find((def) => def.id === "shelter")!
const cross = buildCatalog().find((def) => def.id === "cross")!
const inside = (map: GameMap, x: number, z: number) => !!buildInfluence(map).connected[z * map.width + x]

describe("influence and unrestricted placement", () => {
  it("allows buildings along the approach and the main road beyond shrine influence", () => {
    const map = world()
    expect(placementError(map, shelter, { x: 11, z: 36 })).toBeNull()
    expect(inside(map, 35, 39)).toBe(false)
    expect(placementError(map, shelter, { x: 35, z: 39 })).toBeNull()
    // The approach track is walkable ground: a footprint may stand astride it
    // while the shrine door can still be reached around the outside.
    expect(placementError(map, shelter, { x: 9, z: 35 })).toBeNull()
  })

  it("allows distant placement even when the shrine has no renown", () => {
    const map = world(), balance = structuredClone(DEFAULT_BALANCE)
    balance.rules.hovelRenown = 0
    expect(placementError(map, shelter, { x: 11, z: 36 }, balance)).toBeNull()
    expect(placementError(map, shelter, { x: 50, z: 20 }, balance)).toBeNull()
  })

  it.each(["shelter", "workshop", "storehouse"])("%s contributes neither renown nor further influence", (id) => {
    const map = world()
    const built = { ...map, buildings: [...map.buildings, building(id, 20, 20)] }
    expect(buildInfluence(built)).toEqual(buildInfluence(map))
    expect(settlementRenown(built, [], []).total).toBe(settlementRenown(map, [], []).total)
  })

  it("a devotional landmark extends connected territory only after construction", () => {
    const map = world()
    expect(inside(map, 26, 20)).toBe(false)
    const purchase = purchaseStructure(createSettlement(), map, [], [], "cross", { x: 21, z: 20 })
    expect(purchase.error).toBeNull()
    const built = { ...map, buildings: [...map.buildings, ...purchase.settlement.structures] }
    expect(inside(built, 26, 20)).toBe(false)
    expect(placementError(built, shelter, { x: 26, z: 20 })).toBeNull()
    purchase.settlement.structures[0].construction!.work = purchase.settlement.structures[0].construction!.required
    expect(inside(built, 26, 20)).toBe(true)
    expect(placementError({ ...built }, shelter, { x: 26, z: 20 })).toBeNull()
    expect(settlementRenown(built, [], []).total).toBe(7)
  })

  it("purchases a renown source outside influence and charges its normal cost", () => {
    const before = createSettlement()
    const purchase = purchaseStructure(before, world(), [], [], "cross", { x: 26, z: 20 })
    expect(purchase.error).toBeNull()
    expect(purchase.settlement.structures).toHaveLength(1)
    expect(purchase.settlement.resources).toEqual({
      gold: before.resources.gold - cross.cost.gold,
      wood: before.resources.wood - cross.cost.wood,
    })
  })

  it("allows a footprint to straddle an influence boundary", () => {
    const map = world()
    expect(placementError(map, cross, { x: 22, z: 20 })).toBeNull()
    expect(placementError(map, shelter, { x: 22, z: 20 })).toBeNull()
  })

  it.each(["water", "forest"] as const)("%s prevents influence reaching disconnected land", (terrain) => {
    const map = world()
    for (let z = 0; z < map.depth; z++) map.tiles[z * map.width + 15] = terrain
    const field = buildInfluence(map)
    expect(field.radiated[20 * map.width + 18]).toBe(1)
    expect(field.connected[20 * map.width + 18]).toBe(0)
    expect(placementError(map, shelter, { x: 18, z: 20 })).toMatch(/access/)
  })

  it("an isolated existing source does not establish disconnected territory", () => {
    const map = world()
    map.buildings.push(building("cross", 50, 20))
    const field = buildInfluence(map)
    expect(field.radiated[20 * map.width + 52]).toBe(1)
    expect(field.connected[20 * map.width + 52]).toBe(0)
  })

  it("stronger sources reach farther; tuning can remove influence without deleting structures", () => {
    expect(influenceRadius(18)).toBeGreaterThan(influenceRadius(2))
    const map = world()
    map.buildings.push(building("cross", 21, 20))
    expect(placementError(map, shelter, { x: 26, z: 20 })).toBeNull()
    const balance = structuredClone(DEFAULT_BALANCE)
    balance.buildings.cross.renown = 0
    expect(buildInfluence(map, balance).connected[20 * map.width + 26]).toBe(0)
    expect(placementError(map, shelter, { x: 26, z: 20 }, balance)).toBeNull()
    expect(map.buildings).toHaveLength(2)
  })
})
