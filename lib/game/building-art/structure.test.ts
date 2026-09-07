import { shrineStructureParts } from "./shrine-geometry"
import { describe, expect, it } from "vitest"
import { Box3, BoxGeometry, BufferGeometry, Euler, Float32BufferAttribute, Matrix4, Quaternion, Vector3 } from "three"
import { BUILD_CATALOG } from "../balance"
import { PROTOTYPE_BUILDINGS } from "../map/prototype-map"
import { structureParts, visibleStructureParts } from "./structure"
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
    for (const parts of [shelter, hall]) expect(parts.some(part => part.name.startsWith("thatch-bundle-"))).toBe(true)
    expect(hall.filter(part => part.name.startsWith("shelter-cross-upright-"))).toHaveLength(2)
    for (const parts of [shelter, workshop]) expect(parts.some(part => part.name.includes("cross-"))).toBe(false)
  })

  it("keeps scenery roofless and provides a covered store with room for live stocks", () => {
    for (const id of ["garden", "cross"]) expect(partsFor(id).some(part => part.layer === "roof")).toBe(false)
    const store = partsFor("storehouse")
    expect(store.some(p => p.layer === "roof")).toBe(true)
    expect(store.some(p => /^(rear-|side-|front-|door-|woven-gable)/.test(p.name))).toBe(false)
    expect(store.some(p => p.name === "entry-ramp")).toBe(true)
    expect(store.some(p => p.name === "grain-sack" || p.name.startsWith("firewood-"))).toBe(false)
  })

  it("reveals furnished interiors when selected and restores the complete shell on deselection", () => {
    for (const def of catalogue.filter(b => b.category === "buildings")) {
      const parts = structureParts(def), inside = visibleStructureParts(parts, true)
      expect(inside.some(p => p.layer === "roof")).toBe(false)
      if (parts.some(p => p.layer === "wall")) expect(inside.some(p => p.layer === "wall")).toBe(true)
      expect(inside.some(p => p.name === "floor")).toBe(true)
      expect(visibleStructureParts(parts, false)).toBe(parts)
    }
    const workshop = visibleStructureParts(partsFor("workshop"), true)
    expect(workshop.some(p => p.name === "workbench-seat")).toBe(true)
    expect(workshop.some(p => p.name === "axe-head")).toBe(true)
  })

  it("covers the 3×5 shrine with one entrance, benches and an altar towards the rear", () => {
    const parts = shrineStructureParts(3, 5)
    expect(new Set(parts.map(p => p.name)).size).toBe(parts.length)
    expect(parts.some(p => p.layer === "roof")).toBe(true)
    expect(parts.filter(p => p.name === "entrance-arch-0")).toHaveLength(1)
    expect(bounds(parts.find(p => p.name === "relic-table")!).getCenter(new Vector3()).z).toBeCloseTo(-1.4)
    expect(parts.filter(p => p.name.startsWith("kneeler-") && p.name.endsWith("-pad"))).toHaveLength(4)
    const inside = visibleStructureParts(parts, true)
    expect(inside.some(p => p.name === "relic-table")).toBe(true)
    expect(inside.some(p => p.layer === "roof")).toBe(false)
  })

  it("gives untyped legacy map buildings the shared hut construction", () => {
    const legacy = structureParts({ w: 2, d: 2, height: 2.6, color: "red", roofColor: "blue" })
    expect(legacy.some(part => part.name === "doorway-shadow")).toBe(true)
    expect(legacy.some(part => part.name.startsWith("thatch-bundle-"))).toBe(true)
  })
})

it("keeps shrine furniture and both roof levels inside the 3×5 footprint", () => {
  const parts = shrineStructureParts(3, 5)
  for (const part of parts) {
    const b = bounds(part)
    expect(b.min.x, part.name).toBeGreaterThanOrEqual(-1.501)
    expect(b.max.x, part.name).toBeLessThanOrEqual(1.501)
    expect(b.min.z, part.name).toBeGreaterThanOrEqual(-2.501)
    expect(b.max.z, part.name).toBeLessThanOrEqual(2.501)
  }
  const aisle = new Box3(new Vector3(-.3,.1,-.5),new Vector3(.3,.7,2.5))
  expect(parts.filter(p => p.layer === "interior").some(p => bounds(p).intersectsBox(aisle))).toBe(false)
  expect(parts.some(p => p.name === "roof-cross-upright")).toBe(true)
  expect(parts.some(p => p.name.startsWith("raised-nave-thatch-bundle-"))).toBe(true)
})


it("builds solid shrine walls around open arched windows and a single doorway", () => {
  const parts = shrineStructureParts(3, 5), walls = parts.filter(p => p.layer === "wall").map(bounds)
  const doorway = new Box3(new Vector3(-.24,.05,2.29),new Vector3(.24,.8,2.46))
  expect(walls.some(b => b.intersectsBox(doorway))).toBe(false)
  for (const side of [-1,1]) for (const z of [-1.5,0,1.5]) {
    const window = new Box3(new Vector3(side*1.37-.08,.44,z-.12),new Vector3(side*1.37+.08,.69,z+.12))
    expect(walls.some(b => b.intersectsBox(window))).toBe(false)
  }
  expect(parts.filter(p => /^side-wall-.*-arch-\d+$/.test(p.name))).toHaveLength(6)
  expect(parts.filter(p => /^upper-timber-.*-arch-\d+$/.test(p.name))).toHaveLength(6)
  expect(parts.some(p => p.name.startsWith("upper-timber-") && p.size && p.color === "#756044")).toBe(true)
})


it("shows only far walls in every camera quadrant, including a rotated shrine", () => {
  const walls: BuildingPart[] = [[1,0],[-1,0],[0,1],[0,-1]].map(([x,z])=>({name:`wall-${x}-${z}`,layer:"wall",position:[x,0,z],size:[.1,1,.1],color:"tan",cutawaySide:[x,z]}))
  for(const x of [-1,1]) for(const z of [-1,1]) {
    const visible=visibleStructureParts(walls,true,[x,z])
    expect(visible).toHaveLength(2)
    expect(visible.every(p=>p.cutawaySide![0]*x+p.cutawaySide![1]*z<0)).toBe(true)
    const shrine=visibleStructureParts(shrineStructureParts(3,5),true,[x,z])
    expect(shrine.some(p=>p.layer === "roof")).toBe(false)
    expect(shrine.some(p=>p.name.startsWith(`side-wall-${-x}-`))).toBe(true)
    expect(shrine.some(p=>p.name.startsWith(`side-wall-${x}-`))).toBe(false)
  }
})
