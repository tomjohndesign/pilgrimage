import { describe, expect, it } from "vitest"
import { WATER_SOURCE_DEFINITIONS, WATER_SOURCE_KINDS, waterSourceAccessPoints } from "./assets"
import { waterSourceModel } from "./model"
import { Box3, Vector3 } from "three"

describe("water-source access", () => {
  it.each(WATER_SOURCE_KINDS)("keeps %s standing contacts outside its authored footprint", kind => {
    const definition = WATER_SOURCE_DEFINITIONS[kind]
    const model = waterSourceModel(kind)
    try {
      const size = new Box3().setFromObject(model.root).getSize(new Vector3())
      expect(size.x).toBeLessThanOrEqual(definition.footprint[0])
      expect(size.z).toBeLessThanOrEqual(definition.footprint[1])
      for (const point of definition.access) {
        expect(Math.abs(point.stand[2])).toBeGreaterThan(definition.footprint[1] / 2)
        expect(Math.abs(point.water[2])).toBeLessThan(definition.footprint[1] / 2)
      }
    } finally { model.dispose() }
  })

  it("rotates and translates access with the rendered eighth-turn direction", () => {
    const [point] = waterSourceAccessPoints({ kind: "well", x: 5, y: 2, z: -3, yaw: Math.PI / 2 + .01 })
    expect(point.action).toBe("draw-water")
    expect(point.stand.x).toBeCloseTo(5.83)
    expect(point.stand.y).toBe(2)
    expect(point.stand.z).toBeCloseTo(-3)
    expect(point.water.x).toBeCloseTo(5.25)
    expect(point.water.y).toBeCloseTo(2.46)
  })
})
