import { describe, expect, it } from "vitest"
import { DEFAULT_BALANCE } from "./balance"
import { createSim, stepSim, type SimState } from "./sim"
import { TRAVELER_TYPES, type Traveler } from "./travelers"
import type { GameMap } from "./map/types"

/** A short looping road past a church, with everyone devout enough to turn in
 * every time: a stress test for the line at the relic. Two companies and a
 * handful of single walkers keep coming round for another look. */
function relicRoad(companies: number[], singles: number) {
  const width = 60, depth = 20
  const map: GameMap = { width, depth, seed: 7, tiles: Array(width * depth).fill("grass"), buildings: [],
    road: Array.from({ length: width }, (_, x) => ({ x, z: 5 })), shortcuts: [] }
  for (const p of map.road!) map.tiles[p.z * map.width + p.x] = "path"
  map.site = { hovelId: "shrine", door: { x: 30, z: 9 }, junction: 30,
    branch: Array.from({ length: 5 }, (_, i) => ({ x: 30, z: 5 + i })) }
  for (const p of map.site.branch) map.tiles[p.z * map.width + p.x] = "track"
  map.buildings.push({ id: "shrine", label: "Shrine", x: 29, z: 10, w: 3, d: 3, height: 1, color: "tan", roofColor: "brown" })
  const travelers: Traveler[] = []
  let id = 0
  const person = (party?: { id: number; name: string; slot: number }): Traveler => ({
    id: id++, name: `Person ${id}`, type: TRAVELER_TYPES.pilgrim, direction: id % 2 ? 1 : -1, offset: (id * 7 % 60) / 60, pace: .8 + (id % 5) * .1, party,
    attributes: { happiness: 80, age: 30, gold: 20, status: 0, piety: 100, hunger: 100, thirst: 100, stamina: 100, jobless: false, skills: [] } })
  companies.forEach((size, c) => { for (let slot = 0; slot < size; slot++) travelers.push(person({ id: c, name: `Company ${c}`, slot })) })
  for (let i = 0; i < singles; i++) travelers.push(person())
  const sim = createSim(travelers, map, [], { sanctity: 100, spectacle: 100, doubt: 0 })
  for (const party of sim.parties.values()) party.transportInitialized = true
  sim.balance = { ...DEFAULT_BALANCE, rules: { ...DEFAULT_BALANCE.rules, hungerDecay: 0, thirstDecay: 0, staminaDecay: 0 } }
  sim.shrineRenown = 10000
  sim.shrineKeeperReady = true
  return { map, travelers, sim }
}

/** The line is moving if someone in it stepped forward or someone was shown the relic. */
function watchLine(sim: SimState, travelers: Traveler[], map: GameMap, seconds: number, patience = 20) {
  const inLine = () => [...sim.travelers.values()].filter(s => s.shrineSeat?.startsWith("queue-") && (s.activity === "toRelic" || s.activity === "visiting"))
  let lastMoved = 0, visits = sim.visits, longest = 0
  const progress = new Map<number, number>()
  for (let tick = 1; tick <= seconds * 10; tick++) {
    stepSim(sim, travelers, map, 1, .1)
    const now = tick / 10, line = inLine()
    let moved = sim.visits > visits
    for (const s of line) {
      if (s.branchProgress > (progress.get(s.id) ?? -1) + 1e-9) moved = true
      progress.set(s.id, s.branchProgress)
    }
    visits = sim.visits
    if (moved || !line.length) lastMoved = now
    longest = Math.max(longest, now - lastMoved)
    if (now - lastMoved > patience) {
      const dump = line.map(s => `${s.id}${s.partyId !== undefined ? `(company ${s.partyId})` : ""}:${s.activity}@${s.branchProgress.toFixed(2)}/${s.shrineRoute?.length}`).join(" ")
      const companies = [...sim.parties.values()].map(p => `${p.id}:${p.stage} "${p.reason}"`).join(" | ")
      throw new Error(`line stood still for ${patience}s at t=${now}: ${dump} | ${companies}`)
    }
    for (const p of sim.parties.values()) for (const id of p.members) expect(sim.travelers.get(id)!.partyVisitAborted).toBeFalsy()
  }
  return longest
}

describe("the line at the relic", () => {
  it("keeps moving with companies and single walkers coming round together", () => {
    const { map, travelers, sim } = relicRoad([5, 3], 6)
    const longest = watchLine(sim, travelers, map, 20 * 60)
    expect(longest).toBeLessThanOrEqual(20)
    // Everyone has been round more than once, companies included.
    for (const s of sim.travelers.values()) expect(s.visits, `traveler ${s.id}`).toBeGreaterThanOrEqual(2)
    expect(sim.visits).toBeGreaterThanOrEqual(travelers.length * 2)
  })

  it("stands while the keeper is away and moves again as soon as the relic is shown", () => {
    const { map, travelers, sim } = relicRoad([6, 3], 8)
    let longest = 0
    for (let round = 0; round < 6; round++) {
      // The keeper steps away for a while: nobody new joins the line, and those in it wait.
      sim.shrineKeeperReady = false
      const away = 40
      for (let tick = 0; tick < away * 10; tick++) stepSim(sim, travelers, map, 1, .1)
      for (const p of sim.parties.values()) for (const id of p.members) expect(sim.travelers.get(id)!.partyVisitAborted).toBeFalsy()
      sim.shrineKeeperReady = true
      longest = Math.max(longest, watchLine(sim, travelers, map, 120))
    }
    expect(longest).toBeLessThanOrEqual(20)
    for (const s of sim.travelers.values()) expect(s.visits, `traveler ${s.id}`).toBeGreaterThanOrEqual(1)
  })

  it("keeps moving when a large company and many single walkers crowd the branch", () => {
    const { map, travelers, sim } = relicRoad([12, 4, 2], 14)
    watchLine(sim, travelers, map, 20 * 60)
    for (const s of sim.travelers.values()) expect(s.visits, `traveler ${s.id}`).toBeGreaterThanOrEqual(1)
  })
})
