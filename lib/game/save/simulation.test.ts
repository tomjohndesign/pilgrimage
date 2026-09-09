import { describe, expect, it } from "vitest"

import { DEFAULT_WALK_SPEED } from "../base-person/gait"
import { GAME_HOUR_SECONDS } from "../calendar"
import { generateMap } from "../map/generate-map"
import { MONK_COUNT } from "../monks"
import { generateRelic } from "../relic"
import { createSim, stepSim, type SimState } from "../sim"
import { generateTravelers, travelerCountForMap } from "../travelers"
import { simulationSaveSchema } from "./schema"
import { captureSimulation, restoreSimulation } from "./simulation"

const SEED = 4242

function world() {
  const map = generateMap({ seed: SEED })
  const travelers = generateTravelers(SEED, travelerCountForMap(map))
  const relic = generateRelic(SEED)
  return { map, travelers, relic }
}

function run(sim: SimState, travelers: ReturnType<typeof generateTravelers>, map: ReturnType<typeof generateMap>, seconds: number) {
  for (let elapsed = 0; elapsed < seconds; elapsed += 0.5) stepSim(sim, travelers, map, DEFAULT_WALK_SPEED, 0.5)
}

describe("simulation save", () => {
  it("survives a JSON round trip and keeps everyone's lasting state", () => {
    const { map, travelers, relic } = world()
    const sim = createSim(travelers, map, [], relic.stats)
    run(sim, travelers, map, 6 * GAME_HOUR_SECONDS)
    // Hand-plant some economy so the collections have something to carry.
    sim.wood = 40; sim.shrineGold = 12; sim.tradeGold = 3; sim.visits = 2; sim.constructionWood = 5
    sim.felled.add(7); sim.felled.add(3)
    sim.treeResources.set(7, { maxHealth: 10, health: 4, wood: 8, remainingWood: 8, size: 1, fellingHours: 2,
      trunkHeight: 3, trunkRadius: .2, trunkTaper: .8, footprintRadius: .4, trunkVolume: 1, felledAt: null, stumpUntil: null })
    const camp = map.buildings[0].id
    sim.piles.set(`${camp}:pile:0`, { id: `${camp}:pile:0`, campId: camp, slot: 0, wood: 6 })
    sim.foodStores.set(camp, { grain: 4, vegetables: 0, fruit: 1, fish: 0 })

    const saved = simulationSaveSchema.parse(JSON.parse(JSON.stringify(captureSimulation(sim, "sprites"))))
    expect(saved.felled).toEqual([3, 7])
    expect(saved.travelers).toHaveLength(sim.travelers.size)

    const fresh = createSim(travelers, map, [], relic.stats)
    restoreSimulation(fresh, saved, travelers, map)
    expect(fresh.time).toBe(sim.time)
    expect([fresh.wood, fresh.shrineGold, fresh.tradeGold, fresh.visits, fresh.constructionWood]).toEqual([40, 12, 3, 2, 5])
    expect([...fresh.felled]).toEqual([3, 7])
    expect(fresh.treeResources.get(7)).toEqual(sim.treeResources.get(7))
    expect(fresh.piles.get(`${camp}:pile:0`)).toEqual({ id: `${camp}:pile:0`, campId: camp, slot: 0, wood: 6 })
    expect(fresh.foodStores.get(camp)).toEqual({ grain: 4, vegetables: 0, fruit: 1, fish: 0 })
    for (const [id, before] of sim.travelers) {
      const after = fresh.travelers.get(id)!
      expect([after.gold, after.piety, after.happiness, after.hunger, after.thirst, after.stamina, after.visits, after.rolls, after.direction])
        .toEqual([before.gold, before.piety, before.happiness, before.hunger, before.thirst, before.stamina, before.visits, before.rolls, before.direction])
      expect(after.progress).toBeCloseTo(Math.min(map.road!.length - 1, before.progress), 6)
      expect(["walking", "idle"]).toContain(after.activity)
      expect(after.walkFrom).toBeNull()
      expect(Number.isFinite(after.x) && Number.isFinite(after.z)).toBe(true)
    }
  })

  it("keeps running after a restore", () => {
    const { map, travelers, relic } = world()
    const sim = createSim(travelers, map, [], relic.stats)
    run(sim, travelers, map, 3 * GAME_HOUR_SECONDS)
    const saved = simulationSaveSchema.parse(JSON.parse(JSON.stringify(captureSimulation(sim, "sprites"))))
    const fresh = createSim(travelers, map, [], relic.stats)
    restoreSimulation(fresh, saved, travelers, map)
    expect(() => run(fresh, travelers, map, 3 * GAME_HOUR_SECONDS)).not.toThrow()
    expect(fresh.time).toBeGreaterThan(saved.time)
    for (const s of fresh.travelers.values()) expect(Number.isFinite(s.x) && Number.isFinite(s.z)).toBe(true)
  })

  it("restores brothers who joined and drops records that no longer fit", () => {
    const { map, travelers, relic } = world()
    const sim = createSim(travelers, map, [], relic.stats)
    const friar = travelers.find(t => t.type.id === "friar")!
    const monk = { id: MONK_COUNT + friar.id, name: friar.name, duty: "Brother of the enclave",
      attributes: { age: 30, piety: 90, happiness: 60, skills: [] as string[] }, home: map.buildings[0].id, bedSlot: 1,
      arrival: { x: 1, y: 0, z: 2, stamina: 50 } }
    sim.joinedMonks.set(friar.id, monk)
    sim.travelers.delete(friar.id)
    const saved = simulationSaveSchema.parse(JSON.parse(JSON.stringify(captureSimulation(sim, "sprites"))))
    saved.felled = [0, 1_000_000]
    saved.piles = [{ id: "ghost:pile:0", campId: "ghost", slot: 0, wood: 3 }]
    saved.travelers[0] = { ...saved.travelers[0], employer: "ghost", home: "ghost", progress: 1e9 }

    const fresh = createSim(travelers, map, [], relic.stats)
    restoreSimulation(fresh, saved, travelers, map, 10)
    expect(fresh.joinedMonks.get(friar.id)).toEqual(monk)
    expect(fresh.travelers.has(friar.id)).toBe(false)
    expect([...fresh.felled]).toEqual([0])
    expect(fresh.piles.size).toBe(0)
    const first = fresh.travelers.get(saved.travelers[0].id)!
    expect([first.employer, first.home, first.activity]).toEqual([null, null, "walking"])
    expect(first.progress).toBe(map.road!.length - 1)
  })
})
