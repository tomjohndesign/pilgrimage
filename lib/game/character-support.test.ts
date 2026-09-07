import { describe, expect, it } from "vitest"
import { buildingSupports, characterSupport, partSupports, placedSupport } from "./character-support"
import { assignBuildingTask, stepBuildingTask, type Worker } from "./construction"
import { rotatedFootprint, type BuildingRotation } from "./building-rotation"
import { shrineSeats } from "./shrine-layout"
import { tileToWorldX, tileToWorldZ, type GameMap } from "./map/types"

function fixture(type = "monk-shelter"): GameMap {
  return { width: 16, depth: 16, tiles: Array(256).fill("grass"), buildings: [
    { id: "bedroom", buildType: type, x: 5, z: 5, w: 3, d: 2, height: .8, label: "Shelter", color: "", roofColor: "" },
  ] }
}

describe("authored character supports", () => {
  it("derives the contact height and anchor from a rotated furniture top", () => {
    const [support] = partSupports([{ name: "new-furniture", layer: "interior", color: "", position: [2, .3, 4],
      size: [.8, .1, .4], rotation: [0, Math.PI / 2, 0], support: { clips: ["sitting"], anchorOffset: [0, .1] } }])
    expect(support.height).toBeCloseTo(.35)
    expect(support.anchor.x).toBeCloseTo(2.1)
    expect(support.anchor.z).toBeCloseTo(4)
  })

  for (const type of ["monk-shelter", "shelter"]) {
    it.each([0, 1, 2, 3] as BuildingRotation[])(`${type} routes every rest slot onto its rendered bed at rotation %s`, rotation => {
      const map = fixture(type), building = map.buildings[0]
      Object.assign(building, { rotation, ...rotatedFootprint({ w: 3, d: 2 }, rotation) })
      // A pilgrim shelter also has a sittable bench; only bedding takes rest slots.
      const beds = buildingSupports(building).filter(support => support.clips.includes("sleeping"))
      expect(beds).toHaveLength(type === "shelter" ? 2 : 4)
      for (let slot = 0; slot < beds.length * 2; slot++) {
        const actor: Worker = { x: 0, y: 0, z: 2, workSlot: slot }
        expect(assignBuildingTask(actor, map, "rest")).toBe(true)
        for (let tick = 0; actor.buildingTask!.route.length && tick < 500; tick++) stepBuildingTask(actor, map, 2, .1)
        expect(stepBuildingTask(actor, map, 2, .1)).toBe("sleeping")
        const bed = placedSupport(map, building, beds[slot % beds.length])
        expect(actor.x).toBeCloseTo(bed.anchor.x)
        expect(actor.z).toBeCloseTo(bed.anchor.z)
        expect(actor.buildingTask!.heading).toBeCloseTo(bed.heading)
        expect(characterSupport(map, actor.x, actor.z, "sleeping")).toEqual(bed)
        expect(characterSupport(map, actor.x, actor.z, "walk")).toBeUndefined()
      }
    })
  }

  it("releases contact outside the furniture and throughout construction", () => {
    const map = fixture(), building = map.buildings[0]
    const bed = placedSupport(map, building, buildingSupports(building)[0])
    expect(characterSupport(map, bed.x + bed.width, bed.z, "sleeping")).toBeUndefined()
    building.construction = { work: 0, required: 10 }
    expect(characterSupport(map, bed.x, bed.z, "sleeping")).toBeUndefined()
    building.construction.work = 10
    expect(characterSupport(map, bed.x, bed.z, "sleeping")?.height).toBeCloseTo(bed.height)
    map.buildings = []
    expect(characterSupport(map, bed.x, bed.z, "sleeping")).toBeUndefined()
  })

  it("refreshes supports when the same building is resized or its recipe changes", () => {
    const map = fixture(), building = map.buildings[0]
    expect(buildingSupports(building)).toHaveLength(4)
    building.w = 2
    expect(buildingSupports(building)).toHaveLength(3)
    building.buildType = "shelter"
    expect(buildingSupports(building)).toHaveLength(3)
  })

  it.each([{ x: 6, z: 8 }, { x: 4, z: 6 }, { x: 8, z: 6 }, { x: 6, z: 4 }])("supports prayer using shrine geometry with door %j", door => {
    const map = fixture(), building = map.buildings[0]
    building.w = building.d = 3
    map.site = { hovelId: building.id, door, branch: [], junction: 0 }
    for (const seat of shrineSeats(building, door)) {
      const support = characterSupport(map, tileToWorldX(map, seat.tile.x), tileToWorldZ(map, seat.tile.z), "praying")
      expect(support?.id).toBe(`${seat.id}-pad`)
      expect(support!.height).toBeGreaterThan(0)
      expect(characterSupport(map, tileToWorldX(map, seat.tile.x), tileToWorldZ(map, seat.tile.z), "sleeping")).toBeUndefined()
    }
  })
})
