import { placementBuildingLayout } from "./building-placement-layout"
import { settlementRoute } from "./settlement-route"
import { buildingApproaches, buildingEntry, rotatedFootprint, type BuildingRotation } from "./building-rotation"
import { getBuildInfluence } from "./build-influence"
import { DEFAULT_ELEVATION, finishElevation, generateElevation, groundHeight } from "./map/elevation"
import { describe, expect, it } from "vitest"
import { generateMap } from "./map/generate-map"
import { tileToWorldX, tileToWorldZ, type GameMap, type TilePos } from "./map/types"
import { createFootpaths, recordWalkingPath } from "./footpaths"
import { generateMonks } from "./monks"
import { generateRelic, relicDraw } from "./relic"
import { generateTravelers } from "./travelers"
import { structureParts } from "./building-art/structure"
import {
  BUILD_CATALOG,
  buildTileError,
  collectIncome,
  completeConstruction,
  createSettlement,
  grantRenown,
  grantResources,
  individualRenown,
  placementError,
  purchaseStructure,
  roadBlockError,
  relicRenown,
  settlementIncome,
  settlementEvangelism,
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
const house = BUILD_CATALOG.find((item) => item.id === "house")!
const cross = BUILD_CATALOG.find((item) => item.id === "cross")!

/** A shrine off a through road, as the generator lays one out: road, track, door. */
function trackMap(): GameMap {
  const width = 24, depth = 24
  const map: GameMap = {
    width, depth, tiles: new Array(width * depth).fill("grass"), buildings: [],
    road: Array.from({ length: width }, (_, x) => ({ x, z: 4 })),
    site: { junction: 10, branch: Array.from({ length: 5 }, (_, i) => ({ x: 10, z: 4 + i })),
      door: { x: 10, z: 8 }, hovelId: "hovel" },
  }
  for (const p of map.road!) map.tiles[p.z * width + p.x] = "path"
  for (const p of map.site!.branch.slice(1)) map.tiles[p.z * width + p.x] = "track"
  map.buildings.push({ id: "hovel", label: "Shrine", x: 9, z: 9, w: 3, d: 3, height: 1, color: "tan", roofColor: "brown" })
  map.footpaths = createFootpaths(map)
  return map
}

/** Walk a straight line often enough to establish a path along it. */
function wearPath(map: GameMap, from: TilePos, to: TilePos, passes = 20) {
  const a = { x: tileToWorldX(map, from.x), z: tileToWorldZ(map, from.z) }
  const b = { x: tileToWorldX(map, to.x), z: tileToWorldZ(map, to.z) }
  for (let pass = 0; pass < passes; pass++) {
    let before = a
    for (let step = 1; step <= 60; step++) {
      const after = { x: a.x + (b.x - a.x) * step / 60, z: a.z + (b.z - a.z) * step / 60 }
      recordWalkingPath(map.footpaths!, map, before, after)
      before = after
    }
  }
}
const garden = BUILD_CATALOG.find((item) => item.id === "garden")!

describe("build and buy", () => {
  it.each(["shelter", "wood-shelter", "lumberCamp", "watering-hole"])("retires %s without deleting existing structures or charging for new ones", type => {
    const def = BUILD_CATALOG.find(b => b.id === type)!
    expect(def.retired).toBe(true)
    const existing = { ...def, id: "legacy", buildType: type, x: 10, z: 14 }
    const before = { ...createSettlement(), structures: [existing] }
    const result = purchaseStructure(before, testMap(), monks, [relic], type, { x: 18, z: 14 }, undefined, 10000)
    expect(result.error).toBe("This structure is no longer available to build.")
    expect(result.settlement).toBe(before)
    expect(result.settlement.structures[0]).toBe(existing)
    expect(structureParts(existing).length).toBeGreaterThan(0)
  })
  it("activates evangelism only after construction and never stacks extra crosses", () => {
    const map = testMap()
    expect(settlementEvangelism(map)).toBe(0)
    const purchase = purchaseStructure(createSettlement(), map, monks, [relic], "cross", { x: 10, z: 14 })
    expect(purchase.error).toBeNull()
    expect(purchase.settlement.resources).toEqual({ gold: STARTING_RESOURCES.gold - 60, wood: STARTING_RESOURCES.wood - 45 })
    const cross = purchase.settlement.structures[0]
    map.buildings.push(cross)
    expect(settlementEvangelism(map)).toBe(0)
    cross.construction!.work = cross.construction!.required
    expect(settlementEvangelism(map)).toBe(0.05)
    map.buildings.push({ ...cross, id: "extra-cross", x: 12 })
    expect(settlementEvangelism(map)).toBe(0.05)
    map.buildings = map.buildings.filter(b => b.buildType !== "cross")
    expect(settlementEvangelism(map)).toBe(0)
  })
  it.each([0, 1, 2, 3] as BuildingRotation[])("buys and reserves a rectangular building at rotation %i", rotation => {
    const map = testMap(), at = { x: 10, z: 14 }
    const def = BUILD_CATALOG.find(item => item.id === "hall")!
    const water = new Uint8Array(map.tiles.length)
    map.elevation = generateElevation(1, map.width, map.depth, water)
    map.elevation.height = map.elevation.height.map((_, i) => (i % map.width) * 0.025)
    finishElevation(map.elevation, map.width, map.depth, water, [])
    const footprint = rotatedFootprint(def, rotation)
    const previewHeight = groundHeight(map, at.x + (footprint.w - 1) / 2, at.z + (footprint.d - 1) / 2)
    const before = { ...createSettlement(), resources: { ...def.cost } }
    const result = purchaseStructure(before, map, monks, [relic], def.id, at, undefined, 10000, rotation)
    expect(result.error).toBeNull()
    const placed = result.settlement.structures[0]
    expect(placed).toMatchObject({ ...at, ...footprint, rotation })
    const placedMap = { ...map, elevation: result.settlement.elevation }
    for (let z = at.z; z < at.z + footprint.d; z++) for (let x = at.x; x < at.x + footprint.w; x++) {
      for (const dx of [-0.49, 0.49]) for (const dz of [-0.49, 0.49]) {
        expect(groundHeight(placedMap, x + dx, z + dz)).toBeCloseTo(previewHeight)
      }
    }
    const occupied = { ...map, buildings: [...map.buildings, placed] }
    expect(placementError(occupied, garden, { x: at.x + placed.w - 1, z: at.z + placed.d - 1 })).toMatch(/occupies/)
    map.tiles[(at.z + placed.d - 1) * map.width + at.x + placed.w - 1] = "water"
    const failed = purchaseStructure(before, map, monks, [relic], def.id, at, undefined, 10000, rotation)
    expect(failed.error).toBeTruthy()
    expect(failed.settlement).toBe(before)
  })

  it.each(["workshop", "storehouse"])("preserves the entrance of an already rotated %s", buildType => {
    const map = testMap()
    map.buildings.push({ ...map.buildings[0], id: `${buildType}-0`, buildType, x: 10, z: 14, rotation: 1 })
    const cross = BUILD_CATALOG.find(item => item.id === "cross")!
    expect(placementError(map, cross, { x: 9, z: 14 })).toMatch(/access to existing buildings/)
    expect(placementError(map, cross, { x: 10, z: 16 })).toBeNull()
  })

  it("checks the turned footprint rather than the catalogue dimensions", () => {
    const map = testMap(), at = { x: 10, z: 14 }
    const def = BUILD_CATALOG.find(item => item.id === "hall")!
    map.tiles[(at.z + 2) * map.width + at.x] = "water"
    expect(placementError(map, def, at)).toBeTruthy()
    expect(placementError(map, def, at, undefined, 1)).toBeNull()
  })

  it("offers the active building kit", () => {
    expect(BUILD_CATALOG.filter(b => b.category === "buildings" && !b.retired).map(b => b.id))
      .toEqual(["workshop", "hall", "storehouse", "monk-shelter", "house", "market", "guard-post", "tavern", "inn", "sheep-pen"])
    for (const type of ["enclosure", "gable", "hovel"])
      expect(purchaseStructure(createSettlement(), testMap(), monks, [relic], type, { x: 10, z: 14 }).error).toBe("Unknown structure.")
  })

  it("buys a roofed storehouse away from woods using its full footprint", () => {
    const map = testMap(), def = BUILD_CATALOG.find(b => b.id === "storehouse")!
    const result = purchaseStructure(createSettlement(), map, monks, [relic], def.id, { x: 10, z: 14 })
    expect(result.error).toBeNull()
    const placed = result.settlement.structures[0]
    expect([placed.w, placed.d]).toEqual([2, 2])
    expect(structureParts(placed)).toEqual(structureParts({ ...def, buildType: def.id, layoutSeed: placed.layoutSeed, fireplace: placed.fireplace, hearthZ: placed.hearthZ }))
    expect(structureParts(placed).some(p => p.layer === "roof")).toBe(true)
    expect(placementError({ ...map, buildings: [...map.buildings, placed] }, def, { x: 11, z: 15 })).toMatch(/occupies/)
  })

  it("keeps storehouse entrances reachable when placing stores and later additions", () => {
    const map = testMap(), def=BUILD_CATALOG.find(b=>b.id==="storehouse")!
    const candidate={...def,x:10,z:14,buildType:def.id,id:"preview"}
    const entry=buildingEntry({...candidate,...placementBuildingLayout(map,candidate)})
    map.tiles[entry.z * map.width + entry.x] = "water"
    expect(purchaseStructure(createSettlement(), map, monks, [relic], "storehouse", { x: 10, z: 14 }).error).toMatch(/access|entrance/)
    map.tiles[entry.z * map.width + entry.x] = "grass"
    const placed = purchaseStructure(createSettlement(), map, monks, [relic], "storehouse", { x: 10, z: 14 })
    expect(placed.error).toBeNull()
    const blocked = purchaseStructure(placed.settlement, map, monks, [relic], "cross", entry)
    expect(blocked.error).toMatch(/access/)
    expect(blocked.settlement).toBe(placed.settlement)
  })

  it("grades successful purchases cumulatively without editing terrain on rejected purchases", () => {
    const map = testMap(), water = new Uint8Array(map.tiles.length)
    map.elevation = generateElevation(1, map.width, map.depth, water)
    map.elevation.height = map.elevation.height.map((_, i) => (i % map.width) * 0.025)
    finishElevation(map.elevation, map.width, map.depth, water, [])
    const original = structuredClone(map.elevation)
    const before = { ...createSettlement(), resources: { gold: 1000, wood: 1000 } }
    const at = { x: 11, z: 14 }
    const previewHeight = groundHeight(map, at.x + (house.w - 1) / 2, at.z + (house.d - 1) / 2)
    const first = purchaseStructure(before, map, monks, [relic], house.id, at)
    expect(first.error).toBeNull()
    const firstElevation = structuredClone(first.settlement.elevation!)
    const second = purchaseStructure(first.settlement, map, monks, [relic], house.id, { x: 9, z: 14 })
    expect(second.error).toBeNull()
    expect(second.settlement.elevation).not.toBe(first.settlement.elevation)
    for (const settlement of [first.settlement, second.settlement]) {
      const placedMap = { ...map, elevation: settlement.elevation }
      for (let z = at.z; z < at.z + house.d; z++) for (let x = at.x; x < at.x + house.w; x++) {
        for (const dx of [-0.49, 0.49]) for (const dz of [-0.49, 0.49]) {
          expect(groundHeight(placedMap, x + dx, z + dz)).toBeCloseTo(previewHeight)
        }
      }
    }
    const rejected = purchaseStructure(second.settlement, map, monks, [relic], house.id, at)
    expect(rejected.error).toMatch(/occupies/)
    expect(rejected.settlement).toBe(second.settlement)
    expect(map.elevation).toEqual(original)
    expect(first.settlement.elevation).toEqual(firstElevation)
    expect(before.elevation).toBeUndefined()
  })

  it("keeps influence feedback and footprint checks aware of cliffs and uneven ground", () => {
    const map = testMap(), i = 14 * map.width + 11
    map.elevation = { settings: DEFAULT_ELEVATION, height: Array(900).fill(0), corners: Array(3600).fill(0), cliffs: Array(900).fill(0), slope: Array(900).fill(0) }
    const influence = getBuildInfluence(map)
    expect(buildTileError(map, 11, 14, influence)).toBeNull()
    map.elevation.cliffs[i] = 1
    expect(buildTileError(map, 11, 14, influence)).toMatch(/cliffs/)
    expect(placementError(map, house, { x: 11, z: 14 })).toMatch(/cliffs/)
    map.elevation.cliffs[i] = 0
    map.elevation.corners.fill(0.4, (i + 1) * 4, (i + 2) * 4)
    expect(placementError(map, house, { x: 11, z: 14 })).toMatch(/level ground/)
  })

  it("pays once on successful placement, retaining the base map and founding supplies", () => {
    const before = createSettlement()
    const map = testMap()
    const result = purchaseStructure(before, map, monks, [relic], "house", { x: 11, z: 14 })
    expect(result.error).toBeNull()
    expect(result.settlement.resources).toEqual({
      gold: STARTING_RESOURCES.gold - 40,
      wood: STARTING_RESOURCES.wood - 30,
    })
    expect(result.settlement.structures[0]).toMatchObject({
      buildType: "house",
      x: 11,
      z: 14,
      w: 2,
      d: 2,
      construction: { work: 0, required: 96, cost: { gold: 40, wood: 30 } },
    })
    expect(before.resources).toEqual(STARTING_RESOURCES)
    expect(before.structures).toHaveLength(0)
    expect(map.buildings).toHaveLength(1)
  })

  it.each([
    { gold: 39, wood: 100 },
    { gold: 100, wood: 29 },
  ])("requires enough of each currency: %j", (resources) => {
    const before = { ...createSettlement(), resources }
    const result = purchaseStructure(before, testMap(), monks, [relic], "house", { x: 11, z: 14 })
    expect(result.error).toMatch(/Not enough/)
    expect(result.settlement).toBe(before)
  })

  it("allows exact funds, then refuses a second purchase without going negative", () => {
    const before = { ...createSettlement(), resources: { ...house.cost } }
    const result = purchaseStructure(before, testMap(), monks, [relic], "house", { x: 11, z: 14 })
    expect(result.settlement.resources).toEqual({ gold: 0, wood: 0 })
    const second = purchaseStructure(result.settlement, testMap(), monks, [relic], "house", {
      x: 18,
      z: 14,
    })
    expect(second.settlement).toBe(result.settlement)
    expect(second.error).toBeTruthy()
  })

  it("rejects overlap with both the founding hovel and player additions without charging", () => {
    const before = createSettlement()
    expect(
      purchaseStructure(before, testMap(), monks, [relic], "house", { x: 13, z: 13 }).settlement,
    ).toBe(before)
    const first = purchaseStructure(before, testMap(), monks, [relic], "house", {
      x: 11,
      z: 14,
    }).settlement
    const second = purchaseStructure(first, testMap(), monks, [relic], "garden", { x: 12, z: 15 })
    expect(second.error).toMatch(/occupies/)
    expect(second.settlement).toBe(first)
  })

  it.each(["forest", "darkwood", "water", "bridge", "clearing", "hills"] as const)(
    "checks the far corner of the footprint for %s",
    (terrain) => {
      const map = testMap()
      map.tiles[15 * map.width + 12] = terrain
      const before = createSettlement()
      const result = purchaseStructure(before, map, monks, [relic], "house", { x: 11, z: 14 })
      expect(result.error).toBeTruthy()
      expect(result.settlement).toBe(before)
    },
  )

  it("builds over the road while a way around it remains", () => {
    const map = testMap()
    const road = Array.from({ length: 30 }, (_, z) => ({ x: 11, z }))
    for (const p of road) map.tiles[p.z * map.width + p.x] = "path"
    map.road = road
    expect(placementError(map, house, { x: 10, z: 12 })).toBeNull()
  })

  it("refuses a footprint that pens the road in with nowhere to go around", () => {
    // A road down a gorge: water either side leaves no ground to step onto.
    const map = testMap()
    map.road = Array.from({ length: 30 }, (_, z) => ({ x: 11, z }))
    for (let z = 0; z < 30; z++) {
      map.tiles[z * map.width + 11] = "path"
      for (const x of [10, 12]) map.tiles[z * map.width + x] = "water"
    }
    const across = { ...house, id: "dam", buildType: "house", label: "Dam", w: 1, d: 2, x: 11, z: 12, rotation: 0 as const }
    expect(roadBlockError(map, [...map.buildings, across])).toMatch(/way around the road/)
  })

  it("keeps the road's map edges clear for arrivals and departures", () => {
    const map = testMap()
    map.road = Array.from({ length: 30 }, (_, z) => ({ x: 11, z }))
    const across = { ...house, id: "gate", buildType: "house", label: "Gate", x: 10, z: 0, rotation: 0 as const }
    expect(roadBlockError(map, [...map.buildings, across])).toMatch(/leaves the map/)
    expect(roadBlockError(map, [...map.buildings, { ...across, z: 12 }])).toBeNull()
  })

  it("builds on ground a path has worn, but not on the untrodden forest floor beside it", () => {
    const map = testMap()
    for (let z = 11; z < 17; z++) for (let x = 9; x < 14; x++) map.tiles[z * map.width + x] = "clearing"
    map.footpaths = createFootpaths(map)
    expect(placementError(map, cross, { x: 11, z: 14 })).toMatch(/worn path/)
    wearPath(map, { x: 11, z: 11 }, { x: 11, z: 16 })
    expect(placementError(map, cross, { x: 11, z: 14 })).toBeNull()
    expect(placementError(map, cross, { x: 13, z: 14 })).toMatch(/worn path/)
  })

  it("builds on the shrine track while the door can still be reached", () => {
    const map = trackMap()
    expect(placementError(map, cross, { x: 10, z: 6 })).toBeNull()
    // Penned between water, the track is the only way in, so it must stay open.
    const gorge = { ...map, water: { depth: new Array(24 * 24).fill(0) as number[], flow: {} } }
    for (let z = 5; z <= 8; z++) for (const x of [9, 11]) {
      gorge.tiles[z * 24 + x] = "water"
      gorge.water.depth[z * 24 + x] = 2
    }
    expect(placementError(gorge, cross, { x: 10, z: 6 })).toMatch(/to the shrine door/)
  })

  it("keeps the dark forest tracks clear, where the old growth allows no detour", () => {
    const map = trackMap()
    map.shortcuts = [{ entry: 2, exit: 6, tiles: [{ x: 2, z: 4 }, { x: 3, z: 5 }, { x: 4, z: 5 }, { x: 6, z: 4 }] }]
    expect(placementError(map, cross, { x: 3, z: 5 })).toMatch(/forest track/)
  })

  it("keeps the approach clear even if its terrain is open", () => {
    expect(placementError(testMap(), house, { x: 13, z: 16 })).toMatch(/approach/)
  })

  it("rejects distant sites, partial off-map footprints and fractional coordinates", () => {
    expect(placementError(testMap(), house, { x: 0, z: 0 })).toBeTruthy()
    expect(placementError(testMap(), house, { x: 29, z: 14 })).toBeTruthy()
    expect(placementError(testMap(), house, { x: 11.5, z: 14 })).toBeTruthy()
  })

  it("housing does not unlock the hall; completed visits can earn the required renown", () => {
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
      const purchase = purchaseStructure(settlement, map, [], [], "house", at)
      expect(purchase.error).toBeNull()
      settlement = purchase.settlement
    }
    expect(purchaseStructure(settlement, map, [], [], "hall", { x: 18, z: 14 }).error).toMatch(/40 shrine renown/)
    const hall = purchaseStructure(settlement, map, [], [], "hall", { x: 18, z: 14 }, undefined, 70)
    expect(hall.error).toBeNull()
    expect(hall.settlement.structures.at(-1)?.buildType).toBe("hall")
  })

  it("counts granted renown toward unlocks and reports it separately", () => {
    const map = testMap()
    const settlement = grantRenown({ ...createSettlement(), resources: { gold: 1000, wood: 1000 } }, 1000)
    expect(settlement.grantedRenown).toBe(1000)
    const earned = settlementRenown(map, [], [])
    expect(earned.granted).toBe(0)
    const renown = settlementRenown(map, [], [], undefined, 0, settlement.grantedRenown)
    expect(renown.granted).toBe(1000)
    expect(renown.total).toBe(earned.total + 1000)
    const hall = purchaseStructure(settlement, map, [], [], "hall", { x: 18, z: 14 })
    expect(hall.error).toBeNull()
  })

  it("grants resources on top of the treasury without touching deliveries", () => {
    const before = createSettlement()
    const richer = grantResources(grantResources(before, { wood: 1000 }), { gold: 1000 })
    expect(richer.resources).toEqual({ gold: STARTING_RESOURCES.gold + 1000, wood: STARTING_RESOURCES.wood + 1000 })
    expect(richer.deliveredWood).toBe(0)
    expect(richer.spentWood).toBe(0)
    expect(before.resources).toEqual(STARTING_RESOURCES)
  })

  it("finishes every pending site at once and leaves finished settlements alone", () => {
    const map = testMap()
    const purchase = purchaseStructure(createSettlement(), map, [], [], "house", { x: 9, z: 10 })
    expect(purchase.error).toBeNull()
    const planned = purchase.settlement
    expect(planned.structures[0].construction?.work).toBe(0)
    const finished = completeConstruction(planned)
    expect(finished).not.toBe(planned)
    expect(finished.structures[0].construction?.work).toBe(finished.structures[0].construction?.required)
    expect(finished.resources).toEqual(planned.resources)
    expect(planned.structures[0].construction?.work).toBe(0)
    expect(completeConstruction(finished)).toBe(finished)
    expect(completeConstruction(createSettlement())).toEqual(createSettlement())
  })

  it("offers buildable land on generated shrine maps", () => {
    for (const seed of [1, 42, 12345, 7919]) {
      const map = generateMap({ seed, width: 64, depth: 64 })
      const hovel = map.buildings.find((b) => b.id === map.site?.hovelId)!
      let available = false
      for (let z = hovel.z - 12; z <= hovel.z + 12 && !available; z++) {
        for (let x = hovel.x - 12; x <= hovel.x + 12; x++) {
          if (!placementError(map, house, { x, z })) {
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
    const first = purchaseStructure(createSettlement(), map, monks, [relic], "house", {
      x: 11,
      z: 14,
    }).settlement
    const second = purchaseStructure(first, map, monks, [relic], "garden", {
      x: 18,
      z: 14,
    }).settlement
    for (const b of second.structures) b.construction!.work = b.construction!.required
    const relics = [relic, generateRelic(42)]
    const total = settlementRenown(
      { ...map, buildings: [...map.buildings, ...second.structures] },
      monks,
      relics,
    )
    expect(total.buildings).toBe(5 + house.renown)
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
    for (const b of purchase.structures) b.construction!.work = b.construction!.required
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

  it("never generates resources from resident counts or purchased buildings", () => {
    const before = createSettlement()
    const map = testMap()
    map.tiles[12 * map.width + 10] = "forest"
    const purchase = purchaseStructure(before, map, monks, [relic], "workshop", {
      x: 11,
      z: 14,
    })
    expect(purchase.error).toBeNull()
    const built = purchase.settlement
    expect(settlementIncome(built, 4)).toEqual({ gold: 0, wood: 0 })
    const after = collectIncome(built, 4)
    expect(after.resources.gold).toBe(built.resources.gold)
    expect(after.resources.wood).toBe(built.resources.wood)
    expect(after.structures).toBe(built.structures)
    expect(createSettlement()).toEqual(before)
  })
})

it.each([0,1,2,3] as BuildingRotation[])("reserves a walkable entrance tile and releases it on removal (rotation %i)", rotation => {
  const map=testMap(),def=BUILD_CATALOG.find(b=>b.id==="hall")!
  const building={...def,...rotatedFootprint(def,rotation),x:8,z:8,rotation,id:"hall",buildType:"hall"}
  map.buildings.push(building)
  const entry=buildingEntry(building)
  const marker=BUILD_CATALOG.find(b=>b.id==="cross")!
  expect(placementError(map,marker,entry)).toMatch(/entrance path tile/)
  expect(settlementRoute(map,map.buildings,map.site!.door,entry)).not.toBeNull()
  map.buildings.pop()
  expect(placementError(map,marker,entry)).toBeNull()
})

it.each([0,1,2,3] as BuildingRotation[])("reserves tavern doorways and outdoor benches and releases them on removal (rotation %i)", rotation => {
  const map=testMap(),def=BUILD_CATALOG.find(b=>b.id==="hall")!
  const building={...def,...rotatedFootprint({w:3,d:4},rotation),x:8,z:8,rotation,id:"tavern",buildType:"tavern"}
  map.buildings.push(building)
  const entries=buildingApproaches(map,building),marker=BUILD_CATALOG.find(b=>b.id==="cross")!
  expect(entries).toHaveLength(4)
  for(const entry of entries) {
    expect(placementError(map,marker,entry)).toMatch(/entrance path tile/)
    expect(settlementRoute(map,map.buildings,map.site!.door,entry)).not.toBeNull()
  }
  map.buildings.pop()
  for(const entry of entries) expect(placementError(map,marker,entry)).toBeNull()
})

it("buys the same roof-snapped rotation shown by the placement preview", async()=>{
  const {placementRoofRotation}=await import("./building-placement-layout")
  const map=testMap(),house=BUILD_CATALOG.find(b=>b.id==="house")!,tavern=BUILD_CATALOG.find(b=>b.id==="tavern")!
  map.buildings.push({...tavern,id:"neighbor-tavern",buildType:"tavern",x:7,z:12,layoutSeed:18})
  const at={x:10,z:14},rotation=placementRoofRotation(map,house,at,1)
  expect(rotation).toBe(0)
  expect(placementError(map,house,at,undefined,1)).toBeNull()
  const before={...createSettlement(),resources:{...house.cost}}
  const result=purchaseStructure(before,map,monks,[relic],"house",at,undefined,10000,1)
  expect(result.error).toBeNull()
  expect(result.settlement.structures[0]).toMatchObject({...at,rotation,w:2,d:2})
})
