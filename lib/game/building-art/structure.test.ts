import { describe, expect, it } from "vitest"
import { Box3, BoxGeometry, BufferGeometry, Euler, Float32BufferAttribute, Matrix4, Quaternion, Vector3 } from "three"
import { BUILD_CATALOG } from "../balance"
import { PROTOTYPE_BUILDINGS } from "../map/prototype-map"
import { structureParts } from "./structure"
import type { BuildingPart } from "./geometry"

function bounds(part: BuildingPart) {
  const geometry = part.size ? new BoxGeometry(...part.size)
    : new BufferGeometry().setAttribute("position", new Float32BufferAttribute(part.vertices!, 3))
  geometry.applyMatrix4(new Matrix4().compose(new Vector3(...part.position),
    new Quaternion().setFromEuler(new Euler(...part.rotation ?? [0, 0, 0])), new Vector3(1, 1, 1)))
  geometry.computeBoundingBox()
  const result = geometry.boundingBox!.clone()
  geometry.dispose()
  return result
}

const catalogue = BUILD_CATALOG.map(def => ({ ...def, buildType: def.id }))
const partsFor = (id: string) => structureParts(catalogue.find(def => def.id === id)!)

describe("settlement construction", () => {
  it.each([...catalogue, ...PROTOTYPE_BUILDINGS])("$label has complete, deterministic geometry within its occupied tiles", (building) => {
    const parts = structureParts(building)
    expect(parts.length).toBeGreaterThan(5)
    expect(new Set(parts.map(part => part.name)).size).toBe(parts.length)
    expect(parts.some(part => part.name === "body" || part.name === "cap")).toBe(false)
    expect(structureParts(building)).toEqual(parts)
    const whole = new Box3()
    for (const part of parts) {
      const box = bounds(part)
      expect(box.min.x, part.name).toBeGreaterThanOrEqual(-building.w / 2 - .001)
      expect(box.max.x, part.name).toBeLessThanOrEqual(building.w / 2 + .001)
      expect(box.min.z, part.name).toBeGreaterThanOrEqual(-building.d / 2 - .001)
      expect(box.max.z, part.name).toBeLessThanOrEqual(building.d / 2 + .001)
      const groundSurface = part.name === "floor" && building.buildType !== "storehouse"
        || part.name.startsWith("paving-") || part.name.startsWith("garden-path-") || part.name === "hall-threshold"
      expect(box.min.y, part.name).toBeGreaterThanOrEqual(groundSurface ? -.06 : -.001)
      if (groundSurface) {
        expect(box.min.y, part.name).toBeLessThan(0)
        expect(box.max.y, part.name).toBeGreaterThan(0)
        expect(box.max.y, part.name).toBeLessThanOrEqual(.003)
      }
      expect(Number.isFinite(box.max.y), part.name).toBe(true)
      whole.union(box)
    }
    expect(whole.max.y).toBeGreaterThan(.1)
  })

  it("keeps hospitality, working and religious buildings visually distinct", () => {
    const shelter = partsFor("shelter"), workshop = partsFor("workshop"), hall = partsFor("hall")
    expect(shelter.some(part => part.name.startsWith("straw-bed-"))).toBe(true)
    expect(shelter.some(part => part.name.startsWith("front-"))).toBe(false)
    expect(workshop.some(part => part.name === "workbench-seat")).toBe(true)
    expect(workshop.some(part => part.name === "axe-head")).toBe(true)
    expect(hall.some(part => part.name === "doorway-shadow")).toBe(true)
    for (const parts of [shelter, workshop, hall]) expect(parts.some(part => part.name.startsWith("thatch-bundle-"))).toBe(true)
    expect(hall.filter(part => part.name.startsWith("shelter-cross-upright-"))).toHaveLength(2)
    for (const parts of [shelter, workshop]) expect(parts.some(part => part.name.includes("cross-"))).toBe(false)
  })

  it("keeps scenery roofless and the lumber yard clear for live timber stacks", () => {
    expect(partsFor("garden").some(part => part.name.startsWith("herb-"))).toBe(true)
    expect(partsFor("cross").some(part => part.name === "cross-footing")).toBe(true)
    for (const id of ["garden", "cross", "lumberCamp"]) expect(partsFor(id).some(part => part.layer === "roof")).toBe(false)
    const yard = partsFor("lumberCamp")
    expect(yard.some(part => part.name.startsWith("firewood-"))).toBe(false)
    // Beyond the ground surface, the existing storage area and front entrance stay open.
    const storage = new Box3(new Vector3(-.8, .12, -.7), new Vector3(.8, 1.5, 1))
    expect(yard.some(part => bounds(part).intersectsBox(storage))).toBe(false)
  })

  it("gives untyped legacy map buildings the shared hut construction", () => {
    const legacy = structureParts({ w: 2, d: 2, height: 2.6, color: "red", roofColor: "blue" })
    expect(legacy.some(part => part.name === "doorway-shadow")).toBe(true)
    expect(legacy.some(part => part.name.startsWith("thatch-bundle-"))).toBe(true)
  })
})
