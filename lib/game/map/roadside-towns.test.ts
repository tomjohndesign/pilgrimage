import { ROUTE_EDGE_INSET } from "./route-bounds"
import { tavernWalkingRoute } from "../tavern-navigation"
import { tileToWorldX, tileToWorldZ } from "./types"
import { describe, expect, it } from "vitest"
import { addRoadsideTowns, TOWN_SPACING, TOWN_CHAPEL_CLEARANCE, TOWN_APPROACH_CLEARANCE, TOWN_ROAD_SETBACK } from "./roadside-towns"
import { generateMap } from "./generate-map"
import { type GameMap, tileAt } from "./types"
import { tavernVisitPlan, servingHouses } from "../tavern"
import { buildingApproaches, buildingEntry } from "../building-rotation"
import { settlementRoute } from "../settlement-route"
import { jobBuildings, settlementRenown } from "../settlement"
import { enclaveHousing } from "../housing"
import { buildInfluence } from "../build-influence"

function roadMap(): GameMap {
  const width = 400, depth = 34
  const map: GameMap = { width, depth, tiles: Array(width * depth).fill("grass"), buildings: [],
    road: Array.from({ length: width }, (_, x) => ({ x, z: 17 })) }
  for (const p of map.road!) map.tiles[p.z * width + p.x] = "path"
  return map
}

describe("independent roadside towns", () => {
  it("spaces complete communities by a 192-tile radius", () => {
    const map = roadMap()
    addRoadsideTowns(map)
    expect(map.towns).toHaveLength(2)
    for (const [i, town] of map.towns!.entries()) {
      const buildings = map.buildings.filter(b => b.townId === town.id)
      expect(buildings.map(b => b.buildType)).toEqual(["tavern", "house", "well"])
      expect(buildings.every(b => b.owner === "independent" && !b.construction)).toBe(true)
      const entry = buildingEntry(buildings[0]), junction = map.road![town.junction]
      expect(Math.hypot(entry.x - junction.x, entry.z - junction.z)).toBe(TOWN_ROAD_SETBACK)
      if (i) {
        expect(town.junction - map.towns![i - 1].junction).toBe(TOWN_SPACING)
        expect(TOWN_SPACING).toBe(192)
      }
    }
    expect(map.road!.every(p => tileAt(map, p.x, p.z) === "path")).toBe(true)
    for (let i = 0; i < map.tiles.length; i++) if (map.tiles[i] === "track") {
      const x = i % map.width, z = Math.floor(i / map.width)
      expect(Math.min(x, z, map.width - 1 - x, map.depth - 1 - z)).toBeGreaterThanOrEqual(ROUTE_EDGE_INSET)
    }
    expect(servingHouses(map, () => false)).toHaveLength(0)
  })

  it("keeps looping roads outside every earlier tavern's radius", () => {
    const width = 440, depth = 80
    // Three parallel passes: the third comes back close to the first town,
    // despite being far from the most recently placed town along the road.
    const road = [
      ...Array.from({ length: 421 }, (_, x) => ({ x: x + 10, z: 20 })),
      ...Array.from({ length: 20 }, (_, z) => ({ x: 430, z: z + 21 })),
      ...Array.from({ length: 421 }, (_, x) => ({ x: 429 - x, z: 40 })),
      ...Array.from({ length: 20 }, (_, z) => ({ x: 9, z: z + 41 })),
      ...Array.from({ length: 421 }, (_, x) => ({ x: x + 10, z: 60 })),
    ]
    const map: GameMap = { width, depth, tiles: Array(width * depth).fill("grass"), buildings: [], road }
    for (const p of road) map.tiles[p.z * width + p.x] = "path"
    addRoadsideTowns(map)
    expect(map.towns).toHaveLength(2)
    const entrances = map.towns!.map(t => buildingEntry(map.buildings.find(b => b.id === t.tavernId)!))
    for (let i = 0; i < entrances.length; i++) for (let j = 0; j < i; j++) {
      expect(Math.hypot(entrances[i].x - entrances[j].x, entrances[i].z - entrances[j].z)).toBeGreaterThanOrEqual(192)
    }
  })

  it("continues beyond an unsuitable site without shrinking the radius", () => {
    const map = roadMap()
    // The nominal second site at x=288 is flooded; the next dry town must
    // remain outside the first tavern's circle while finding accessible land.
    for (let z = 0; z < map.depth; z++) for (let x = 280; x < 310; x++) {
      if (z !== 17) map.tiles[z * map.width + x] = "water"
    }
    addRoadsideTowns(map)
    expect(map.towns).toHaveLength(2)
    expect(map.road![map.towns![1].junction].x).toBeGreaterThanOrEqual(310)
    const [a, b] = map.towns!.map(t => buildingEntry(map.buildings.find(b => b.id === t.tavernId)!))
    expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeGreaterThanOrEqual(192)
  })

  it("contributes no jobs, housing, renown or building influence", () => {
    const map = roadMap()
    map.site = { junction: 200, branch: [{ x: 200, z: 17 }], door: { x: 200, z: 17 }, hovelId: "absent" }
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
    const entrances = map.towns!.map(t => buildingEntry(map.buildings.find(b => b.id === t.tavernId)!))
    for (let i = 0; i < entrances.length; i++) for (let j = 0; j < i; j++) {
      expect(Math.hypot(entrances[i].x - entrances[j].x, entrances[i].z - entrances[j].z)).toBeGreaterThanOrEqual(192)
    }
    for (const town of map.towns!) {
      const road = map.road![town.junction]
      const tavern = map.buildings.find(b => b.id === town.tavernId)!
      const visit = tavernVisitPlan(map, tavern, road)
      expect(visit, `${town.name} has a reachable counter and seat`).not.toBeNull()
      expect(tavernWalkingRoute(map, visit!.seat!.point, { x: tileToWorldX(map, road.x), z: tileToWorldZ(map, road.z), y: .2 })).toBeTruthy()
      for (const id of town.buildingIds) {
        const building = map.buildings.find(b => b.id === id)!
        if (building.buildType === "tavern" || building.buildType === "house") {
          for (const p of map.road!) {
            const dx = Math.max(building.x - p.x, p.x - (building.x + building.w - 1), 0)
            const dz = Math.max(building.z - p.z, p.z - (building.z + building.d - 1), 0)
            expect(Math.max(dx, dz), "road bends also leave a clear verge").toBeGreaterThan(TOWN_ROAD_SETBACK)
          }
        }
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
