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
    expect(["grass", "dirt", "clearing"]).toContain(terrain)

    const staminaAsleep = s.stamina
    stepSim(sim, travelers, map, 1, 0.5)
    expect(s.stamina).toBeGreaterThan(staminaAsleep)

    expect(runUntil(sim, travelers, map, () => s.activity === "walking", 30)).toBe(true)
    expect(s.stamina).toBeGreaterThan(90)
    expect(s.spot).toBeNull()
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
    expect(["grass", "dirt", "clearing"]).toContain(terrain)

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
    expect(runUntil(sim, travelers, map, () => s.activity === "walking", 30)).toBe(true)
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
