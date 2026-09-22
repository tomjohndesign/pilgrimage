import { describe, expect, it } from "vitest"
import { chickenCoopDemo } from "./building-art/chicken-coop-demo"
import { buildingPreviewMap } from "./building-art/map-preview"
import { earlyBuildingRecipe } from "./building-art/style"
import { chickenCoopParts } from "./building-art/chicken-coop"
import { BASE_CHARACTER_SCALE, DEFAULT_WALK_SPEED } from "./base-person/gait"
import { coopPoint, stepCoopChicken } from "./chicken-coop"
import { walkingSurface } from "./map/walking-surface"
import { coopLayout } from "./coop-layout"
import { releaseCoopEggs, seekCoopEggs, stepCoopKeeper } from "./coop-keeper"
import { rotateBuildingPoint } from "./building-rotation"
import { Vector3 } from "three"
import { layoutHand, reflectBuildingParts } from "./building-layout"
import { penGate, stepPenGates } from "./pen-gate"
import { createSim, stepSim } from "./sim"
import { TRAVELER_TYPES, type Traveler } from "./travelers"
import { depositFood } from "./storage"

function fixture(rotation = 0, layoutSeed = 0) {
  const map = buildingPreviewMap({ ...earlyBuildingRecipe("chicken-coop"), layoutSeed }, [
    { id: "store", recipe: earlyBuildingRecipe("storehouse"), x: 3, z: 0, rotation: 0 },
  ])
  map.buildings[0].rotation = rotation as 0 | 1 | 2 | 3
  return { map, ...chickenCoopDemo(map, false) }
}

describe("coop nests and egg collection", () => {
  it("closes the rear roof gap and leaves a real opening behind a top-hinged hatch", () => {
    const recipe = earlyBuildingRecipe("chicken-coop"), parts = chickenCoopParts(recipe), layout = coopLayout()
    const top = layout.floorHeight + recipe.wallHeight + recipe.roofRise * (.045 - layout.back) / 1.045
    const upper = parts.filter(p => p.name.startsWith("coop-back-above"))
    expect(upper.length).toBeGreaterThan(5)
    for (const p of upper) expect(p.position[1] + p.size![1] / 2).toBeCloseTo(top)
    const leaves = parts.filter(p => p.name.startsWith("coop-egg-hatch"))
    expect(leaves).toHaveLength(1)
    for (const hatch of [leaves[0], reflectBuildingParts(leaves)[0]]) {
      const hinge = hatch.gateHinge!
      expect(hinge.axis).toBe("x")
      expect(hinge.position[1]).toBeCloseTo(hatch.position[1] + hatch.size![1] / 2)
      const bottom = new Vector3(hatch.position[0], hatch.position[1] - hatch.size![1] / 2, hatch.position[2])
      const pivot = new Vector3(...hinge.position)
      bottom.sub(pivot).applyAxisAngle(new Vector3(1,0,0),hinge.openAngle).add(pivot)
      expect(bottom.x).toBeCloseTo(hatch.position[0])
      expect(bottom.y).toBeGreaterThan(hinge.position[1])
      expect(bottom.z).toBeLessThan(hinge.position[2])
    }
    for (const p of parts.filter(p => p.name.startsWith("coop-back-"))) {
      if (Math.abs(p.position[0]) < .7) expect(p.position[1] + p.size![1] / 2 <= layout.floorHeight + .12001 || p.position[1] - p.size![1] / 2 >= layout.floorHeight + .39999).toBe(true)
    }
  })

  for (const rotation of [0, 1, 2, 3]) for (const seed of [0, 1]) it(`lays through the pop-hole and returns to the run, rotation ${rotation}, layout ${seed}`, () => {
    const { map, world, stores } = fixture(rotation, seed), coop = map.buildings[0], centre = coopPoint(map, coop, 0, 0)
    const local = (a: { x: number; z: number }) => {
      const p = rotateBuildingPoint(a.x - centre.x, a.z - centre.z, -rotation)
      return { x: p.x * layoutHand(coop.buildType, seed), z: p.z }
    }
    let laid = false, returned = false, sat = false, climbed = false
    const hen = world.animals[0]
    for (let frame = 0; frame < 4000; frame++) {
      for (const animal of world.animals) {
        const before = local(animal)
        animal.age += .05
        stepCoopChicken(animal, map, .05, BASE_CHARACTER_SCALE, undefined, world.animals, stores)
        const after = local(animal)
        if (animal === hen && animal.nesting && Math.abs(after.x) < .01 && after.z > .02 && after.z < .48) {
          climbed = true
          expect(animal.y - walkingSurface(map,animal.x,animal.z).height).toBeCloseTo(coopLayout().floorHeight * (1 - after.z / .5))
        }
        if (before.z * after.z < 0) expect(Math.abs(after.x)).toBeLessThan(.05)
        if (animal.kind === "rooster") expect(animal.nesting).toBeUndefined()
      }
      expect(world.animals.filter(a => a.nesting).length).toBeLessThanOrEqual(1)
      if (hen.nesting?.stage === "laying") { sat = true; expect(hen.lying).toBe(1); expect(local(hen).z).toBeLessThan(-.6) }
      if ((stores.get(coop.id)?.eggs ?? 0) > 0) laid = true
      if (laid && !hen.nesting && local(hen).z > .2) { returned = true; break }
    }
    expect(climbed).toBe(true); expect(sat).toBe(true); expect(laid).toBe(true); expect(returned).toBe(true)
    expect(stores.get(coop.id)?.eggs).toBe(1)
  })

  it("supports the shelter on four short stilts with a raised floor and a ramp touching the ground", () => {
    const parts = chickenCoopParts(earlyBuildingRecipe("chicken-coop")), layout = coopLayout()
    const stilts = parts.filter(p => p.name.startsWith("coop-stilt-"))
    expect(stilts).toHaveLength(4)
    for (const p of stilts) {
      expect(p.position[1] - p.size![1] / 2).toBe(0)
      expect(p.position[1] + p.size![1] / 2).toBe(layout.floorHeight)
    }
    const floor = parts.find(p => p.name === "coop-raised-floor")!
    expect(floor.position[1] + floor.size![1] / 2).toBeCloseTo(layout.floorHeight)
    const ramp = parts.find(p => p.name === "coop-ramp")!.vertices!
    expect(Math.min(...ramp.filter((_,i)=>i%3===1))).toBe(0)
    expect(Math.max(...ramp.filter((_,i)=>i%3===1))).toBe(layout.floorHeight)
  })

  it("opens the playground with eggs ready and a keeper harvesting at the rear hatch", () => {
    const { map } = fixture(), { world, stores, actors } = chickenCoopDemo(map), actor = actors[0]
    const stand = coopPoint(map,map.buildings[0],coopLayout().keeper.x,coopLayout().keeper.z)
    expect([actor.x,actor.z]).toEqual([stand.x,stand.z])
    expect(actor.coopEggs?.stage).toBe("opening")
    expect(actor.coopEggs?.route).toEqual([])
    expect(stores.get(map.buildings[0].id)?.eggs).toBe(3)
    let harvesting = false
    for (let i=0;i<2000 && actor.coopEggs;i++) {
      stepPenGates(world,map,.05)
      stepCoopKeeper(actor,world,map,DEFAULT_WALK_SPEED,.05,stores)
      harvesting ||= actor.coopEggs?.stage === "collecting"
    }
    expect(harvesting).toBe(true)
    expect(stores.get("store")?.eggs).toBe(3)
  })

  it("opens the rear hatch, gathers eggs, closes it and deposits a basket in the store", () => {
    const { map, world, stores, actors } = fixture(), actor = actors[0], coop = map.buildings[0]
    depositFood(stores, coop, "eggs", 4)
    expect(seekCoopEggs(actor, world, map, stores)).toBe(true)
    const stages = new Set<string>()
    for (let frame = 0; frame < 6000 && actor.coopEggs; frame++) {
      stepPenGates(world, map, .05)
      stepCoopKeeper(actor, world, map, DEFAULT_WALK_SPEED, .05, stores)
      const task = actor.coopEggs
      if (!task) break
      stages.add(task.stage)
      if (task.stage === "collecting") expect(penGate(world, coop.id).open).toBeGreaterThanOrEqual(.98)
      if (task.stage === "delivery") {
        expect(penGate(world, coop.id).open).toBeLessThanOrEqual(.02)
        expect(task.amount).toBe(4)
        expect(stores.get(coop.id)?.eggs).toBe(4)
      }
    }
    expect(stages).toEqual(new Set(["approach", "opening", "collecting", "closing", "delivery"]))
    expect(actor.coopEggs).toBeUndefined()
    expect(stores.get("store")?.eggs).toBe(4)
    expect(stores.get(coop.id)?.eggs).toBe(0)
    expect(world.coopKeepers?.size).toBe(0)
  })

  it("fills the nests without overflowing when no keeper is available", () => {
    const { map, world, stores } = fixture(), coop = map.buildings[0]
    for (let frame = 0; frame < 24000; frame++) for (const bird of world.animals) {
      bird.age += .05
      stepCoopChicken(bird, map, .05, BASE_CHARACTER_SCALE, undefined, world.animals, stores)
    }
    expect(stores.get(coop.id)?.eggs).toBe(12)
    expect(world.animals.every(a => !a.nesting)).toBe(true)
  })

  it("runs the keeper chore through the live resident simulation", () => {
    const { map, world, stores, actors } = fixture(), actor = actors[0], coop = map.buildings[0]
    const traveler: Traveler = { id: actor.id, name: "Keeper", type: TRAVELER_TYPES.peasant, direction: 1, pace: 1, offset: 0,
      attributes: { happiness: 80, age: 30, gold: 0, piety: 0, status: 0, hunger: 100, thirst: 100, stamina: 100, jobless: false, skills: ["farming"] } }
    const sim = createSim([traveler], map)
    sim.travelers.set(actor.id, actor); sim.wildlife = world; sim.foodStores = stores
    depositFood(stores, coop, "eggs", 3)
    let started = false
    for (let frame = 0; frame < 4000 && !(stores.get("store")?.eggs); frame++) {
      stepPenGates(world, map, .05)
      stepSim(sim, [traveler], map, DEFAULT_WALK_SPEED, .05)
      started ||= actor.activity === "collectingEggs"
    }
    expect(started).toBe(true)
    expect(stores.get("store")?.eggs).toBe(3)
    expect(stores.get(coop.id)?.eggs).toBe(0)
    expect(actor.employer).toBe(coop.id)
  })

  it("retains eggs when interrupted and waits if no store has capacity", () => {
    const { map, world, stores, actors } = fixture(), actor = actors[0], coop = map.buildings[0]
    depositFood(stores, coop, "eggs", 6)
    expect(seekCoopEggs(actor, world, map, stores)).toBe(true)
    actor.coopEggs!.amount = 6
    releaseCoopEggs(actor, world)
    expect(stores.get(coop.id)?.eggs).toBe(6)
    expect(world.coopKeepers?.size).toBe(0)
    map.buildings = [coop]
    expect(seekCoopEggs(actor, world, map, stores)).toBe(false)
    expect(stores.get(coop.id)?.eggs).toBe(6)
  })
})
