import { describe, expect, it } from "vitest"
import { BUILD_CATALOG } from "./balance"
import { buildingApproaches, rotatedFootprint } from "./building-rotation"
import { findGatheringPlace, gatheringHeading, gatheringSitting, gatheringPlaceOpen } from "./party-gathering"
import { createSim } from "./sim"
import { generateTravelers } from "./travelers"
import { turningMap } from "./transport/turning-demo"
import { roadLanePoint } from "./map/road-lane"
import { tileToWorldX, tileToWorldZ, worldToTileX, worldToTileZ, type BuildingDef, type GameMap } from "./map/types"

function fixture(rotation: 0 | 1 | 2 | 3 = 0) {
  const def = BUILD_CATALOG.find(b => b.id === "tavern")!
  const tavern: BuildingDef = { ...def, id: "tavern", label: "Oak tavern", buildType: "tavern", x: 22, z: 14,
    ...rotatedFootprint(def, rotation), rotation }
  const map: GameMap = { width: 64, depth: 40, seed: 42, tiles: Array(2560).fill("grass"), buildings: [tavern],
    road: Array.from({ length: 64 }, (_, x) => ({ x, z: 5 })) }
  for (const p of map.road!) map.tiles[p.z * map.width + p.x] = "path"
  const world = (x: number, z: number) => ({ x: tileToWorldX(map, x), z: tileToWorldZ(map, z) })
  return { map, tavern, world, origin: world(24, 5), fallback: world(24, 7) }
}

describe("company meeting places", () => {
  it("keeps waiting bodies beyond both edges of a wide road, including grassy road tiles", () => {
    const { map, origin, fallback, world } = fixture()
    map.buildings = []; map.mainRoadWidth = 2
    const place = findGatheringPlace(map, origin, fallback, 20, () => false)!
    expect(place.spots).toHaveLength(20)
    for (const spot of place.spots) expect(Math.abs(spot.z - world(0, 5).z)).toBeGreaterThanOrEqual(1.4)
  })

  it("keeps a company clear of the rendered road around a bend", () => {
    const map = turningMap("s_bend")
    map.mainRoadWidth = 2
    const origin = { x: tileToWorldX(map, map.road![12].x), z: tileToWorldZ(map, map.road![12].z) }
    const place = findGatheringPlace(map, origin, origin, 12, () => false)!
    expect(place.spots).toHaveLength(12)
    for (const spot of place.spots) for (let progress = 0; progress < map.road!.length - 1; progress += .1) {
      const centre = roadLanePoint(map, map.road!, progress, 0)
      if (centre) expect(Math.hypot(spot.x - tileToWorldX(map, centre.x), spot.z - tileToWorldZ(map, centre.z))).toBeGreaterThan(1.35)
    }
  })

  it("searches the other side when the first gathering patch is crowded", () => {
    const { map, origin, world } = fixture()
    map.buildings = []; map.mainRoadWidth = 2
    const place = findGatheringPlace(map, origin, world(24, 10), 20, p => p.z >= world(0, 4).z)!
    expect(place.spots).toHaveLength(20)
    expect(place.spots.every(p => p.z < world(0, 4).z)).toBe(true)
  })

  it.each([0, 1, 2, 3] as const)("gathers twenty outside a tavern with its doors and benches clear (rotation %s)", rotation => {
    const { map, tavern, origin, fallback } = fixture(rotation)
    const place = findGatheringPlace(map, origin, fallback, 20, () => false)!
    expect(place.label).toBe(tavern.label)
    expect(place.spots).toHaveLength(20)
    const approaches = buildingApproaches(map, tavern)
    for (const spot of place.spots) {
      const x = worldToTileX(map, spot.x), z = worldToTileZ(map, spot.z)
      expect(z).toBeGreaterThan(9)
      expect(x < tavern.x || x >= tavern.x + tavern.w || z < tavern.z || z >= tavern.z + tavern.d).toBe(true)
      expect(approaches.some(p => p.x === x && p.z === z)).toBe(false)
      for (const other of place.spots) if (other !== spot) expect(Math.hypot(spot.x - other.x, spot.z - other.z)).toBeGreaterThanOrEqual(.95)
    }
    expect(findGatheringPlace(map, origin, fallback, 20, () => false)).toEqual(place)
  })

  it("invalidates a meeting place when a building takes its ground", () => {
    const { map, origin, fallback } = fixture()
    const place = findGatheringPlace(map, origin, fallback, 8, () => false)!
    expect(gatheringPlaceOpen(map, place)).toBe(true)
    const spot = place.spots[0]
    map.buildings = [...map.buildings, { ...BUILD_CATALOG.find(b => b.id === "house")!, id: "new-house", buildType: "house",
      x: worldToTileX(map, spot.x), z: worldToTileZ(map, spot.z) }]
    expect(gatheringPlaceOpen(map, place)).toBe(false)
  })

  it("uses a public waypoint when the tavern is occupied", () => {
    const { map, origin, fallback, world } = fixture()
    map.buildings.push({ ...BUILD_CATALOG.find(b => b.id === "well")!, id: "well", buildType: "well", x: 15, z: 7, label: "Town well" })
    const place = findGatheringPlace(map, origin, fallback, 8, point => point.z > world(0, 10).z)!
    expect(place.label).toBe("Town well")
    expect(place.spots).toHaveLength(8)
  })

  it("falls back to reachable open ground when a nearby tavern is cut off by water", () => {
    const { map, origin, fallback } = fixture()
    for (let x = 0; x < map.width; x++) map.tiles[11 * map.width + x] = "water"
    const place = findGatheringPlace(map, origin, fallback, 8, () => false)!
    expect(place.label).toBe("Open ground")
    expect(place.spots).toHaveLength(8)
    expect(place.spots.every(p => worldToTileZ(map, p.z) < 11)).toBe(true)
  })

  it("does not send a party to an unfinished building or promise occupied ground", () => {
    const { map, tavern, origin, fallback } = fixture()
    tavern.construction = { work: 0, required: 100 }
    expect(findGatheringPlace(map, origin, fallback, 8, () => false)?.label).toBe("Open ground")
    expect(findGatheringPlace(map, origin, fallback, 8, () => true)).toBeUndefined()
  })
})

describe("quiet company", () => {
  function waiting() {
    const { map } = fixture()
    const sim = createSim(generateTravelers(42, 6), map)
    const members = [...sim.travelers.values()]
    for (const [i, s] of members.entries()) Object.assign(s, { activity: "walking", partyWaiting: true,
      x: i, z: 0, partyGathering: { spot: { x: i, y: 0, z: 0 }, arrived: true, waited: 5 } })
    return members
  }

  it("faces a companion and sits gradually, keeping some people standing", () => {
    const members = waiting(), a = members[1], entrance = { x: 0, z: 10 }
    expect(gatheringHeading(a, members, entrance)).toBeCloseTo(-Math.PI / 2)
    expect(members.some(gatheringSitting)).toBe(false)
    for (const s of members) s.partyGathering!.waited = 18
    const first = members.filter(gatheringSitting).length
    expect(first).toBeGreaterThan(0)
    for (const s of members) s.partyGathering!.waited = 30
    expect(members.filter(gatheringSitting).length).toBeGreaterThan(first)
    expect(members.every(gatheringSitting)).toBe(false)
    a.partyGathering!.heading = .7
    expect(gatheringHeading(a, members, entrance)).toBe(.7)
  })

  it("stands for departure and never sits while walking to a place or doing an errand", () => {
    const [s] = waiting().filter(s => s.id % 3 !== 0)
    s.partyGathering!.waited = 30
    expect(gatheringSitting(s)).toBe(true)
    s.partyGathering!.arrived = false
    expect(gatheringSitting(s)).toBe(false)
    s.partyGathering!.arrived = true; s.activity = "toRelic"
    expect(gatheringSitting(s)).toBe(false)
    s.activity = "walking"; s.partyGathering!.back = { point: { x: 0, y: 0, z: 0 }, progress: 0 }
    expect(gatheringSitting(s)).toBe(false)
    expect(gatheringHeading(s, [s], { x: 0, z: 0 })).toBeUndefined()
  })
})
