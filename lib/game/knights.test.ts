import { describe, expect, it } from "vitest"
import { followKnight, knightLoadout, knightMounted, knightTravelSpeed, type TrailPoint } from "./knights"
import { withTravelParties, partyRoadDelta } from "./travel-parties"
import { captureSimulation, restoreSimulation } from "./save/simulation"
import { simulationSaveSchema } from "./save/schema"
import { selectElement, selectionObjectId } from "./selection"
import { useCameraStore } from "./camera-store"
import { generateTravelers } from "./travelers"
import { createSim, stepSim } from "./sim"
import { DEFAULT_WALK_SPEED } from "./base-person/gait"
import { knightDesign } from "./knight/design"
import { personWalkStride, DEFAULT_WALK_CADENCE } from "./base-person/gait"
import { travelerAppearance } from "./base-person/population"
import { TRAVELER_TYPES, type Traveler } from "./travelers"
import { animalWalkSpeed } from "./transport/assets"
import { tileAt, worldToTileX, worldToTileZ, tileToWorldX, tileToWorldZ } from "./map/types"
import { findHorseStanding, standingGround } from "./horse-standing"
import type { GameMap } from "./map/types"

function fixture(direction: 1 | -1) {
  const map: GameMap = { width: 30, depth: 24, seed: 1, tiles: Array(720).fill("grass"),
    road: Array.from({ length: 30 }, (_, x) => ({ x, z: 18 })),
    buildings: [{ id: "shrine", x: 13, z: 5, w: 3, d: 5, height: 2, label: "Shrine", color: "", roofColor: "" }],
    site: { hovelId: "shrine", door: { x: 14, z: 10 }, junction: 14, branch: Array.from({ length: 9 }, (_, i) => ({ x: 14, z: 18 - i })) } }
  for (const p of [...map.road!, ...map.site!.branch]) map.tiles[p.z * map.width + p.x] = "path"
  const t: Traveler = { id: 0, type: TRAVELER_TYPES.knight, name: "Knight", pace: 1, direction, offset: (14 - direction * 0.03) / 29,
    attributes: { happiness: 80, gold: 100, piety: 100, hunger: 100, thirst: 100, stamina: 100, status: 100, jobless: false, skills: [], age: 30 } }
  const sim = createSim([t], map); sim.shrineRenown = 10000
  // Tether trees two tiles off the standing's lane on either side, clear of
  // its verges, and a pair on the far verge of the road for stops at the fork.
  const standing = findHorseStanding(map)!
  const lane = standing.lane, u = { x: lane[1].x - lane[0].x, z: lane[1].z - lane[0].z }
  sim.trees = [...[1, -1].map(side => ({ x: tileToWorldX(map, lane[2].x + u.z * 2 * side), y: 0.2, z: tileToWorldZ(map, lane[2].z - u.x * 2 * side), species: "oak" as const })),
    ...[1, -1].map(side => ({ x: tileToWorldX(map, 14 + side * 2), y: 0.2, z: tileToWorldZ(map, 21), species: "oak" as const }))]
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
    // The horse waits beside the lane of the horse-standing, not on the verge of the road.
    const ground = standingGround(findHorseStanding(map)!), horseTile = { x: worldToTileX(map, s.horseRest!.x), z: worldToTileZ(map, s.horseRest!.z) }
    expect(ground.some(p => p.x === horseTile.x && p.z === horseTile.z)).toBe(true)
    expect(Math.abs(s.horseRest!.z - tileToWorldZ(map, 18))).toBeGreaterThanOrEqual(2)
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
    map.buildings[0].z = 12
    map.site!.door = { x: 14, z: 17 }
    map.site!.branch = [{ x: 14, z: 18 }, map.site!.door]
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


describe("knight and squire parties", () => {
  function company(direction: 1 | -1 = 1) {
    const { map, t } = fixture(direction)
    t.id = Array.from({ length: 100 }, (_, id) => id).find(id => knightLoadout(id).squire)!
    t.name = "Edmund of the Vale"
    const travelers = withTravelParties([t], map.seed!)
    const sim = createSim(travelers, map)
    return { map, travelers, sim, knight: travelers[0], squire: travelers[1] }
  }

  it("gives each attendant a stable, distinct identity and exactly one knight companion", () => {
    const seed = 42, original = generateTravelers(seed, 300)
    const cast = withTravelParties(original, seed)
    const squires = cast.filter(t => t.type.id === "squire")
    expect(squires.length).toBeGreaterThan(0)
    expect(new Set(cast.map(t => t.id)).size).toBe(cast.length)
    expect(withTravelParties(cast, seed)).toEqual(cast)
    const reordered = withTravelParties([...original].reverse(), seed)
    const larger = withTravelParties(generateTravelers(seed, 600), seed)
    for (const squire of squires) {
      const knight = cast.find(t => t.id === squire.knightId)!
      expect(squire.name).not.toBe(knight.name)
      expect(squire.type.label).toBe("Squire")
      expect(squire.attributes).not.toBe(knight.attributes)
      expect(cast.filter(t => t.party?.id === knight.id).map(t => t.id)).toEqual([knight.id, squire.id])
      expect(squire.party?.slot).toBe(1)
      expect(reordered.find(t => t.id === squire.id)).toEqual(squire)
      expect(larger.find(t => t.id === squire.id)).toEqual(squire)
    }
    for (const knight of cast.filter(t => t.type.id === "knight" && !knightLoadout(t.id).squire)) expect(knight.party).toBeUndefined()
  })

  it.each([1, -1] as const)("travels as two people at their shared pace in direction %i", direction => {
    const { map, travelers, sim, knight, squire } = company(direction)
    map.site = undefined; map.buildings = []
    const a = sim.travelers.get(knight.id)!, b = sim.travelers.get(squire.id)!
    const start = a.progress
    for (let tick = 0; tick < 600; tick++) {
      stepSim(sim, travelers, map, DEFAULT_WALK_SPEED, .1)
      const gap = direction * partyRoadDelta(a.progress, b.progress, 29)
      expect(gap).toBeGreaterThan(0)
      expect(gap).toBeLessThan(3)
      expect(a.direction).toBe(b.direction)
    }
    expect(Math.abs(partyRoadDelta(a.progress, start, 29))).toBeGreaterThan(1)
    expect(sim.parties.get(knight.id)?.members).toEqual([knight.id, squire.id])
    expect(sim.parties.get(knight.id)?.transport).toBeUndefined()
    expect(a.gold).toBe(b.gold)
  })

  it("visits the shrine as two people and regroups after the knight retrieves his horse", () => {
    const { map, travelers, sim, knight, squire } = company()
    sim.shrineRenown = 10000
    for (const s of sim.travelers.values()) s.piety = 100
    const party = sim.parties.get(knight.id)!
    let dismounted = false
    for (let tick = 0; tick < 12000; tick++) {
      stepSim(sim, travelers, map, DEFAULT_WALK_SPEED, .1)
      const rider = sim.travelers.get(knight.id)!
      dismounted ||= !!rider.horseRest
      if (sim.travelers.get(squire.id)!.visits && rider.visits && party.stage === "traveling" && !rider.horseRest) break
    }
    expect(dismounted).toBe(true)
    expect(sim.travelers.get(knight.id)!.visits).toBeGreaterThan(0)
    expect(sim.travelers.get(squire.id)!.visits).toBeGreaterThan(0)
    expect(party.stage).toBe("traveling")
    expect(sim.travelers.get(knight.id)!.horseRest).toBeUndefined()
    expect(party.members).toEqual([knight.id, squire.id])
  })

  it("selects the squire independently and assigns a different outline ID", () => {
    const { travelers, knight, squire } = company()
    const objects = { travelers, buildings: [], monks: [], piles: [] }
    const click = { delta: 0, stopPropagation: () => {} }
    selectElement({ kind: "traveler", id: knight.id }, click)
    selectElement({ kind: "traveler", id: squire.id }, click)
    expect(useCameraStore.getState().selection).toEqual({ kind: "traveler", id: squire.id })
    expect(selectionObjectId({ kind: "traveler", id: squire.id }, objects)).not.toBe(selectionObjectId({ kind: "traveler", id: knight.id }, objects))
    useCameraStore.getState().select(null)
  })

  it("keeps each person's progress and the two-member purse through save and reload", () => {
    const { map, travelers, sim, knight, squire } = company()
    stepSim(sim, travelers, map, DEFAULT_WALK_SPEED, .1)
    sim.travelers.get(squire.id)!.stamina = 47
    sim.travelers.get(squire.id)!.visits = 3
    const saved = simulationSaveSchema.parse(JSON.parse(JSON.stringify(captureSimulation(sim, "sprites"))))
    const freshCast = withTravelParties([knight], map.seed!)
    const restored = createSim(freshCast, map)
    restoreSimulation(restored, saved, freshCast, map)
    expect(freshCast.find(t => t.id === squire.id)).toEqual(squire)
    expect(restored.travelers.get(squire.id)?.stamina).toBe(47)
    expect(restored.travelers.get(squire.id)?.visits).toBe(3)
    expect(restored.parties.get(knight.id)?.members).toEqual([knight.id, squire.id])
    expect(restored.parties.get(knight.id)?.gold).toBe(sim.parties.get(knight.id)?.gold)
  })
})
