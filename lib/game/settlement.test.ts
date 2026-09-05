import { describe, expect, it } from "vitest"
import { generateMap } from "./map/generate-map"
import type { GameMap } from "./map/types"
import { generateMonks } from "./monks"
import { generateRelic, relicDraw } from "./relic"
import { generateTravelers } from "./travelers"
import {
  BUILD_CATALOG,
  collectIncome,
  createSettlement,
  individualRenown,
  placementError,
  purchaseStructure,
  relicRenown,
  settlementIncome,
  settlementRenown,
  STARTING_RESOURCES,
} from "./settlement"

function testMap(): GameMap {
  const map: GameMap = {
    width: 30,
    depth: 30,
    tiles: Array(900).fill("grass"),
    buildings: [
      {
        id: "hovel",
        label: "Founding hovel",
        x: 14,
        z: 14,
        w: 2,
        d: 2,
        height: 0.6,
        color: "#888",
        roofColor: "#444",
      },
    ],
    site: {
      hovelId: "hovel",
      junction: 0,
      door: { x: 14, z: 16 },
      branch: [
        { x: 14, z: 16 },
        { x: 14, z: 17 },
      ],
    },
  }
  return map
}
const monks = generateMonks(12345)
const relic = generateRelic(12345)
const shelter = BUILD_CATALOG.find((item) => item.id === "shelter")!
const garden = BUILD_CATALOG.find((item) => item.id === "garden")!

describe("build and buy", () => {
  it("pays once on successful placement, retaining the base map and founding supplies", () => {
    const before = createSettlement()
    const map = testMap()
    const result = purchaseStructure(before, map, monks, [relic], "shelter", { x: 11, z: 14 })
    expect(result.error).toBeNull()
    expect(result.settlement.resources).toEqual({
      gold: STARTING_RESOURCES.gold - 45,
      wood: STARTING_RESOURCES.wood - 35,
    })
    expect(result.settlement.structures[0]).toMatchObject({
      buildType: "shelter",
      x: 11,
      z: 14,
      w: 2,
      d: 2,
    })
    expect(before.resources).toEqual(STARTING_RESOURCES)
    expect(before.structures).toHaveLength(0)
    expect(map.buildings).toHaveLength(1)
  })

  it.each([
    { gold: 44, wood: 100 },
    { gold: 100, wood: 34 },
  ])("requires enough of each currency: %j", (resources) => {
    const before = { ...createSettlement(), resources }
    const result = purchaseStructure(before, testMap(), monks, [relic], "shelter", { x: 11, z: 14 })
    expect(result.error).toMatch(/Not enough/)
    expect(result.settlement).toBe(before)
  })

  it("allows exact funds, then refuses a second purchase without going negative", () => {
    const before = { ...createSettlement(), resources: { ...shelter.cost } }
    const result = purchaseStructure(before, testMap(), monks, [relic], "shelter", { x: 11, z: 14 })
    expect(result.settlement.resources).toEqual({ gold: 0, wood: 0 })
    const second = purchaseStructure(result.settlement, testMap(), monks, [relic], "shelter", {
      x: 18,
      z: 14,
    })
    expect(second.settlement).toBe(result.settlement)
    expect(second.error).toBeTruthy()
  })

  it("rejects overlap with both the founding hovel and player additions without charging", () => {
    const before = createSettlement()
    expect(
      purchaseStructure(before, testMap(), monks, [relic], "shelter", { x: 13, z: 13 }).settlement,
    ).toBe(before)
    const first = purchaseStructure(before, testMap(), monks, [relic], "shelter", {
      x: 11,
      z: 14,
    }).settlement
    const second = purchaseStructure(first, testMap(), monks, [relic], "garden", { x: 12, z: 15 })
    expect(second.error).toMatch(/occupies/)
    expect(second.settlement).toBe(first)
  })

  it.each(["forest", "darkwood", "water", "path", "track", "bridge", "clearing", "hills"] as const)(
    "checks the far corner of the footprint for %s",
    (terrain) => {
      const map = testMap()
      map.tiles[15 * map.width + 12] = terrain
      const before = createSettlement()
      const result = purchaseStructure(before, map, monks, [relic], "shelter", { x: 11, z: 14 })
      expect(result.error).toBeTruthy()
      expect(result.settlement).toBe(before)
    },
  )

  it("keeps the approach clear even if its terrain is open", () => {
    expect(placementError(testMap(), shelter, { x: 13, z: 16 })).toMatch(/approach/)
  })

  it("rejects distant sites, partial off-map footprints and fractional coordinates", () => {
    expect(placementError(testMap(), shelter, { x: 0, z: 0 })).toBeTruthy()
    expect(placementError(testMap(), shelter, { x: 29, z: 14 })).toBeTruthy()
    expect(placementError(testMap(), shelter, { x: 11.5, z: 14 })).toBeTruthy()
  })

  it("unlocks the hall through the establishment's combined renown", () => {
    const map = testMap()
    let settlement = { ...createSettlement(), resources: { gold: 1000, wood: 1000 } }
    const locked = purchaseStructure(settlement, map, [], [], "hall", { x: 18, z: 14 })
    expect(locked.error).toMatch(/40 shrine renown/)
    expect(locked.settlement).toBe(settlement)
    for (const at of [
      { x: 9, z: 10 },
      { x: 11, z: 10 },
      { x: 13, z: 10 },
      { x: 15, z: 10 },
      { x: 17, z: 10 },
    ]) {
      const purchase = purchaseStructure(settlement, map, [], [], "shelter", at)
      expect(purchase.error).toBeNull()
      settlement = purchase.settlement
    }
    const hall = purchaseStructure(settlement, map, [], [], "hall", { x: 18, z: 14 })
    expect(hall.error).toBeNull()
    expect(hall.settlement.structures.at(-1)?.buildType).toBe("hall")
  })

  it("offers buildable land on generated shrine maps", () => {
    for (const seed of [1, 42, 12345, 7919]) {
      const map = generateMap({ seed, width: 64, depth: 64 })
      const hovel = map.buildings.find((b) => b.id === map.site?.hovelId)!
      let available = false
      for (let z = hovel.z - 12; z <= hovel.z + 12 && !available; z++) {
        for (let x = hovel.x - 12; x <= hovel.x + 12; x++) {
          if (!placementError(map, shelter, { x, z })) {
            available = true
            break
          }
        }
      }
      expect(available, `seed ${seed}`).toBe(true)
    }
  })
})

describe("shrine renown and income", () => {
  it("adds all four sources and counts each resident and relic separately", () => {
    const map = testMap()
    const first = purchaseStructure(createSettlement(), map, monks, [relic], "shelter", {
      x: 11,
      z: 14,
    }).settlement
    const second = purchaseStructure(first, map, monks, [relic], "garden", {
      x: 18,
      z: 14,
    }).settlement
    const relics = [relic, generateRelic(42)]
    const total = settlementRenown(
      { ...map, buildings: [...map.buildings, ...second.structures] },
      monks,
      relics,
    )
    expect(total.buildings).toBe(5 + shelter.renown)
    expect(total.scenery).toBe(garden.renown)
    expect(total.individuals).toBe(monks.reduce((sum, monk) => sum + individualRenown(monk), 0))
    expect(total.relics).toBe(relics.reduce((sum, item) => sum + relicRenown(item), 0))
    expect(total.total).toBe(total.buildings + total.scenery + total.individuals + total.relics)
  })

  it("increases attraction when scenery is added, without changing the relic", () => {
    const map = testMap()
    const before = settlementRenown(map, monks, [relic]).total
    const purchase = purchaseStructure(createSettlement(), map, monks, [relic], "garden", {
      x: 18,
      z: 14,
    }).settlement
    const after = settlementRenown(
      { ...map, buildings: [...map.buildings, ...purchase.structures] },
      monks,
      [relic],
    ).total
    const pilgrim = generateTravelers(42, 60).find((t) => t.type.id === "pilgrim")!
    expect(relicDraw(pilgrim.attributes, relic.stats, after)).toBeGreaterThan(
      relicDraw(pilgrim.attributes, relic.stats, before),
    )
    expect(relic).toEqual(generateRelic(12345))
  })

  it("replenishes both supplies and applies income from purchased buildings", () => {
    const before = createSettlement()
    const built = purchaseStructure(before, testMap(), monks, [relic], "workshop", {
      x: 11,
      z: 14,
    }).settlement
    expect(settlementIncome(built, 4)).toEqual({ gold: 4, wood: 16 })
    const after = collectIncome(built, 4)
    expect(after.resources.gold).toBe(built.resources.gold + 4)
    expect(after.resources.wood).toBe(built.resources.wood + 16)
    expect(after.structures).toBe(built.structures)
    expect(createSettlement()).toEqual(before)
  })
})
