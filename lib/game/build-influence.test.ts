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

describe("construction influence", () => {
  it("allows frontage along the approach beyond the shrine radius, without claiming the main road", () => {
    const map = world()
    expect(placementError(map, shelter, { x: 11, z: 36 })).toBeNull()
    expect(placementError(map, shelter, { x: 35, z: 39 })).toMatch(/influence/)
    expect(placementError(map, shelter, { x: 9, z: 35 })).toMatch(/approach/)
  })

  it("keeps the approach as a starting area even when the shrine has no renown", () => {
    const map = world(), balance = structuredClone(DEFAULT_BALANCE)
    balance.rules.hovelRenown = 0
    expect(placementError(map, shelter, { x: 11, z: 36 }, balance)).toBeNull()
    expect(placementError(map, shelter, { x: 18, z: 20 }, balance)).toMatch(/influence/)
  })

  it.each(["shelter", "workshop", "lumberCamp"])("%s contributes neither renown nor further influence", (id) => {
    const map = world()
    const built = { ...map, buildings: [...map.buildings, building(id, 20, 20)] }
    expect(buildInfluence(built)).toEqual(buildInfluence(map))
    expect(settlementRenown(built, [], []).total).toBe(settlementRenown(map, [], []).total)
  })

  it("a purchased devotional landmark extends connected territory immediately", () => {
    const map = world()
    expect(inside(map, 26, 20)).toBe(false)
    const purchase = purchaseStructure(createSettlement(), map, [], [], "cross", { x: 21, z: 20 })
    expect(purchase.error).toBeNull()
    const built = { ...map, buildings: [...map.buildings, ...purchase.settlement.structures] }
    expect(placementError(built, shelter, { x: 26, z: 20 })).toBeNull()
    expect(settlementRenown(built, [], []).total).toBe(7)
  })

  it("does not let a prospective renown source supply its own placement influence", () => {
    const before = createSettlement()
    const purchase = purchaseStructure(before, world(), [], [], "cross", { x: 26, z: 20 })
    expect(purchase.error).toMatch(/influence/)
    expect(purchase.settlement).toBe(before)
  })

  it("checks every footprint tile at an influence boundary", () => {
    const map = world()
    expect(placementError(map, cross, { x: 22, z: 20 })).toBeNull()
    expect(placementError(map, shelter, { x: 22, z: 20 })).toMatch(/influence/)
  })

  it.each(["water", "forest"] as const)("%s prevents influence reaching disconnected land", (terrain) => {
    const map = world()
    for (let z = 0; z < map.depth; z++) map.tiles[z * map.width + 15] = terrain
    const field = buildInfluence(map)
    expect(field.radiated[20 * map.width + 18]).toBe(1)
    expect(field.connected[20 * map.width + 18]).toBe(0)
    expect(placementError(map, shelter, { x: 18, z: 20 })).toMatch(/influence/)
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
    expect(placementError(map, shelter, { x: 26, z: 20 }, balance)).toMatch(/influence/)
    expect(map.buildings).toHaveLength(2)
  })
})
