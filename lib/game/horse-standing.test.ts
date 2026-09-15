import { describe, expect, it } from "vitest"
import { DEFAULT_BALANCE } from "./balance"
import { createSim, stepSim } from "./sim"
import { TRAVELER_TYPES, type Traveler } from "./travelers"
import { generateMap } from "./map/generate-map"
import { currentStanding, findHorseStanding, standingGround, STANDING_LANE_LENGTH, type HorseStanding } from "./horse-standing"
import { shrineVisitPlan } from "./shrine-visit"
import { tileAt, tileToWorldX, tileToWorldZ, worldToTileX, worldToTileZ, type GameMap } from "./map/types"
import { knightLoadout, squireFollowGap } from "./knights"
import { PACK_LEAD, partyLoadout } from "./transport/party"
import { BASE_CHARACTER_SCALE } from "./base-person/gait"

/** A straight road past a long branch to a church. Nothing marks the standing:
 * the people find a lane of open ground well down the branch on their own. */
function standingRoad(travelers: Traveler[]) {
  const width = 60, depth = 40
  const map: GameMap = { width, depth, seed: 7, tiles: Array(width * depth).fill("grass"), buildings: [],
    road: Array.from({ length: width }, (_, x) => ({ x, z: 5 })), shortcuts: [] }
  for (const p of map.road!) map.tiles[p.z * map.width + p.x] = "path"
  const branch = Array.from({ length: 22 }, (_, i) => ({ x: 30, z: 5 + i }))
  map.site = { hovelId: "shrine", door: { x: 30, z: 26 }, junction: 30, branch }
  for (const p of branch.slice(1)) map.tiles[p.z * map.width + p.x] = "track"
  map.buildings.push({ id: "shrine", label: "Shrine", x: 29, z: 27, w: 3, d: 5, height: 1, color: "tan", roofColor: "brown" })
  const sim = createSim(travelers, map, [], { sanctity: 100, spectacle: 100, doubt: 0 })
  sim.balance = { ...DEFAULT_BALANCE, rules: { ...DEFAULT_BALANCE.rules, hungerDecay: 0, thirstDecay: 0, staminaDecay: 0 } }
  sim.shrineRenown = 10000
  sim.shrineKeeperReady = true
  return { map, sim }
}
const devout = { happiness: 80, age: 30, gold: 20, status: 0, piety: 100, hunger: 100, thirst: 100, stamina: 100, jobless: false, skills: [] }
const besideLane = (map: GameMap, standing: HorseStanding, p: { x: number; z: number }) => {
  const tile = { x: worldToTileX(map, p.x), z: worldToTileZ(map, p.z) }
  return standingGround(standing).some(q => q.x === tile.x && q.z === tile.z) && !standing.lane.some(q => q.x === tile.x && q.z === tile.z)
}

describe("finding the horse-standing", () => {
  it("is a lane of open ground at a right angle off the branch, well below the church, laid on no map tile", () => {
    const map = generateMap({ seed: 1 }), site = map.site!, standing = findHorseStanding(map)!
    expect(standing).not.toBeNull()
    const last = site.branch.length - 1, share = (last - standing.fork) / last
    expect(share).toBeGreaterThan(0.35)
    expect(share).toBeLessThan(0.85)
    expect(standing.lane).toHaveLength(STANDING_LANE_LENGTH + 1)
    expect(standing.lane[0]).toEqual(site.branch[standing.fork])
    const u = { x: standing.lane[1].x - standing.lane[0].x, z: standing.lane[1].z - standing.lane[0].z }
    const along = { x: site.branch[standing.fork + 1].x - site.branch[standing.fork - 1].x, z: site.branch[standing.fork + 1].z - site.branch[standing.fork - 1].z }
    expect(u.x * along.x + u.z * along.z).toBe(0)
    for (let i = 1; i < standing.lane.length; i++) expect(standing.lane[i]).toEqual({ x: standing.lane[0].x + u.x * i, z: standing.lane[0].z + u.z * i })
    // Open ground the whole way, on both verges, and nothing drawn: grass stays grass.
    for (const p of standingGround(standing)) {
      expect(["grass", "clearing"]).toContain(tileAt(map, p.x, p.z))
      expect(map.buildings.some(b => p.x >= b.x && p.x < b.x + b.w && p.z >= b.z && p.z < b.z + b.d)).toBe(false)
      expect(site.branch.some(q => q.x === p.x && q.z === p.z)).toBe(false)
    }
  }, 60_000)

  it("keeps its place while the ground stays open, and moves once the settlement builds over it", () => {
    const map = generateMap({ seed: 1 })
    const sim = { trees: [], felled: new Set<number>() } as Parameters<typeof currentStanding>[0]
    const first = currentStanding(sim, map)!
    expect(first).not.toBeNull()
    // Another building elsewhere changes nothing for the animals.
    map.buildings = [...map.buildings, { id: "far", label: "Far", x: 2, z: 2, w: 2, d: 2, height: 1, color: "", roofColor: "" }]
    expect(currentStanding(sim, map)).toBe(first)
    // A building on the lane sends them to find another.
    const onLane = first.lane[3]
    map.buildings = [...map.buildings, { id: "hut", label: "Hut", x: onLane.x, z: onLane.z, w: 1, d: 1, height: 1, color: "", roofColor: "" }]
    const next = currentStanding(sim, map)!
    expect(next).not.toBeNull()
    expect(next).not.toBe(first)
    expect(standingGround(next).some(p => p.x === onLane.x && p.z === onLane.z)).toBe(false)
  }, 60_000)
})

describe("a company's pack animal at the enclave", () => {
  it("is led to the standing by its handler while the company visits, and back to the road afterwards", () => {
    // A company of three on foot with one pack animal, starting a little way before the fork.
    const id = [0, 1, 2, 3, 4, 5].find(candidate => partyLoadout(candidate, 3).packs > 0)!
    const travelers: Traveler[] = [0, 1, 2].map(slot => ({ id: slot, name: `Pilgrim ${slot}`, type: TRAVELER_TYPES.pilgrim, direction: 1,
      offset: (18 - slot) / 59, pace: 1, party: { id, name: "Company", slot }, attributes: { ...devout } }))
    const { map, sim } = standingRoad(travelers)
    const standing = findHorseStanding(map)!
    const party = [...sim.parties.values()][0]
    let parkedInYard = false, ledBack = false, ledOut = false
    for (let tick = 0; tick < 12000 && !ledBack; tick++) {
      stepSim(sim, travelers, map, 1, .1)
      const pack = party.packs?.[0]
      expect(pack).toBeDefined()
      const handler = sim.travelers.get(pack!.handler)!
      if (pack!.phase === "parking" || pack!.phase === "leaving") {
        // The handler walks the lead: never far from the animal's head.
        expect(Math.hypot(handler.x - pack!.pose.hitch.x, handler.z - pack!.pose.hitch.z)).toBeLessThan(PACK_LEAD * BASE_CHARACTER_SCALE + 1)
        if (pack!.phase === "leaving") ledOut = true
      }
      // Nobody lines up until the animal stands beside the lane.
      if (travelers.some(t => ["toRelic", "visiting", "fromRelic"].includes(sim.travelers.get(t.id)!.activity))) {
        expect(pack!.phase).toBe("parked")
        expect(besideLane(map, standing, pack!.pose.hitch)).toBe(true)
        parkedInYard = true
      }
      if (parkedInYard && ledOut && !pack!.phase) {
        ledBack = true
        expect(tileAt(map, worldToTileX(map, pack!.pose.hitch.x), worldToTileZ(map, pack!.pose.hitch.z))).toBe("path")
      }
    }
    expect(parkedInYard).toBe(true)
    expect(ledBack).toBe(true)
    for (const s of sim.travelers.values()) expect(s.partyVisitAborted).toBeFalsy()
    // The animal's walk wore the ground: a path to the standing emerges from use.
    expect(sim.footpaths.edges.size).toBeGreaterThan(0)
    // The column forms again and carries on.
    let travelling = false
    for (let tick = 0; tick < 3000 && !travelling; tick++) {
      stepSim(sim, travelers, map, 1, .1)
      travelling = party.formed && party.reason === "Traveling together"
    }
    expect(travelling).toBe(true)
  }, 120_000)
})

describe("a cart company's approach", () => {
  it.each([1, -1] as const)("walks companions up the track during parking and gathers beside the bay (%i)", direction => {
    const count = 8, id = 0
    const travelers: Traveler[] = Array.from({ length: count }, (_, slot) => ({ id: slot, name: `Pilgrim ${slot}`,
      type: TRAVELER_TYPES.pilgrim, direction, offset: (direction === 1 ? 18 - slot : 42 + slot) / 59,
      pace: 1, party: { id, name: "Company", slot }, attributes: { ...devout } }))
    const { map, sim } = standingRoad(travelers), party = sim.parties.get(id)!
    // Keep the shrine closed so the company has time to gather beside the bay.
    sim.shrineKeeperReady = false
    let followed = false, gathered = false, longestStep = 0
    for (let tick = 0; tick < 4000 && !gathered; tick++) {
      const before = new Map([...sim.travelers].map(([id, s]) => [id, { x: s.x, z: s.z }]))
      stepSim(sim, travelers, map, 1, .1)
      const cart = party.transport
      if (!cart?.parking) continue
      const walkers = [...sim.travelers.values()].filter(s => !cart.seats.includes(s.id))
      for (const s of walkers) {
        const old = before.get(s.id)!
        longestStep = Math.max(longestStep, Math.hypot(s.x - old.x, s.z - old.z))
        if (cart.phase === "parking" && worldToTileZ(map, s.z) >= 8 && worldToTileZ(map, s.z) < map.site!.branch[findHorseStanding(map)!.fork].z - 3) {
          followed = true
          expect(Math.abs(worldToTileX(map, s.x) - 30)).toBeLessThanOrEqual(1)
        }
      }
      gathered = cart.phase === "parked" && walkers.every(s => s.partyGathering?.arrived)
      if (gathered) for (const s of walkers) {
        expect(Math.hypot(s.x - cart.parking.parked.hitch.x, s.z - cart.parking.parked.hitch.z)).toBeLessThan(5)
        expect(worldToTileZ(map, s.z)).toBeGreaterThan(8)
        expect(map.site!.branch.some(p => p.x === worldToTileX(map, s.x) && p.z === worldToTileZ(map, s.z))).toBe(false)
      }
    }
    expect(followed).toBe(true)
    expect(gathered, party.reason).toBe(true)
    expect(longestStep).toBeLessThan(.5)
    sim.shrineKeeperReady = true
    for (let tick = 0; tick < 12000 && !(sim.visits === count && party.transport?.phase === "road"); tick++) stepSim(sim, travelers, map, 1, .1)
    expect(sim.visits).toBe(count)
    expect(party.transport!.phase).toBe("road")
    for (const s of sim.travelers.values()) expect(s.partyGathering).toBeUndefined()
  }, 120_000)
})

describe("a knight's squire in the line", () => {
  /** A squire leaves extra space behind a knight waiting for admission. */
  function gapBehindKnight(knightId: number) {
    const travelers: Traveler[] = [
      { id: knightId, name: "Knight", type: TRAVELER_TYPES.knight, direction: 1, offset: 24 / 59, pace: 1, attributes: { ...devout, gold: 100, status: 100 } },
      { id: 1000, name: "Pilgrim", type: TRAVELER_TYPES.pilgrim, direction: 1, offset: 8 / 59, pace: 1, attributes: { ...devout } }]
    const { map, sim } = standingRoad(travelers)
    const knight = sim.travelers.get(knightId)!, pilgrim = sim.travelers.get(1000)!
    const reserved = new Set<string>()
    for (const [order, traveler] of travelers.entries()) {
      const plan = shrineVisitPlan(map, traveler.id, 0, reserved)!
      reserved.add(plan.seat)
      Object.assign(sim.travelers.get(traveler.id)!, { activity: "toRelic", shrineRoute: plan.route,
        shrineSeat: plan.seat, shrineQueueOrder: order, branchProgress: 0, lane: 0, branchEntryLane: 0,
        x: tileToWorldX(map, plan.route[0].x), z: tileToWorldZ(map, plan.route[0].z) })
    }
    sim.shrineKeeperReady = false
    let still = 0
    for (let tick = 0; tick < 8000 && still < 30; tick++) {
      stepSim(sim, travelers, map, 1, .1)
      // Hold the line after both visitors have joined.
      still = knight.activity === "toRelic" && knight.moveSpeed === 0 && pilgrim.activity === "toRelic" && pilgrim.moveSpeed === 0 ? still + 1 : 0
    }
    expect(still).toBe(30)
    return pilgrim.shrineDoor! - pilgrim.branchProgress
  }
  it("holds a place behind him, so the next visitor stands a squire's step further back", () => {
    const withSquire = [...Array(60).keys()].find(id => knightLoadout(id).squire)!
    const alone = [...Array(60).keys()].find(id => !knightLoadout(id).squire)!
    const extra = gapBehindKnight(withSquire) - gapBehindKnight(alone)
    expect(extra).toBeGreaterThan(squireFollowGap(BASE_CHARACTER_SCALE) * 0.5)
    expect(extra).toBeLessThan(squireFollowGap(BASE_CHARACTER_SCALE) * 2)
  }, 120_000)
})
