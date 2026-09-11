import { describe, expect, it } from "vitest"

import { generateMap } from "../map/generate-map"
import { generateMonks } from "../monks"
import { generateRelic } from "../relic"
import { BUILD_CATALOG, createSettlement, purchaseStructure, settlementMap } from "../settlement"
import { DEFAULT_BALANCE } from "../balance"
import { settlementSaveSchema } from "./schema"
import { captureSettlement, restoreSettlement } from "./settlement"

/** Buy the cheapest structure somewhere near the hovel, on the first tile that accepts it. */
function buyAnything(world: ReturnType<typeof generateMap>) {
  const balance = { ...DEFAULT_BALANCE, rules: { ...DEFAULT_BALANCE.rules, startingGold: 100000, startingWood: 100000 } }
  const monks = generateMonks(world.seed!), relic = generateRelic(world.seed!)
  let settlement = createSettlement(balance)
  const hovel = world.buildings.find(b => b.id === world.site?.hovelId)!
  const def = BUILD_CATALOG.filter(b => !b.retired).sort((a, b) => a.requiredRenown - b.requiredRenown || a.cost.gold - b.cost.gold)[0]
  for (let r = 2; r < 14; r++) for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
    const result = purchaseStructure(settlement, world, monks, [relic], def.id, { x: hovel.x + dx, z: hovel.z + dz }, balance, 0, 0)
    if (!result.error) { settlement = result.settlement; if (settlement.structures.length === 2) return settlement }
  }
  return settlement
}

describe("settlement save", () => {
  it("replays ground levelling instead of storing the terrain", () => {
    const world = generateMap({ seed: 31 })
    const settlement = buyAnything(world)
    expect(settlement.structures.length).toBeGreaterThan(0)
    expect(settlement.elevation).toBeDefined()

    const saved = settlementSaveSchema.parse(JSON.parse(JSON.stringify(captureSettlement(settlement))))
    expect("elevation" in saved).toBe(false)

    const restored = restoreSettlement(world, saved)
    expect(restored.structures).toEqual(settlement.structures)
    expect(restored.resources).toEqual(settlement.resources)
    expect(restored.elevation?.height).toEqual(settlement.elevation?.height)
    expect(restored.elevation?.corners).toEqual(settlement.elevation?.corners)
    expect(settlementMap(world, restored).buildings.map(b => b.id)).toEqual(settlementMap(world, settlement).buildings.map(b => b.id))
  })

  it("keeps granted renown and defaults it for saves made before cheats", () => {
    const world = generateMap({ seed: 31 })
    const settlement = { ...buyAnything(world), grantedRenown: 1000 }
    const saved = settlementSaveSchema.parse(JSON.parse(JSON.stringify(captureSettlement(settlement))))
    expect(restoreSettlement(world, saved).grantedRenown).toBe(1000)
    const { grantedRenown: _dropped, ...older } = saved
    expect(restoreSettlement(world, settlementSaveSchema.parse(older)).grantedRenown).toBe(0)
  })

  it("drops structures that cannot belong to this world", () => {
    const world = generateMap({ seed: 31 })
    const saved = captureSettlement(buyAnything(world))
    const [first] = saved.structures
    saved.structures = [first, { ...first }, { ...first, id: "elsewhere", x: world.width - 1 }]
    saved.claimedBuildings = ["not-a-building", world.buildings[0].id]
    const restored = restoreSettlement(world, saved)
    expect(restored.structures.map(s => s.id)).toEqual([first.id])
    expect(restored.claimedBuildings).toEqual([world.buildings[0].id])
  })
})
