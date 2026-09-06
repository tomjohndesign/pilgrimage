import { afterEach, describe, expect, it } from "vitest"
import { Vector3 } from "three"
import { buildingYaw, lumberCampEntry, rotateBuildingPoint, type BuildingRotation } from "./building-rotation"
import { useBuildStore } from "./build-store"
import { placementProblem } from "./buildings"
import type { GameMap } from "./map/types"

afterEach(() => useBuildStore.getState().reset())

describe("building rotation", () => {
  it("wraps in either direction and resets when changing tools or worlds", () => {
    const store = useBuildStore.getState()
    store.rotateBuilding(1)
    expect(useBuildStore.getState().rotation).toBe(0)
    store.setTool("shelter")
    store.rotateBuilding(-1)
    expect(useBuildStore.getState().rotation).toBe(3)
    store.rotateBuilding(1)
    expect(useBuildStore.getState().rotation).toBe(0)
    store.rotateBuilding(1)
    store.setTool("shelter")
    expect(useBuildStore.getState().rotation).toBe(1)
    store.setTool("workshop")
    expect(useBuildStore.getState().rotation).toBe(0)
    store.rotateBuilding(1)
    store.reset()
    expect(useBuildStore.getState().rotation).toBe(0)
  })

  it.each([0, 1, 2, 3] as BuildingRotation[])("keeps rendered and navigable entrances aligned at rotation %i", rotation => {
    const point = rotateBuildingPoint(-0.5, 1.5, rotation)
    const rendered = new Vector3(-0.5, 0, 1.5).applyAxisAngle(new Vector3(0, 1, 0), buildingYaw(rotation))
    expect(rendered.x).toBeCloseTo(point.x)
    expect(rendered.z).toBeCloseTo(point.z)
    const camp = { x: 5, z: 5, w: 2, d: 2, rotation }
    const outside = lumberCampEntry(camp), inside = lumberCampEntry(camp, true)
    expect(Math.abs(outside.x - inside.x) + Math.abs(outside.z - inside.z)).toBe(1)
    expect(inside.x).toBeGreaterThanOrEqual(5)
    expect(inside.x).toBeLessThan(7)
    expect(inside.z).toBeGreaterThanOrEqual(5)
    expect(inside.z).toBeLessThan(7)
    const map: GameMap = {
      width: 12, depth: 12, tiles: Array(144).fill("grass"), buildings: [],
      site: { hovelId: "hovel", junction: 0, branch: [], door: { x: 2, z: 2 } },
    }
    map.tiles[5 * map.width + 9] = "forest"
    expect(placementProblem(map, [], "lumberCamp", 5, 5, rotation)).toBeNull()
    map.tiles[outside.z * map.width + outside.x] = "water"
    expect(placementProblem(map, [], "lumberCamp", 5, 5, rotation)).toBe("access")
  })
})
