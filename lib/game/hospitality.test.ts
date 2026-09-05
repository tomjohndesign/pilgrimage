import { describe, expect, it } from "vitest"
import { DEFAULT_BALANCE } from "./balance"
import { createSettlement, purchaseStructure, lumberCamps, creditTimber, syncTimberSpending, settlementRenown } from "./settlement"
import { BUILDING_KINDS, placementProblem, planBuilding } from "./buildings"
import { useBuildStore } from "./build-store"
import { BRIDGE_RISE } from "./map/bridges"
import { generateMap } from "./map/generate-map"
import { TILE_HEIGHT, type TerrainId } from "./map/terrain"
import { tileToWorldX, tileToWorldZ, worldToTileX, worldToTileZ, type GameMap } from "./map/types"
import { generateRelic, visitChance } from "./relic"
import { createSim, stepSim, type SimState } from "./sim"
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
  map.buildings.push({ id: "hovel", label: "Shrine", x: 9, z: 9, w: 2, d: 2, height: 1, color: "tan", roofColor: "brown" })
  const trees: TreePlacement[] = Array.from({ length: 6 }, (_, i) => {
    const x = 16 + i % 3, z = 10 + Math.floor(i / 3)
    map.tiles[z * width + x] = "forest"
    return { x: tileToWorldX(map, x), y: TILE_HEIGHT, z: tileToWorldZ(map, z), species: "oak" }
  })
  const camp = planBuilding(map, map.buildings, "lumberCamp", 13, 8, 0)!
  const traveler = (id: number, direction: 1 | -1 = 1): Traveler => ({
    id, name: `Traveler ${id}`, type: TRAVELER_TYPES.peasant, direction, pace: 1,
    offset: (10 - direction * 0.2) / (width - 1),
    attributes: { age: 30, gold: 0, piety: 0, status: 100, hunger: 100, thirst: 100,
      stamina: 100, jobless: false, skills: [] },
  })
  return { map, camp, trees, traveler }
}

function run(sim: SimState, travelers: Traveler[], map: GameMap, seconds: number, stop = () => false) {
  for (let i = 0; i < seconds * 10 && !stop(); i++) stepSim(sim, travelers, map, 1.5, 0.1)
}

const obscure = { sanctity: 0, spectacle: 0, doubt: 100 }

describe("shrine hospitality", () => {
  for (const need of ["hunger", "thirst", "stamina"] as const) {
    for (const direction of [1, -1] as const) {
      it(`draws a traveler with empty ${need} from direction ${direction}, restores needs and returns them`, () => {
        const { map, traveler } = fixture()
        const t = traveler(0, direction)
        t.attributes[need] = 0
        const sim = createSim([t], map, [], obscure)
        const s = sim.travelers.get(t.id)!
        const identity = structuredClone(t)
        run(sim, [t], map, 1)
        expect(s.activity).toBe("toRelic")
        run(sim, [t], map, 60, () => s.activity === "fromRelic")
        expect(s.visits).toBe(1)
        expect(Math.min(s.hunger, s.thirst, s.stamina)).toBeGreaterThanOrEqual(95)
        expect(s.piety).toBeGreaterThan(t.attributes.piety)
        expect(s.gold).toBe(0)
        expect(sim.visits * sim.balance.rules.visitRenown).toBe(0.5)
        expect(sim.relic).toEqual(obscure)
        run(sim, [t], map, 20, () => s.activity === "walking")
        expect(s.activity).toBe("walking")
        expect(s.progress).toBe(map.site!.junction)
        expect(s.direction).toBe(direction)
        run(sim, [t], map, 0.5)
        expect(s.activity).toBe("walking")
        expect(t).toEqual(identity)
      })
    }
  }

  it("notices a junction even when a fast step skips its tile", () => {
    const { map, traveler } = fixture()
    const t = traveler(0)
    t.offset = 8.5 / 29
    t.attributes.hunger = 0
    const sim = createSim([t], map)
    stepSim(sim, [t], map, 5, 1)
    expect(sim.travelers.get(0)!.activity).toBe("toRelic")
  })

  it("keeps faith relevant for rested travelers and makes dire need certain", () => {
    const { traveler } = fixture()
    const a = traveler(0).attributes
    const holy = { sanctity: 95, spectacle: 40, doubt: 15 }
    expect(visitChance({ ...a, piety: 100 }, holy)).toBeGreaterThan(visitChance(a, holy))
    expect(visitChance({ ...a, hunger: 0 }, obscure)).toBe(1)
    expect(visitChance({ ...a, thirst: 35 }, obscure)).toBeGreaterThan(visitChance(a, obscure))
  })

  it("produces actual visits on generated worlds", () => {
    for (const seed of [1, 42, 12345]) {
      const map = generateMap({ seed })
      const travelers = generateTravelers(seed, 30)
      const sim = createSim(travelers, map, [], generateRelic(seed).stats)
      run(sim, travelers, map, 240)
      expect(sim.visits, `seed ${seed}`).toBeGreaterThan(0)
    }
  })
})

describe("lumber camps", () => {
  it("purchases a working camp and credits deliveries once, even after spending wood", () => {
    const { map, trees, traveler } = fixture()
    const before = createSettlement()
    const bought = purchaseStructure(before, map, [], [], "lumberCamp", { x: 13, z: 8 })
    expect(bought.error).toBeNull()
    expect(bought.settlement.resources).toEqual({ gold: 140, wood: 115 })
    const blocked = purchaseStructure(before, map, [], [], "lumberCamp", { x: 0, z: 8 })
    expect(blocked.error).toBeTruthy()
    expect(blocked.settlement).toBe(before)
    const builtMap = { ...map, buildings: [...map.buildings, ...bought.settlement.structures] }
    const t = traveler(0)
    t.attributes.hunger = 0
    t.attributes.jobless = true
    const sim = createSim([t], builtMap, [], obscure)
    sim.buildings = lumberCamps(builtMap)
    sim.trees = trees
    syncTimberSpending(sim, bought.settlement.spentWood)
    run(sim, [t], builtMap, 300, () => sim.wood > 0)
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
    expect(camp).not.toBeNull()
    map.tiles[10 * map.width + 15] = "water"
    const travelers = Array.from({ length: 12 }, (_, id) => {
      const t = traveler(id)
      t.attributes.hunger = 0
      t.attributes.jobless = true
      return t
    })
    const sim = createSim(travelers, map, [], obscure)
    sim.buildings = [camp]
    sim.trees = trees
    let maxWorkers = 0
    let sawWorking = false
    let sawHauling = false
    for (let i = 0; i < 6000; i++) {
      stepSim(sim, travelers, map, 1.5, 0.1)
      const workers = Array.from(sim.travelers.values()).filter((s) => s.employer)
      maxWorkers = Math.max(maxWorkers, workers.length)
      expect(workers.length).toBeLessThanOrEqual(BUILDING_KINDS.lumberCamp.jobs)
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
    expect(sim.wood).toBe(trees.reduce((sum, tree, index) => sum + treeResource(tree, index, map.seed).wood, 0))
    expect(Array.from(sim.piles.values()).reduce((sum, pile) => sum + pile.wood, 0)).toBe(sim.wood)
    expect(Array.from(sim.travelers.values()).filter((s) => s.employer)).toHaveLength(3)
  })

  it("does not recruit employed travelers", () => {
    const { map, trees, camp, traveler } = fixture()
    const t = traveler(0)
    t.attributes.hunger = 0
    const sim = createSim([t], map)
    sim.buildings = [camp]
    sim.trees = trees
    run(sim, [t], map, 120)
    expect(sim.visits).toBeGreaterThan(0)
    expect(sim.travelers.get(0)!.employer).toBeNull()
    expect(sim.wood).toBe(0)
  })

  it("rejects water, roads, occupied footprints, remote woods and disconnected entrances", () => {
    const { map, camp } = fixture()
    expect(placementProblem(map, map.buildings, "lumberCamp", 13, 8)).toBeNull()
    expect(placementProblem(map, [...map.buildings, camp], "lumberCamp", 14, 8)).toBe("occupied")
    expect(placementProblem(map, map.buildings, "lumberCamp", 10, 4)).toBe("terrain")
    expect(placementProblem(map, map.buildings, "lumberCamp", 29, 17)).toBe("terrain")
    expect(placementProblem(map, map.buildings, "lumberCamp", 0, 0)).toBe("noWoods")
    map.tiles[8 * map.width + 13] = "water"
    expect(placementProblem(map, map.buildings, "lumberCamp", 13, 8)).toBe("terrain")
    map.tiles[8 * map.width + 13] = "grass"
    for (let z = 0; z < map.depth; z++) map.tiles[z * map.width + 12] = "water"
    expect(placementProblem(map, map.buildings, "lumberCamp", 13, 8)).toBe("access")
  })

  it("rejects woods stranded across water even within the work radius", () => {
    const { map } = fixture()
    for (let z = 9; z <= 12; z++) {
      for (let x = 15; x <= 19; x++) {
        if (x === 15 || x === 19 || z === 9 || z === 12) map.tiles[z * map.width + x] = "water"
      }
    }
    expect(placementProblem(map, map.buildings, "lumberCamp", 13, 8)).toBe("noWoods")
  })

  it("clears simulation snapshots, cut trees and the tool for a new world", () => {
    const { map, traveler } = fixture()
    const store = useBuildStore.getState()
    store.syncResources(createSim([traveler(0)], map))
    store.setTool("lumberCamp")
    store.setFelled(new Set([1]))
    store.reset()
    expect(useBuildStore.getState()).toMatchObject({ simulation: null, settlers: [], wood: 0, visits: 0, tool: null })
    expect(useBuildStore.getState().felled.size).toBe(0)
  })
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
    sim.buildings = [camp]
    sim.trees = [trees[0]]
    const s = sim.travelers.get(0)!
    s.employer = camp.id
    s.activity = "idle"
    s.timer = 0
    s.x = tileToWorldX(map, camp.x)
    s.z = tileToWorldZ(map, camp.z + camp.d - 1)
    run(sim, [t], map, 30, () => s.activity === "working")
    expect(s.activity).toBe("working")
    run(sim, [t], map, 10)
    const resource = sim.treeResources.get(0)!
    expect(resource.health).toBeGreaterThan(0)
    expect(resource.health).toBeLessThan(resource.maxHealth)
    expect(treeStage(resource, sim.time)).toBe("Being felled")
    expect(sim.felled.size).toBe(0)
    run(sim, [t], map, 120, () => s.activity === "gathering")
    expect(resource.health).toBe(0)
    expect(treeStage(resource, sim.time)).toBe("Fallen")
    expect(resource.stumpUntil! - resource.felledAt!).toBeCloseTo(STUMP_LIFETIME_DAYS)
    expect(resource.remainingWood).toBe(resource.wood)
    expect(sim.piles.size).toBe(0)
    run(sim, [t], map, 10, () => s.carrying > 0)
    expect(s.carrying).toBe(TIMBER_LOAD)
    expect(resource.remainingWood).toBe(resource.wood - TIMBER_LOAD)
    expect(sim.wood).toBe(0)
    expect(sim.piles.size).toBe(0)
    run(sim, [t], map, 30, () => sim.wood > 0)
    expect(sim.wood).toBe(TIMBER_LOAD)
    expect(s.x).toBeGreaterThanOrEqual(tileToWorldX(map, camp.x))
    expect(s.x).toBeLessThan(tileToWorldX(map, camp.x + camp.w))
    expect(s.z).toBeGreaterThanOrEqual(tileToWorldZ(map, camp.z))
    expect(s.z).toBeLessThan(tileToWorldZ(map, camp.z + camp.d))
    for (let i = 0; i < 2000; i++) {
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
      s.branchProgress = activity === "fromRelic" ? 2 : 1
      s.workRoute = map.site!.branch
      s.workProgress = 1
      s.y = TILE_HEIGHT
      stepSim(sim, [t], map, 1, 0.5)
      expect(s.y).toBeCloseTo(TILE_HEIGHT + BRIDGE_RISE * 0.75)
      expect(s.x).toBeCloseTo(tileToWorldX(map, 10))
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
