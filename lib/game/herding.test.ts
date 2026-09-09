import { describe, expect, it } from "vitest"
import { buildingFoldEntry, rotatedFootprint, type BuildingRotation } from "./building-rotation"
import { buildingStepAllowed } from "./building-navigation"
import { BUILDING_KINDS } from "./buildings"
import { foldLayout, releaseSheep, seekSheep } from "./herding"
import { tileToWorldX, tileToWorldZ, type GameMap } from "./map/types"
import { createSim, stepSim } from "./sim"
import { TRAVELER_TYPES, type Traveler } from "./travelers"
import { createWildlife, stepWildlife } from "./wildlife/simulation"

function fixture(rotation: BuildingRotation = 0) {
  const map: GameMap = { width: 32, depth: 32, seed: 124, tiles: Array(32 * 32).fill("grass"), buildings: [],
    road: Array.from({ length: 32 }, (_, x) => ({ x, z: 1 })) }
  const def = BUILDING_KINDS["sheep-pen"]
  const pen = { ...def, ...rotatedFootprint(def, rotation), id: "pen", buildType: "sheep-pen", kind: "sheep-pen" as const, x: 16, z: 16, rotation }
  map.buildings.push(pen)
  const people: Traveler[] = [0, 1].map(id => ({ id, name: `Shepherd ${id}`, type: TRAVELER_TYPES.peasant, direction: 1, pace: 1, offset: .1,
    attributes: { happiness: 80, age: 30, gold: 0, piety: 0, status: 0, hunger: 100, thirst: 100, stamina: 100, jobless: false, skills: ["herding"] } }))
  const world = createWildlife(map, [], 1.5), sheep = world.animals.filter(a => a.kind === "sheep").slice(0, 4)
  for (const a of world.animals) if (!sheep.includes(a)) { a.reserve = true; a.concealed = true }
  sheep.forEach((a, i) => Object.assign(a, { x: -4 + i, z: 4, home: { x: -4 + i, z: 4 }, leader: a.id, rest: 10000, target: null }))
  const sim = createSim(people, map)
  sim.wildlife = world; sim.buildings = [pen]
  sim.balance = { ...sim.balance, rules: { ...sim.balance.rules, staminaDecay: 0, hungerDecay: 0, thirstDecay: 0 } }
  const layout = foldLayout(map, pen, 1.5)
  for (const actor of sim.travelers.values()) Object.assign(actor, { ...layout.outside, employer: pen.id, jobSlot: actor.id, activity: "idle" })
  const tick = () => {
    stepSim(sim, people, map, 1.5, .1)
    stepWildlife(world, map, .1, 1.5)
  }
  return { map, pen, people, world, sheep, sim, tick }
}

describe("shepherds gathering sheep", () => {
  for (const rotation of [0, 1, 2, 3] as const) it(`fetches sheep and keeps them in a pen rotated ${rotation} quarter turns`, () => {
    const { map, pen, sheep, sim, tick } = fixture(rotation)
    const slots = foldLayout(map, pen, 1.5).slots
    expect(slots.length).toBeGreaterThanOrEqual(2)
    const activities = new Set<string>()
    for (let i = 0; i < 7000 && !sheep.every(a => a.fold?.arrived); i++) {
      tick()
      for (const actor of sim.travelers.values()) activities.add(actor.activity)
    }
    expect(activities).toContain("toSheep")
    expect(activities).toContain("herding")
    expect(sheep.every(a => a.fold?.arrived)).toBe(true)
    expect(new Set(sheep.map(a => a.fold!.slot)).size).toBe(sheep.length)
    const positions = sheep.map(a => ({ x: a.x, z: a.z }))
    for (let i = 0; i < 500; i++) tick()
    expect(sheep.map(a => ({ x: a.x, z: a.z }))).toEqual(positions)
    for (const a of sheep) {
      expect(a.x).toBeCloseTo(slots[a.fold!.slot].x)
      expect(a.z).toBeCloseTo(slots[a.fold!.slot].z)
      expect(a.grazing).toBe(1)
      expect(a.phase).toBeGreaterThan(0)
    }
  })

  it("reserves different sheep and releases a sheep when its shepherd needs rest", () => {
    const { sim, world, map, tick } = fixture()
    const [a, b] = [...sim.travelers.values()]
    expect(seekSheep(a, world, map, 1.5)).toBe(true)
    expect(seekSheep(b, world, map, 1.5)).toBe(true)
    expect(a.herding!.animalId).not.toBe(b.herding!.animalId)
    const target = world.animals.find(s => s.id === a.herding!.animalId)!
    a.stamina = 10; tick()
    expect(a.herding).toBeUndefined()
    expect(target.fold).toBeUndefined()
    expect(a.activity).toBe("idle")
  })

  it("does not fetch unreachable sheep across a river", () => {
    const { sim, world, map, sheep } = fixture()
    for (let z = 0; z < map.depth; z++) map.tiles[z * map.width + 14] = "water"
    for (const a of sheep) { a.x = tileToWorldX(map, 10); a.z = tileToWorldZ(map, 20) }
    expect(seekSheep([...sim.travelers.values()][0], world, map, 1.5)).toBe(false)
    expect(sheep.every(a => !a.fold)).toBe(true)
  })

  it("abandons a removed pen and frees reservations", () => {
    const { sim, map, sheep, tick } = fixture()
    tick()
    expect(sheep.some(a => a.fold)).toBe(true)
    map.buildings = []; sim.buildings = []
    tick()
    expect(sheep.every(a => !a.fold)).toBe(true)
    expect([...sim.travelers.values()].every(a => !a.herding)).toBe(true)
  })

  it("does not move or assign work while paused", () => {
    const { sim, world, map, people, sheep } = fixture()
    const before = sheep.map(a => ({ x: a.x, z: a.z }))
    stepSim(sim, people, map, 1.5, 0)
    stepWildlife(world, map, 0, 1.5)
    expect(sheep.map(a => ({ x: a.x, z: a.z }))).toEqual(before)
    expect(sheep.every(a => !a.fold)).toBe(true)
  })

  it("uses the fold gate in every orientation", () => {
    for (const rotation of [0, 1, 2, 3] as const) {
      const { map, pen, sim, world } = fixture(rotation)
      const outside = buildingFoldEntry(pen), inside = buildingFoldEntry(pen, true)
      expect(buildingStepAllowed(map, [pen], outside, inside, true)).toBe(true)
      const actor = [...sim.travelers.values()][0]
      seekSheep(actor, world, map, 1.5); releaseSheep(actor, world)
      expect(actor.herding).toBeUndefined()
    }
  })
})
