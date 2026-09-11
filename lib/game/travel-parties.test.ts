import { describe, expect, it } from "vitest"
import { withTravelParties, partyRoadDelta, partyNeedDrain, PARTY_NEED_FLOOR, ANIMAL_NEED_DRAIN } from "./travel-parties"
import { generateTravelers, TRAVELER_TYPES, type Traveler } from "./travelers"
import { createSim, stepSim, type SimState } from "./sim"
import { GAME_HOUR_SECONDS } from "./calendar"
import { DEFAULT_WALK_SPEED } from "./base-person/gait"
import { BUILD_CATALOG, DEFAULT_BALANCE } from "./balance"
import { jobBuildings } from "./settlement"
import { roadLanePoint } from "./map/road-lane"
import { tileToWorldX, tileToWorldZ, worldToTileX, worldToTileZ, type GameMap, type TilePos } from "./map/types"
import { shrineVisitPlan } from "./shrine-visit"
import { shrineGates } from "./building-navigation"

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

  it.each(["bridge", "ford"] as const)("follows a bent route, narrows for a %s, and reforms after the tail clears", crossing => {
    const { map, travelers } = fixture(6)
    map.road = [...Array.from({ length: 25 }, (_, x) => ({ x, z: 5 })),
      ...Array.from({ length: 9 }, (_, i) => ({ x: 24, z: 6 + i })),
      ...Array.from({ length: 45 }, (_, i) => ({ x: 25 + i, z: 14 }))]
    for (const p of map.road) map.tiles[p.z * map.width + p.x] = "path"
    map.tiles[10 * map.width + 24] = crossing
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
  it.each([1, -1] as const)("draws thirsty companions to an unstaffed church (%i)", direction => {
    const { map, travelers, sim } = fixture(5, direction)
    sim.shrineRenown = 0
    map.site = { hovelId: "shrine", door: { x: 24, z: 9 }, junction: 24,
      branch: Array.from({ length: 5 }, (_, i) => ({ x: 24, z: 5 + i })) }
    map.buildings.push({ id: "shrine", label: "Shrine", x: 23, z: 10, w: 3, d: 3, height: 1, color: "tan", roofColor: "brown" })
    for (const s of sim.travelers.values()) Object.assign(s, { piety: 88, happiness: 38, hunger: 2, thirst: 0, gold: 36 })
    const party = sim.parties.get(0)!
    party.progress = 24
    run(sim, travelers, map, 1)
    expect(party.stage).toBe("visiting")
    run(sim, travelers, map, 400, () => sim.visits === 5 && party.stage === "traveling")
    expect(sim.visits).toBe(5)
    expect(party.stage).toBe("traveling")
    expect([...sim.travelers.values()].every(s => s.hunger === 2)).toBe(true)
  })

  it("lets one partner stay for a job without settling their companion", () => {
    const { map, travelers, sim } = fixture(2)
    travelers[0].party!.partnerId = 1; travelers[1].party!.partnerId = 0
    for (const id of [0, 1]) sim.travelers.get(id)!.jobless = true
    map.site = { hovelId: "shrine", door: { x: 28, z: 9 }, junction: 28,
      branch: Array.from({ length: 5 }, (_, i) => ({ x: 28, z: 5 + i })) }
    map.buildings.push({ id: "shrine", label: "Shrine", x: 27, z: 10, w: 3, d: 3, height: 1, color: "tan", roofColor: "brown" },
      { ...BUILD_CATALOG.find(b => b.id === "house")!, id: "house", buildType: "house", x: 34, z: 9 },
      { ...BUILD_CATALOG.find(b => b.id === "tavern")!, id: "tavern", buildType: "tavern", x: 39, z: 9 })
    sim.buildings = jobBuildings(map)
    const party = sim.parties.get(0)!
    run(sim, travelers, map, 2500, () => [...sim.travelers.values()].some(s => !!s.employer))
    const settled = [...sim.travelers.values()].filter(s => s.employer)
    expect(settled).toHaveLength(1)
    expect(settled[0].visits).toBeGreaterThan(0)
    expect(settled[0].home).toBe("house")
    const companion = sim.travelers.get(settled[0].id === 0 ? 1 : 0)!
    expect(companion.home).toBeNull()
    expect(party.members).toContain(companion.id)
    expect(party.members).not.toContain(settled[0].id)
  })

  it.each([8, 20])("views the relic together without overbooking (%i companions)", count => {
    const { map, travelers, sim } = fixture(count)
    map.site = { hovelId: "shrine", door: { x: 28, z: 9 }, junction: 28,
      branch: Array.from({ length: 5 }, (_, i) => ({ x: 28, z: 5 + i })) }
    for (const p of map.site.branch) map.tiles[p.z * map.width + p.x] = "track"
    map.buildings.push({ id: "shrine", label: "Shrine", x: 27, z: 10, w: 3, d: 3, height: 1, color: "tan", roofColor: "brown" })
    const party = sim.parties.get(0)!
    run(sim, travelers, map, 1)
    expect(party.stage).toBe("visiting")
    for (let i = 0; i < 3500 && (party.stage !== "traveling" || !sim.visits); i++) {
      stepSim(sim, travelers, map, 1, .1)
      // No one completes a viewing before their companions have gathered.
      expect([0, count]).toContain(sim.visits)
      const seats = [...sim.travelers.values()].flatMap(s => s.shrineSeat ? [s.shrineSeat] : [])
      expect(new Set(seats).size).toBe(seats.length)
    }
    expect(sim.visits).toBe(count)
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

  it("admits a second company while another still holds places in the nave", () => {
    const { map, travelers, sim } = fixture(8)
    // Two companies of four, the second a little further from the junction.
    for (const t of travelers) t.party = { id: t.id < 4 ? 0 : 1, name: t.id < 4 ? "First company" : "Second company", slot: t.id % 4 }
    sim.parties.clear()
    for (const s of sim.travelers.values()) s.partyId = undefined
    const cast = createSim(travelers, map, [], { sanctity: 100, spectacle: 100, doubt: 0 })
    for (const [id, party] of cast.parties) { party.transportInitialized = true; sim.parties.set(id, party) }
    for (const s of sim.travelers.values()) s.partyId = travelers[s.id].party!.id
    map.site = { hovelId: "shrine", door: { x: 28, z: 9 }, junction: 28,
      branch: Array.from({ length: 5 }, (_, i) => ({ x: 28, z: 5 + i })) }
    for (const p of map.site.branch) map.tiles[p.z * map.width + p.x] = "track"
    map.buildings.push({ id: "shrine", label: "Shrine", x: 27, z: 10, w: 3, d: 3, height: 1, color: "tan", roofColor: "brown" })
    const first = sim.parties.get(0)!, second = sim.parties.get(1)!
    first.progress = 28; second.progress = 26
    for (const s of sim.travelers.values()) s.progress = s.partyId === 0 ? 28 : 26
    run(sim, travelers, map, 1)
    expect(first.stage).toBe("visiting")
    // The second company is admitted alongside the first, not turned away until it leaves.
    run(sim, travelers, map, 60, () => second.visitStarted.length > 0)
    expect(second.visitStarted.length).toBeGreaterThan(0)
    const holding = first.members.filter(id => sim.travelers.get(id)!.shrineSeat?.startsWith("group-"))
    expect(holding.length).toBeGreaterThan(0)
    const seats = [...sim.travelers.values()].flatMap(s => s.shrineSeat ? [s.shrineSeat] : [])
    expect(new Set(seats).size).toBe(seats.length)
    run(sim, travelers, map, 600, () => sim.visits === 8 && first.stage === "traveling" && second.stage === "traveling")
    expect(sim.visits).toBe(8)
    expect(first.stage).toBe("traveling")
    expect(second.stage).toBe("traveling")
  })

  const SHRINE = { id: "shrine", label: "Shrine", x: 27, z: 10, w: 3, d: 3, height: 1, color: "tan", roofColor: "brown" }
  const withShrine = (map: GameMap) => {
    map.site = { hovelId: "shrine", door: { x: 28, z: 9 }, junction: 28,
      branch: Array.from({ length: 5 }, (_, i) => ({ x: 28, z: 5 + i })) }
    for (const p of map.site.branch) map.tiles[p.z * map.width + p.x] = "track"
    map.buildings.push({ ...SHRINE })
  }
  const insideShrine = (map: GameMap, s: { x: number; z: number }) => {
    const x = worldToTileX(map, s.x), z = worldToTileZ(map, s.z)
    return x >= SHRINE.x && x < SHRINE.x + SHRINE.w && z >= SHRINE.z && z < SHRINE.z + SHRINE.d
  }
  const doorIndex = (map: GameMap, route: readonly TilePos[]) => {
    const gate = shrineGates(map.buildings[0], map.site!.door)[0]
    return route.findIndex(p => p.x === gate.outside.x && p.z === gate.outside.z)
  }

  it("holds a company at the church door while a single visitor views the relic", () => {
    const { map, travelers, sim } = fixture(5)
    withShrine(map)
    // The fifth person is alone, already inside at the relic.
    travelers[4].party = undefined
    const lone = sim.travelers.get(4)!
    sim.parties.get(0)!.members = [0, 1, 2, 3]; lone.partyId = undefined
    const plan = shrineVisitPlan(map, 4, 0)!
    Object.assign(lone, { shrineSeat: plan.seat, shrineRoute: plan.route, branchProgress: plan.route.length - 1, activity: "visiting", timer: 10000,
      shrineQueueOrder: ++sim.shrineQueueSequence, x: tileToWorldX(map, plan.route.at(-1)!.x), z: tileToWorldZ(map, plan.route.at(-1)!.z), offeringMade: false })
    expect(insideShrine(map, lone)).toBe(true)
    const party = sim.parties.get(0)!
    party.progress = 28
    for (const id of party.members) sim.travelers.get(id)!.progress = 28
    run(sim, travelers, map, 60, () => party.members.every(id => sim.travelers.get(id)!.activity === "toRelic"))
    expect(party.stage).toBe("visiting")
    // Everyone is admitted with a place, walks up to the door and waits there in a line.
    run(sim, travelers, map, 60)
    for (const id of party.members) {
      const s = sim.travelers.get(id)!
      expect(s.activity).toBe("toRelic")
      expect(s.shrineSeat).toMatch(/^group-/)
      expect(insideShrine(map, s)).toBe(false)
      expect(s.branchProgress).toBeLessThanOrEqual(doorIndex(map, s.shrineRoute!))
    }
    const line = party.members.map(id => sim.travelers.get(id)!).sort((a, b) => a.shrineQueueOrder! - b.shrineQueueOrder!)
    for (let i = 1; i < line.length; i++) expect(Math.hypot(line[i].x - line[i - 1].x, line[i].z - line[i - 1].z)).toBeGreaterThanOrEqual(.35)
    // Waiting for a turn is not being stranded: well past the give-up, nobody turns back.
    run(sim, travelers, map, 200)
    expect(party.stage).toBe("visiting")
    for (const id of party.members) {
      const s = sim.travelers.get(id)!
      expect(s.activity).toBe("toRelic")
      expect(s.partyVisitAborted).toBeFalsy()
      expect(insideShrine(map, s)).toBe(false)
    }
    // Once the visitor has left the nave the company walks in and views the relic together.
    lone.timer = 0
    run(sim, travelers, map, 600, () => sim.visits === 5 && party.stage === "traveling")
    expect(sim.visits).toBe(5)
    expect(party.stage).toBe("traveling")
  })

  it("lets a waiting company in before single visitors who arrived after it", () => {
    const { map, travelers, sim } = fixture(6)
    withShrine(map)
    for (const id of [4, 5]) { travelers[id].party = undefined; sim.travelers.get(id)!.partyId = undefined }
    const party = sim.parties.get(0)!
    party.members = [0, 1, 2, 3]
    // One person views the relic; the company arrives and waits at the door.
    const first = sim.travelers.get(4)!, plan = shrineVisitPlan(map, 4, 0)!
    Object.assign(first, { shrineSeat: plan.seat, shrineRoute: plan.route, branchProgress: plan.route.length - 1, activity: "visiting", timer: 10000,
      shrineQueueOrder: ++sim.shrineQueueSequence, x: tileToWorldX(map, plan.route.at(-1)!.x), z: tileToWorldZ(map, plan.route.at(-1)!.z), offeringMade: false })
    const later = sim.travelers.get(5)!
    Object.assign(later, { progress: 0, activity: "idle", timer: 1e9 })
    party.progress = 28
    for (const id of party.members) sim.travelers.get(id)!.progress = 28
    run(sim, travelers, map, 60, () => party.members.every(id => sim.travelers.get(id)!.activity === "toRelic"))
    run(sim, travelers, map, 30)
    // A second single visitor joins the line behind the company.
    const second = shrineVisitPlan(map, 5, 0, new Set([first.shrineSeat!]))!
    Object.assign(later, { shrineSeat: second.seat, shrineRoute: second.route, branchProgress: 0, activity: "toRelic", timer: 0, offeringMade: false,
      shrineQueueOrder: ++sim.shrineQueueSequence, progress: 28, x: tileToWorldX(map, second.route[0].x), z: tileToWorldZ(map, second.route[0].z) })
    run(sim, travelers, map, 60)
    expect(later.activity).toBe("toRelic")
    expect(insideShrine(map, later)).toBe(false)
    const doorLine = [...party.members.map(id => sim.travelers.get(id)!), later].sort((a, b) => a.shrineQueueOrder! - b.shrineQueueOrder!)
    for (let i = 1; i < doorLine.length; i++) expect(doorLine[i].branchProgress).toBeLessThan(doorIndex(map, doorLine[i].shrineRoute!))
    // When the nave frees, the company goes in first and the latecomer only after it has left.
    first.timer = 0
    let companyIn = -1, laterIn = -1
    for (let i = 0; i < 6000 && sim.visits < 6; i++) {
      stepSim(sim, travelers, map, 1, .1)
      const companyInside = party.members.some(id => insideShrine(map, sim.travelers.get(id)!))
      if (companyInside && companyIn < 0) companyIn = i
      if (insideShrine(map, later) && laterIn < 0) laterIn = i
      if (insideShrine(map, later)) expect(companyInside).toBe(false)
    }
    expect(companyIn).toBeGreaterThanOrEqual(0)
    expect(laterIn).toBeGreaterThan(companyIn)
    expect(sim.visits).toBe(6)
  })

  it("lines single visitors up outside the door while a company holds the nave", () => {
    const { map, travelers, sim } = fixture(6)
    withShrine(map)
    // Two people travel alone, some way behind the company.
    for (const id of [4, 5]) { travelers[id].party = undefined; sim.travelers.get(id)!.partyId = undefined }
    const party = sim.parties.get(0)!
    party.members = [0, 1, 2, 3]
    party.progress = 28
    for (const id of party.members) sim.travelers.get(id)!.progress = 28
    for (const id of [4, 5]) Object.assign(sim.travelers.get(id)!, { progress: 22, visitCooldown: 0 })
    const lone = () => [4, 5].map(id => sim.travelers.get(id)!)
    // While the company is inside, the line waits outside the door in arrival order.
    let held = 0, lined = 0
    for (let i = 0; i < 6000 && sim.visits < 6; i++) {
      stepSim(sim, travelers, map, 1, .1)
      if (!party.members.some(id => insideShrine(map, sim.travelers.get(id)!))) continue
      const waiting = lone().filter(s => s.activity === "toRelic" && s.shrineSeat?.startsWith("queue-"))
      for (const s of waiting) {
        expect(insideShrine(map, s)).toBe(false)
        expect(s.branchProgress).toBeLessThanOrEqual(doorIndex(map, s.shrineRoute!))
        held++
      }
      if (waiting.length === 2 && waiting.every(s => s.moveSpeed === 0)) {
        const [front, back] = waiting.sort((a, b) => a.shrineQueueOrder! - b.shrineQueueOrder!)
        expect(Math.hypot(front.x - back.x, front.z - back.z)).toBeGreaterThanOrEqual(.35)
        lined++
      }
    }
    expect(held).toBeGreaterThan(0)
    expect(lined).toBeGreaterThan(0)
    // Everyone has been shown the relic; some may already be round for a second visit.
    expect(sim.visits).toBeGreaterThanOrEqual(6)
    expect([...sim.travelers.values()].every(s => s.visits >= 1)).toBe(true)
  })

  it("walks a track longer than the waiting timeout to its end instead of turning back", () => {
    const count = 6
    const { travelers, sim } = fixture(count)
    // A branch of default relic distance takes well over two minutes to walk.
    const map: GameMap = { width: 80, depth: 80, seed: 42, tiles: Array(6400).fill("grass"), buildings: [],
      road: Array.from({ length: 80 }, (_, x) => ({ x, z: 5 })), shortcuts: [] }
    for (const p of map.road!) map.tiles[p.z * map.width + p.x] = "path"
    map.site = { hovelId: "shrine", door: { x: 28, z: 69 }, junction: 28,
      branch: Array.from({ length: 65 }, (_, i) => ({ x: 28, z: 5 + i })) }
    for (const p of map.site.branch) map.tiles[p.z * map.width + p.x] = "track"
    map.buildings.push({ id: "shrine", label: "Shrine", x: 27, z: 70, w: 3, d: 3, height: 1, color: "tan", roofColor: "brown" })
    const party = sim.parties.get(0)!
    // Step at the game's reference pace: the fixture's unit speed walks the branch too fast to time out.
    const step = () => stepSim(sim, travelers, map, DEFAULT_WALK_SPEED, .1)
    for (let i = 0; i < 10; i++) step()
    expect(party.stage).toBe("visiting")
    for (let i = 0; i < 12000 && party.stage !== "traveling"; i++) step()
    expect(sim.visits).toBe(count)
    expect([...sim.travelers.values()].some(s => s.partyVisitAborted)).toBe(false)
    expect(party.stage).toBe("traveling")
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

describe("company water stops", () => {
  it.each(["well", "river"])("refills the shared supply at a %s and resumes travel", source => {
    const { map, travelers, sim } = fixture(8)
    if (source === "well") map.buildings.push({ ...BUILD_CATALOG.find(b => b.id === "well")!, id: "well", buildType: "well", x: 24, z: 8 })
    else map.tiles[7 * map.width + 24] = "water"
    for (const s of sim.travelers.values()) s.thirst = 5
    const party = sim.parties.get(0)!, before = party.progress
    run(sim, travelers, map, 150, () => party.thirst > 95 && party.waterCarrier === undefined)
    expect(party.thirst).toBeGreaterThan(95)
    expect([...sim.travelers.values()].every(s => s.thirst > 95 && s.activity === "walking")).toBe(true)
    run(sim, travelers, map, 10)
    expect(party.progress).toBeGreaterThan(before)
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

  it("drains shared provisions at one quarter of the previous default rates", () => {
    const { map, travelers, sim } = fixture(5)
    sim.balance = structuredClone(DEFAULT_BALANCE)
    stepSim(sim, travelers, map, 1, GAME_HOUR_SECONDS)
    const party = sim.parties.get(0)!
    expect(100 - party.hunger).toBeCloseTo(1.5 / 4 * partyNeedDrain(5))
    expect(100 - party.thirst).toBeCloseTo(3 / 4 * partyNeedDrain(5))
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
