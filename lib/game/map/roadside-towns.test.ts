import { tavernWalkingRoute } from "../tavern-navigation"
import { tileToWorldX, tileToWorldZ } from "./types"
import { describe, expect, it } from "vitest"
import { addRoadsideTowns, TOWN_SPACING, TOWN_CHAPEL_CLEARANCE, TOWN_APPROACH_CLEARANCE } from "./roadside-towns"
import { generateMap } from "./generate-map"
import { type GameMap, tileAt } from "./types"
import { TILES_PER_DAY } from "../calendar"
import { tavernVisitPlan, servingHouses } from "../tavern"
import { buildingApproaches } from "../building-rotation"
import { settlementRoute } from "../settlement-route"
import { jobBuildings, settlementRenown } from "../settlement"
import { enclaveHousing } from "../housing"
import { buildInfluence } from "../build-influence"

function roadMap(): GameMap {
  const width = 400, depth = 30
  const map: GameMap = { width, depth, tiles: Array(width * depth).fill("grass"), buildings: [],
    road: Array.from({ length: width }, (_, x) => ({ x, z: 15 })) }
  for (const p of map.road!) map.tiles[p.z * width + p.x] = "path"
  return map
}

describe("independent roadside towns", () => {
  it("spaces complete communities just under a day's walk apart", () => {
    const map = roadMap()
    addRoadsideTowns(map)
    expect(map.towns).toHaveLength(3)
    for (const [i, town] of map.towns!.entries()) {
      const buildings = map.buildings.filter(b => b.townId === town.id)
      expect(buildings.map(b => b.buildType)).toEqual(["tavern", "house"])
      expect(buildings.every(b => b.owner === "independent" && !b.construction)).toBe(true)
      if (i) {
        expect(town.junction - map.towns![i - 1].junction).toBe(TOWN_SPACING)
        expect(town.junction - map.towns![i - 1].junction).toBeLessThan(TILES_PER_DAY)
      }
    }
    expect(map.road!.every(p => tileAt(map, p.x, p.z) === "path")).toBe(true)
    expect(servingHouses(map, () => false)).toHaveLength(0)
  })

  it("contributes no jobs, housing, renown or building influence", () => {
    const map = roadMap()
    map.site = { junction: 200, branch: [{ x: 200, z: 15 }], door: { x: 200, z: 15 }, hovelId: "absent" }
    const influence = buildInfluence(map)
    addRoadsideTowns(map)
    expect(jobBuildings(map)).toEqual([])
    expect(enclaveHousing(map, 0, 0).people.capacity).toBe(0)
    expect(settlementRenown(map, [], []).total).toBe(0)
    expect(buildInfluence(map)).toEqual(influence)
  })

  it.each([1, 7919, 42, 99, 12345])("generates reachable taverns on seeded terrain (%s)", seed => {
    const map = generateMap({ seed })
    expect(map.towns!.length).toBeGreaterThan(0)
    for (const town of map.towns!) {
      const road = map.road![town.junction]
      const tavern = map.buildings.find(b => b.id === town.tavernId)!
      const visit = tavernVisitPlan(map, tavern, road)
      expect(visit, `${town.name} has a reachable counter and seat`).not.toBeNull()
      expect(tavernWalkingRoute(map, visit!.seat!.point, { x: tileToWorldX(map, road.x), z: tileToWorldZ(map, road.z), y: .2 })).toBeTruthy()
      for (const id of town.buildingIds) {
        const building = map.buildings.find(b => b.id === id)!
        for (const entry of buildingApproaches(map, building)) {
          const pathMap = { ...map, tiles: map.tiles.map(t => t === "path" || t === "track" || t === "bridge" ? t : "forest" as const) }
          expect(settlementRoute(pathMap, pathMap.buildings, road, entry), "every entrance has a continuous path").not.toBeNull()
        }
        const chapel = map.buildings.find(b => b.id === map.site!.hovelId)!
        expect(Math.hypot(
          Math.max(chapel.x - building.x - building.w, building.x - chapel.x - chapel.w, 0),
          Math.max(chapel.z - building.z - building.d, building.z - chapel.z - chapel.d, 0),
        )).toBeGreaterThanOrEqual(TOWN_CHAPEL_CLEARANCE)
        for (const p of map.site!.branch) expect(Math.hypot(building.x - p.x, building.z - p.z)).toBeGreaterThanOrEqual(TOWN_APPROACH_CLEARANCE)
        for (let z = building.z; z < building.z + building.d; z++) for (let x = building.x; x < building.x + building.w; x++) {
          expect(tileAt(map, x, z)).toBe("grass")
          expect(map.water!.depth[z * map.width + x]).toBe(0)
        }
      }
    }
  }, 20000)
})
