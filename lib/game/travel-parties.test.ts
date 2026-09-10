import { describe, expect, it } from "vitest"
import { withTravelParties, partyRoadDelta, partyNeedDrain, PARTY_NEED_FLOOR, ANIMAL_NEED_DRAIN } from "./travel-parties"
import { generateTravelers, TRAVELER_TYPES, type Traveler } from "./travelers"
import { createSim, stepSim, type SimState } from "./sim"
import { BUILD_CATALOG, DEFAULT_BALANCE } from "./balance"
import { jobBuildings } from "./settlement"
import { roadLanePoint } from "./map/road-lane"
import { tileToWorldX, tileToWorldZ, type GameMap } from "./map/types"

function fixture(count = 6, direction: 1 | -1 = 1) {
  const map: GameMap = { width: 80, depth: 20, seed: 42, tiles: Array(1600).fill("grass"), buildings: [],
    road: Array.from({ length: 80 }, (_, x) => ({ x, z: 5 })), shortcuts: [] }
  for (const p of map.road!) map.tiles[p.z * map.width + p.x] = "path"
  const travelers: Traveler[] = Array.from({ length: count }, (_, id) => ({ id, name: `Person ${id}`,
    type: TRAVELER_TYPES.peasant, direction, offset: .3, pace: id === 0 ? 1.2 : .65 + id * .02,
    party: { id: 0, name: "Village party", slot: id },
    attributes: { happiness: 80, age: 30, gold: 20, status: 0, piety: 100, hunger: 100, thirst: 100, stamina: 100, jobless: false, skills: [] } }))
  const sim = createSim(travelers, map, [], { sanctity: 100, spectacle: 100, doubt: 0 })
  for (const party of sim.parties.values()) party.transportInitialized = true
  sim.balance = { ...DEFAULT_BALANCE, rules: { ...DEFAULT_BALANCE.rules, hungerDecay: 0, thirstDecay: 0, staminaDecay: 0 } }
  sim.shrineRenown = 10000
  return { map, travelers, sim }
}

function run(sim: SimState, travelers: Traveler[], map: GameMap, seconds: number, stop = () => false) {
  for (let i = 0; i < seconds * 10 && !stop(); i++) stepSim(sim, travelers, map, 1, .1)
}

describe("travel party generation", () => {
  it("preserves the cast and headcount, groups related callings, and varies sizes up to twenty", () => {
    const sizes = new Set<number>()
    for (let seed = 0; seed < 12; seed++) {
      const original = generateTravelers(seed, 300), grouped = withTravelParties(original, seed)
      expect(grouped.map(({ party: _party, ...person }) => person)).toEqual(original)
      expect(withTravelParties(original, seed)).toEqual(grouped)
      const parties = new Map<number, Traveler[]>()
      for (const person of grouped) if (person.party) parties.set(person.party.id, [...parties.get(person.party.id) ?? [], person])
      for (const members of parties.values()) {
        sizes.add(members.length)
        expect(members.length).toBeLessThanOrEqual(20)
        expect(new Set(members.map(t => t.type.id)).size).toBe(1)
      }
      expect(grouped.some(t => !t.party)).toBe(true)
    }
    expect([...sizes].some(size => size >= 15)).toBe(true)
    expect(sizes.has(2)).toBe(true)
    expect(sizes.has(8)).toBe(true)
  })
})

describe("coordinated travel", () => {
  it.each([1, -1] as const)("uses its own half of a wide road with room between companions (%i)", direction => {
    const { map, travelers } = fixture(12, direction)
    map.mainRoadWidth = 2
    const sim = createSim(travelers, map)
    for (const party of sim.parties.values()) party.transportInitialized = true
    for (const elapsed of [0, 10]) {
      if (elapsed) run(sim, travelers, map, elapsed)
      const offsets = [...sim.travelers.values()].map(s => (tileToWorldZ(map, 5) - s.z) * direction)
      expect(Math.min(...offsets)).toBeGreaterThan(.3)
      expect(Math.max(...offsets)).toBeLessThan(.85)
      expect(Math.max(...offsets) - Math.min(...offsets)).toBeGreaterThan(.2)
    }
  })

  it.each([1, -1] as const)("keeps different personal paces together across the edge seam (%i)", direction => {
    const { map, travelers, sim } = fixture(8, direction)
    const starts = [...sim.travelers.values()].map(s => s.progress)
    run(sim, travelers, map, 120)
    const members = [...sim.travelers.values()]
    expect(Math.abs(partyRoadDelta(members[0].progress, starts[0], 79))).toBeGreaterThan(4)
    expect(Math.max(...members.map(s => Math.abs(partyRoadDelta(s.progress, members[0].progress, 79))))).toBeLessThan(10)
    for (const s of members) {
      expect(s.direction).toBe(direction)
      expect(s.moveSpeed).toBeLessThanOrEqual(travelers[s.id].pace + .001)
    }
  })

  it("does not privilege simulation iteration order", () => {
    const a = fixture(), b = fixture()
    run(a.sim, a.travelers, a.map, 30)
    run(b.sim, [...b.travelers].reverse(), b.map, 30)
    for (const [id, s] of a.sim.travelers) expect(b.sim.travelers.get(id)!.progress).toBeCloseTo(s.progress, 8)
  })

  it("follows a bent route, narrows for a bridge, and reforms after the tail clears", () => {
    const { map, travelers } = fixture(6)
    map.road = [...Array.from({ length: 25 }, (_, x) => ({ x, z: 5 })),
      ...Array.from({ length: 9 }, (_, i) => ({ x: 24, z: 6 + i })),
      ...Array.from({ length: 45 }, (_, i) => ({ x: 25 + i, z: 14 }))]
    for (const p of map.road) map.tiles[p.z * map.width + p.x] = "path"
    map.tiles[10 * map.width + 24] = "bridge"
    const sim = createSim(travelers, map)
    for (const party of sim.parties.values()) party.transportInitialized = true
    sim.balance = { ...DEFAULT_BALANCE, rules: { ...DEFAULT_BALANCE.rules, staminaDecay: 0, hungerDecay: 0, thirstDecay: 0 } }
    let narrowed = false, reformed = false
    for (let i = 0; i < 1000; i++) {
      stepSim(sim, travelers, map, 1, .1)
      narrowed ||= sim.parties.get(0)!.singleFile
      if (narrowed && !sim.parties.get(0)!.singleFile) reformed = true
      for (const s of sim.travelers.values()) {
        const expected = roadLanePoint(map, map.road, s.progress, s.lane)
        if (expected) expect(Math.hypot(s.x - tileToWorldX(map, expected.x), s.z - tileToWorldZ(map, expected.z))).toBeLessThan(.001)
        else expect(Math.min(...map.road.map(p => Math.hypot(s.x - tileToWorldX(map, p.x), s.z - tileToWorldZ(map, p.z))))).toBeLessThan(.8)
      }
    }
    expect(narrowed).toBe(true)
    expect(reformed).toBe(true)
  })
})

describe("shared stops", () => {
  it.each([1, 2])("keeps a couple together when %i beds are available", beds => {
    const { map, travelers, sim } = fixture(4)
    travelers[0].party!.partnerId = 1; travelers[1].party!.partnerId = 0
    for (const id of [0, 1]) { travelers[id].attributes.jobless = true; travelers[id].attributes.skills = ["cooking"]; sim.travelers.get(id)!.jobless = true }
    map.site = { hovelId: "shrine", door: { x: 28, z: 9 }, junction: 28,
      branch: Array.from({ length: 5 }, (_, i) => ({ x: 28, z: 5 + i })) }
    map.buildings.push({ id: "shrine", label: "Shrine", x: 27, z: 10, w: 3, d: 3, height: 1, color: "tan", roofColor: "brown" })
    const house = { ...BUILD_CATALOG.find(b => b.id === "house")!, id: "house", buildType: "house", x: 34, z: 9 }
    const tavern = { ...BUILD_CATALOG.find(b => b.id === "tavern")!, id: "tavern", buildType: "tavern", x: 39, z: 9 }
    map.buildings.push(house, tavern)
    sim.buildings = jobBuildings(map)
    // Leave just one job. The second partner must be a real unemployed resident.
    sim.travelers.set(-1, { ...sim.travelers.get(0)!, id: -1, employer: "tavern", home: null, partyId: undefined, activity: "posted", jobSlot: 0 })
    if (beds === 1) sim.travelers.set(-2, { ...sim.travelers.get(0)!, id: -2, home: "house", partyId: undefined, activity: "idle" })
    const party = sim.parties.get(0)!
    run(sim, travelers, map, 350, () => party.decisions > 0 && party.stage === "traveling")
    expect(sim.visits).toBe(4)
    const couple = [sim.travelers.get(0)!, sim.travelers.get(1)!]
    expect(couple.map(s => s.home)).toEqual(beds === 2 ? ["house", "house"] : [null, null])
    if (beds === 2) {
      expect(couple.filter(s => s.employer === "tavern")).toHaveLength(1)
      expect(party.members).toEqual([2, 3])
      run(sim, travelers, map, 90)
      expect(couple.every(s => s.partyId === undefined && s.home === "house")).toBe(true)
      expect(couple.some(s => !s.employer && ["idle", "toHome", "sleeping", "toBuild", "building", "fromBuild"].includes(s.activity))).toBe(true)
    } else expect(party.members).toEqual([0, 1, 2, 3])
  })



  it("visits together without overbooking, then continues with members who did not settle", () => {
    const { map, travelers, sim } = fixture(8)
    map.site = { hovelId: "shrine", door: { x: 28, z: 9 }, junction: 28,
      branch: Array.from({ length: 5 }, (_, i) => ({ x: 28, z: 5 + i })) }
    for (const p of map.site.branch) map.tiles[p.z * map.width + p.x] = "track"
    map.buildings.push({ id: "shrine", label: "Shrine", x: 27, z: 10, w: 3, d: 3, height: 1, color: "tan", roofColor: "brown" })
    const party = sim.parties.get(0)!
    run(sim, travelers, map, 1)
    expect(party.stage).toBe("visiting")
    for (let i = 0; i < 3500 && (party.stage !== "traveling" || !sim.visits); i++) {
      stepSim(sim, travelers, map, 1, .1)
      const seats = [...sim.travelers.values()].flatMap(s => s.shrineSeat ? [s.shrineSeat] : [])
      expect(new Set(seats).size).toBe(seats.length)
    }
    expect(sim.visits).toBe(8)
    expect(party.decisions).toBe(1)
    expect(party.stage).toBe("traveling")
    // A resident retains identity and position, but no longer holds up departure.
    const resident = sim.travelers.get(2)!
    resident.home = "house"; resident.employer = "job"; resident.activity = "idle"
    stepSim(sim, travelers, map, 1, .1)
    expect(party.members).not.toContain(2)
    expect(resident.partyId).toBeUndefined()
    const before = sim.travelers.get(0)!.progress
    run(sim, travelers, map, 10)
    expect(sim.travelers.get(0)!.progress).toBeGreaterThan(before)
  })

  it("times out an inaccessible enclave without splitting or teleporting", () => {
    const { map, travelers, sim } = fixture(4)
    const party = sim.parties.get(0)!
    party.stage = "visiting"; party.visitPending = [...party.members]
    const before = [...sim.travelers.values()].map(s => ({ x: s.x, z: s.z }))
    run(sim, travelers, map, 100)
    expect([...sim.travelers.values()].map(s => ({ x: s.x, z: s.z }))).toEqual(before)
    run(sim, travelers, map, 30)
    expect(party.stage).toBe("traveling")
    expect([...sim.travelers.values()].every(s => s.activity === "walking")).toBe(true)
  })
})

describe("companies for a cast added after creation", () => {
  it("forms and carries companies when travelers join an empty simulation, as the game does", () => {
    const { map, travelers } = fixture(6)
    const sim = createSim([], map, [], { sanctity: 100, spectacle: 100, doubt: 0 })
    const fresh = createSim(travelers, map, [], { sanctity: 100, spectacle: 100, doubt: 0 })
    for (const [id, s] of fresh.travelers) sim.travelers.set(id, s)
    expect(sim.parties.size).toBe(0)
    sim.balance = { ...DEFAULT_BALANCE, rules: { ...DEFAULT_BALANCE.rules, hungerDecay: 0, thirstDecay: 0, staminaDecay: 0 } }
    for (const party of sim.parties.values()) party.transportInitialized = true
    stepSim(sim, travelers, map, 1, .1)
    for (const party of sim.parties.values()) party.transportInitialized = true
    expect(sim.parties.size).toBe(1)
    expect([...sim.travelers.values()].every(s => s.partyId === 0 && s.partyCarried)).toBe(true)
    run(sim, travelers, map, 30)
    expect(sim.parties.get(0)!.formed).toBe(true)
    const members = [...sim.travelers.values()]
    expect(Math.max(...members.map(s => Math.abs(partyRoadDelta(s.progress, members[0].progress, 79))))).toBeLessThan(10)
  })
})

describe("tireless travel", () => {
  it("never drains stamina on the road, alone or in company, and never makes camp", () => {
    const { map, travelers, sim } = fixture(6)
    sim.balance = structuredClone(DEFAULT_BALANCE)
    for (const s of sim.travelers.values()) s.stamina = 15
    run(sim, travelers, map, 120)
    expect([...sim.travelers.values()].every(s => s.stamina === 15 && s.activity === "walking" && s.spot === null)).toBe(true)
    expect(sim.parties.get(0)!.stage).toBe("traveling")
  })
})

describe("shared provisions and purse", () => {
  it("eases the drain with company size and charges every animal", () => {
    expect(partyNeedDrain(1)).toBe(1)
    expect(partyNeedDrain(20)).toBeCloseTo(PARTY_NEED_FLOOR, 9)
    expect(partyNeedDrain(40)).toBeCloseTo(PARTY_NEED_FLOOR, 9)
    expect(partyNeedDrain(8)).toBeLessThan(partyNeedDrain(4))
    expect(partyNeedDrain(4)).toBeLessThan(1)
    expect(partyNeedDrain(8, 1)).toBeCloseTo(partyNeedDrain(8) + ANIMAL_NEED_DRAIN, 9)
    expect(partyNeedDrain(8, 2)).toBeGreaterThan(1)
  })

  it("holds one purse and one store, fed by individual meals and paid by individual costs", () => {
    const { map, travelers, sim } = fixture(8)
    sim.balance = { ...DEFAULT_BALANCE, rules: { ...DEFAULT_BALANCE.rules, staminaDecay: 0 } }
    const members = travelers.map(t => sim.travelers.get(t.id)!)
    members.forEach((s, i) => { s.gold = 10 + i; s.hunger = 40 + i * 4 })
    stepSim(sim, travelers, map, 1, .1)
    expect(new Set(members.map(s => s.gold)).size).toBe(1)
    expect(members[0].gold).toBeCloseTo(10 * 8 + 28, 6)
    expect(new Set(members.map(s => s.hunger)).size).toBe(1)
    const purse = members[0].gold, store = members[0].hunger
    members[3].gold -= 5
    members[5].hunger = 100
    stepSim(sim, travelers, map, 1, .1)
    expect(members[0].gold).toBeCloseTo(purse - 5, 6)
    expect(members[7].gold).toBeCloseTo(purse - 5, 6)
    expect(members[0].hunger).toBeGreaterThan(store)
    expect(members[0].hunger).toBeLessThan(100)
    expect(members[2].hunger).toBe(members[5].hunger)
    // Stamina stays personal.
    members[1].stamina = 50
    stepSim(sim, travelers, map, 1, .1)
    expect(members[1].stamina).toBe(50)
    expect(members[0].stamina).toBe(100)
  })

  it("declines more slowly in a large company than alone, and faster with a wagon", () => {
    const hungerAfter = (count: number, wagon = false) => {
      const { map, travelers, sim } = fixture(count)
      sim.balance = { ...DEFAULT_BALANCE, rules: { ...DEFAULT_BALANCE.rules, staminaDecay: 0 } }
      if (wagon) {
        const party = sim.parties.get(0)!
        party.transport = { style: "bench", animal: "ox", seats: [], phase: "road", pose: { x: 0, z: 0, heading: 0, hitch: { x: 0, z: 0 }, distance: 0 },
          progress: 0, distance: 0, animalDistance: 0, animalHeading: 0, retry: 0 }
      }
      run(sim, travelers, map, 120)
      return sim.travelers.get(0)!.hunger
    }
    const alone = hungerAfter(1), company = hungerAfter(12), wagon = hungerAfter(12, true)
    expect(alone).toBeLessThan(100)
    expect(company).toBeGreaterThan(alone)
    expect(wagon).toBeLessThan(company)
  })

  it("lets a departing companion take their share of the purse", () => {
    const { map, travelers, sim } = fixture(4)
    const members = travelers.map(t => sim.travelers.get(t.id)!)
    members.forEach(s => { s.gold = 10 })
    stepSim(sim, travelers, map, 1, .1)
    expect(members[0].gold).toBe(40)
    members[2].home = "house"
    stepSim(sim, travelers, map, 1, .1)
    expect(members[2].gold).toBeCloseTo(10, 6)
    expect(members[2].partyId).toBeUndefined()
    expect(members[0].gold).toBeCloseTo(30, 6)
    expect(sim.parties.get(0)!.members).toEqual([0, 1, 3])
  })
})
