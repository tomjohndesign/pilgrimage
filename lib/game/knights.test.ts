import { describe, expect, it } from "vitest"
import { followKnight, knightLoadout, knightMounted, knightTravelSpeed, type TrailPoint } from "./knights"
import { createSim, stepSim } from "./sim"
import { DEFAULT_WALK_SPEED } from "./base-person/gait"
import { knightDesign } from "./knight/design"
import { personWalkStride, DEFAULT_WALK_CADENCE } from "./base-person/gait"
import { travelerAppearance } from "./base-person/population"
import { TRAVELER_TYPES, type Traveler } from "./travelers"
import { animalWalkSpeed } from "./transport/assets"
import { tileAt, worldToTileX, worldToTileZ, tileToWorldX, tileToWorldZ } from "./map/types"
import { ENCLAVE_FIELD_RADIUS } from "./transport/enclave-parking"
import type { GameMap } from "./map/types"

function fixture(direction: 1 | -1) {
  const map: GameMap = { width: 30, depth: 20, seed: 1, tiles: Array(600).fill("grass"),
    road: Array.from({ length: 30 }, (_, x) => ({ x, z: 14 })),
    buildings: [{ id: "shrine", x: 13, z: 5, w: 3, d: 5, height: 2, label: "Shrine", color: "", roofColor: "" }],
    site: { hovelId: "shrine", door: { x: 14, z: 10 }, junction: 14, branch: Array.from({ length: 5 }, (_, i) => ({ x: 14, z: 14 - i })) } }
  for (const p of [...map.road!, ...map.site!.branch]) map.tiles[p.z * map.width + p.x] = "path"
  const t: Traveler = { id: 0, type: TRAVELER_TYPES.knight, name: "Knight", pace: 1, direction, offset: (14 - direction * 0.03) / 29,
    attributes: { happiness: 80, gold: 100, piety: 100, hunger: 100, thirst: 100, stamina: 100, status: 100, jobless: false, skills: [], age: 30 } }
  const sim = createSim([t], map); sim.shrineRenown = 10000
  // Tether trees on either side of the field beside the shrine, clear of the
  // track, and a pair on the far verge of the road for stops at the fork.
  sim.trees = [1, -1].flatMap(side => [{ x: tileToWorldX(map, 14 + side * 4), y: 0.2, z: tileToWorldZ(map, 8), species: "oak" as const },
    { x: tileToWorldX(map, 14 + side * 2), y: 0.2, z: tileToWorldZ(map, 17), species: "oak" as const }])
  return { map, t, sim, s: sim.travelers.get(0)! }
}

describe("mounted knight journeys", () => {
  it("keeps the mount with its rider throughout roadside music visits", () => {
    for (const activity of ["toListen", "listening", "fromListening", "toAlms", "givingAlms", "fromAlms"]) {
      expect(knightMounted(activity)).toBe(true)
      expect(knightMounted(activity, { x: 0, y: 0, z: 0, heading: 0 })).toBe(false)
    }
  })

  it.each([1, -1] as const)("dismounts outside, prays on foot and returns to the same horse (direction %i)", direction => {
    const { map, t, sim, s } = fixture(direction)
    for (let i = 0; i < 3000 && !s.horseRest; i++) stepSim(sim, [t], map, DEFAULT_WALK_SPEED, 0.1)
    expect(s.activity).toBe("toRelic")
    expect(s.horseRest).toBeDefined()
    expect(s.branchProgress).toBe(0)
    expect(s.horseRest?.tree).toBeDefined()
    expect(tileAt(map, worldToTileX(map, s.horseRest!.x), worldToTileZ(map, s.horseRest!.z))).toBe("grass")
    // The horse waits in the field beside the shrine, not on the verge of the road.
    expect(Math.hypot(s.horseRest!.x - tileToWorldX(map, 14), s.horseRest!.z - tileToWorldZ(map, 10))).toBeLessThanOrEqual(ENCLAVE_FIELD_RADIUS)
    expect(Math.abs(s.horseRest!.z - tileToWorldZ(map, 14))).toBeGreaterThan(2)
    const horse = { ...s.horseRest! }
    expect(horse.x).toBeCloseTo(s.x); expect(horse.z).toBeCloseTo(s.z)
    let prayed = false, walkedOut = false
    for (let i = 0; i < 10000 && s.horseRest; i++) {
      expect(knightMounted(s.activity, s.horseRest)).toBe(false)
      expect(s.horseRest).toEqual(horse)
      if (s.activity === "visiting") {
        prayed = true
        expect(Math.hypot(s.x - horse.x, s.z - horse.z)).toBeGreaterThan(1)
        s.timer = 0; s.hunger = s.thirst = s.stamina = 100
      }
      if (s.activity === "fromRelic") walkedOut = true
      stepSim(sim, [t], map, DEFAULT_WALK_SPEED, 0.1)
    }
    expect({ prayed, walkedOut, visits: s.visits, activity: s.activity }).toEqual({ prayed: true, walkedOut: true, visits: 1, activity: "fromParking" })
    expect(s.horseRest).toBeUndefined(); expect(knightMounted(s.activity)).toBe(true)
    expect(s.x).toBeCloseTo(horse.x); expect(s.z).toBeCloseTo(horse.z)
    for (let i = 0; i < 1000 && s.activity !== "walking"; i++) stepSim(sim, [t], map, DEFAULT_WALK_SPEED, 0.1)
    expect(s.activity).toBe("walking")
  })

  it("dismounts immediately on a short approach beside the road", () => {
    const { map, t, sim, s } = fixture(1)
    map.buildings[0].z = 8
    map.site!.door = { x: 14, z: 13 }
    map.site!.branch = [{ x: 14, z: 14 }, map.site!.door]
    for (let i = 0; i < 3000 && !s.horseRest; i++) stepSim(sim, [t], map, DEFAULT_WALK_SPEED, 0.1)
    expect(s.activity).toBe("toRelic")
    expect(s.horseRest?.progress).toBe(0)
    expect(knightMounted(s.activity, s.horseRest)).toBe(false)
  })

  it("leaves the horse standing loose in the field when no tree is within reach", () => {
    const { map, t, sim, s } = fixture(1)
    sim.trees = []
    for (let i = 0; i < 3000 && !s.horseRest; i++) stepSim(sim, [t], map, DEFAULT_WALK_SPEED, 0.1)
    expect(s.horseRest).toBeDefined()
    expect(s.horseRest?.tree).toBeUndefined()
    expect(s.activity).toBe("toRelic")
  })

  it("uses the horse's stride on the road and the knight's own legs after dismounting", () => {
    const { map, t, sim, s } = fixture(1)
    s.visitCooldown = 100
    const before = s.progress
    stepSim(sim, [t], map, DEFAULT_WALK_SPEED, 0.1)
    expect(s.progress - before).toBeCloseTo(knightTravelSpeed(1.5, knightLoadout(t.id).squire) * 0.1)
    s.activity = "toRelic"; s.branchProgress = 0; s.shrineRoute = map.site!.branch
    s.horseRest = { x: s.x, y: s.y, z: s.z, heading: Math.PI / 2, progress: 0, lane: s.lane }
    stepSim(sim, [t], map, DEFAULT_WALK_SPEED, 0.1)
    expect(s.branchProgress).toBeCloseTo(personWalkStride(knightDesign(travelerAppearance(map.seed!, t.id).variant)) * 1.5 * DEFAULT_WALK_CADENCE * 0.1)
    expect(knightTravelSpeed(1.5, true)).toBeLessThanOrEqual(animalWalkSpeed("horse", 1.5, "noble"))
  })

  it("visits and returns to the horse even with no donation money", () => {
    const { map, t, sim, s } = fixture(1)
    for (let i = 0; i < 3000 && !s.horseRest; i++) stepSim(sim, [t], map, DEFAULT_WALK_SPEED, 0.1)
    expect(s.horseRest).toBeDefined()
    s.gold = 0
    for (let i = 0; i < 10000 && s.horseRest; i++) stepSim(sim, [t], map, DEFAULT_WALK_SPEED, 0.1)
    expect(s.horseRest).toBeUndefined(); expect(s.activity).toBe("fromParking"); expect(s.visits).toBe(1)
    expect(sim.shrineGold).toBe(0)
  })
})

describe("optional squire", () => {
  it("mixes accompanied and solo knights reproducibly", () => {
    const loadouts = Array.from({ length: 100 }, (_, id) => knightLoadout(id))
    expect(loadouts.filter(l => l.squire).length).toBeGreaterThan(20)
    expect(loadouts.filter(l => l.squire).length).toBeLessThan(50)
    expect(new Set(loadouts.map(l => l.coat)).size).toBe(5)
    expect(loadouts).toEqual(Array.from({ length: 100 }, (_, id) => knightLoadout(id)))
  })
  it("moves smoothly between stored trail samples", () => {
    const trail: TrailPoint[] = []
    followKnight(trail, { x: 0, z: 0, heading: Math.PI / 2 }, 1)
    const a = followKnight(trail, { x: 0.005, z: 0, heading: Math.PI / 2 }, 1)
    const b = followKnight(trail, { x: 0.01, z: 0, heading: Math.PI / 2 }, 1)
    expect(b.x - a.x).toBeCloseTo(0.005)
  })
  it("follows corners, stops with the horse and resets cleanly at map wrapping", () => {
    const trail: TrailPoint[] = []
    for (let i = 0; i <= 20; i++) followKnight(trail, { x: i / 10, z: 0, heading: Math.PI / 2 }, 1)
    const corner = followKnight(trail, { x: 2, z: 0.5, heading: 0 }, 1)
    expect(corner.x).toBeCloseTo(1.5); expect(corner.z).toBe(0)
    expect(followKnight(trail, { x: 2, z: 0.5, heading: 0 }, 1)).toEqual(corner)
    for (let i = 6; i < 500; i++) followKnight(trail, { x: 2, z: i / 10, heading: 0 }, 1)
    expect(trail.length).toBeLessThan(15)
    expect(followKnight(trail, { x: -20, z: 0, heading: Math.PI / 2 }, 1, true).x).toBeCloseTo(-21)
  })
})
