import { naturalWaterStop } from "./natural-water"
import { settlementJob, SETTLEMENT_JOBS } from "./jobs/design"
import { shrineSeats, shrineStations, shrineLayout } from "./shrine-layout"
import { afterEach, describe, expect, it } from "vitest"
import { BUILD_CATALOG, DEFAULT_BALANCE } from "./balance"
import { createSettlement, purchaseStructure, placementError, woodcutterHuts, jobBuildings, creditTimber, creditAdmission, syncTimberSpending, settlementRenown } from "./settlement"
import { buildingEntry } from "./building-rotation"
import { characterSupport } from "./character-support"
import { HOUSE_BEDS } from "./building-art/early-geometry"
import { DRINK_PRICE, MEAL_PRICE, servingHouses, tavernSeats } from "./tavern"
import { buildingStepAllowed, containsTile, shrineGates } from "./building-navigation"
import { relicHeading, shrineVisitRoute, shrineVisitPlan, shrineDonation } from "./shrine-visit"
import { BUILDING_KINDS, placementProblem, planBuilding } from "./buildings"
import { useBuildStore } from "./build-store"
import { BRIDGE_RISE } from "./map/bridges"
import { generateMap } from "./map/generate-map"
import { TILE_HEIGHT, type TerrainId } from "./map/terrain"
import { tileToWorldX, tileToWorldZ, worldToTileX, worldToTileZ, type GameMap } from "./map/types"
import { generateRelic, visitChance } from "./relic"
import { createSim, stepSim, GAME_DAY_SECONDS, type SimState } from "./sim"
import { DEFAULT_MOVEMENT, LINEAR_MOVEMENT } from "./motion"
import { preachingRegistry, stepMonkEvangelism, type EvangelizingMonk } from "./monk-evangelism"
import { createMonkRoutine } from "./monk-routine"
import { monkWander } from "./monk-wander"
import { createMonkNeeds } from "./monk-work"
import { generateMonks } from "./monks"
import { generateTravelers, TRAVELER_TYPES, type Traveler } from "./travelers"
import { treeResource, treeStage, STUMP_LIFETIME_DAYS, TIMBER_LOAD, stackWood, type WoodPile } from "./trees/timber"
import type { TreePlacement } from "./trees/placement"

function fixture() {
  const width = 30, depth = 18
  const map: GameMap = { width, depth, tiles: new Array<TerrainId>(width * depth).fill("grass"), buildings: [],
    road: Array.from({ length: width }, (_, x) => ({ x, z: 4 })),
    site: { junction: 10, branch: Array.from({ length: 5 }, (_, i) => ({ x: 10, z: 4 + i })),
      door: { x: 10, z: 8 }, hovelId: "hovel" } }
  for (const p of map.road!) map.tiles[p.z * width + p.x] = "path"
  for (const p of map.site!.branch.slice(1)) map.tiles[p.z * width + p.x] = "track"
  map.buildings.push({ id: "hovel", admissionFee: 0, label: "Shrine", x: 9, z: 9, w: 3, d: 3, height: 1, color: "tan", roofColor: "brown" })
  const trees: TreePlacement[] = Array.from({ length: 6 }, (_, i) => {
    const x = 16 + i % 3, z = 10 + Math.floor(i / 3)
    map.tiles[z * width + x] = "forest"
    return { x: tileToWorldX(map, x), y: TILE_HEIGHT, z: tileToWorldZ(map, z), species: "oak" }
  })
  const camp = planBuilding(map, map.buildings, "workshop", 13, 8, 0)!
  const traveler = (id: number, direction: 1 | -1 = 1): Traveler => ({
    id, name: `Traveler ${id}`, type: TRAVELER_TYPES.peasant, direction, pace: 1,
    offset: (10 - direction * 0.2) / (width - 1),
    attributes: { happiness: 80, age: 30, gold: 0, piety: 0, status: 100, hunger: 100, thirst: 100,
      stamina: 100, jobless: false, skills: [] },
  })
  return { map, camp, trees, traveler }
}

function run(sim: SimState, travelers: Traveler[], map: GameMap, seconds: number, stop = () => false) {
  for (let i = 0; i < seconds * 10 && !stop(); i++) stepSim(sim, travelers, map, 1.5, 0.1)
}

const obscure = { sanctity: 0, spectacle: 0, doubt: 100 }
/** The shrine no longer feeds anyone, so faith is what reliably draws a visitor. */
const holy = { sanctity: 100, spectacle: 0, doubt: 0 }
function devout(t: Traveler): Traveler {
  // Just short of complete devotion, so a visit can still raise it.
  t.attributes.piety = 99
  t.attributes.status = 0
  return t
}

function addCross(map: GameMap) {
  map.buildings.push({ ...BUILD_CATALOG.find(b => b.id === "cross")!, id: "cross-0", buildType: "cross", x: 13, z: 6 })
}

describe("cross evangelism", () => {
  it("gives otherwise uninterested travelers one independent 5% roll at the junction", () => {
    let persuaded = 0
    for (let id = 0; id < 1000; id++) {
      const { map, traveler } = fixture()
      addCross(map)
      const t = traveler(id, id % 2 === 0 ? 1 : -1)
      const sim = createSim([t], map, [], obscure)
      const s = sim.travelers.get(id)!
      expect(visitChance(t.attributes, obscure)).toBe(0)
      stepSim(sim, [t], map, 1.5, 0.2)
      expect(s.rolls).toBe(2)
      expect(s.piety).toBe(t.attributes.piety)
      if (s.activity === "toRelic") persuaded++
      else {
        expect(s.activity).toBe("walking")
        // No repeated chances while the same traveler is still at the junction.
        s.progress = map.site!.junction
        stepSim(sim, [t], map, 1.5, 0.01)
        expect(s.rolls).toBe(2)
      }
    }
    expect(persuaded).toBeGreaterThan(30)
    expect(persuaded).toBeLessThan(70)
  })

  it("does not roll evangelism when the ordinary visit roll succeeds", () => {
    const { map, traveler } = fixture()
    addCross(map)
    const t = devout(traveler(0))
    const sim = createEstablishedShrine([t], map, holy)
    stepSim(sim, [t], map, 1.5, 0.2)
    expect(sim.travelers.get(0)!.activity).toBe("toRelic")
    expect(sim.travelers.get(0)!.rolls).toBe(1)
  })

  it.each(["open", "unaffordable", "blocked"])("respects shrine access after persuasion: %s", access => {
    const { map, traveler } = fixture()
    addCross(map)
    // This traveler's second deterministic roll is about 2%, below Evangelism's 5%.
    const t = traveler(15)
    if (access === "unaffordable") map.buildings[0].admissionFee = 3
    if (access === "blocked") {
      const gate = shrineGates(map.buildings[0], map.site!.door)[0]
      Object.assign(map.buildings.at(-1)!, gate.outside)
    }
    const sim = createSim([t], map, [], obscure)
    stepSim(sim, [t], map, 1.5, 0.2)
    const s = sim.travelers.get(t.id)!
    expect(s.rolls).toBe(2)
    expect(s.activity).toBe((access === "open" || access === "unaffordable") ? "toRelic" : "walking")
    expect(s.admissionPaid).toBe(0)
  })

  it.each(["absent", "unfinished"])("does not give an extra roll for an %s cross", state => {
    const { map, traveler } = fixture()
    if (state === "unfinished") {
      addCross(map)
      map.buildings.at(-1)!.construction = { work: 0, required: 12 }
    }
    const t = traveler(0)
    const sim = createSim([t], map, [], obscure)
    stepSim(sim, [t], map, 1.5, 0.2)
    expect(sim.travelers.get(0)!.activity).toBe("walking")
    expect(sim.travelers.get(0)!.rolls).toBe(1)
  })
})

describe("monk evangelism at the junction", () => {
  afterEach(() => { preachingRegistry.current = null })
  function preacher(map: GameMap) {
    const monk: EvangelizingMonk = { ...createMonkRoutine(monkWander(map), 0, () => .5), ...createMonkNeeds(0) }
    for (let i = 0; i < 300 && monk.activity !== "preaching"; i++) stepMonkEvangelism(monk, map, true, 2, .1)
    expect(monk.activity).toBe("preaching")
    preachingRegistry.current = { road: map.road, monks: [monk] }
    return monk
  }

  it("persuades about 5% of uninterested travelers in both directions, once per pass", () => {
    const { map, traveler } = fixture()
    preacher(map)
    let persuaded = 0
    for (let id = 0; id < 1000; id++) {
      const t = traveler(id, id % 2 === 0 ? 1 : -1), sim = createSim([t], map, [], obscure)
      stepSim(sim, [t], map, 1.5, .2)
      const s = sim.travelers.get(id)!
      expect(s.rolls).toBe(2)
      if (s.activity === "toRelic") persuaded++
      else {
        s.progress = map.site!.junction
        stepSim(sim, [t], map, 1.5, .01)
        expect(s.rolls).toBe(2)
      }
    }
    expect(persuaded).toBeGreaterThan(30)
    expect(persuaded).toBeLessThan(70)
  })

  it.each(["open", "unaffordable", "blocked", "recalled"])("respects shrine access and recall: %s", access => {
    const { map, traveler } = fixture(), monk = preacher(map), t = traveler(15)
    if (access === "unaffordable") map.buildings[0].admissionFee = 3
    if (access === "blocked") {
      const gate = shrineGates(map.buildings[0], map.site!.door)[0]
      map.buildings.push({ ...BUILD_CATALOG.find(b => b.id === "cross")!, id: "obstacle", ...gate.outside })
    }
    if (access === "recalled") stepMonkEvangelism(monk, map, false, 2, .1)
    const sim = createSim([t], map, [], obscure)
    stepSim(sim, [t], map, 1.5, .2)
    expect(sim.travelers.get(t.id)!.activity).toBe((access === "open" || access === "unaffordable") ? "toRelic" : "walking")
    expect(sim.travelers.get(t.id)!.rolls).toBe(access === "recalled" ? 1 : 2)
  })
})

/** Guaranteed hospitality isolates the visit lifecycle from attraction rolls. */
function createEstablishedShrine(travelers: Traveler[], map: GameMap, stats = obscure) {
  const sim = createSim(travelers, map, [], stats)
  sim.balance = structuredClone(DEFAULT_BALANCE)
  sim.balance.rules.hospitalityBaseChance = 1
  sim.shrineRenown = sim.balance.rules.drawCap
  return sim
}

/**
 * A completed tavern with a keeper already at their post, so its counter can
 * serve. The keeper has no identity on the road, so `stepSim` never moves them.
 */
/** A completed house: where settlers sleep, and where their own hearth feeds them. */
function addHouse(map: GameMap, at = { x: 6, z: 9 }) {
  const def = BUILD_CATALOG.find(b => b.id === "house")!
  const house = { ...def, id: `house-${at.x}-${at.z}`, buildType: "house", label: def.label, ...at, rotation: 0 as const }
  map.buildings.push(house)
  return house
}

function staffTavern(sim: SimState, map: GameMap, at = { x: 13, z: 9 }) {
  const def = BUILD_CATALOG.find(b => b.id === "tavern")!
  const tavern = { ...def, id: "tavern-0", buildType: "tavern", label: def.label, ...at, rotation: 0 as const }
  map.buildings.push(tavern)
  sim.travelers.set(-1, { ...[...sim.travelers.values()][0], id: -1, employer: tavern.id,
    activity: "posted", tavernVisit: undefined, home: null,
    x: tileToWorldX(map, at.x + 1), z: tileToWorldZ(map, at.z + 1) })
  return tavern
}

describe("shrine hospitality", () => {
  it("earns more junction visits through shrine renown and completed visits", () => {
    const accepted = (renown: number, visits: number) => {
      let count = 0
      for (let id = 0; id < 40; id++) {
        const { map, traveler } = fixture()
        const t = traveler(id, id % 2 === 0 ? 1 : -1)
        t.attributes.hunger = 0
        t.attributes.gold = 10
        const sim = createSim([t], map, [], obscure)
        staffTavern(sim, map)
        sim.shrineRenown = renown
        sim.visits = visits
        run(sim, [t], map, 1)
        if (sim.travelers.get(id)!.activity === "toTavern") count++
      }
      return count
    }
    const early = accepted(0, 0)
    expect(early).toBeGreaterThan(0)
    expect(early).toBeLessThan(12)
    const established = accepted(DEFAULT_BALANCE.rules.drawCap, 0)
    expect(established).toBeGreaterThan(early * 2)
    expect(established).toBeLessThan(40)
    expect(accepted(0, DEFAULT_BALANCE.rules.drawCap / DEFAULT_BALANCE.rules.visitRenown)).toBe(established)
  })

  it.each([0, 1, 2, 3])("visitor %i enters free, prays, and can donate only at the exit box", (id) => {
    const { map, traveler } = fixture()
    const shrine = map.buildings[0]
    shrine.admissionFee = 999 // Obsolete saved fees must never affect a visit.
    const t = devout(traveler(id))
    t.attributes.gold = 10
    const sim = createEstablishedShrine([t], map, holy), s = sim.travelers.get(id)!
    run(sim, [t], map, 60, () => s.activity === "visiting")
    expect(s.activity).toBe("visiting")
    expect(s.gold).toBe(10)
    expect(sim.shrineGold).toBe(0)
    expect(sim.admissionPayments).toHaveLength(0)
    expect(containsTile(shrine, { x: worldToTileX(map, s.x), z: worldToTileZ(map, s.z) })).toBe(true)
    const { altar } = shrineLayout(shrine, map.site!.door)
    expect(relicHeading(map, s)).toBeCloseTo(Math.atan2(tileToWorldX(map, altar.x) - s.x, tileToWorldZ(map, altar.z) - s.z))
    run(sim, [t], map, 60, () => s.activity === "offering")
    expect(s.visits).toBe(1)
    expect(s.piety).toBeGreaterThan(t.attributes.piety)
    const { offering } = shrineStations(shrine, map.site!.door)
    expect(s.x).toBe(tileToWorldX(map, offering.x))
    expect(s.z).toBe(tileToWorldZ(map, offering.z))
    expect(s.gold).toBe(10)
    run(sim, [t], map, 30, () => s.activity === "walking")
    expect(s.activity).toBe("walking")
    expect(s.offeringMade).toBe(true)
    expect(s.gold + sim.shrineGold).toBe(10)
    expect(sim.shrineGold).toBeGreaterThanOrEqual(0)
    expect(sim.shrineGold).toBeLessThanOrEqual(10)
    expect(sim.admissionPayments).toHaveLength(sim.shrineGold > 0 ? 1 : 0)
    if (sim.shrineGold > 0) expect(sim.admissionPayments[0]).toMatchObject({ amount: sim.shrineGold,
      x: tileToWorldX(map, offering.x), z: tileToWorldZ(map, offering.z) })
    expect(s.shrineRoute).toBeNull()
    expect(t.attributes.gold).toBe(10)
  })

  it("welcomes penniless visitors and rewards their prayer without requiring a donation", () => {
    const { map, traveler } = fixture()
    map.buildings[0].admissionFee = 1000
    const t = devout(traveler(0))
    t.attributes.gold = 0
    const sim = createEstablishedShrine([t], map, holy), s = sim.travelers.get(0)!
    run(sim, [t], map, 60, () => s.offeringMade === true)
    expect(s.visits).toBe(1)
    expect(s.piety).toBeGreaterThan(t.attributes.piety)
    expect(s.gold).toBe(0)
    expect(sim.shrineGold).toBe(0)
    expect(sim.admissionPayments).toHaveLength(0)
  })

  it("makes voluntary gifts random, wallet-limited and larger on average at higher piety", () => {
    const totals = [0, 0]
    for (let i = 0; i < 1000; i++) {
      const rolls = [i / 1000, ((i * 37) % 1000) / 1000]
      for (const [index, piety] of [5, 95].entries()) {
        let cursor = 0
        totals[index] += shrineDonation(piety, 100, () => rolls[cursor++])
      }
    }
    expect(totals[0]).toBeGreaterThan(0)
    expect(totals[1]).toBeGreaterThan(totals[0] * 4)
    expect(shrineDonation(100, 100, () => .99)).toBe(0)
    expect(shrineDonation(100, 0, () => 0)).toBe(0)
    expect(shrineDonation(100, 2, () => .8)).toBe(2)
  })

  it("credits donation receipts once across spending and clears them for a new world", () => {
    const initial = createSettlement()
    expect(initial.shrineAdmission).toBe(0)
    const paid = creditAdmission(initial, 6)
    expect(paid.resources.gold).toBe(initial.resources.gold + 6)
    const spent = { ...paid, resources: { ...paid.resources, gold: 0 } }
    expect(creditAdmission(spent, 6)).toBe(spent)
    expect(creditAdmission(spent, 8).resources.gold).toBe(2)
    const { map } = fixture()
    const sim = createSim([], map)
    sim.shrineGold = 6
    useBuildStore.getState().syncResources(sim)
    expect(useBuildStore.getState().shrineGold).toBe(6)
    useBuildStore.getState().reset()
    expect(useBuildStore.getState().shrineGold).toBe(0)
    expect(createSettlement().collectedAdmission).toBe(0)
  })

  it.each([LINEAR_MOVEMENT, DEFAULT_MOVEMENT])("keeps shrine visitors on opposite sides in both directions (%j)", (movement) => {
    const { map, traveler } = fixture()
    const travelers = [traveler(0), traveler(1)]
    const sim = createEstablishedShrine(travelers, map)
    for (const [index, s] of [...sim.travelers.values()].entries()) {
      s.activity = index === 0 ? "toRelic" : "fromRelic"
      s.branchProgress = 2
      s.lane = (index === 0 ? 1 : -1) * s.laneOffset
    }
    for (let tick = 0; tick < 10; tick++) {
      stepSim(sim, travelers, map, 1, 0.1, movement)
      for (const [index, s] of [...sim.travelers.values()].entries()) {
        const direction = index === 0 ? 1 : -1
        expect((s.x - tileToWorldX(map, 10)) * direction).toBeCloseTo(s.laneOffset)
      }
    }
  })

  it.each([1, -1] as const)("keeps lane changes continuous through a complete shrine visit (road direction %i)", (direction) => {
    const { map, traveler } = fixture()
    const t = devout(traveler(0, direction))
    const sim = createEstablishedShrine([t], map, holy)
    const s = sim.travelers.get(0)!
    let returning = false
    let rejoined = false
    for (let tick = 0; tick < GAME_DAY_SECONDS / 2 / 0.01; tick++) {
      const before = { x: s.x, z: s.z }
      stepSim(sim, [t], map, 1, 0.01, DEFAULT_MOVEMENT)
      expect(Math.hypot(s.x - before.x, s.z - before.z)).toBeLessThan(0.025)
      returning ||= s.activity === "fromRelic"
      if (returning && s.activity === "walking") {
        expect(s.x).toBeCloseTo(tileToWorldX(map, 10))
        expect(s.z).toBeCloseTo(tileToWorldZ(map, 4) - direction * s.laneOffset)
        stepSim(sim, [t], map, 1, 0.01, DEFAULT_MOVEMENT)
        expect(s.z).toBeCloseTo(tileToWorldZ(map, 4) - direction * s.laneOffset)
        rejoined = true
        break
      }
    }
    expect(rejoined).toBe(true)
  })

  for (const need of ["hunger", "thirst"] as const) {
    for (const direction of [1, -1] as const) {
      it(`draws a traveler with empty ${need} from direction ${direction} to the counter, fills them for coin and returns them`, () => {
        const { map, traveler } = fixture()
        const t = traveler(0, direction)
        t.attributes[need] = 0
        t.attributes.gold = 10
        const sim = createEstablishedShrine([t], map)
        const tavern = staffTavern(sim, map)
        const s = sim.travelers.get(t.id)!
        const identity = structuredClone(t)
        run(sim, [t], map, 1)
        expect(s.activity).toBe("toTavern")
        expect(s.tavernVisit!.plan.buildingId).toBe(tavern.id)
        run(sim, [t], map, 120, () => s.activity === "sitting")
        expect(s.activity).toBe("sitting")
        // Paid for at the counter, then carried to an authored bench place.
        expect(s[need]).toBeGreaterThan(95)
        expect(s.gold).toBeLessThan(10)
        expect(sim.tradeGold).toBe(10 - s.gold)
        expect(sim.tradeGold).toBeGreaterThan(0)
        expect(containsTile(tavern, { x: worldToTileX(map, s.x), z: worldToTileZ(map, s.z) })).toBe(true)
        // The shrine itself neither feeds nor takes any of this.
        expect(sim.visits).toBe(0)
        expect(sim.shrineGold).toBe(0)
        run(sim, [t], map, 240, () => s.activity === "walking")
        expect(s.activity).toBe("walking")
        expect(s.tavernVisit).toBeUndefined()
        expect(s.direction).toBe(direction)
        expect(t).toEqual(identity)
      })
    }
  }

  it("notices a junction even when a fast step skips its tile", () => {
    const { map, traveler } = fixture()
    const t = devout(traveler(0))
    t.offset = 8.5 / 29
    const sim = createEstablishedShrine([t], map, holy)
    stepSim(sim, [t], map, 5, 1)
    expect(sim.travelers.get(0)!.activity).toBe("toRelic")
  })

  it("keeps faith relevant and limits early hospitality to desperate needs", () => {
    const { traveler } = fixture()
    const a = traveler(0).attributes
    const holy = { sanctity: 95, spectacle: 40, doubt: 15 }
    expect(visitChance({ ...a, piety: 100 }, holy)).toBeGreaterThan(visitChance(a, holy))
    expect(visitChance({ ...a, hunger: 0 }, obscure)).toBe(0.1)
    expect(visitChance({ ...a, hunger: 0 }, obscure, DEFAULT_BALANCE.rules.drawCap)).toBeCloseTo(0.6)
    expect(visitChance({ ...a, thirst: 35 }, obscure)).toBe(0)
  })

  it.each([1, -1] as const)("does not turn desperate travelers back toward the shrine (direction %i)", (direction) => {
    const { map, traveler } = fixture()
    const t = traveler(0, direction)
    t.offset = (map.site!.junction + direction * 2) / (map.road!.length - 1)
    t.attributes.thirst = 10
    const sim = createEstablishedShrine([t], map)
    const s = sim.travelers.get(t.id)!
    const before = s.progress
    run(sim, [t], map, 1)
    expect((s.progress - before) * direction).toBeGreaterThan(0)
    expect(s.activity).toBe("walking")
    expect(s.direction).toBe(direction)
  })

  it("does not lure ordinary passersby with a job vacancy or moderate needs", () => {
    for (let id = 0; id < 40; id++) {
      const { map, camp, trees, traveler } = fixture()
      const t = traveler(id, id % 2 === 0 ? 1 : -1)
      Object.assign(t.attributes, { jobless: true, hunger: 35, thirst: 35 })
      const sim = createSim([t], map, [], obscure)
      sim.buildings = [camp]
      sim.trees = trees
      sim.shrineRenown = 20
      run(sim, [t], map, 1)
      const s = sim.travelers.get(id)!
      expect(s.activity).toBe("walking")
      expect((s.progress - map.site!.junction) * t.direction).toBeGreaterThan(0)
    }
  })

  it("earns more actual visits on generated worlds as the shrine becomes known", () => {
    let early = 0, established = 0
    for (const seed of [1, 42, 12345]) {
      const map = generateMap({ seed })
      const travelers = generateTravelers(seed, 30)
      const relic = generateRelic(seed)
      for (const known of [false, true]) {
        const sim = createSim(travelers, map, [], relic.stats)
        sim.shrineRenown = known ? DEFAULT_BALANCE.rules.drawCap : settlementRenown(map, generateMonks(seed), [relic]).total
        run(sim, travelers, map, 240)
        if (known) established += sim.visits
        else early += sim.visits
      }
    }
    expect(established).toBeGreaterThan(early)
    expect(early).toBeLessThan(9) // Under one visit per ten initial passersby across these worlds.
    // Three generated worlds, twice over: slow, but the only end-to-end check.
  }, 30000)
})

describe("woodcutter huts", () => {
  it("returns a homeless settler to their workplace after camping", () => {
    const { map, camp, traveler } = fixture(), t = traveler(0)
    map.buildings.push(camp)
    const sim = createSim([t], map), s = sim.travelers.get(0)!
    sim.buildings = jobBuildings(map)
    const entry = buildingEntry(camp)
    Object.assign(s, { employer: camp.id, home: null, activity: "idle", stamina: 0,
      x: tileToWorldX(map, entry.x), z: tileToWorldZ(map, entry.z) })
    run(sim, [t], map, 120, () => s.activity === "camping")
    expect(s.activity).toBe("camping")
    run(sim, [t], map, 120, () => s.activity === "fromCamp")
    expect(s.activity).toBe("fromCamp")
    run(sim, [t], map, 120, () => s.activity !== "fromCamp")
    expect(s.activity).toBe("idle")
    expect(s.employer).toBe(camp.id)
    expect(s.x).toBeCloseTo(tileToWorldX(map, entry.x))
    expect(s.z).toBeCloseTo(tileToWorldZ(map, entry.z))
    expect(s.spot).toBeNull()
    expect(s.offRoadRoute).toBeNull()
  })

  it.each(["hunger", "thirst", "stamina"] as const)("keeps a settled builder assigned through completion with depleted %s", need => {
    for (const atWork of [false, true]) {
      const { map, camp, traveler } = fixture()
      const t = traveler(0), sim = createSim([t], map), actor = sim.travelers.get(0)!
      const site = { ...camp, id: "construction-site", x: 5, z: 6, construction: { work: 0, required: 96 } }
      map.buildings.push(camp, site)
      addHouse(map)
      sim.buildings = [camp]
      actor.employer = camp.id
      actor.activity = "idle"
      actor.x = tileToWorldX(map, camp.x); actor.z = tileToWorldZ(map, camp.z + camp.d)
      stepSim(sim, [t], map, 1.5, 0.1)
      expect(actor.activity).toBe("toBuild")
      if (atWork) {
        run(sim, [t], map, 60, () => actor.activity === "building")
        expect(actor.activity).toBe("building")
      }
      const task = actor.buildingTask
      actor[need] = 0
      for (let i = 0; i < 1500 && site.construction.work < site.construction.required; i++) {
        stepSim(sim, [t], map, 1.5, 0.1)
        expect(actor.buildingTask).toBe(task)
        expect(["toBuild", "building"]).toContain(actor.activity)
      }
      expect(site.construction.work).toBe(site.construction.required)
      run(sim, [t], map, 60, () => actor.activity === "idle")
      expect(actor.activity).toBe("idle")
      expect(actor.buildingTask).toBeUndefined()
      // Only once the site is finished do they go home, where the household's
      // own hearth restores them. The shrine keeps no table any more.
      const depleted = actor[need]
      run(sim, [t], map, 600, () => actor[need] > depleted)
      expect(["toHome", "sleeping"]).toContain(actor.activity)
      expect(actor[need]).toBeGreaterThan(depleted)
    }
  })

  it("sends an idle settled worker to build, then returns them to camp", () => {
    const { map, camp, traveler } = fixture()
    const t = traveler(0), sim = createSim([t], map), actor = sim.travelers.get(0)!
    const site = { ...camp, id: "construction-site", x: 5, z: 6, construction: { work: 0, required: 2 } }
    map.buildings.push(camp, site)
    sim.buildings = [camp]
    actor.employer = camp.id
    actor.activity = "idle"
    actor.x = tileToWorldX(map, camp.x); actor.z = tileToWorldZ(map, camp.z + camp.d)
    stepSim(sim, [t], map, 1.5, 0.1)
    expect(actor.activity).toBe("toBuild")
    expect(site.construction.work).toBe(0)
    run(sim, [t], map, 60, () => actor.activity === "fromBuild")
    expect(site.construction.work).toBe(2)
    run(sim, [t], map, 60, () => actor.activity === "idle")
    expect(actor.x).toBeCloseTo(tileToWorldX(map, camp.x))
    expect(actor.z).toBeCloseTo(tileToWorldZ(map, camp.z + camp.d))
    expect(actor.employer).toBe(camp.id)
  })

  it.each(["none", "hunger", "thirst", "stamina"] as const)(
    "only rests after a delivery when needs are low (low need: %s)", (need) => {
      const { map, trees, camp, traveler } = fixture()
      const t = traveler(0)
      const sim = createSim([t], map)
      map.buildings.push(camp)
      addHouse(map)
      sim.buildings = [camp]
      sim.trees = [trees[0]]
      const resource = treeResource(trees[0], 0, map.seed)
      resource.health = 0
      resource.remainingWood -= TIMBER_LOAD
      sim.treeResources.set(0, resource)
      sim.felled.add(0)
      const s = sim.travelers.get(0)!
      s.employer = camp.id
      s.activity = "hauling"
      s.workRoute = [{ x: camp.x, z: camp.z + camp.d }]
      s.carrying = TIMBER_LOAD
      s.hunger = s.thirst = s.stamina = 60
      if (need !== "none") s[need] = 40

      stepSim(sim, [t], map, 1.5, 0.1)

      expect(sim.wood).toBe(TIMBER_LOAD)
      expect([...sim.piles.values()].reduce((sum, pile) => sum + pile.wood, 0)).toBe(TIMBER_LOAD)
      expect(s.carrying).toBe(0)
      expect(s.gold).toBe(1)
      if (need === "none") {
        expect(s.activity).toBe("toWork")
        expect(s.tree).toBe(0)
        expect(Math.max(s.hunger, s.thirst, s.stamina)).toBeLessThan(60)
      } else {
        expect(s.activity).toBe("idle")
        expect(s.tree).toBeNull()
        // They go home to sleep and eat before taking on another tree.
        run(sim, [t], map, 600, () => s.activity === "toWork")
        expect(s.activity).toBe("toWork")
        expect(Math.min(s.hunger, s.thirst, s.stamina)).toBeGreaterThanOrEqual(80)
      }
      run(sim, [t], map, GAME_DAY_SECONDS / 4, () => sim.wood > TIMBER_LOAD)
      expect(sim.wood).toBe(2 * TIMBER_LOAD)
      expect(resource.remainingWood + s.carrying + sim.wood).toBe(resource.wood)
    },
  )

  it("waits at camp when a delivery leaves no more timber to collect", () => {
    const { map, camp, traveler } = fixture()
    const t = traveler(0)
    const sim = createSim([t], map)
    sim.buildings = [camp]
    const s = sim.travelers.get(0)!
    s.employer = camp.id
    s.activity = "hauling"
    s.workRoute = [{ x: camp.x, z: camp.z + camp.d }]
    s.carrying = TIMBER_LOAD

    stepSim(sim, [t], map, 1.5, 0.1)
    run(sim, [t], map, 10)

    expect(s.activity).toBe("idle")
    expect(s.tree).toBeNull()
    expect(s.carrying).toBe(0)
    expect(sim.wood).toBe(TIMBER_LOAD)
    expect(s.gold).toBe(1)
  })

  it("waits for a walking Ent to replant before claiming it for timber", () => {
    const { map, trees, camp, traveler } = fixture()
    const t = traveler(0)
    const sim = createSim([t], map)
    sim.buildings = [camp]
    sim.trees = [{ ...trees[0], walking: true }]
    const worker = sim.travelers.get(0)!
    worker.employer = camp.id
    worker.activity = "idle"
    worker.timer = 0
    run(sim, [t], map, 5)
    expect(worker.tree).toBeNull()
    expect(sim.treeResources.size).toBe(0)
    sim.trees[0].walking = false
    worker.timer = 0
    run(sim, [t], map, 5, () => worker.tree !== null)
    expect(worker.tree).toBe(0)
    expect(sim.treeResources.has(0)).toBe(true)
  })


  it("purchases a working hut and credits deliveries once, even after spending wood", () => {
    const { map, trees, traveler } = fixture()
    const before = createSettlement()
    const bought = purchaseStructure(before, map, [], [], "workshop", { x: 13, z: 8 })
    expect(bought.error).toBeNull()
    expect(bought.settlement.resources).toEqual({ gold: 140, wood: 115 })
    const blocked = purchaseStructure(before, map, [], [], "workshop", { x: 0, z: 8 })
    expect(blocked.error).toBeTruthy()
    expect(blocked.settlement).toBe(before)
    bought.settlement.structures[0].construction!.work = bought.settlement.structures[0].construction!.required
    const builtMap = { ...map, buildings: [...map.buildings, ...bought.settlement.structures] }
    addHouse(builtMap)
    const t = devout(traveler(0))
    t.attributes.jobless = true
    const sim = createEstablishedShrine([t], builtMap, holy)
    sim.buildings = woodcutterHuts(builtMap)
    sim.trees = trees
    syncTimberSpending(sim, bought.settlement.spentWood)
    run(sim, [t], builtMap, 450, () => sim.wood > 0)
    expect(sim.travelers.get(0)!.employer).toBe(bought.settlement.structures[0].id)
    expect(sim.wood).toBeGreaterThan(0)
    const credited = creditTimber(bought.settlement, sim.wood)
    expect(credited.resources.wood).toBe(115 + sim.wood)
    expect(creditTimber(credited, sim.wood)).toBe(credited)
    const garden = purchaseStructure(credited, map, [], [], "garden", { x: 7, z: 8 }).settlement
    expect(garden.resources.wood).toBe(credited.resources.wood - 10)
    expect(creditTimber(garden, sim.wood)).toBe(garden)
    const totalDelivered = sim.wood
    syncTimberSpending(sim, garden.spentWood)
    const stock = () => Array.from(sim.piles.values()).reduce((sum, p) => sum + p.wood, 0)
    expect(stock()).toBe(Math.max(0, totalDelivered - 10))
    syncTimberSpending(sim, garden.spentWood)
    expect(stock()).toBe(Math.max(0, totalDelivered - 10))
    expect(sim.wood).toBe(totalDelivered)
    expect(creditTimber(garden, sim.wood + 7).resources.wood).toBe(garden.resources.wood + 7)
    useBuildStore.getState().syncResources(sim, [t])
    const residents = useBuildStore.getState().settlers
    expect(residents).toHaveLength(1)
    expect(settlementRenown(builtMap, residents, [], DEFAULT_BALANCE, sim.visits).individuals).toBeGreaterThan(0)
    useBuildStore.getState().reset()
  })

  it("uses shrine visit renown for unlocks and revalues it with live tuning", () => {
    const { map } = fixture()
    const relic = generateRelic(42)
    const balance = structuredClone(DEFAULT_BALANCE)
    balance.rules.visitRenown = 2
    const without = settlementRenown(map, [], [relic], balance)
    const withVisits = settlementRenown(map, [], [relic], balance, 20)
    expect(withVisits.total - without.total).toBe(40)
    expect(withVisits.relics).toBe(without.relics)
    expect(relic.stats).not.toHaveProperty("renown")
    const locked = purchaseStructure(createSettlement(), map, [], [], "hall", { x: 12, z: 12 }, balance)
    expect(locked.error).toMatch(/renown/)
    const unlocked = purchaseStructure(createSettlement(), map, [], [], "hall", { x: 12, z: 12 }, balance, 20)
    expect(unlocked.error).toBeNull()
  })

  it("hires unskilled visitors up to capacity, cuts each tree once and delivers wood", () => {
    const { map, trees, camp, traveler } = fixture()
    // Use the full shrine footprint so the arrival wave has enough prayer seats.
    map.buildings[0].d = 5
    expect(camp).not.toBeNull()
    map.tiles[10 * map.width + 15] = "water"
    const travelers = Array.from({ length: 12 }, (_, id) => {
      const t = devout(traveler(id))
      t.attributes.jobless = true
      return t
    })
    // Three hires need beds; a house sleeps two.
    addHouse(map)
    addHouse(map, { x: 6, z: 12 })
    const sim = createEstablishedShrine(travelers, map, holy)
    sim.buildings = [camp]
    sim.trees = trees
    let maxWorkers = 0
    let sawWorking = false
    let sawHauling = false
    const expectedWood = trees.reduce((sum, tree, index) => sum + treeResource(tree, index, map.seed).wood, 0)
    // Taller trunks need more hauling trips; wait for delivery within a bounded run.
    for (let i = 0; i < 10 * GAME_DAY_SECONDS / 0.1 && sim.wood < expectedWood; i++) {
      stepSim(sim, travelers, map, 1.5, 0.1)
      const workers = Array.from(sim.travelers.values()).filter((s) => s.employer)
      maxWorkers = Math.max(maxWorkers, workers.length)
      expect(workers.length).toBeLessThanOrEqual(BUILDING_KINDS.workshop.jobs)
      const reserved = workers.flatMap((s) => s.tree === null ? [] : [s.tree])
      expect(new Set(reserved).size).toBe(reserved.length)
      for (const worker of workers) {
        expect(worker.jobless).toBe(false)
        sawWorking ||= worker.activity === "working"
        sawHauling ||= worker.activity === "hauling" && worker.carrying > 0
        const x = worldToTileX(map, worker.x), z = worldToTileZ(map, worker.z)
        expect(map.tiles[z * map.width + x]).not.toBe("water")
      }
    }
    expect(maxWorkers).toBe(3)
    expect(sawWorking && sawHauling).toBe(true)
    expect(sim.felled.size).toBe(trees.length)
    expect(sim.wood).toBe(expectedWood)
    expect(Array.from(sim.piles.values()).reduce((sum, pile) => sum + pile.wood, 0)).toBe(sim.wood)
    expect(Array.from(sim.travelers.values()).filter((s) => s.employer)).toHaveLength(3)
    // Ten game days of felling, hauling and nights at home.
  }, 30000)

  it("delivers harvested wood to a storehouse without moving the worker’s job", () => {
    const { map, camp, trees, traveler } = fixture()
    const t = traveler(0)
    map.buildings.push(camp, { ...camp, id: "storehouse-1", buildType: "storehouse", x: 13, z: 12 })
    const sim = createSim([t], map)
    sim.buildings = woodcutterHuts(map)
    sim.trees = [trees[0]]
    const s = sim.travelers.get(t.id)!
    s.employer = camp.id
    s.activity = "idle"
    s.timer = 0
    s.x = tileToWorldX(map, camp.x)
    s.z = tileToWorldZ(map, camp.z + camp.d)
    run(sim, [t], map, 300, () => sim.wood > 0)
    expect(sim.wood).toBeGreaterThan(0)
    expect(s.employer).toBe(camp.id)
    expect([...sim.piles.values()].every(p => p.campId === "storehouse-1")).toBe(true)
    expect([...sim.piles.values()].reduce((n, p) => n + p.wood, 0)).toBe(sim.wood)
  })

  it("does not recruit employed travelers", () => {
    const { map, trees, camp, traveler } = fixture()
    const t = devout(traveler(0))
    const sim = createEstablishedShrine([t], map, holy)
    sim.buildings = [camp]
    sim.trees = trees
    run(sim, [t], map, 120)
    expect(sim.visits).toBeGreaterThan(0)
    expect(sim.travelers.get(0)!.employer).toBeNull()
    expect(sim.wood).toBe(0)
  })

  it("rejects water, off-map footprints, occupied ground, remote woods and disconnected entrances", () => {
    const { map, camp } = fixture()
    expect(placementProblem(map, map.buildings, "workshop", 13, 8)).toBeNull()
    expect(placementProblem(map, [...map.buildings, camp], "workshop", 14, 8)).toBe("occupied")
    // The road and its track are ordinary ground; walkers go around a footprint.
    expect(placementProblem(map, map.buildings, "workshop", 10, 4)).toBeNull()
    expect(placementProblem(map, map.buildings, "workshop", 29, 17)).toBe("terrain")
    expect(placementProblem(map, map.buildings, "workshop", 0, 0)).toBe("noWoods")
    map.tiles[8 * map.width + 13] = "water"
    expect(placementProblem(map, map.buildings, "workshop", 13, 8)).toBe("terrain")
    map.tiles[8 * map.width + 13] = "grass"
    for (let z = 0; z < map.depth; z++) map.tiles[z * map.width + 12] = "water"
    expect(placementProblem(map, map.buildings, "workshop", 13, 8)).toBe("access")
  })

  it("rejects woods stranded across water even within the work radius", () => {
    const { map } = fixture()
    for (let z = 9; z <= 12; z++) {
      for (let x = 15; x <= 19; x++) {
        if (x === 15 || x === 19 || z === 9 || z === 12) map.tiles[z * map.width + x] = "water"
      }
    }
    expect(placementProblem(map, map.buildings, "workshop", 12, 8)).toBe("noWoods")
  })

  it("clears simulation snapshots, cut trees and the tool for a new world", () => {
    const { map, traveler } = fixture()
    const store = useBuildStore.getState()
    store.syncResources(createSim([traveler(0)], map))
    store.setTool("workshop")
    store.setFelled(new Set([1]))
    store.reset()
    expect(useBuildStore.getState()).toMatchObject({ simulation: null, settlers: [], wood: 0, visits: 0, tool: null })
    expect(useBuildStore.getState().felled.size).toBe(0)
  })
})


describe("houses, counters and posts", () => {
  it.each([
    { hunger: 40, thirst: 0, gold: MEAL_PRICE, served: "thirst", price: DRINK_PRICE },
    { hunger: 0, thirst: 40, gold: MEAL_PRICE, served: "hunger", price: MEAL_PRICE },
    { hunger: 0, thirst: 0, gold: DRINK_PRICE, served: "thirst", price: DRINK_PRICE },
    { hunger: 0, thirst: 40, gold: DRINK_PRICE, served: "thirst", price: DRINK_PRICE },
    { hunger: 100, thirst: 0, gold: DRINK_PRICE, served: "thirst", price: DRINK_PRICE },
  ] as const)("serves $served first with hunger $hunger, thirst $thirst and $gold gold", ({ hunger, thirst, gold, served, price }) => {
    const { map, traveler } = fixture()
    const t = traveler(0)
    Object.assign(t.attributes, { hunger, thirst, gold })
    const sim = createEstablishedShrine([t], map)
    staffTavern(sim, map)
    const s = sim.travelers.get(t.id)!
    run(sim, [t], map, 200, () => s.activity === "sitting")
    expect(s.activity).toBe("sitting")
    expect(s[served]).toBeGreaterThan(95)
    const other = served === "thirst" ? "hunger" : "thirst"
    expect(s[other]).toBeLessThanOrEqual(t.attributes[other])
    expect(s.gold).toBe(gold - price)
    expect(sim.tradeGold).toBe(price)
  })

  it.each([1, -1] as const)("serves travelers at an independent town in direction %s without paying the player", direction => {
    const { map, traveler } = fixture()
    // An ordinary paid counter, operated locally from the start.
    const def = BUILD_CATALOG.find(b => b.id === "tavern")!
    const tavern = { ...def, id: "town-tavern", owner: "independent" as const, townId: "town",
      buildType: "tavern", x: 13, z: 9, rotation: 0 as const }
    map.buildings.push(tavern)
    map.towns = [{ id: "town", name: "Alderford", junction: 10, tavernId: tavern.id, buildingIds: [tavern.id] }]
    const t = traveler(0, direction)
    Object.assign(t.attributes, { hunger: 40, thirst: 40, gold: 10 })
    const sim = createSim([t], map, [], obscure)
    const s = sim.travelers.get(t.id)!
    sim.travelers.set(-1, { ...s, id: -1, employer: tavern.id, activity: "posted" })
    run(sim, [t], map, 200, () => s.activity === "sitting")
    expect(s.activity).toBe("sitting")
    expect(s.hunger).toBeGreaterThan(90)
    expect(s.thirst).toBeGreaterThan(90)
    expect(s.gold).toBe(10 - MEAL_PRICE - DRINK_PRICE)
    expect(sim.tradeGold).toBe(0)
    expect(sim.shrineGold).toBe(0)
    expect(sim.visits).toBe(0)
    expect(s.employer).toBeNull()
    run(sim, [t], map, 200, () => s.activity === "walking")
    expect(s.activity).toBe("walking")
    expect(s.direction).toBe(direction)
    expect(s.tavernVisit).toBeUndefined()
  })

  it("seats a customer on an authored bench and pays the settlement, not the shrine", () => {
    const { map, traveler } = fixture()
    const t = traveler(0)
    t.attributes.hunger = 0
    t.attributes.gold = 10
    const sim = createEstablishedShrine([t], map)
    const tavern = staffTavern(sim, map)
    const s = sim.travelers.get(0)!
    run(sim, [t], map, 200, () => s.activity === "sitting")
    expect(s.activity).toBe("sitting")
    const bench = characterSupport(map, s.x, s.z, "sitting")
    expect(bench?.id).toBe(s.tavernVisit!.plan.seat!.id)
    expect(tavernSeats(map, tavern).map(seat => seat.id)).toContain(bench!.id)
    expect(sim.tradeGold).toBe(MEAL_PRICE)
    expect(s.gold).toBe(10 - MEAL_PRICE)
    expect(sim.shrineGold).toBe(0)
  })

  it("keeps one table per customer and leaves the penniless on the road", () => {
    const { map, traveler } = fixture()
    const people = Array.from({ length: 8 }, (_, id) => {
      const t = traveler(id, id % 2 === 0 ? 1 : -1)
      t.attributes.hunger = 0
      t.attributes.gold = id === 7 ? 0 : 10
      return t
    })
    const sim = createEstablishedShrine(people, map)
    const tavern = staffTavern(sim, map)
    run(sim, people, map, 200, () => [...sim.travelers.values()].filter(s => s.activity === "sitting").length === tavernSeats(map, tavern).length)
    const seated = [...sim.travelers.values()].filter(s => s.activity === "sitting")
    expect(seated).toHaveLength(tavernSeats(map, tavern).length)
    expect(new Set(seated.map(s => s.tavernVisit!.plan.seat!.id)).size).toBe(seated.length)
    // Nobody without the price of a meal turns off the road for one.
    expect(sim.travelers.get(7)!.tavernVisit).toBeUndefined()
  })

  it("does not draw anyone to a tavern with nobody behind the counter", () => {
    const { map, traveler } = fixture()
    const t = traveler(0)
    t.attributes.hunger = 0
    t.attributes.gold = 10
    const sim = createEstablishedShrine([t], map)
    const def = BUILD_CATALOG.find(b => b.id === "tavern")!
    map.buildings.push({ ...def, id: "tavern-0", buildType: "tavern", label: def.label, x: 13, z: 9, rotation: 0 })
    const s = sim.travelers.get(0)!
    run(sim, [t], map, 30)
    // They stay on the road, hunting a vendor as they would with no tavern at all.
    expect(["walking", "seeking"]).toContain(s.activity)
    expect(s.tavernVisit).toBeUndefined()
    expect(sim.tradeGold).toBe(0)
  })

  it("takes both tavern posts and both places in the fold, one settler each", () => {
    for (const type of ["tavern", "sheep-pen"] as const) {
      const { map, traveler } = fixture()
      const def = BUILD_CATALOG.find(b => b.id === type)!
      const place = { ...def, id: `${type}-0`, buildType: type, label: def.label, x: 13, z: 9, rotation: 0 as const }
      map.buildings.push(place)
      addHouse(map)
      const people = Array.from({ length: 4 }, (_, id) => {
        const t = devout(traveler(id))
        t.attributes.jobless = true
        return t
      })
      const sim = createEstablishedShrine(people, map, holy)
      sim.buildings = jobBuildings(map)
      run(sim, people, map, 400, () => [...sim.travelers.values()].filter(s => s.activity === "posted").length === 2)
      const staff = [...sim.travelers.values()].filter(s => s.employer === place.id)
      expect(staff).toHaveLength(2)
      useBuildStore.getState().syncResources(sim, people)
      expect(useBuildStore.getState().settlers.map(resident => resident.duty)).toEqual(
        staff.map(worker => SETTLEMENT_JOBS[settlementJob(worker.employer, sim.buildings)!].label))
      expect(staff.map(worker => settlementJob(worker.employer, sim.buildings))).toEqual(
        [type === "tavern" ? "tavern" : "shepherd", type === "tavern" ? "tavern" : "shepherd"])
      expect(new Set(staff.map(s => s.jobSlot))).toEqual(new Set([0, 1]))
      for (const worker of staff) {
        expect(worker.jobless).toBe(false)
        // Every post stands inside its own building, not on the doorstep.
        expect(containsTile(place, { x: worldToTileX(map, worker.x), z: worldToTileZ(map, worker.z) })).toBe(true)
      }
    }
  }, 20000)

  it("gives each settler their own bed and moves the next one into the next house", () => {
    const { map, camp, trees, traveler } = fixture()
    map.buildings.push(camp)
    addHouse(map)
    addHouse(map, { x: 6, z: 12 })
    const people = Array.from({ length: 4 }, (_, id) => {
      const t = devout(traveler(id))
      t.attributes.jobless = true
      return t
    })
    const sim = createEstablishedShrine(people, map, holy)
    sim.buildings = jobBuildings(map)
    sim.trees = trees
    run(sim, people, map, 400, () => [...sim.travelers.values()].filter(s => s.home).length === 3)
    const settled = [...sim.travelers.values()].filter(s => s.home)
    expect(settled.length).toBe(3)
    // Two beds to a house, so the third settler goes to the second house.
    const byHouse = new Map<string, number>()
    for (const s of settled) byHouse.set(s.home!, (byHouse.get(s.home!) ?? 0) + 1)
    expect([...byHouse.values()].every(count => count <= HOUSE_BEDS)).toBe(true)
    expect(byHouse.size).toBe(2)
  }, 20000)

  it.each([0, 4, 8])("parks vendor %s's transport before they keep an empty market stall", id => {
    const { map } = fixture()
    const def = BUILD_CATALOG.find(b => b.id === "market")!
    const stall = { ...def, id: "market-0", buildType: "market", label: def.label, x: 13, z: 6, rotation: 0 as const }
    map.buildings.push(stall)
    addHouse(map, { x: 6, z: 12 })
    const vendor: Traveler = {
      id, name: "Vendor", type: TRAVELER_TYPES.vendor, direction: 1, pace: 1, offset: 8 / 29,
      attributes: { happiness: 80, age: 30, gold: 60, piety: 0, status: 20, hunger: 100, thirst: 100, stamina: 100, jobless: false, skills: ["haggling"] },
    }
    const sim = createSim([vendor], map, [], obscure)
    sim.buildings = jobBuildings(map)
    const s = sim.travelers.get(id)!
    run(sim, [vendor], map, 300, () => s.activity === "posted")
    expect(s.employer).toBe(stall.id)
    expect(s.activity).toBe("posted")
    expect(s.convoy).toBe(false)
    expect(s.marketParking?.walking).toBe(true)
    const parked = structuredClone(s.marketParking!.pose)
    run(sim, [vendor], map, 30)
    expect(s.marketParking!.pose).toEqual(parked)
    expect(Math.hypot(s.x - parked.hitch.x, s.z - parked.hitch.z)).toBeGreaterThan(1)
    expect(containsTile(stall, { x: worldToTileX(map, s.x), z: worldToTileZ(map, s.z) })).toBe(true)
    // A kept stall is a counter: it serves food and drink like the tavern.
    expect(servingHouses(map, b => [...sim.travelers.values()].some(w => w.employer === b.id && w.activity === "posted")))
      .toEqual([stall])
  }, 20000)

  it.each([1, -1] as const)("lets hungry travelers pass a settled vendor instead of chasing their old road position (direction %i)", direction => {
    const { map, traveler } = fixture()
    const def = BUILD_CATALOG.find(b => b.id === "market")!
    const stall = { ...def, id: "market-0", buildType: "market", x: 13, z: 6, rotation: 0 as const }
    map.buildings.push(stall)
    addHouse(map, { x: 6, z: 12 })
    const vendor = { ...traveler(4), type: TRAVELER_TYPES.vendor, offset: 8 / 29 }
    const sim = createSim([vendor], map, [], obscure)
    sim.buildings = jobBuildings(map)
    const keeper = sim.travelers.get(vendor.id)!
    run(sim, [vendor], map, 300, () => keeper.activity === "posted")
    expect(keeper.activity).toBe("posted")

    const hungry = ["peasant", "knight"] as const
    const passers = hungry.map((type, id) => {
      const t = traveler(id, direction)
      t.type = TRAVELER_TYPES[type]
      t.offset = (keeper.progress - direction * 2) / 29
      t.attributes.hunger = t.attributes.thirst = 0
      return t
    })
    for (const [id, s] of createSim(passers, map).travelers) {
      // Recover travelers already stuck seeking this vendor; decline optional visits.
      s.activity = "seeking"; s.targetId = vendor.id; s.visitCooldown = 999
      sim.travelers.set(id, s)
    }
    const passed = new Set<number>()
    run(sim, [...passers, vendor], map, 8, () => {
      for (const t of passers) {
        if (direction * (sim.travelers.get(t.id)!.progress - keeper.progress) > 3) passed.add(t.id)
      }
      return passed.size === passers.length
    })
    expect(passed.size).toBe(passers.length)
    for (const t of passers) {
      const s = sim.travelers.get(t.id)!
      expect(s.targetId).toBeNull()
      expect(s.hunger).toBe(0)
      expect(s.thirst).toBe(0)
    }
    expect(keeper.activity).toBe("posted")
  }, 20000)
})

describe("tree resources and timber storage", () => {
  it("gives larger and harder species more durability and wood", () => {
    const { trees } = fixture()
    const oak = treeResource(trees[0], 0, 42)
    const small = treeResource({ ...trees[0], scale: 0.7 }, 0, 42)
    const birch = treeResource({ ...trees[0], species: "birch" }, 0, 42)
    expect(oak.maxHealth).toBeGreaterThan(small.maxHealth)
    expect(oak.wood).toBeGreaterThan(small.wood)
    expect(oak.maxHealth).toBeGreaterThan(birch.maxHealth)
    expect(small.fellingHours).toBeGreaterThanOrEqual(2)
    expect(treeResource(trees[0], 0, 42)).toEqual(oak)
  })

  it("keeps a tree standing through the old cut time, then hauls several loads into the yard", () => {
    const { map, trees, camp, traveler } = fixture()
    const t = traveler(0)
    const sim = createSim([t], map)
    map.buildings.push(camp)
    addHouse(map)
    sim.buildings = [camp]
    sim.trees = [trees[0]]
    const s = sim.travelers.get(0)!
    s.employer = camp.id
    s.activity = "idle"
    s.timer = 0
    s.x = tileToWorldX(map, camp.x)
    s.z = tileToWorldZ(map, camp.z + camp.d)
    run(sim, [t], map, 30, () => s.activity === "working")
    expect(s.activity).toBe("working")
    expect(s.workTarget).not.toBeNull()
    expect(s.x).toBeCloseTo(s.workTarget!.x)
    expect(s.z).toBeCloseTo(s.workTarget!.z)
    const trunkDistance = Math.hypot(s.x - trees[0].x, s.z - trees[0].z)
    expect(trunkDistance).toBeGreaterThan(0.25)
    expect(trunkDistance).toBeLessThan(0.65)
    run(sim, [t], map, 10)
    const resource = sim.treeResources.get(0)!
    expect(resource.health).toBeGreaterThan(0)
    expect(resource.health).toBeLessThan(resource.maxHealth)
    expect(treeStage(resource, sim.time)).toBe("Being felled")
    expect(sim.felled.size).toBe(0)
    run(sim, [t], map, GAME_DAY_SECONDS, () => s.activity === "gathering")
    expect(resource.health).toBe(0)
    expect(treeStage(resource, sim.time)).toBe("Fallen")
    expect(resource.stumpUntil! - resource.felledAt!).toBeCloseTo(STUMP_LIFETIME_DAYS)
    expect(resource.remainingWood).toBe(resource.wood)
    expect(sim.piles.size).toBe(0)
    run(sim, [t], map, GAME_DAY_SECONDS / 12, () => s.carrying > 0)
    expect(s.carrying).toBe(TIMBER_LOAD)
    const departure = { x: s.x, z: s.z }
    stepSim(sim, [t], map, 1.5, 0)
    expect(s.x).toBeCloseTo(departure.x)
    expect(s.z).toBeCloseTo(departure.z)
    expect(resource.remainingWood).toBe(resource.wood - TIMBER_LOAD)
    expect(sim.wood).toBe(0)
    expect(sim.piles.size).toBe(0)
    run(sim, [t], map, 30, () => sim.wood > 0)
    expect(sim.wood).toBe(TIMBER_LOAD)
    expect(s.x).toBeGreaterThanOrEqual(tileToWorldX(map, camp.x))
    expect(s.x).toBeLessThan(tileToWorldX(map, camp.x + camp.w))
    expect(s.z).toBe(tileToWorldZ(map, camp.z + camp.d))
    for (let i = 0; i < 2 * GAME_DAY_SECONDS / 0.1 && sim.wood < resource.wood; i++) {
      stepSim(sim, [t], map, 1.5, 0.1)
      expect(resource.remainingWood + s.carrying + sim.wood).toBe(resource.wood)
    }
    expect(sim.wood).toBe(resource.wood)
    expect(treeStage(resource, resource.stumpUntil! - 0.01)).toBe("Stump")
    expect(treeStage(resource, resource.stumpUntil!)).toBe("Cleared")
    expect(Array.from(sim.piles.values()).reduce((sum, pile) => sum + pile.wood, 0)).toBe(resource.wood)
  })

  it("keeps uncollected timber after the stump decays", () => {
    const { trees } = fixture()
    const resource = treeResource(trees[0], 0)
    resource.health = 0
    resource.felledAt = 1
    resource.stumpUntil = 4
    expect(treeStage(resource, 5)).toBe("Fallen")
  })

  it("reuses spent stack slots without overwriting remaining timber", () => {
    const { map } = fixture()
    const sim = createSim([], map)
    for (let i = 0; i < 100; i++) stackWood(sim.piles, "camp-a", 10)
    const first = sim.piles.get("camp-a:pile:0")!.wood
    syncTimberSpending(sim, first)
    expect(sim.piles.has("camp-a:pile:0")).toBe(false)
    for (let i = 0; i < 100; i++) stackWood(sim.piles, "camp-a", 10)
    expect(Array.from(sim.piles.values()).reduce((sum, p) => sum + p.wood, 0)).toBe(2000 - first)
    expect(new Set(Array.from(sim.piles.values(), (p) => p.slot)).size).toBe(sim.piles.size)
  })

  it("keeps stacks separate by camp and preserves every delivered unit", () => {
    const piles = new Map<string, WoodPile>()
    for (let i = 0; i < 100; i++) stackWood(piles, "camp-a", 10)
    stackWood(piles, "camp-b", 7)
    expect(Array.from(piles.values()).filter((pile) => pile.campId === "camp-a")).toHaveLength(4)
    expect(Array.from(piles.values()).reduce((sum, pile) => sum + pile.wood, 0)).toBe(1007)
    expect(new Set(piles.keys()).size).toBe(piles.size)
  })
})

describe("settlement route heights", () => {
  it.each(["toRelic", "fromRelic", "toWork", "hauling"] as const)(
    "follows bridge ramps while %s", (activity) => {
      const { map, traveler } = fixture()
      map.tiles[6 * map.width + 10] = "bridge"
      const t = traveler(0)
      const sim = createSim([t], map)
      const s = sim.travelers.get(0)!
      s.activity = activity
      s.lane = (activity === "fromRelic" ? -1 : 1) * s.laneOffset
      s.branchProgress = activity === "fromRelic" ? 2 : 1
      s.workRoute = map.site!.branch
      s.workProgress = 1
      s.y = TILE_HEIGHT
      stepSim(sim, [t], map, 1, 0.5)
      // z=5.5 is the top edge of the ramp, already at full deck height.
      expect(s.y).toBeCloseTo(TILE_HEIGHT + BRIDGE_RISE)
      const lane = activity === "toRelic" ? s.laneOffset : activity === "fromRelic" ? -s.laneOffset : 0
      expect(s.x).toBeCloseTo(tileToWorldX(map, 10) + lane)
      expect(s.z).toBeCloseTo(tileToWorldZ(map, 5.5))
    },
  )

  it.each(["grass", "bridge"] as const)("finishes a one-tile hauling route on %s", (terrain) => {
    const { map, traveler } = fixture()
    map.tiles[6 * map.width + 10] = terrain
    const t = traveler(0)
    const sim = createSim([t], map)
    const s = sim.travelers.get(0)!
    s.activity = "hauling"
    s.workRoute = [{ x: 10, z: 6 }]
    s.workProgress = 0
    stepSim(sim, [t], map, 1, 0.5)
    expect(s.activity).toBe("idle")
    expect(s.x).toBe(tileToWorldX(map, 10))
    expect(s.z).toBe(tileToWorldZ(map, 6))
    expect(s.y).toBeCloseTo(TILE_HEIGHT + (terrain === "bridge" ? BRIDGE_RISE : 0))
  })
})


it("queues single file, lets the keeper show one visitor at a time, and keeps floor prayer available", () => {
  const { map, traveler } = fixture()
  map.buildings[0].d = 5
  const people = Array.from({ length: 4 }, (_, id) => devout(traveler(id)))
  people[2].pace = 2 // A faster arrival must wait behind those already in line.
  const sim = createEstablishedShrine(people, map, holy)
  sim.shrineKeeperReady = false
  run(sim, people, map, 16)
  const queue = [...sim.travelers.values()].filter(s => s.shrineSeat?.startsWith("queue-"))
  expect(queue).toHaveLength(3)
  expect(queue.every(s => s.activity === "toRelic")).toBe(true)
  const ordered = [...queue].sort((a, b) => a.shrineQueueOrder! - b.shrineQueueOrder!)
  for (let i = 1; i < ordered.length; i++) {
    expect(ordered[i].x).toBeCloseTo(ordered[0].x)
    expect(Math.hypot(ordered[i].x - ordered[i - 1].x, ordered[i].z - ordered[i - 1].z)).toBeGreaterThanOrEqual(.74)
  }
  expect(sim.travelers.get(3)!.activity).toBe("visiting")
  expect(sim.travelers.get(3)!.shrineSeat).toMatch(/^prayer-/)
  sim.shrineKeeperReady = true
  const shown: number[] = []
  for (let tick = 0; tick < 1500; tick++) {
    stepSim(sim, people, map, 1.5, .1)
    const viewing = queue.filter(s => s.activity === "visiting")
    expect(viewing.length).toBeLessThanOrEqual(1)
    if (viewing[0] && !shown.includes(viewing[0].id)) shown.push(viewing[0].id)
    if (queue.every(s => s.offeringMade && !s.shrineSeat)) break
  }
  expect(shown).toEqual(ordered.map(s => s.id))
  expect(queue.every(s => s.visits === 1 && s.offeringMade && !s.shrineSeat)).toBe(true)
})

describe("shrine visits beside a covered junction", () => {
  function obstructed(direction: 1 | -1, offset = 0) {
    const { map, traveler } = fixture()
    const cross = BUILD_CATALOG.find(b => b.id === "cross")!
    const x = 10 + direction * offset
    expect(placementError(map, cross, map.road![x])).toBeNull()
    const obstacle = { ...cross, id: "road-cross", buildType: "cross", x, z: 4 }
    map.buildings.push(obstacle)
    const t = devout(traveler(0, direction))
    t.offset = (10 - direction * 4) / 29
    const sim = createEstablishedShrine([t], map, holy), s = sim.travelers.get(0)!
    Object.assign(sim.balance.rules, { hungerDecay: 0, thirstDecay: 0, staminaDecay: 0 })
    const step = () => {
      const before = { x: s.x, z: s.z, activity: s.activity, branchProgress: s.branchProgress }
      stepSim(sim, [t], map, 1.5, .1)
      expect(containsTile(obstacle, { x: worldToTileX(map, s.x), z: worldToTileZ(map, s.z) })).toBe(false)
      const movement = Math.hypot(s.x - before.x, s.z - before.z)
      expect(movement, `${before.activity} at ${before.branchProgress} → ${s.activity} at ${s.branchProgress}`).toBeLessThan(.3)
    }
    return { map, t, sim, s, step }
  }

  it.each([1, -1] as const)("walks to the shrine and back around the obstruction (direction %i)", direction => {
    const { sim, s, step } = obstructed(direction)
    for (let i = 0; i < 300 && s.activity !== "toRelic"; i++) step()
    expect(s.activity).toBe("toRelic")
    const departure = { x: s.x, z: s.z, progress: s.progress }
    expect((10 - departure.progress) * direction).toBeGreaterThan(0)
    for (let i = 0; i < 2000 && s.activity !== "walking"; i++) step()
    expect(s.activity).toBe("walking")
    expect(sim.visits).toBe(1)
    expect(s.progress).toBe(departure.progress)
    expect(s.x).toBeCloseTo(departure.x)
    expect(s.z).toBeCloseTo(departure.z)
    for (let i = 0; i < 300 && direction * (s.progress - 10) < 3; i++) step()
    expect(direction * (s.progress - 10)).toBeGreaterThanOrEqual(3)
    expect(sim.visits).toBe(1)
  })

  it.each([1, -1] as const)("offers a declined visit only once while taking the diversion (direction %i)", direction => {
    const { map, t, sim, s, step } = obstructed(direction)
    t.attributes.piety = s.piety = 0
    sim.relic = obscure
    // Leave no completed cross granting an independent evangelism roll.
    map.buildings.at(-1)!.construction = { work: 0, required: 1 }
    for (let i = 0; i < 300 && direction * (s.progress - 10) < 3; i++) step()
    expect(direction * (s.progress - 10)).toBeGreaterThanOrEqual(3)
    expect(sim.visits).toBe(0)
    expect(s.rolls).toBe(1)
  })

  it.each([1, -1] as const)("keeps the tavern accessible from the diversion departure (direction %i)", direction => {
    const { map, t, sim, s, step } = obstructed(direction)
    staffTavern(sim, map)
    t.attributes.gold = s.gold = 20
    t.attributes.hunger = s.hunger = 5
    t.attributes.thirst = s.thirst = 5
    for (let i = 0; i < 300 && s.activity !== "toTavern"; i++) step()
    expect(s.activity).toBe("toTavern")
    for (let i = 0; i < 2000 && s.activity !== "walking"; i++) step()
    expect(s.activity).toBe("walking")
    expect(sim.tradeGold).toBe(MEAL_PRICE + DRINK_PRICE)
    expect(s.tavernVisit).toBeUndefined()
    for (let i = 0; i < 300 && direction * (s.progress - 10) < 3; i++) step()
    expect(direction * (s.progress - 10)).toBeGreaterThanOrEqual(3)
  })

  it.each([1, -1] as const)("offers a visit at arrival when the diversion ends exactly on the junction (direction %i)", direction => {
    const { map, t, sim, s, step } = obstructed(direction, -2)
    t.attributes.piety = s.piety = 0
    sim.relic = obscure
    map.buildings.at(-1)!.construction = { work: 0, required: 1 }
    for (let i = 0; i < 300 && s.progress !== 10; i++) {
      step()
      expect(s.rolls).toBe(0)
    }
    expect(s.progress).toBe(10)
    step()
    expect(s.rolls).toBe(1)
  })
})


describe("traveling monks and housing limits", () => {
  function finishPrayer(sim: SimState, people: Traveler[], map: GameMap) {
    for (const s of sim.travelers.values()) {
      if (s.employer) continue
      const plan = shrineVisitPlan(map, s.id, s.visits)!
      const end = plan.route.at(-1)!
      Object.assign(s, { activity: "visiting", timer: 0, shrineRoute: plan.route, shrineSeat: plan.seat,
        branchProgress: plan.route.length - 1, offeringMade: false, offeringProgress: undefined,
        x: tileToWorldX(map, end.x), z: tileToWorldZ(map, end.z) })
    }
    stepSim(sim, people, map, 1.5, 0.1)
  }

  function leaveChurch(sim: SimState, people: Traveler[], map: GameMap) {
    const departed = () => [...sim.travelers.values()].every(s => s.offeringMade
      && !["visiting", "fromRelic", "offering"].includes(s.activity))
    run(sim, people, map, 60, departed)
    expect(departed()).toBe(true)
  }

  it("draws monks to an unknown enclave more often than other supplied travelers", () => {
    const { traveler } = fixture()
    const attributes = traveler(0).attributes
    expect(visitChance(attributes, obscure, 0, DEFAULT_BALANCE, 0, "friar")).toBe(0.6)
    expect(visitChance(attributes, obscure, 0, DEFAULT_BALANCE, 0, "peasant")).toBe(0)
  })

  it("admits some visiting monks to free shelter beds, preserving their identity and arrival", () => {
    const { map, traveler } = fixture()
    const shelter = BUILD_CATALOG.find(b => b.id === "monk-shelter")!
    map.buildings.push({ ...shelter, id: "founding-shelter", buildType: "monk-shelter", x: 2, z: 12 },
      { ...shelter, id: "extra-shelter", buildType: "monk-shelter", x: 6, z: 12 })
    const people = Array.from({ length: 60 }, (_, id) => ({ ...traveler(id), name: `Brother ${id}`, type: TRAVELER_TYPES.friar }))
    const sim = createSim(people, map)
    const arrivals = new Map(sim.travelers)
    for (const s of sim.travelers.values()) s.gold = 10
    finishPrayer(sim, people, map)
    expect(sim.joinedMonks.size).toBe(0)
    leaveChurch(sim, people, map)
    expect(sim.joinedMonks.size).toBe(4)
    expect(sim.visits).toBe(people.length)
    expect(sim.travelers.size).toBe(56)
    expect(sim.shrineGold).toBe([...arrivals.values()].reduce((sum, s) => sum + 10 - s.gold, 0))
    for (const [id, monk] of sim.joinedMonks) {
      const visitor = arrivals.get(id)!
      expect(visitor.offeringMade).toBe(true)
      expect(sim.travelers.has(id)).toBe(false)
      expect(monk).toMatchObject({ id: id + 4, name: people[id].name, home: "extra-shelter",
        attributes: { happiness: visitor.happiness, age: people[id].attributes.age, piety: visitor.piety },
        arrival: { x: visitor.x, y: visitor.y, z: visitor.z } })
      expect(visitor.employer).toBeNull()
    }
    const visits = sim.visits
    stepSim(sim, people, map, 1.5, 1)
    expect(sim.visits).toBe(visits)
    useBuildStore.getState().syncResources(sim, people)
    expect(useBuildStore.getState().joinedMonks).toHaveLength(4)
    expect(useBuildStore.getState().settlers).toHaveLength(0)
    useBuildStore.getState().reset()
    expect(useBuildStore.getState().joinedMonks).toEqual([])
  })

  it("turns monks back to the road when there is no completed shelter space", () => {
    const { map, traveler } = fixture()
    const shelter = BUILD_CATALOG.find(b => b.id === "monk-shelter")!
    map.buildings.push({ ...shelter, id: "site", buildType: "monk-shelter", x: 2, z: 12,
      construction: { work: 0, required: 100 } })
    const people = Array.from({ length: 20 }, (_, id) => ({ ...traveler(id), type: TRAVELER_TYPES.friar }))
    const sim = createSim(people, map)
    finishPrayer(sim, people, map)
    leaveChurch(sim, people, map)
    expect(sim.joinedMonks.size).toBe(0)
    expect([...sim.travelers.values()].every(s => s.activity === "walking")).toBe(true)
  })

  it("limits new workers to completed house beds even when more jobs are open", () => {
    const { map, camp, trees, traveler } = fixture()
    const people = Array.from({ length: 30 }, (_, id) => traveler(id))
    const sim = createSim(people, map)
    sim.buildings = [camp]; sim.trees = trees
    const completeVisits = () => {
      for (const s of sim.travelers.values()) if (!s.employer) s.jobless = true
      finishPrayer(sim, people, map)
      expect([...sim.travelers.values()].filter(s => s.employer)).toHaveLength(0)
      leaveChurch(sim, people, map)
    }
    completeVisits()
    expect([...sim.travelers.values()].filter(s => s.employer)).toHaveLength(0)
    const house = addHouse(map)
    completeVisits()
    const workers = [...sim.travelers.values()].filter(s => s.employer)
    expect(workers).toHaveLength(2)
    expect(workers.every(s => s.home === house.id)).toBe(true)
  })
})

describe("happiness and church devotion", () => {
  it.each([false, true])("draws a well-fed unhappy walker to a staffed tavern (independent: %s)", independent => {
    const { map, traveler } = fixture()
    const t = traveler(0)
    Object.assign(t.attributes, { happiness: 0, gold: DRINK_PRICE })
    const sim = createSim([t], map, [], obscure)
    Object.assign(sim.balance.rules, { hungerDecay: 0, thirstDecay: 0, staminaDecay: 0 })
    const tavern = staffTavern(sim, map)
    if (independent) {
      Object.assign(tavern, { owner: "independent", townId: "town" })
      map.towns = [{ id: "town", name: "Alderford", junction: 10, tavernId: tavern.id, buildingIds: [tavern.id] }]
    }
    const s = sim.travelers.get(0)!
    run(sim, [t], map, 120, () => s.activity === "sitting")
    expect(s.activity).toBe("sitting")
    expect(s.gold).toBe(0)
    expect(s.tavernVisit?.drink).toBe(true)
    expect(sim.tradeGold).toBe(independent ? 0 : DRINK_PRICE)
    expect(s.happiness).toBe(0)
    stepSim(sim, [t], map, 1.5, 0)
    expect(s.happiness).toBe(0)
    run(sim, [t], map, 120, () => s.activity === "fromTavern")
    expect(s.happiness).toBeCloseTo(30)
    expect(sim.visits).toBe(0)
    expect(t.attributes.happiness).toBe(0)
  })

  it.each(["closed", "poor", "market", "full"])("does not turn happiness into a church visit when the tavern is %s", reason => {
    const { map, traveler } = fixture()
    const t = traveler(0)
    Object.assign(t.attributes, { happiness: 0, gold: reason === "poor" ? 0 : 10 })
    const sim = createSim([t], map, [], obscure)
    const tavern = staffTavern(sim, map)
    if (reason === "closed") sim.travelers.delete(-1)
    if (reason === "market") tavern.buildType = "market"
    if (reason === "full") {
      for (const [i, seat] of tavernSeats(map, tavern).entries()) {
        sim.travelers.set(-10 - i, { ...sim.travelers.get(0)!, id: -10 - i, activity: "sitting",
          tavernVisit: { plan: { buildingId: tavern.id, seat, route: [], counter: { tile: seat.tile, point: seat.point } }, served: true, returnTo: null } })
      }
    }
    run(sim, [t], map, 1)
    const s = sim.travelers.get(0)!
    expect(s.activity).toBe("walking")
    expect(s.tavernVisit).toBeUndefined()
    expect(s.shrineSeat).toBeUndefined()
  })

  it("lets an idle settler take a happiness break and return to their workplace", () => {
    const { map, traveler, camp } = fixture()
    const t = traveler(0)
    Object.assign(t.attributes, { happiness: 40, gold: 10 })
    const sim = createSim([t], map, [], obscure)
    Object.assign(sim.balance.rules, { hungerDecay: 0, thirstDecay: 0, staminaDecay: 0 })
    sim.buildings = [camp]
    staffTavern(sim, map, { x: 19, z: 9 })
    const s = sim.travelers.get(0)!
    Object.assign(s, { activity: "idle", employer: camp.id })
    run(sim, [t], map, 120, () => s.activity === "sitting")
    expect(s.activity).toBe("sitting")
    expect(s.tavernVisit?.returnTo).not.toBeNull()
    run(sim, [t], map, 120, () => s.activity === "idle")
    expect(s.activity).toBe("idle")
    expect(s.happiness).toBeGreaterThan(60)
    expect(s.employer).toBe(camp.id)
  })

  it("ages devotion and happiness while away, and gains piety during private prayer", () => {
    const { map, traveler } = fixture()
    const t = traveler(0)
    const sim = createSim([t], map, [], obscure), s = sim.travelers.get(0)!
    Object.assign(s, { piety: 50, happiness: 80, hoursSinceChurch: 48 })
    stepSim(sim, [t], map, 0, GAME_DAY_SECONDS / 24)
    expect(s.piety).toBeCloseTo(49.98)
    expect(s.happiness).toBeCloseTo(79.5)
    Object.assign(s, { activity: "visiting", shrineSeat: "prayer-0", timer: GAME_DAY_SECONDS, piety: 50 })
    stepSim(sim, [t], map, 0, GAME_DAY_SECONDS / 24)
    expect(s.piety).toBeCloseTo(53)
    expect(s.hoursSinceChurch).toBe(0)
  })
})


describe("choosing tavern company or free water", () => {
  function choice(happiness: number, location: "shrine" | "town" | "work", gold = 10, thirst = 0) {
    const { map, traveler, camp } = fixture()
    map.tiles[5 * map.width + 8] = "water"
    const t = traveler(0)
    Object.assign(t.attributes, { happiness, thirst, hunger: 100, gold })
    const sim = createSim([t], map, [], obscure)
    Object.assign(sim.balance.rules, { hungerDecay: 0, thirstDecay: 0, staminaDecay: 0, happinessDecay: 0 })
    const tavern = staffTavern(sim, map, { x: 19, z: 9 })
    if (location === "town") {
      Object.assign(tavern, { owner: "independent", townId: "town" })
      map.towns = [{ id: "town", name: "Alderford", junction: 10, tavernId: tavern.id, buildingIds: [tavern.id] }]
    }
    const s = sim.travelers.get(0)!
    if (location === "work") {
      sim.buildings = [camp]
      Object.assign(s, { activity: "idle", employer: camp.id })
    }
    expect(naturalWaterStop(map, s)).not.toBeNull()
    return { map, t, sim, s, tavern }
  }

  it.each(["shrine", "town", "work"] as const)("makes happiness decide between available water and a %s tavern", location => {
    for (const thirst of [0, 40]) for (const happiness of [20, 80]) {
      const { map, t, sim, s } = choice(happiness, location, 10, thirst)
      stepSim(sim, [t], map, 1.5, .1)
      expect(s.activity).toBe(happiness < 60 ? "toTavern" : "toWater")
      if (happiness < 60) {
        expect(s.waterVisit).toBeUndefined()
        run(sim, [t], map, 120, () => s.activity === "sitting")
        expect(s.activity).toBe("sitting")
        expect(s.thirst).toBe(100)
        expect(s.gold).toBe(10 - DRINK_PRICE)
      } else {
        expect(s.tavernVisit).toBeUndefined()
        run(sim, [t], map, 120, () => s.activity === "fromWater")
        expect(s.activity).toBe("fromWater")
        expect(s.thirst).toBe(100)
        expect(s.gold).toBe(10)
        expect(s.happiness).toBe(80)
      }
    }
  })

  it.each(["well", "watering-hole"] as const)("preserves happiness preference when a free %s is available", kind => {
    for (const location of ["shrine", "town", "work"] as const) for (const happiness of [20, 80]) {
      const { map, t, sim, s } = choice(happiness, location, 10, 40)
      map.tiles[5 * map.width + 8] = "grass"
      const def = BUILD_CATALOG.find(b => b.id === kind)!
      map.buildings.push({ ...def, id: "free-water", buildType: kind, x: 6, z: 6 })
      stepSim(sim, [t], map, 1.5, .1)
      expect(s.activity).toBe(happiness < 60 ? "toTavern" : "toWater")
      if (happiness < 60) expect(s.waterVisit).toBeUndefined()
      else expect(s.waterVisit?.sourceId).toBe("free-water")
      expect(s.naturalWaterVisit).toBeUndefined()
    }
  })

  it.each(["poor", "closed", "full", "blocked"] as const)("falls back to free water when an unhappy customer's tavern is %s", reason => {
    const { map, t, sim, s, tavern } = choice(20, "shrine", reason === "poor" ? 0 : 10)
    if (reason === "closed") sim.travelers.delete(-1)
    if (reason === "full") for (const [i, seat] of tavernSeats(map, tavern).entries()) {
      sim.travelers.set(-10 - i, { ...s, id: -10 - i, activity: "sitting",
        tavernVisit: { plan: { buildingId: tavern.id, seat, route: [], counter: { tile: seat.tile, point: seat.point } }, served: true, returnTo: null } })
    }
    if (reason === "blocked") {
      for (let z = 0; z < map.depth; z++) map.tiles[z * map.width + 17] = "water"
    }
    stepSim(sim, [t], map, 1.5, .1)
    expect(s.activity).toBe("toWater")
    expect(s.tavernVisit).toBeUndefined()
  })
})
