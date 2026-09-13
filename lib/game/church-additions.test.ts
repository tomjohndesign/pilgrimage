import { describe, expect, it } from "vitest"
import { Box3, Vector3 } from "three"
import { churchAdditionError, churchWing, churchWingGates, completedChurchWings } from "./church-additions"
import { buildingEntry, rotatedFootprint, type BuildingRotation } from "./building-rotation"
import { buildingStepAllowed, containsTile } from "./building-navigation"
import { assignBuildingTask, type Worker } from "./construction"
import { shrinePoint } from "./shrine-layout"
import { settlementRoute } from "./settlement-route"
import { BUILD_CATALOG, createSettlement, purchaseStructure, settlementMap } from "./settlement"
import { generateMonks } from "./monks"
import { generateRelic } from "./relic"
import { tileToWorldX, tileToWorldZ, type GameMap } from "./map/types"
import { captureSettlement, restoreSettlement } from "./save/settlement"
import { settlementSaveSchema } from "./save/schema"
import { finishElevation, generateElevation, groundHeight, levelBuildingGround } from "./map/elevation"
import { churchAisleRoof, churchWingRoof, clipRoof } from "./building-art/church-roof"
import { shrineStructureParts, structureParts } from "./building-art/structure"
import { roofOutlineOwners } from "./building-art/roof-joins"

const residence = BUILD_CATALOG.find(b => b.id === "monk-shelter")!

function fixture(turn: BuildingRotation = 0, side = -1, along = 0) {
  const church = { id: "church", label: "Church", x: 14, z: 14, ...rotatedFootprint({ w: 3, d: 5 }, turn), height: 1.18, color: "tan", roofColor: "brown" }
  const doors = [{ x: 15, z: 19 }, { x: 13, z: 15 }, { x: 15, z: 13 }, { x: 19, z: 15 }]
  const map: GameMap = { width: 32, depth: 32, tiles: Array(1024).fill("grass"), buildings: [church],
    site: { hovelId: church.id, door: doors[turn], branch: [doors[turn]], junction: 0 } }
  const centre = shrinePoint(church, map.site!.door, side * 2.5, along)
  const footprint = rotatedFootprint({ w: 2, d: 3 }, turn)
  const at = { x: centre.x - (footprint.w - 1) / 2, z: centre.z - (footprint.d - 1) / 2 }
  return { map, church, at }
}

function buy(map: GameMap, at: { x: number; z: number }) {
  const result = purchaseStructure(createSettlement(), map, generateMonks(1), [generateRelic(1)], residence.id, at)
  expect(result.error).toBeNull()
  return result.settlement
}

describe("church side residences", () => {
  it.each(([0, 1, 2, 3] as BuildingRotation[]).flatMap(turn => [-1, 1].flatMap(side => [-1, 0, 1].map(along => ({ turn, side, along })))))
  ("joins only through the church at $turn / $side / $along", ({ turn, side, along }) => {
    const { map, church, at } = fixture(turn, side, along)
    const settlement = buy(map, at), building = settlement.structures[0]
    const connected = settlementMap(map, settlement)
    expect(churchWing(connected, building)).toMatchObject({ side, from: along - 1.5, to: along + 1.5, reach: 2 })
    expect(churchWingGates(connected)).toEqual([])
    expect(completedChurchWings(connected)).toEqual([])
    const inside = buildingEntry(building, true), entry = buildingEntry(building)
    expect(containsTile(church, entry)).toBe(true)
    expect(buildingStepAllowed(connected, connected.buildings, entry, inside, true)).toBe(false)
    const actor: Worker = { x: tileToWorldX(map, map.site!.door.x), z: tileToWorldZ(map, map.site!.door.z), y: 0 }
    expect(assignBuildingTask(actor, connected, "build", building.id)).toBe(true)
    building.construction!.work = building.construction!.required
    expect(churchWingGates(connected)).toEqual([{ inside: entry, outside: inside }])
    expect(completedChurchWings(connected)).toHaveLength(1)
    expect(buildingStepAllowed(connected, connected.buildings, entry, inside, true)).toBe(true)
    expect(buildingStepAllowed(connected, connected.buildings, inside, entry, true)).toBe(true)
    expect(buildingStepAllowed(connected, connected.buildings, buildingEntry(building, false, -1), buildingEntry(building, true, -1), true)).toBe(false)
    const route = settlementRoute(connected, connected.buildings, map.site!.door, inside, false, true)!
    expect(route).not.toBeNull()
    expect(route).toContainEqual(entry)
    expect(settlementRoute(connected, connected.buildings, inside, map.site!.door, false, true)).not.toBeNull()
    // Bed routes use the same wall openings as ordinary church navigation.
    actor.buildingTask = undefined
    expect(assignBuildingTask(actor, connected, "rest", building.id)).toBe(true)
    expect(actor.buildingTask!.route.some(p => containsTile(church, { x: p.x + map.width / 2 - .5, z: p.z + map.depth / 2 - .5 }))).toBe(true)
    expect(roofOutlineOwners(connected.buildings, new Map())).toEqual([0, 0])
  })

  it.each([{ x: 12, z: 12 }, { x: 12, z: 17 }, { x: 15, z: 12 }, { x: 15, z: 19 }, { x: 11, z: 15 }])
  ("rejects ends, overhangs, corners and detached wings at %o", at => {
    const { map } = fixture()
    expect(churchAdditionError(map, { ...at, w: 2, d: 3, buildType: "monk-shelter" })).toMatch(/side wall/)
    const settlement = createSettlement()
    const result = purchaseStructure(settlement, map, generateMonks(1), [generateRelic(1)], residence.id, at)
    expect(result.error).toMatch(/side wall/)
    expect(result.settlement).toBe(settlement)
  })

  it("does not turn standalone buildings into church doors on maps without a church", () => {
    const { map } = fixture()
    map.site = undefined
    expect(churchWingGates(map)).toEqual([])
    expect(completedChurchWings(map)).toEqual([])
  })

  it("supports both side wings and closes a shared doorway when its wing is removed", () => {
    const { map, at } = fixture()
    const first = buy(map, at)
    first.structures[0].construction = undefined
    const next = purchaseStructure(first, settlementMap(map, first), generateMonks(1), [generateRelic(1)], residence.id, fixture(0, 1).at)
    expect(next.error).toBeNull()
    next.settlement.structures[1].construction = undefined
    const connected = settlementMap(map, next.settlement)
    expect(churchWingGates(connected)).toHaveLength(2)
    const removed = connected.buildings.pop()!
    expect(churchWingGates(connected)).toHaveLength(1)
    expect(buildingStepAllowed(connected, connected.buildings, buildingEntry(removed, true), buildingEntry(removed), true)).toBe(false)
  })

  it("keeps the church floor level and shared entrance after saving and loading", () => {
    const { map, church, at } = fixture()
    const water = new Uint8Array(map.tiles.length)
    map.elevation = generateElevation(1, map.width, map.depth, water)
    map.elevation.height = map.elevation.height.map((_, i) => (i % map.width) * .04)
    finishElevation(map.elevation, map.width, map.depth, water, [])
    map.elevation = levelBuildingGround(map, church)!
    const settlement = buy(map, at), building = settlement.structures[0]
    building.construction!.work = building.construction!.required
    const saved = settlementSaveSchema.parse(JSON.parse(JSON.stringify(captureSettlement(settlement))))
    const restored = restoreSettlement(map, saved), loaded = settlementMap(map, restored)
    expect(restored.structures).toEqual(settlement.structures)
    expect(restored.elevation?.height).toEqual(settlement.elevation?.height)
    for (let z = building.z; z < building.z + building.d; z++) for (let x = building.x; x < building.x + building.w; x++) {
      expect(groundHeight(loaded, x, z)).toBeCloseTo(groundHeight(loaded, church.x + 1, church.z + 2))
    }
    expect(settlementRoute(loaded, loaded.buildings, loaded.site!.door, buildingEntry(restored.structures[0], true), false, true)).not.toBeNull()
  })

  it.each([-1, 1])("shares the exact thatch boundary and leaves only an interior doorway on side %i", side => {
    const { map, at } = fixture(0, side)
    const building = buy(map, at).structures[0], wing = churchWing(map, building)!
    const roof = churchWingRoof(wing)
    const churchRoof = clipRoof(churchAisleRoof(3, side, wing.from, wing.to, wing.reach), side * 1.5, -side)
    const edge = (parts: typeof roof, local: boolean) => [...new Set(parts.flatMap(p => p.vertices!.flatMap((_, i, v) => {
      if (i % 3) return []
      const x = local ? side * (2.5 - v[i + 2]) : v[i]
      const z = local ? side * v[i] : v[i + 2]
      return Math.abs(x - side * 1.5) < 1e-8 ? `${v[i + 1].toFixed(8)},${z.toFixed(8)}` : []
    })))].sort()
    expect(edge(roof, true).length).toBeGreaterThan(10)
    expect(edge(roof, true)).toEqual(edge(churchRoof, false))
    const parts = structureParts({ ...building, ...rotatedFootprint(building, building.rotation), churchWing: wing })
    expect(parts.some(p => p.name.startsWith("residence-entrance") || p.name.startsWith("residence-gable"))).toBe(false)
    const church = shrineStructureParts(3, 5, [wing])
    expect(church.some(p => p.name.startsWith(`side-wall-${side}-span-`) && p.name.includes("jamb"))).toBe(true)
    expect(church.some(p => p.name === `side-sill-${side}`)).toBe(false)
    const passage = new Box3(new Vector3(side * 1.37 - .12, .02, -.16), new Vector3(side * 1.37 + .12, .78, .16))
    expect(church.filter(p => {
      if (p.layer !== "wall") return false
      const bounds = p.vertices ? new Box3().setFromArray(p.vertices) : new Box3().setFromCenterAndSize(new Vector3(...p.position), new Vector3(...p.size!))
      return bounds.intersectsBox(passage)
    }).map(p => p.name)).toEqual([])
  })
})
