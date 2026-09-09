import { shrineStructureParts } from "./shrine-geometry"
import { describe, expect, it } from "vitest"
import { Box3, BoxGeometry, BufferGeometry, Euler, Float32BufferAttribute, Matrix4, Quaternion, Vector3 } from "three"
import { BUILD_CATALOG } from "../balance"
import { PROTOTYPE_BUILDINGS } from "../map/prototype-map"
import { structureParts, visibleStructureParts } from "./structure"
import type { BuildingPart } from "./geometry"
import { workshopLayout, workshopPileOffset } from "../workshop-layout"
import { roofProfile, singlePlaneRoofRise, hasFrontAwning } from "./dimensions"
import { WOOD_LOG, woodLogScale } from "../wood-log"

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
  it.each([...catalogue, ...PROTOTYPE_BUILDINGS])("$label has complete, deterministic geometry within its occupied tiles and reserved bench frontage", (building) => {
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
      expect(box.min.z, part.name).toBeGreaterThanOrEqual(-building.d / 2 - .001 - (part.name.startsWith("tavern-outside-") ? .6 : 0))
      expect(box.max.z, part.name).toBeLessThanOrEqual(building.d / 2 + .001 + (part.name.startsWith("tavern-outside-") ? .6 : 0))
      const groundSurface = part.name === "cart-yard" || part.name === "floor" && building.buildType !== "storehouse"
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

  it("keeps a gentle pitch across houses and toward the rear of open awnings", () => {
    // The market stall carries a level cloth canopy and the timber yard is open to the sky.
    for (const def of catalogue.filter(b => b.category === "buildings" && b.id !== "inn" && b.id !== "market" && b.id !== "lumberCamp")) {
      for (const [w, d] of [[2, 2], [3, 2], [3, 4]]) {
        const parts = structureParts({ ...def, w, d })
        expect(parts.some(p => /ridge-pole|rafter-left|rafter-right|woven-gable/.test(p.name))).toBe(false)
        const bundles = parts.filter(p => p.name.startsWith("thatch-bundle-"))
        expect(bundles.length).toBeGreaterThan(0)
        for (const part of bundles) {
          const [ax, ay, az, bx, by, bz, cx, cy, cz] = part.vertices!
          const profile=roofProfile(d,singlePlaneRoofRise(d),hasFrontAwning(def.id))
          expect(ay-profile.height(az),part.name).toBeCloseTo(by-profile.height(bz))
          expect(ay-profile.height(az),part.name).toBeCloseTo(cy-profile.height(cz))
          expect(by,part.name).toBeLessThan(ay)

        }
      }
    }
  })

  it("shelters the hut's bench and two timber bays without beds, leaving the work yard open", () => {
    const hut = catalogue.find(b => b.id === "workshop")!
    expect([hut.w, hut.d]).toEqual([3, 2])
    const parts = partsFor("workshop")
    expect(parts.find(p => p.name === "floor")?.surface).toBe("trail")
    expect(parts.some(p => /bed|blanket|wool-cover/.test(p.name))).toBe(false)
    expect(parts.some(p => p.name.startsWith("roof-plank-"))).toBe(false)
    const roof = parts.filter(p => p.name.startsWith("thatch-bundle-")).map(bounds)
    const covered = (x: number, z: number) => roof.some(b => x >= b.min.x && x <= b.max.x && z >= b.min.z && z <= b.max.z)
    for (const part of parts.filter(p => p.name === "workbench-seat")) {
      expect(covered(part.position[0], part.position[2]), part.name).toBe(true)
    }
    expect(covered(-.4, .5)).toBe(false)
    expect(covered(-hut.w/2+.2, .5)).toBe(false)
    expect(parts.some(p => /-(side)$/.test(p.name) && p.layer === "roof")).toBe(false)
    const layout = workshopLayout(hut.w, hut.d)
    expect(layout.bayWidth * layout.bayDepth * 2).toBe(2)
    const scale = woodLogScale(), radius = WOOD_LOG.radius * scale
    const occupied: Box3[] = []
    for (let slot=0;slot<4;slot++) {
      const [x,z] = workshopPileOffset(slot,hut.w,hut.d)
      const stack = new Box3(new Vector3(x-1.5*radius*2.05-radius,0,z-WOOD_LOG.length*scale/2),
        new Vector3(x+2*radius*2.05+radius,.8,z+WOOD_LOG.length*scale/2))
      expect(stack.min.x).toBeGreaterThan(layout.storageX-layout.bayWidth/2)
      expect(stack.max.x).toBeLessThan(layout.storageX+layout.bayWidth/2)
      expect(covered(stack.min.x, stack.min.z)).toBe(true)
      expect(covered(stack.max.x, stack.max.z)).toBe(true)
      expect(occupied.some(other => other.intersectsBox(stack))).toBe(false)
      occupied.push(stack)
    }
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

  it("covers the 3×5 shrine with one entrance, a veiled relic under the altar and an offering box", () => {
    const parts = shrineStructureParts(3, 5)
    expect(new Set(parts.map(p => p.name)).size).toBe(parts.length)
    expect(parts.some(p => p.layer === "roof")).toBe(true)
    expect(parts.filter(p => p.name === "entrance-arch-0")).toHaveLength(1)
    expect(bounds(parts.find(p => p.name === "relic-table")!).getCenter(new Vector3()).z).toBeCloseTo(-1.4)
    expect(parts.some(p => p.name.startsWith("kneeler-"))).toBe(false)
    const altar = bounds(parts.find(p => p.name === "relic-table")!)
    const shelf = bounds(parts.find(p => p.name === "relic-shelf")!)
    const veil = bounds(parts.find(p => p.name === "relic-veil-0")!)
    expect(shelf.max.y + .18).toBeLessThan(altar.min.y)
    expect(veil.min.y).toBeLessThan(shelf.min.y)
    expect(veil.max.y).toBeCloseTo(altar.max.y)
    expect(parts.some(p => p.name === "offering-box-slot")).toBe(true)
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
  expect(parts.filter(p=>/^upper-timber-.*-arch-\d+$/.test(p.name))).toHaveLength(6)
  expect(parts.some(p=>p.name === "steeple-cross-upright")).toBe(true)
  expect(Math.max(...parts.filter(p=>p.name.startsWith("raised-nave-thatch-")).map(p=>bounds(p).max.y))).toBeGreaterThan(2)

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
