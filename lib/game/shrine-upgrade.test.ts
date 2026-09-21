import { assignBuildingTask, isComplete, stepBuildingTask, type Worker } from "./construction"
import { churchWingGates } from "./church-additions"
import { generateMonks } from "./monks"
import { generateRelic } from "./relic"
import { MONK_BUILD_RATE } from "./build-labour"
import { constructionParts } from "./building-art/construction"
import { createSim, stepSim } from "./sim"
import { TRAVELER_TYPES, type Traveler } from "./travelers"
import { BUILD_CATALOG, DEFAULT_BALANCE } from "./balance"
import { generateMap } from "./map/generate-map"
import { describe, expect, it } from "vitest"
import { buildingStepAllowed, shrineFurnitureClear, containsTile } from "./building-navigation"
import { shrinePoint, shrineLayout, shrineSeats, shrineStations, shrineViewingPlaces } from "./shrine-layout"
import { shrineVisitPlan, shrineExitPlan, shrineDonation, relicQueueSpacing, shrineQueueStop } from "./shrine-visit"
import { shrineStructureParts } from "./building-art/shrine-geometry"
import { monkWander } from "./monk-wander"
import { processionGrounds } from "./relic-procession"
import { CHURCH_COST, CHURCH_RENOWN_BONUS, churchPlan, churchDevelopmentPlot, shrineDonationMultiplier, shrineMonkCapacity } from "./shrine-upgrade"
import { purchaseStructure, placementError, completeConstruction, upgradeChurch, createSettlement, settlementMap, settlementRenown } from "./settlement"
import { enclaveHousing, vacantMonkBed } from "./housing"
import { captureSettlement, restoreSettlement } from "./save/settlement"
import { settlementSaveSchema } from "./save/schema"
import { tileToWorldX, tileToWorldZ, type GameMap } from "./map/types"

function fixture(direction = 0): GameMap {
  const door = [{ x: 13, z: 14 }, { x: 14, z: 13 }, { x: 13, z: 11 }, { x: 11, z: 13 }][direction]
  const delta = [{ x: 0, z: 1 }, { x: 1, z: 0 }, { x: 0, z: -1 }, { x: -1, z: 0 }][direction]
  const branch = Array.from({ length: 6 }, (_, i) => ({ x: door.x + delta.x * (5 - i), z: door.z + delta.z * (5 - i) }))
  return { width: 32, depth: 32, tiles: Array(1024).fill("grass"), road: [branch[0]],
    buildings: [{ id: "shrine", x: 12, z: 12, w: 2, d: 2, height: .9, label: "Relic chapel", color: "", roofColor: "" }],
    site: { hovelId: "shrine", door, branch, junction: 0 } }
}

describe("chapel progression", () => {
  it.each([0, 1, 2, 3])("keeps both side wings available through construction and reload (direction %i)", direction => {
    const base = fixture(direction), church = churchPlan(base)!
    const acrossX = church.w < church.d
    base.site!.churchPlot = { x: church.x - (acrossX ? 2 : 0), z: church.z - (acrossX ? 0 : 2),
      w: church.w + (acrossX ? 4 : 0), d: church.d + (acrossX ? 0 : 4) }
    const residence = BUILD_CATALOG.find(b => b.id === "monk-shelter")!
    const cross = BUILD_CATALOG.find(b => b.id === "cross")!
    let settlement = { ...createSettlement(), resources: { gold: 1000, wood: 1000 } }
    const sites = [-1, 1].map(side => {
      const centre = shrinePoint(church, base.site!.door, side * 2.5, 0)
      return { x: centre.x - (acrossX ? .5 : 1), z: centre.z - (acrossX ? 1 : .5) }
    })
    for (const at of sites) {
      expect(placementError(base, cross, at)).toMatch(/Reserved/)
      expect(placementError(base, residence, at)).toMatch(/Finish upgrading/)
    }
    settlement = upgradeChurch(settlement, base).settlement
    for (const at of sites) expect(placementError(settlementMap(base, settlement), residence, at)).toMatch(/Finish upgrading/)
    settlement = completeConstruction(settlement)
    for (const at of sites) {
      const map = settlementMap(base, settlement)
      expect(placementError(map, cross, at)).toMatch(/Reserved/)
      const bought = purchaseStructure(settlement, map, generateMonks(1), [generateRelic(1)], residence.id, at)
      expect(bought.error).toBeNull()
      settlement = completeConstruction(bought.settlement)
    }
    const restored = restoreSettlement(base, settlementSaveSchema.parse(captureSettlement(settlement)))
    const loaded = settlementMap(base, restored)
    expect(loaded.site!.churchPlot).toEqual(base.site!.churchPlot)
    expect(churchWingGates(loaded)).toHaveLength(2)
  })

  it("finishes a chapel viewing and exit donation in the live simulation", () => {
    const map = fixture()
    map.road = Array.from({ length: 32 }, (_, x) => ({ x, z: 19 }))
    map.site!.junction = 13
    const traveler: Traveler = { id: 0, name: "Pilgrim", type: TRAVELER_TYPES.peasant, direction: 1, pace: 1, offset: 12.8 / 31,
      attributes: { happiness: 80, age: 30, gold: 10, piety: 99, status: 0, hunger: 100, thirst: 100, stamina: 100, jobless: false, skills: [] } }
    const sim = createSim([traveler], map, [], { sanctity: 100, spectacle: 0, doubt: 0 })
    sim.balance = structuredClone(DEFAULT_BALANCE)
    sim.balance.rules.hospitalityBaseChance = 1
    sim.shrineRenown = sim.balance.rules.drawCap
    sim.shrineKeeperReady = true
    const live = sim.travelers.get(0)!
    let viewed = false, offered = false
    for (let i = 0; i < 1600; i++) {
      stepSim(sim, [traveler], map, 1.5, .1)
      if (live.activity === "visiting") { viewed = true; expect(live.shrineSeat).toMatch(/^queue-/) }
      if (live.activity === "offering") offered = true
      if (offered && live.activity === "walking") break
    }
    expect({ viewed, offered, visits: live.visits, activity: live.activity }).toEqual({ viewed: true, offered: true, visits: 1, activity: "walking" })
    expect(live.gold + sim.shrineGold).toBe(10)
    expect(sim.shrineGold).toBeLessThanOrEqual(5)
    expect(live.shrineRoute).toBeNull()
  })

  it.each([false, true])("admits only the available kneeling places and holds the waiting line back (church %s)", church => {
    const map = fixture()
    map.road = Array.from({ length: 32 }, (_, x) => ({ x, z: 19 }))
    map.site!.junction = 13
    if (church) map.buildings = [churchPlan(map)!]
    const shrine = map.buildings[0], layout = shrineLayout(shrine, map.site!.door)
    const places = shrineViewingPlaces(shrine, map.site!.door)
    const travelers: Traveler[] = Array.from({ length: 6 }, (_, id) => ({
      id, name: `Pilgrim ${id}`, type: TRAVELER_TYPES.pilgrim, direction: 1, pace: 1, offset: 0,
      attributes: { happiness: 80, age: 30, gold: 10, piety: 99, status: 0, hunger: 100, thirst: 100, stamina: 100, jobless: false, skills: [] },
    }))
    const sim = createSim(travelers, map, [], { sanctity: 100, spectacle: 0, doubt: 0 })
    sim.balance = { ...DEFAULT_BALANCE, rules: { ...DEFAULT_BALANCE.rules, hungerDecay: 0, thirstDecay: 0, staminaDecay: 0 } }
    sim.shrineKeeperReady = true
    const reserved = new Set<string>()
    for (const t of travelers) {
      const plan = shrineVisitPlan(map, t.id, 0, reserved)!
      reserved.add(plan.seat)
      Object.assign(sim.travelers.get(t.id)!, { activity: "toRelic", shrineRoute: plan.route, shrineSeat: plan.seat,
        shrineQueueOrder: t.id, branchProgress: 0, lane: 0, branchEntryLane: 0,
        x: tileToWorldX(map, plan.route[0].x), z: tileToWorldZ(map, plan.route[0].z) })
    }
    let maximumKneeling = 0, heldOutside = false
    const seenPlaces = new Set<number>()
    for (let tick = 0; tick < 2400; tick++) {
      stepSim(sim, travelers, map, 1.5, .1)
      const states = [...sim.travelers.values()]
      const kneeling = states.filter(s => s.activity === "visiting")
      maximumKneeling = Math.max(maximumKneeling, kneeling.length)
      expect(kneeling.length).toBeLessThanOrEqual(places.length)
      expect(new Set(kneeling.map(s => s.shrinePlace)).size).toBe(kneeling.length)
      for (const s of kneeling) {
        seenPlaces.add(s.shrinePlace!)
        expect(s.x).toBeCloseTo(tileToWorldX(map, places[s.shrinePlace!].x))
        expect(s.z).toBeCloseTo(tileToWorldZ(map, places[s.shrinePlace!].z))
      }
      if (!church) expect(states.filter(s => containsTile(shrine, { x: s.x + map.width / 2 - .5, z: s.z + map.depth / 2 - .5 })).length).toBeLessThanOrEqual(1)
      for (const s of states.filter(s => s.activity === "toRelic" && s.shrinePlace === undefined)) {
        const stop = shrineQueueStop(map, s.shrineRoute!, s.shrineDoor!)
        expect(s.branchProgress).toBeLessThanOrEqual(stop + 1e-8)
        if (Math.abs(s.branchProgress - stop) < .001) {
          heldOutside = true
          if (church) {
            const dx = s.x - tileToWorldX(map, places[0].x), dz = s.z - tileToWorldZ(map, places[0].z)
            expect(dx * Math.sin(layout.rotation) + dz * Math.cos(layout.rotation)).toBeCloseTo(4 * relicQueueSpacing())
          }
        }
      }
      if (states.every(s => s.visits > 0 && s.activity === "walking")) break
    }
    expect(maximumKneeling).toBe(places.length)
    expect(seenPlaces.size).toBe(places.length)
    expect(heldOutside).toBe(true)
    expect([...sim.travelers.values()].every(s => s.visits > 0 && s.activity === "walking")).toBe(true)
  })

  it.each([0, 1, 2, 3])("lets an existing chapel visitor depart after the church upgrade (direction %i)", direction => {
    const chapel = fixture(direction), arrival = shrineVisitPlan(chapel, 0, 0)!
    const church = { ...chapel, buildings: [churchPlan(chapel)!] }
    const exit = shrineExitPlan(church, arrival.route.at(-1)!, arrival.route)!
    expect(exit).not.toBeNull()
    for (let i = 1; i < exit.route.length; i++)
      expect(buildingStepAllowed(church, church.buildings, exit.route[i - 1], exit.route[i], true)).toBe(true)
  })

  it("preserves generation 3 saves and their land while new worlds begin with a chapel", () => {
    const options = { seed: 31, width: 128, depth: 128 }
    const older = generateMap({ ...options, generation: 3 }), current = generateMap(options)
    expect(older.buildings[0]).toMatchObject({ w: 3, d: 5 })
    expect(current.buildings[0]).toMatchObject({ w: 2, d: 2 })
    expect(current.tiles).toEqual(older.tiles)
    expect(current.elevation).toEqual(older.elevation)
    expect(current.site).toMatchObject(older.site!)
    expect(current.buildings.slice(1)).toEqual(older.buildings.slice(1))
    const result = upgradeChurch({ ...createSettlement(), resources: { ...CHURCH_COST } }, current)
    expect(result.error).toBeNull()
    const restored = restoreSettlement(current, settlementSaveSchema.parse(captureSettlement(result.settlement)))
    expect(settlementMap(current, restored).elevation).toEqual(settlementMap(current, result.settlement).elevation)
  }, 30000)

  it.each([0, 1, 2, 3])("keeps viewings, donations and keeper access around the altar with a rear keeper lane (direction %i)", direction => {
    const map = fixture(direction), chapel = map.buildings[0], stations = shrineStations(chapel, map.site!.door)
    expect(shrineLayout(chapel, map.site!.door).altar).toEqual({ x: 12.5, z: 12.5 })
    const { altar, rotation } = shrineLayout(chapel, map.site!.door)
    for (const [point, forward] of [[stations.viewing, .5], [stations.keeper, -.5]] as const) {
      expect((point.x - altar.x) * Math.cos(rotation) - (point.z - altar.z) * Math.sin(rotation)).toBeCloseTo(0)
      expect((point.x - altar.x) * Math.sin(rotation) + (point.z - altar.z) * Math.cos(rotation)).toBeCloseTo(forward)
    }
    expect(shrineSeats(chapel)).toEqual([])
    expect(shrineVisitPlan(map, 0, 0, new Set(), undefined, true)).toBeNull()
    expect(shrineVisitPlan(map, 0, 0, new Set(), undefined, false, false)).toBeNull()
    const plan = shrineVisitPlan(map, 0, 0)!
    expect(plan.route.at(-1)).toEqual(stations.viewing)
    expect(Math.abs(stations.offering.x - map.site!.door.x) + Math.abs(stations.offering.z - map.site!.door.z)).toBe(1)
    const exit = shrineExitPlan(map, stations.viewing, plan.route)!
    expect(exit.route[exit.offeringProgress]).toEqual(stations.offering)
    for (const route of [plan.route, exit.route]) for (let i = 1; i < route.length; i++)
      expect(buildingStepAllowed(map, map.buildings, route[i - 1], route[i], true)).toBe(true)
    const wander = monkWander(map)
    expect(wander.prayerSpots).toEqual([])
    expect(shrineFurnitureClear(chapel, map.site!.door, stations.keeper, stations.keeper)).toBe(true)
    const grounds = processionGrounds(map, wander)!
    expect(grounds).not.toBeNull()
    expect(wander.route(grounds.door, grounds.altar).at(-1)).toEqual(grounds.altar)
  })

  it.each([0, 1, 2, 3])("upgrades behind the doorway, charges once and persists the church (direction %i)", direction => {
    const map = fixture(direction), before = { ...createSettlement(), resources: { ...CHURCH_COST } }
    const result = upgradeChurch(before, map)
    expect(result.error).toBeNull()
    const upgraded = settlementMap(map, result.settlement)
    expect(upgraded.site).toBe(map.site)
    expect(upgraded.buildings).toHaveLength(1)
    expect(upgraded.buildings[0]).toMatchObject({ label: "Church", buildType: "church" })
    expect(upgraded.buildings[0].w * upgraded.buildings[0].d).toBe(15)
    expect(shrineVisitPlan(upgraded, 0, 0, new Set(), undefined, true)).toBeNull()
    expect(result.settlement.resources).toEqual({ gold: 0, wood: 0 })
    expect(result.settlement.spentWood).toBe(CHURCH_COST.wood)
    expect(settlementRenown(upgraded, [], []).total - settlementRenown(map, [], []).total).toBeLessThanOrEqual(0)
    expect(upgradeChurch(result.settlement, map).settlement).toBe(result.settlement)
    const restored = restoreSettlement(map, settlementSaveSchema.parse(JSON.parse(JSON.stringify(captureSettlement(result.settlement)))))
    expect(settlementMap(map, restored).buildings).toEqual(upgraded.buildings)
    expect(restored.resources).toEqual(result.settlement.resources)
    expect(restored.church!.construction).toEqual({ work: 0, required: 480, cost: CHURCH_COST })
    expect(shrineMonkCapacity(upgraded)).toBe(4)
    const finished = settlementMap(map, completeConstruction(restored))
    expect(shrineVisitPlan(finished, 0, 0)).not.toBeNull()
    expect(shrineMonkCapacity(finished)).toBe(8)
    expect(settlementRenown(finished, [], []).total - settlementRenown(map, [], []).total).toBe(CHURCH_RENOWN_BONUS)
  })

  it.each([0, 1, 2, 3])("lets the existing builders raise the church and saves partial progress (direction %i)", direction => {
    const base = fixture(direction)
    const { settlement } = upgradeChurch({ ...createSettlement(), resources: { ...CHURCH_COST } }, base)
    const map = settlementMap(base, settlement), church = settlement.church!
    const worker: Worker = { x: tileToWorldX(map, base.site!.door.x), z: tileToWorldZ(map, base.site!.door.z), y: .2, buildRate: MONK_BUILD_RATE }
    expect(assignBuildingTask(worker, map, "build")).toBe(true)
    expect(worker.buildingTask!.buildingId).toBe(church.id)
    expect(church.construction!.work).toBe(0)
    for (let tick = 0; tick < 200 && church.construction!.work < 20; tick++) stepBuildingTask(worker, map, 2, 1)
    expect(church.construction!.work).toBeGreaterThan(0)
    expect(isComplete(church)).toBe(false)
    expect(processionGrounds(map)).toBeNull()
    const saved = restoreSettlement(base, settlementSaveSchema.parse(captureSettlement(settlement)))
    expect(saved.church!.construction).toEqual(church.construction)
    const shape = shrineLayout(church, map.site!.door)
    const finished = shrineStructureParts(shape.width, shape.depth, [], shape.entranceX)
    const art = () => constructionParts({ ...church, w: shape.width, d: shape.depth }, [], finished)
    expect(art().some(p => p.name.startsWith("construction-"))).toBe(true)
    expect(art().some(p => p.layer === "roof")).toBe(false)
    for (let tick = 0; tick < 2000 && !isComplete(church); tick++) stepBuildingTask(worker, map, 2, 1)
    expect(isComplete(church)).toBe(true)
    expect(art()).toEqual(finished)
    expect(shrineMonkCapacity(map)).toBe(8)
    expect(shrineVisitPlan(map, 0, 0)).not.toBeNull()
  })

  it("closes to new visitors and lets an existing viewing leave without a gift during construction", () => {
    const base = fixture()
    base.road = Array.from({ length: 32 }, (_, x) => ({ x, z: 19 }))
    const traveler: Traveler = { id: 0, name: "Pilgrim", type: TRAVELER_TYPES.peasant, direction: 1, pace: 1, offset: .4,
      attributes: { happiness: 80, age: 30, gold: 10, piety: 99, status: 0, hunger: 100, thirst: 100, stamina: 100, jobless: false, skills: [] } }
    const sim = createSim([traveler], base), s = sim.travelers.get(0)!, arrival = shrineVisitPlan(base, 0, 0)!
    const at = arrival.route.at(-1)!
    Object.assign(s, { activity: "visiting", shrineRoute: arrival.route, shrineSeat: arrival.seat, timer: 6,
      branchProgress: arrival.route.length - 1, x: tileToWorldX(base, at.x), z: tileToWorldZ(base, at.z) })
    const { settlement } = upgradeChurch(createSettlement(), base), map = settlementMap(base, settlement)
    expect(shrineVisitPlan(map, 1, 0)).toBeNull()
    for (let tick = 0; tick < 500 && s.activity !== "walking"; tick++) stepSim(sim, [traveler], map, 1.5, .1)
    expect(s.activity).toBe("walking")
    expect(s.visits).toBe(0)
    expect(s.gold).toBe(10)
    expect(sim.shrineGold).toBe(0)
    expect(s.shrineSeat).toBeUndefined()
  })

  it.each([0, 1, 2, 3])("reserves the future plot and keeps neighboring entrances outside it (direction %i)", direction => {
    const map = fixture(direction), chapel = map.buildings[0], plot = churchDevelopmentPlot(map)!
    const cross = BUILD_CATALOG.find(b => b.id === "cross")!
    for (let z = plot.z; z < plot.z + plot.d; z++) for (let x = plot.x; x < plot.x + plot.w; x++) {
      if (x >= chapel.x && x < chapel.x + chapel.w && z >= chapel.z && z < chapel.z + chapel.d) continue
      expect(placementError(map, cross, { x, z })).toMatch(/Reserved for the church/)
    }
    // An adjacent hut must not aim its door into the future plot.
    const hut = { ...BUILD_CATALOG.find(b => b.id === "house")!, w: 1, d: 1 }
    const at = { x: direction === 3 ? plot.x + plot.w : plot.x - 1, z: plot.z + Math.floor(plot.d / 2) }
    expect(placementError(map, hut, at, DEFAULT_BALANCE, direction === 3 ? 1 : 3)).toMatch(/entrance outside the church/)
    // Facing away keeps both the hut and its entrance outside the expansion.
    expect(placementError(map, hut, at, DEFAULT_BALANCE, direction === 3 ? 3 : 1)).toBeNull()
  })

  it("rejects unaffordable, flooded and occupied expansions without charging", () => {
    const map = fixture(), before = { ...createSettlement(), resources: { ...CHURCH_COST } }
    expect(upgradeChurch({ ...before, resources: { gold: 0, wood: 0 } }, map).error).toMatch(/Requires/)
    const planned = churchPlan(map)!
    map.tiles[planned.z * map.width + planned.x] = "water"
    expect(upgradeChurch(before, map).settlement).toBe(before)
    map.tiles[planned.z * map.width + planned.x] = "grass"
    const occupied = { ...map, buildings: [...map.buildings, { ...planned, id: "blocker", w: 1, d: 1 }] }
    expect(upgradeChurch(before, occupied).error).toMatch(/Another building/)
    expect(upgradeChurch(before, occupied).settlement).toBe(before)
  })

  it("raises the monk limit while still requiring actual shelter beds", () => {
    const map = fixture()
    for (let i = 0; i < 3; i++) map.buildings.push({ id: `shelter-${i}`, buildType: "monk-shelter", label: "Shelter", x: i * 4, z: 2, w: 3, d: 2, height: .8, color: "", roofColor: "" })
    expect(enclaveHousing(map, 0, 4).monks.capacity).toBe(4)
    expect(vacantMonkBed(map, [])).toBeUndefined()
    const upgraded = settlementMap(map, completeConstruction(upgradeChurch({ ...createSettlement(), resources: { ...CHURCH_COST } }, map).settlement))
    expect(enclaveHousing(upgraded, 0, 4).monks.capacity).toBe(8)
    const joined: { home: string; bedSlot: number }[] = []
    for (let bed = vacantMonkBed(upgraded, joined); bed; bed = vacantMonkBed(upgraded, joined)) joined.push({ home: bed.home, bedSlot: bed.slot })
    expect(joined).toHaveLength(4)
    expect(vacantMonkBed(upgraded, joined)).toBeUndefined()
  })

  it("takes smaller voluntary gifts at the chapel without overspending", () => {
    const chapel = fixture(), church = { ...chapel, buildings: [churchPlan(chapel)!] }
    const gift = (map: GameMap, gold: number) => {
      const rolls = [0, .99]
      return shrineDonation(100, gold, () => rolls.shift()!, shrineDonationMultiplier(map))
    }
    expect(gift(chapel, 100)).toBe(5)
    expect(gift(church, 100)).toBe(10)
    expect(gift(chapel, 1)).toBe(1)
    expect(gift(chapel, 0)).toBe(0)
  })

  it("uses a single gabled roof, the church steeple and an altar with keeper clearance without church aisles", () => {
    const parts = shrineStructureParts(2, 2)
    expect(parts.find(p => p.name === "relic-table")!.position).toEqual([0, 0, 0])
    expect(parts.some(p => p.name === "chapel-door-lintel")).toBe(true)
    expect(parts.some(p => p.name.startsWith("thatch-"))).toBe(true)
    expect(parts.some(p => /raised-nave|lower-thatch/.test(p.name))).toBe(false)
    expect(parts.some(p => p.name === "steeple-cap")).toBe(true)
    expect(parts.some(p => p.name === "steeple-cross-upright")).toBe(true)
    expect(parts.some(p => p.name === "steeple-cross-arm")).toBe(true)
  })
})
