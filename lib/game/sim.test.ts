import { describe, expect, it } from "vitest"
import { DEFAULT_BALANCE } from "./balance"
import { SIMULATION_SPEEDS } from "./simulation-store"

import { DEFAULT_MOVEMENT, LINEAR_MOVEMENT } from "./motion"
import { BRIDGE_RISE } from "./map/bridges"
import { parseAsciiMap } from "./map/prototype-map"
import { TILE_HEIGHT, type TerrainId } from "./map/terrain"
import { tileAt, tileToWorldX, tileToWorldZ, worldToTileX, worldToTileZ, type GameMap } from "./map/types"
import {
  createSim,
  FOOD_PRICE,
  GAME_DAY_SECONDS,
  formatGameTime,
  stepSim,
  WINE_PRICE,
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
  return { width, depth, tiles, buildings: [], seed: 1, road, shortcuts: [] }
}

/** The same road, but the whole map is old growth — every tile is perilous. */
function makeDarkMap(): GameMap {
  const map = makeMap()
  for (let i = 0; i < map.tiles.length; i++) if (map.tiles[i] !== "path") map.tiles[i] = "darkwood"
  return map
}

/**
 * A long straight road on open ground with one track looping off it between
 * road indices 8 and 20 through a row of old growth at z=1. Nothing on the
 * road itself is dangerous, so only the track can turn anyone back.
 */
function makeTrackMap(): GameMap {
  const width = 40
  const depth = 9
  const tiles = new Array<TerrainId>(width * depth).fill("grass")
  const road: Array<{ x: number; z: number }> = []
  for (let x = 0; x < width; x++) {
    tiles[4 * width + x] = "path"
    road.push({ x, z: 4 })
  }
  for (let x = 0; x < width; x++) tiles[0 * width + x] = "darkwood"
  const track: Array<{ x: number; z: number }> = []
  for (let z = 4; z >= 1; z--) track.push({ x: 8, z })
  for (let x = 9; x <= 20; x++) track.push({ x, z: 1 })
  for (let z = 2; z <= 4; z++) track.push({ x: 20, z })
  for (const p of track) if (tiles[p.z * width + p.x] !== "path") tiles[p.z * width + p.x] = "track"
  return { width, depth, tiles, buildings: [], seed: 1, road, shortcuts: [{ entry: 8, exit: 20, tiles: track }] }
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

it("scales distance traveled with each character's rendered stride", () => {
  const map = makeMap()
  const travelers = [makeTraveler(1, "peasant"), makeTraveler(2, "peasant")]
  const sim = createSim(travelers, map)
  const starts = travelers.map(t => sim.travelers.get(t.id)!.x)
  const scales = new Map([[1, 0.5], [2, 1.5]])
  for (let frame = 0; frame < 60; frame++) stepSim(sim, travelers, map, 0.32, 1 / 60, LINEAR_MOVEMENT, scales)
  expect(sim.travelers.get(1)!.x - starts[0]).toBeCloseTo(0.16, 8)
  expect(sim.travelers.get(2)!.x - starts[1]).toBeCloseTo(0.48, 8)
})

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
  it("lasts five real minutes at the displayed normal speed", () => {
    const normal = SIMULATION_SPEEDS.find(speed => speed.label === 1)!
    expect(GAME_DAY_SECONDS / normal.rate).toBe(300)
  })
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
  it("uses live needs tuning for walkers and keeps camping's reduced drain", () => {
    const map = makeMap()
    const travelers = [makeTraveler(0, "knight")]
    const sim = createSim(travelers, map)
    sim.balance = structuredClone(DEFAULT_BALANCE)
    const s = sim.travelers.get(0)!
    const hour = GAME_DAY_SECONDS / 24
    stepSim(sim, travelers, map, 1, hour)
    expect([s.hunger, s.thirst, s.stamina]).toEqual([77, 74, 75.8])

    Object.assign(sim.balance.rules, { hungerDecay: 2, thirstDecay: 6, staminaDecay: 0 })
    stepSim(sim, travelers, map, 1, hour)
    expect([s.hunger, s.thirst, s.stamina]).toEqual([75, 68, 75.8])

    s.activity = "camping"
    s.stamina = 0
    stepSim(sim, travelers, map, 1, hour)
    expect([s.hunger, s.thirst, s.stamina]).toEqual([74, 65, 60])
  })

  it("keeps food and water supplied longer over an active day", () => {
    const map = makeMap()
    const travelers = [makeTraveler(0, "knight", { hunger: 100, thirst: 100, stamina: 100 })]
    const sim = createSim(travelers, map)
    const s = sim.travelers.get(0)!
    const depleted = { hunger: 0, thirst: 0, stamina: 0 }
    for (let elapsed = 0; elapsed < GAME_DAY_SECONDS; elapsed += 0.25) {
      stepSim(sim, travelers, map, 1, 0.25)
      for (const need of ["hunger", "thirst", "stamina"] as const) {
        if (s[need] > 0) continue
        depleted[need]++
        s[need] = 100 // Immediate replenishment measures the active-day baseline.
        s.activity = "walking"
      }
    }
    expect(depleted).toEqual({ hunger: 0, thirst: 1, stamina: 1 })
    expect(sim.time).toBeCloseTo(1.25)
  })

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
    expect(["grass", "dirt", "clearing"]).toContain(terrain)

    const staminaAsleep = s.stamina
    stepSim(sim, travelers, map, 1, 0.5)
    expect(s.stamina).toBeGreaterThan(staminaAsleep)

    expect(runUntil(sim, travelers, map, () => s.activity === "walking", GAME_DAY_SECONDS / 4)).toBe(true)
    expect(s.stamina).toBeGreaterThan(90)
    expect(s.spot).toBeNull()
    expect(s.z).toBeCloseTo(tileToWorldZ(map, 4) - s.laneOffset)
  })

  it("keeps new camps out of purchased building footprints", () => {
    const map = makeMap()
    map.buildings.push({
      id: "settlement-0", buildType: "shelter", label: "Shelter",
      x: 0, z: 5, w: map.width, d: 1, height: 1, color: "#888", roofColor: "#444",
    })
    const travelers = [makeTraveler(0, "knight", { stamina: 1, hunger: 100, thirst: 100 })]
    const sim = createSim(travelers, map)
    const traveler = sim.travelers.get(0)!

    expect(runUntil(sim, travelers, map, () => traveler.activity === "camping", 20)).toBe(true)
    expect(worldToTileZ(map, traveler.spot!.z)).not.toBe(5)
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

  it("wine refills thirst without replacing sleep or buying a half-full meal", () => {
    const map = makeMap()
    const travelers = [
      makeTraveler(0, "minstrel", { thirst: 0.1, hunger: 50, stamina: 50, gold: 10 }, 0.5),
      makeTraveler(1, "vendor", { gold: 0 }, 0.5),
    ]
    const sim = createSim(travelers, map)
    const buyer = sim.travelers.get(0)!
    const vendor = sim.travelers.get(1)!

    expect(runUntil(sim, travelers, map, () => buyer.thirst > 50, 10)).toBe(true)
    expect(buyer.gold).toBe(10 - WINE_PRICE)
    expect(vendor.gold).toBe(WINE_PRICE)
    expect(buyer.stamina).toBeLessThan(50)
    expect(buyer.hunger).toBeLessThan(50)
  })

  it("needs only one drink in the first day when starting fully supplied", () => {
    const map = makeMap()
    const travelers = [
      makeTraveler(0, "pilgrim", { hunger: 100, thirst: 100, gold: 100 }),
      makeTraveler(1, "vendor", { gold: 0 }),
    ]
    const sim = createSim(travelers, map)
    sim.balance = structuredClone(DEFAULT_BALANCE)
    sim.balance.rules.staminaDecay = 0 // Isolate food and drink from sleep.
    const buyer = sim.travelers.get(0)!, vendor = sim.travelers.get(1)!
    vendor.timer = GAME_DAY_SECONDS + 1
    let meals = 0, drinks = 0
    for (let elapsed = 0; elapsed < GAME_DAY_SECONDS; elapsed += 0.25) {
      const { hunger, thirst } = buyer
      stepSim(sim, travelers, map, 0, 0.25)
      if (buyer.hunger > hunger) meals++
      if (buyer.thirst > thirst) drinks++
    }
    expect({ meals, drinks }).toEqual({ meals: 0, drinks: 1 })
    expect(buyer.gold).toBe(100 - WINE_PRICE)
    expect(vendor.gold).toBe(WINE_PRICE)
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

    expect(runUntil(sim, travelers, map, () => s.activity === "vending", GAME_DAY_SECONDS / 2)).toBe(true)
    // The stall stands on a clearing, off the road.
    const terrain = tileAt(map, worldToTileX(map, s.spot!.x), worldToTileZ(map, s.spot!.z))
    expect(["grass", "dirt", "clearing"]).toContain(terrain)

    const parkedX = s.x
    const parkedZ = s.z
    stepSim(sim, travelers, map, 1, 0.5)
    expect(s.x).toBe(parkedX)
    expect(s.z).toBe(parkedZ)

    expect(s.timer).toBeGreaterThanOrEqual(GAME_DAY_SECONDS - 0.5)
    for (let elapsed = 0; elapsed < GAME_DAY_SECONDS - 1; elapsed += 0.25) {
      stepSim(sim, travelers, map, 1, 0.25)
      expect(s.activity).toBe("vending")
      expect([s.x, s.z]).toEqual([parkedX, parkedZ])
    }
    expect(runUntil(sim, travelers, map, () => s.activity === "walking", GAME_DAY_SECONDS / 3)).toBe(true)
    expect(s.spot).toBeNull()
    expect(
      runUntil(sim, travelers, map, () => Math.hypot(s.x - parkedX, s.z - parkedZ) > 1, 10),
    ).toBe(true)
  })

  it("briefly opens and packs animal-drawn shops, waiting for recall before departure", () => {
    for (const id of [4, 8]) { // donkey and horse
      const map = makeMap(), travelers = [makeTraveler(id, "vendor", { stamina: 100, hunger: 100, thirst: 100 })]
      const sim = createSim(travelers, map), vendor = sim.travelers.get(id)!
      vendor.timer = 0
      expect(runUntil(sim, travelers, map, () => vendor.activity === "openingShop", 60)).toBe(true)
      expect(vendor.pasture).toBeDefined()
      expect(Math.abs(worldToTileZ(map, vendor.z) - 4)).toBe(2)
      const originalProgress = vendor.progress, returnProgress = vendor.stallRoute!.returnProgress
      expect((returnProgress - originalProgress) * vendor.direction).toBeGreaterThan(0)
      const parked = [vendor.x, vendor.z]
      stepSim(sim, travelers, map, 1, 1)
      expect(vendor.activity).toBe("openingShop")
      expect([vendor.x, vendor.z]).toEqual(parked)
      expect(runUntil(sim, travelers, map, () => vendor.activity === "vending", 5)).toBe(true)
      vendor.timer = 100
      for (let i = 0; i < 30; i++) stepSim(sim, travelers, map, 1, 0.1)
      vendor.timer = 0
      stepSim(sim, travelers, map, 1, 0.1)
      expect(runUntil(sim, travelers, map, () => vendor.activity === "packingShop", 25)).toBe(true)
      stepSim(sim, travelers, map, 1, 1)
      expect(vendor.activity).toBe("packingShop")
      expect([vendor.x, vendor.z]).toEqual(parked)
      expect(runUntil(sim, travelers, map, () => vendor.activity === "fromShop", 30)).toBe(true)
      expect(vendor.pasture).toBeUndefined()
      expect(runUntil(sim, travelers, map, () => vendor.activity === "walking", 10)).toBe(true)
      expect(vendor.progress).toBeCloseTo(returnProgress)
    }
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

  it("walks customers along the path, up to the frontage, and back after the purchase", () => {
    const map = makeMap(), travelers = [makeTraveler(4, "vendor", { hunger: 100, thirst: 100, stamina: 100 }), makeTraveler(0, "peasant", { hunger: 100, thirst: 100, stamina: 100, gold: 20 }, 0.2)]
    const sim = createSim(travelers, map), vendor = sim.travelers.get(4)!, buyer = sim.travelers.get(0)!
    vendor.timer = 0
    expect(runUntil(sim, travelers, map, () => vendor.activity === "vending", 60)).toBe(true)
    vendor.timer = 999; buyer.hunger = 0
    expect(runUntil(sim, travelers, map, () => buyer.activity === "toStall", 60)).toBe(true)
    expect(tileAt(map, worldToTileX(map, buyer.x), worldToTileZ(map, buyer.z))).toBe("path")
    expect(buyer.progress).toBeCloseTo(vendor.stallRoute!.entranceProgress)
    expect(buyer.hunger).toBe(0)
    expect(runUntil(sim, travelers, map, () => {
      const visit = buyer.customerVisit!, road = visit.road, front = visit.frontage
      // Do not overshoot into the wares while aligning to a grid-tile centre.
      expect(buyer.x).toBeCloseTo(road.x)
      expect(buyer.z).toBeGreaterThanOrEqual(Math.min(road.z, front.z) - 1e-8)
      expect(buyer.z).toBeLessThanOrEqual(Math.max(road.z, front.z) + 1e-8)
      return buyer.activity === "browsing"
    }, 10)).toBe(true)
    expect(buyer.x).toBeCloseTo(vendor.stallRoute!.frontage.x)
    expect(buyer.z).toBeCloseTo(vendor.stallRoute!.frontage.z)
    expect(buyer.hunger).toBe(0)
    expect(runUntil(sim, travelers, map, () => buyer.activity === "fromStall", 5)).toBe(true)
    expect(buyer.hunger).toBeGreaterThan(99)
    expect(runUntil(sim, travelers, map, () => buyer.activity === "walking", 10)).toBe(true)
    expect(tileAt(map, worldToTileX(map, buyer.x), worldToTileZ(map, buyer.z))).toBe("path")
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

describe("left-hand walking lanes", () => {
  it.each([1, -1] as const)("follows the rendered diagonal through a stair-step road in direction %i", (direction) => {
    const map = parseAsciiMap([".........", "===......", "..==.....", "...==....", "....=====", "........."])
    map.road = [[0, 1], [1, 1], [2, 1], [2, 2], [3, 2], [3, 3], [4, 3], [4, 4], [5, 4], [6, 4], [7, 4], [8, 4]]
      .map(([x, z]) => ({ x, z }))
    const traveler = { ...makeTraveler(0, "knight", {}, (direction === 1 ? 4 : 5) / 11), direction }
    const sim = createSim([traveler], map)
    const s = sim.travelers.get(0)!
    let previous = { x: s.x, z: s.z }
    for (let tick = 0; tick < 10; tick++) {
      stepSim(sim, [traveler], map, 1, 0.1)
      expect(s.x - previous.x).toBeCloseTo(s.z - previous.z, 7)
      expect(Math.hypot(s.x - previous.x, s.z - previous.z)).toBeGreaterThan(0)
      expect(tileAt(map, worldToTileX(map, s.x), worldToTileZ(map, s.z))).toBe("path")
      previous = { x: s.x, z: s.z }
    }
  })

  it.each(([1, -1] as const).flatMap(direction => [LINEAR_MOVEMENT, DEFAULT_MOVEMENT].map(movement => ({ direction, movement }))))(
    "keeps left across bridge ramps and the raised deck with direction $direction and tuning $movement", ({ direction, movement }) => {
    const map = makeMap()
    for (let x = 9; x <= 11; x++) map.tiles[4 * map.width + x] = "bridge"
    const t = makeTraveler(0, "knight", {}, (direction === 1 ? 6 : 13) / 23)
    t.direction = direction
    const sim = createSim([t], map)
    const s = sim.travelers.get(0)!
    for (let i = 0; i <= 28; i++) {
      // Ground at 7 and 13, half-rise ramps at 8 and 12, full deck at 9–11.
      const rise = Math.max(0, Math.min(s.progress - 7, 13 - s.progress, 2)) * BRIDGE_RISE / 2
      expect(s.y).toBeCloseTo(TILE_HEIGHT + rise)
      expect(s.z).toBeCloseTo(tileToWorldZ(map, 4) - direction * s.laneOffset)
      if (i < 28) stepSim(sim, [t], map, 1, 0.25, movement)
    }
  })

  it.each([[1, 0], [-1, 0], [0, 1], [0, -1]])(
    "keeps both directions to their own left on a route heading (%i, %i)",
    (dx, dz) => {
      const map = makeMap()
      map.road = Array.from({ length: 5 }, (_, i) => ({ x: 10 + dx * i, z: 4 + dz * i }))
      const travelers = [makeTraveler(0, "knight"), makeTraveler(1, "knight")]
      travelers[1].direction = -1
      const sim = createSim(travelers, map)
      const centre = map.road[2]
      for (const t of travelers) {
        const s = sim.travelers.get(t.id)!
        const x = s.x - tileToWorldX(map, centre.x)
        const z = s.z - tileToWorldZ(map, centre.z)
        expect((x * dz - z * dx) * t.direction).toBeCloseTo(s.laneOffset)
        expect(s.laneOffset).toBeGreaterThanOrEqual(0.18)
        expect(s.laneOffset).toBeLessThan(0.28)
      }
    },
  )

  it("varies each person's line reproducibly without depending on crowd order", () => {
    const map = makeMap()
    const travelers = Array.from({ length: 10 }, (_, id) => makeTraveler(id, "knight"))
    const sim = createSim(travelers, map)
    const reordered = createSim([...travelers].reverse(), map)
    const offsets = [...sim.travelers.values()].map((s) => s.laneOffset)
    expect(new Set(offsets).size).toBe(travelers.length)
    for (const s of sim.travelers.values()) expect(reordered.travelers.get(s.id)).toEqual(s)
    expect(createSim(travelers, { ...map, seed: 2 }).travelers.get(0)!.laneOffset).not.toBe(offsets[0])
  })

  it.each([1, -1] as const)("stays on the path through bends without position jumps (direction %i)", (direction) => {
    const map = makeMap()
    map.tiles.fill("grass")
    map.road = [
      { x: 8, z: 4 }, { x: 9, z: 4 }, { x: 10, z: 4 },
      { x: 10, z: 5 }, { x: 10, z: 6 }, { x: 11, z: 6 }, { x: 12, z: 6 },
    ]
    for (const tile of map.road) map.tiles[tile.z * map.width + tile.x] = "path"
    const t = makeTraveler(0, "knight", {}, direction === 1 ? 0 : 1)
    t.direction = direction
    const sim = createSim([t], map)
    const s = sim.travelers.get(0)!
    for (let i = 0; i < 550; i++) {
      const before = { x: s.x, z: s.z }
      stepSim(sim, [t], map, 1, 0.01)
      expect(Math.hypot(s.x - before.x, s.z - before.z)).toBeLessThan(0.02)
      expect(tileAt(map, worldToTileX(map, s.x), worldToTileZ(map, s.z))).toBe("path")
    }
  })

  it("crosses gradually to the new left lane when turning back", () => {
    const map = makeMap()
    const t = makeTraveler(0, "knight")
    const sim = createSim([t], map)
    const s = sim.travelers.get(0)!
    const startZ = s.z
    s.direction = -1
    stepSim(sim, [t], map, 1, 0.1)
    expect(s.z - startZ).toBeGreaterThan(0)
    expect(s.z - startZ).toBeLessThan(0.1)
    for (let i = 0; i < 10; i++) stepSim(sim, [t], map, 1, 0.1)
    expect(s.z).toBeCloseTo(tileToWorldZ(map, 4) + s.laneOffset)
  })

  it("uses the actual walking direction while seeking a vendor behind them", () => {
    const map = makeMap()
    const travelers = [makeTraveler(0, "pilgrim", { hunger: 0 }, 0.8), makeTraveler(1, "vendor", {}, 0.2)]
    const sim = createSim(travelers, map)
    const s = sim.travelers.get(0)!
    for (let i = 0; i < 10; i++) stepSim(sim, travelers, map, 1, 0.1)
    expect(s.activity).toBe("seeking")
    expect(s.direction).toBe(1)
    expect(s.progress).toBeLessThan(0.8 * (map.road!.length - 1))
    expect(s.z).toBeCloseTo(tileToWorldZ(map, 4) + s.laneOffset)
  })
})

describe("danger on the road", () => {
  it("never troubles anyone on open country", () => {
    const map = makeMap()
    const travelers = [makeTraveler(0, "minstrel", { hunger: 100, thirst: 100 }, 0.1)]
    const sim = createSim(travelers, map)
    const s = sim.travelers.get(0)!
    // Six game hours: long enough to lap the road, short enough to stay fed.
    for (let i = 0; i < 300; i++) stepSim(sim, travelers, map, 1, 0.1)
    expect(s.fled).toBe(0)
    expect(s.direction).toBe(1)
    expect(s.activity).toBe("walking")
  })

  it("turns the faint-hearted back in the dark, hurrying the way they came", () => {
    const map = makeDarkMap()
    const travelers = [makeTraveler(0, "minstrel", { hunger: 100, thirst: 100 }, 0.1)]
    const sim = createSim(travelers, map)
    const s = sim.travelers.get(0)!
    let sawFleeing = false
    expect(
      runUntil(
        sim,
        travelers,
        map,
        () => {
          if (s.activity === "fleeing") sawFleeing = true
          return s.fled > 0
        },
        120,
      ),
    ).toBe(true)
    expect(sawFleeing).toBe(true)
    expect(s.direction).toBe(-1)
    // The fright wears off and they walk on — in the new direction.
    expect(runUntil(sim, travelers, map, () => s.activity === "walking", GAME_DAY_SECONDS / 4)).toBe(true)
    expect(s.direction).toBe(-1)
  })

  it("replays identically: the same traveler meets the same trouble", () => {
    const map = makeDarkMap()
    const run = () => {
      const travelers = [makeTraveler(3, "pilgrim", { hunger: 100, thirst: 100 }, 0.2)]
      const sim = createSim(travelers, map)
      for (let i = 0; i < 400; i++) stepSim(sim, travelers, map, 1, 0.1)
      const s = sim.travelers.get(3)!
      return [s.fled, s.direction, s.progress, s.rolls]
    }
    expect(run()).toEqual(run())
  })

  it("has knights lose their nerve far less often than minstrels", () => {
    const map = makeDarkMap()
    const fledBy = (type: TravelerTypeId) => {
      let fled = 0
      for (let id = 0; id < 12; id++) {
        const travelers = [makeTraveler(id, type, { hunger: 100, thirst: 100, stamina: 100 }, 0.1)]
        const sim = createSim(travelers, map)
        for (let i = 0; i < 300; i++) stepSim(sim, travelers, map, 1, 0.1)
        fled += sim.travelers.get(id)!.fled
      }
      return fled
    }
    expect(fledBy("minstrel")).toBeGreaterThan(fledBy("knight") * 2)
  })
})

describe("tracks through the dark forest", () => {
  /** Start just west of the track's mouth and walk east through it. */
  const beforeMouth = 6 / 39

  it.each([1, -1] as const)("keeps left on tracks and rejoins the road's lane continuously (direction %i)", (direction) => {
    const map = makeTrackMap()
    const t = makeTraveler(0, "knight")
    t.direction = direction
    const sim = createSim([t], map)
    sim.danger.fill(0)
    const s = sim.travelers.get(0)!
    s.track = { index: 0, progress: 9 }
    stepSim(sim, [t], map, 1, 0)
    expect(s.z).toBeCloseTo(tileToWorldZ(map, 1) - direction * s.laneOffset)

    const track = map.shortcuts![0]
    s.track!.progress = direction === 1 ? track.tiles.length - 1 - 0.00001 : 0.00001
    stepSim(sim, [t], map, 1, 0)
    const before = { x: s.x, z: s.z }
    stepSim(sim, [t], map, 1, 0.00002)
    expect(s.track).toBeNull()
    expect(s.progress).toBe(direction === 1 ? track.exit : track.entry)
    expect(Math.hypot(s.x - before.x, s.z - before.z)).toBeLessThan(0.00003)
    expect(s.z).toBeCloseTo(tileToWorldZ(map, 4) - direction * s.laneOffset)
  })

  it("tempts some knights but never merchants, vendors, or minstrels", () => {
    const map = makeTrackMap()
    const tookTrack = (type: TravelerTypeId, piety = 50) => {
      let took = 0
      for (let id = 0; id < 12; id++) {
        const travelers = [makeTraveler(id, type, { piety, hunger: 100, thirst: 100 }, beforeMouth)]
        const sim = createSim(travelers, map)
        const s = sim.travelers.get(id)!
        if (runUntil(sim, travelers, map, () => s.track !== null, 8)) took++
      }
      return took
    }
    expect(tookTrack("knight")).toBeGreaterThan(0)
    expect(tookTrack("merchant")).toBe(0)
    expect(tookTrack("vendor")).toBe(0)
    expect(tookTrack("minstrel")).toBe(0)
    expect(tookTrack("pilgrim")).toBe(0)
    // The very pious are drawn through; friars too.
    expect(tookTrack("pilgrim", 95)).toBeGreaterThan(0)
    expect(tookTrack("friar", 95)).toBeGreaterThan(0)
  })

  it("tempts a worn-out pilgrim who would otherwise stay on the road", () => {
    const map = makeTrackMap()
    let took = 0
    for (let id = 0; id < 12; id++) {
      const travelers = [makeTraveler(id, "pilgrim", { stamina: 20, hunger: 100, thirst: 100 }, beforeMouth)]
      const sim = createSim(travelers, map)
      const s = sim.travelers.get(id)!
      if (runUntil(sim, travelers, map, () => s.track !== null, 8)) took++
    }
    expect(took).toBeGreaterThan(0)
  })

  it("walks the track to its far end and rejoins the road at the exit", () => {
    const map = makeTrackMap()
    const travelers = [makeTraveler(0, "knight", { hunger: 100, thirst: 100 }, beforeMouth)]
    const sim = createSim(travelers, map)
    const s = sim.travelers.get(0)!
    s.progress = 8
    s.track = { index: 0, progress: 0 }
    const trackTiles = map.shortcuts![0].tiles
    // Somewhere along the way they stand on the track, off the road.
    expect(runUntil(sim, travelers, map, () => worldToTileZ(map, s.z) === 1, 30)).toBe(true)
    expect(tileAt(map, worldToTileX(map, s.x), worldToTileZ(map, s.z))).toBe("track")
    expect(runUntil(sim, travelers, map, () => s.track === null, 60)).toBe(true)
    expect(s.progress).toBe(20)
    const exitTile = trackTiles[trackTiles.length - 1]
    expect(worldToTileX(map, s.x)).toBe(exitTile.x)
    expect(worldToTileZ(map, s.z)).toBe(exitTile.z)
  })

  it("comes back from camp to the track it was on, not the road", () => {
    const map = makeTrackMap()
    const travelers = [makeTraveler(0, "knight", { stamina: 0.5, hunger: 100, thirst: 100 }, beforeMouth)]
    const sim = createSim(travelers, map)
    const s = sim.travelers.get(0)!
    s.track = { index: 0, progress: 8 }
    expect(runUntil(sim, travelers, map, () => s.activity === "camping", 20)).toBe(true)
    expect(runUntil(sim, travelers, map, () => s.activity === "walking", 60)).toBe(true)
    expect(s.track).not.toBeNull()
    expect(tileAt(map, worldToTileX(map, s.x), worldToTileZ(map, s.z))).toBe("track")
  })
})

describe("off-road grid walking", () => {
  it.each(["toCamp", "toShop"] as const)("routes %s around a wall and water instead of walking straight through them", (activity) => {
    const map = makeMap()
    map.buildings.push({ id: "inn", label: "Inn", x: 12, z: 5, w: 2, d: 2, height: 1, color: "", roofColor: "" })
    map.tiles[6 * map.width + 11] = "water"
    const traveler = makeTraveler(0, activity === "toShop" ? "vendor" : "knight", {}, 12 / 23)
    const sim = createSim([traveler], map), s = sim.travelers.get(0)!
    s.activity = activity
    s.spot = { x: tileToWorldX(map, 12), y: TILE_HEIGHT, z: tileToWorldZ(map, 7) }
    s.walkFrom = { x: s.x, y: s.y, z: s.z }
    for (let i = 0; i < 2000 && s.activity === activity; i++) {
      const before = { x: s.x, z: s.z }
      stepSim(sim, [traveler], map, 1, 0.01, DEFAULT_MOVEMENT)
      const x = worldToTileX(map, s.x), z = worldToTileZ(map, s.z)
      expect(x >= 12 && x < 14 && z >= 5 && z < 7).toBe(false)
      expect(tileAt(map, x, z)).not.toBe("water")
      expect(Math.hypot(s.x - before.x, s.z - before.z)).toBeLessThanOrEqual(s.moveSpeed * 0.01 + 1e-8)
    }
    expect(s.activity).toBe(activity === "toCamp" ? "camping" : "openingShop")
    expect(s.x).toBe(s.spot.x)
    expect(s.z).toBe(s.spot.z)
    // Force the return journey and check the same obstacles in reverse.
    s.activity = activity === "toCamp" ? "fromCamp" : "fromShop"
    s.offRoadRoute = null
    for (let i = 0; i < 2000 && !["walking"].includes(s.activity); i++) {
      stepSim(sim, [traveler], map, 1, 0.01)
      const x = worldToTileX(map, s.x), z = worldToTileZ(map, s.z)
      expect(x >= 12 && x < 14 && z >= 5 && z < 7).toBe(false)
      expect(tileAt(map, x, z)).not.toBe("water")
    }
    expect(s.activity).toBe("walking")
    expect(s.z).toBeCloseTo(tileToWorldZ(map, 4) - s.laneOffset)
  })

  it("does not choose a camping spot across an impassable forest ridge", () => {
    const map = makeMap(), traveler = makeTraveler(0, "knight", { stamina: 0 })
    const sim = createSim([traveler], map), s = sim.travelers.get(0)!
    // A nearby vendor attracts the camper toward the unreachable side.
    const vendor = { ...s, id: 1, activity: "vending" as const, spot: { x: s.x, y: TILE_HEIGHT, z: tileToWorldZ(map, 2) } }
    sim.travelers.set(1, vendor)
    stepSim(sim, [traveler], map, 1, 0.1)
    expect(s.spot).not.toBeNull()
    expect(worldToTileZ(map, s.spot!.z)).toBeGreaterThan(4)
  })
})

describe("roadside music", () => {
  function performance() {
    const map = makeMap(), travelers = [makeTraveler(0, "minstrel", { hunger: 100, thirst: 100, stamina: 100 })]
    const sim = createSim(travelers, map), minstrel = sim.travelers.get(0)!
    minstrel.timer = 0
    expect(runUntil(sim, travelers, map, () => minstrel.activity === "performing", 20)).toBe(true)
    return { map, travelers, sim, minstrel }
  }

  it("periodically leaves the road to play, then rejoins at its original lane", () => {
    const { map, travelers, sim, minstrel } = performance()
    expect(tileAt(map, worldToTileX(map, minstrel.x), worldToTileZ(map, minstrel.z))).toBe("grass")
    const position = [minstrel.x, minstrel.z], progress = minstrel.progress
    for (let i = 0; i < 100; i++) stepSim(sim, travelers, map, 1, 0.1)
    expect(minstrel.activity).toBe("performing")
    expect([minstrel.x, minstrel.z]).toEqual(position)
    expect(runUntil(sim, travelers, map, () => minstrel.activity === "walking", 110)).toBe(true)
    expect(minstrel.progress).toBe(progress)
    expect(minstrel.spot).toBeNull()
    expect(minstrel.timer).toBeGreaterThan(GAME_DAY_SECONDS / 12)
    expect(minstrel.cycle).toBe(1)
  })

  it("gathers a spaced audience that stands, listens, and leaves when the music ends", () => {
    const { map, travelers, sim, minstrel } = performance()
    const audience = Array.from({ length: 16 }, (_, i) => makeTraveler(i + 1, "peasant", { hunger: 100, thirst: 100, stamina: 100 }))
    const people = createSim(audience, map)
    for (const [id, person] of people.travelers) sim.travelers.set(id, person)
    travelers.push(...audience)
    expect(runUntil(sim, travelers, map, () => [...sim.travelers.values()].filter(s => s.activity === "listening").length >= 3, 15)).toBe(true)
    const listeners = [...sim.travelers.values()].filter(s => s.activity === "listening")
    expect(new Set(listeners.map(s => `${s.x},${s.z}`)).size).toBe(listeners.length)
    const positions = listeners.map(s => [s.x, s.z])
    stepSim(sim, travelers, map, 1, 0.1)
    expect(listeners.map(s => [s.x, s.z])).toEqual(positions)
    for (const s of listeners) expect(tileAt(map, worldToTileX(map, s.x), worldToTileZ(map, s.z))).toBe("grass")
    minstrel.timer = 0
    expect(runUntil(sim, travelers, map, () => listeners.every(s => s.activity === "walking"), 20)).toBe(true)
    for (const s of listeners) {
      expect(s.musicVisit).toBeUndefined()
      expect(s.musicCooldown).toBeGreaterThan(0)
    }
  })

  it("abandons an approach if the performer leaves", () => {
    const { map, travelers, sim, minstrel } = performance()
    const audience = Array.from({ length: 8 }, (_, i) => makeTraveler(i + 1, "pilgrim"))
    for (const [id, s] of createSim(audience, map).travelers) sim.travelers.set(id, s)
    travelers.push(...audience)
    stepSim(sim, travelers, map, 1, 0.1)
    const approaching = [...sim.travelers.values()].find(s => s.activity === "toListen")!
    expect(approaching).toBeDefined()
    minstrel.timer = 0
    stepSim(sim, travelers, map, 1, 0.1)
    expect(approaching.activity).toBe("fromListening")
    expect(runUntil(sim, travelers, map, () => approaching.activity === "walking", 20)).toBe(true)
  })

  it("lets hungry listeners leave before a performance finishes", () => {
    const { map, travelers, sim, minstrel } = performance()
    const audience = Array.from({ length: 8 }, (_, i) => makeTraveler(i + 1, "peasant"))
    for (const [id, s] of createSim(audience, map).travelers) sim.travelers.set(id, s)
    travelers.push(...audience)
    expect(runUntil(sim, travelers, map, () => [...sim.travelers.values()].some(s => s.activity === "listening"), 15)).toBe(true)
    const listener = [...sim.travelers.values()].find(s => s.activity === "listening")!
    listener.thirst = 5
    stepSim(sim, travelers, map, 1, 0.1)
    expect(listener.activity).toBe("fromListening")
    expect(minstrel.activity).toBe("performing")
  })

  it("keeps minstrels moving when no safe roadside pitch exists", () => {
    const map = makeDarkMap(), travelers = [makeTraveler(0, "minstrel")]
    const sim = createSim(travelers, map), s = sim.travelers.get(0)!
    sim.danger.fill(0); s.timer = 0
    const before = s.progress
    stepSim(sim, travelers, map, 1, 0.1)
    expect(s.activity).toBe("walking")
    expect(s.progress).toBeGreaterThan(before)
    expect(s.spot).toBeNull()
  })
})
