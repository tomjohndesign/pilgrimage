import { describe, expect, it } from "vitest"

import type { TerrainId } from "./map/terrain"
import { tileAt, worldToTileX, worldToTileZ, type GameMap } from "./map/types"
import {
  createSim,
  FOOD_PRICE,
  GAME_DAY_SECONDS,
  formatGameTime,
  stepSim,
  WINE_PRICE,
  WINE_STAMINA_BONUS,
  type SimState,
} from "./sim"
import {
  TRAVELER_TYPES,
  type Traveler,
  type TravelerAttributes,
  type TravelerTypeId,
} from "./travelers"

/**
 * A straight west–east road at z=4 with a forest ridge hugging it at z=3, so
 * the nearest tile off the road is woods — pitch placement must skip it.
 */
function makeMap(): GameMap {
  const width = 24
  const depth = 9
  const tiles = new Array<TerrainId>(width * depth).fill("grass")
  const road: Array<{ x: number; z: number }> = []
  for (let x = 0; x < width; x++) {
    tiles[4 * width + x] = "path"
    road.push({ x, z: 4 })
    tiles[3 * width + x] = "forest"
  }
  return { width, depth, tiles, buildings: [], seed: 1, road }
}

function makeTraveler(
  id: number,
  typeId: TravelerTypeId,
  attributes: Partial<TravelerAttributes> = {},
  offset = 0.5,
): Traveler {
  return {
    id,
    name: `Test ${id}`,
    type: TRAVELER_TYPES[typeId],
    attributes: {
      gold: 10,
      status: 50,
      hunger: 80,
      thirst: 80,
      piety: 50,
      stamina: 80,
      jobless: false,
      skills: [],
      age: 30,
      ...attributes,
    },
    offset,
    direction: 1,
    pace: 1,
  }
}

/** Step in 100 ms ticks until `pred` holds; false if `maxSeconds` runs out. */
function runUntil(
  sim: SimState,
  travelers: Traveler[],
  map: GameMap,
  pred: () => boolean,
  maxSeconds: number,
): boolean {
  for (let i = 0; i < maxSeconds * 10; i++) {
    if (pred()) return true
    stepSim(sim, travelers, map, 1, 0.1)
  }
  return pred()
}

describe("game time", () => {
  it("advances with real time at the configured day length", () => {
    const map = makeMap()
    const travelers = [makeTraveler(0, "knight")]
    const sim = createSim(travelers, map)
    const start = sim.time
    for (let i = 0; i < 10; i++) stepSim(sim, travelers, map, 1, 0.1)
    expect(sim.time - start).toBeCloseTo(1 / GAME_DAY_SECONDS, 5)
  })

  it("formats days and hours", () => {
    expect(formatGameTime(0.25)).toBe("Day 1 — 06:00")
    expect(formatGameTime(2.5)).toBe("Day 3 — 12:00")
  })
})

describe("stepSim", () => {
  it("wears travelers down as they walk", () => {
    const map = makeMap()
    const travelers = [makeTraveler(0, "knight")]
    const sim = createSim(travelers, map)
    const s = sim.travelers.get(0)!
    const startX = s.x

    for (let i = 0; i < 10; i++) stepSim(sim, travelers, map, 1, 0.1)

    expect(s.hunger).toBeLessThan(80)
    expect(s.thirst).toBeLessThan(80)
    expect(s.stamina).toBeLessThan(80)
    expect(s.x).not.toBe(startX)
    expect(s.activity).toBe("walking")
  })

  it("camps in a clearing when exhausted — never in woods or on the road — then rests and returns", () => {
    const map = makeMap()
    const travelers = [makeTraveler(0, "knight", { stamina: 1, hunger: 100, thirst: 100 })]
    const sim = createSim(travelers, map)
    const s = sim.travelers.get(0)!

    expect(runUntil(sim, travelers, map, () => s.activity === "camping", 20)).toBe(true)
    const terrain = tileAt(map, worldToTileX(map, s.spot!.x), worldToTileZ(map, s.spot!.z))
    expect(["grass", "dirt"]).toContain(terrain)

    const staminaAsleep = s.stamina
    stepSim(sim, travelers, map, 1, 0.5)
    expect(s.stamina).toBeGreaterThan(staminaAsleep)

    expect(runUntil(sim, travelers, map, () => s.activity === "walking", 30)).toBe(true)
    expect(s.stamina).toBeGreaterThan(90)
    expect(s.spot).toBeNull()
  })

  it("has pilgrims join a nearby camp instead of camping alone", () => {
    const map = makeMap()
    const travelers = [
      makeTraveler(0, "friar", {}, 0.5),
      makeTraveler(1, "pilgrim", { stamina: 0.1, hunger: 100, thirst: 100 }, 0.6),
    ]
    const sim = createSim(travelers, map)

    // Hand-place the friar's camp a few tiles from the pilgrim's road position.
    const friar = sim.travelers.get(0)!
    friar.activity = "camping"
    friar.spot = { x: friar.x + 2, y: 0.2, z: friar.z + 2 }

    const pilgrim = sim.travelers.get(1)!
    expect(runUntil(sim, travelers, map, () => pilgrim.spot !== null, 5)).toBe(true)
    const dist = Math.hypot(pilgrim.spot!.x - friar.spot.x, pilgrim.spot!.z - friar.spot.z)
    expect(dist).toBeLessThan(3)
  })

  it("anchors anyone's camp to a nearby stall — food beats solitude", () => {
    const map = makeMap()
    const travelers = [
      makeTraveler(0, "vendor", {}, 0.5),
      makeTraveler(1, "knight", { stamina: 0.1, hunger: 100, thirst: 100 }, 0.6),
    ]
    const sim = createSim(travelers, map)

    const vendor = sim.travelers.get(0)!
    vendor.activity = "vending"
    vendor.timer = 999
    vendor.spot = { x: vendor.x + 1, y: 0.2, z: vendor.z + 2 }

    const knight = sim.travelers.get(1)!
    expect(runUntil(sim, travelers, map, () => knight.spot !== null, 5)).toBe(true)
    const dist = Math.hypot(knight.spot!.x - vendor.spot.x, knight.spot!.z - vendor.spot.z)
    expect(dist).toBeLessThan(3)
  })

  it("buys food from a vendor when starving; gold changes hands", () => {
    const map = makeMap()
    const travelers = [
      makeTraveler(0, "pilgrim", { hunger: 0.1, thirst: 100, gold: 10 }, 0.5),
      makeTraveler(1, "vendor", { gold: 50 }, 0.5),
    ]
    const sim = createSim(travelers, map)
    const buyer = sim.travelers.get(0)!
    const vendor = sim.travelers.get(1)!

    expect(runUntil(sim, travelers, map, () => buyer.hunger > 50, 10)).toBe(true)
    expect(buyer.gold).toBe(10 - FOOD_PRICE)
    expect(vendor.gold).toBe(50 + FOOD_PRICE)
    expect(buyer.activity).toBe("walking")
  })

  it("wine refills thirst and restores some stamina", () => {
    const map = makeMap()
    const travelers = [
      makeTraveler(0, "minstrel", { thirst: 0.1, hunger: 100, stamina: 50, gold: 10 }, 0.5),
      makeTraveler(1, "vendor", { gold: 0 }, 0.5),
    ]
    const sim = createSim(travelers, map)
    const buyer = sim.travelers.get(0)!
    const vendor = sim.travelers.get(1)!

    expect(runUntil(sim, travelers, map, () => buyer.thirst > 50, 10)).toBe(true)
    expect(buyer.gold).toBe(10 - WINE_PRICE)
    expect(vendor.gold).toBe(WINE_PRICE)
    // Roughly the bonus over where they were, less a moment of walking decay.
    expect(buyer.stamina).toBeGreaterThan(50 + WINE_STAMINA_BONUS - 5)
  })

  it("chases down a vendor further along the road", () => {
    const map = makeMap()
    const travelers = [
      makeTraveler(0, "pilgrim", { hunger: 0.1, thirst: 100 }, 0.2),
      makeTraveler(1, "vendor", {}, 0.7),
    ]
    const sim = createSim(travelers, map)
    const buyer = sim.travelers.get(0)!

    expect(runUntil(sim, travelers, map, () => buyer.activity === "seeking", 2)).toBe(true)
    expect(runUntil(sim, travelers, map, () => buyer.hunger > 50, 60)).toBe(true)
  })

  it("has vendors set up shop beside the path, then pack up and move on", () => {
    const map = makeMap()
    const travelers = [makeTraveler(1, "vendor", { stamina: 100, hunger: 100, thirst: 100 })]
    const sim = createSim(travelers, map)
    const s = sim.travelers.get(1)!

    expect(runUntil(sim, travelers, map, () => s.activity === "vending", 60)).toBe(true)
    // The stall stands on a clearing, off the road.
    const terrain = tileAt(map, worldToTileX(map, s.spot!.x), worldToTileZ(map, s.spot!.z))
    expect(["grass", "dirt"]).toContain(terrain)

    const parkedX = s.x
    const parkedZ = s.z
    stepSim(sim, travelers, map, 1, 0.5)
    expect(s.x).toBe(parkedX)
    expect(s.z).toBe(parkedZ)

    expect(runUntil(sim, travelers, map, () => s.activity === "walking", 40)).toBe(true)
    expect(s.spot).toBeNull()
    expect(
      runUntil(sim, travelers, map, () => Math.hypot(s.x - parkedX, s.z - parkedZ) > 1, 10),
    ).toBe(true)
  })

  it("holds stamina steady while minding the stall", () => {
    const map = makeMap()
    const travelers = [makeTraveler(1, "vendor", { stamina: 50, hunger: 100, thirst: 100 })]
    const sim = createSim(travelers, map)
    const s = sim.travelers.get(1)!
    s.activity = "vending"
    s.timer = 999

    stepSim(sim, travelers, map, 1, 0.5)
    expect(s.stamina).toBe(50)
    expect(s.hunger).toBeLessThan(100)
  })

  it("sells from a parked stall to a starving passer-by", () => {
    const map = makeMap()
    const travelers = [
      makeTraveler(0, "pilgrim", { hunger: 0.1, thirst: 100, gold: 10 }, 0.4),
      makeTraveler(1, "vendor", { gold: 0 }, 0.6),
    ]
    const sim = createSim(travelers, map)
    const buyer = sim.travelers.get(0)!
    const vendor = sim.travelers.get(1)!
    vendor.activity = "vending"
    vendor.timer = 999

    expect(runUntil(sim, travelers, map, () => buyer.hunger > 50, 30)).toBe(true)
    expect(vendor.gold).toBe(FOOD_PRICE)
    expect(vendor.activity).toBe("vending")
  })

  it("lets vendors eat from their own stock for free", () => {
    const map = makeMap()
    const travelers = [makeTraveler(0, "vendor", { hunger: 0.1, gold: 50 })]
    const sim = createSim(travelers, map)
    const s = sim.travelers.get(0)!

    expect(runUntil(sim, travelers, map, () => s.hunger > 50, 5)).toBe(true)
    expect(s.gold).toBe(50)
  })

  it("serves the penniless without payment", () => {
    const map = makeMap()
    const travelers = [
      makeTraveler(0, "pilgrim", { hunger: 0.1, thirst: 100, gold: 0 }, 0.5),
      makeTraveler(1, "vendor", { gold: 50 }, 0.5),
    ]
    const sim = createSim(travelers, map)
    const buyer = sim.travelers.get(0)!

    expect(runUntil(sim, travelers, map, () => buyer.hunger > 50, 10)).toBe(true)
    expect(buyer.gold).toBe(0)
    expect(sim.travelers.get(1)!.gold).toBe(50)
  })
})
