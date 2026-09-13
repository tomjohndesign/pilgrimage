import { describe, expect, it } from "vitest"
import { enclaveParking } from "./enclave-parking"
import { cartOffset } from "./assets"
import { convoyClear, convoyPoint } from "./navigation"
import { followCart } from "./follow"
import { routeLength, routePoint } from "./roadside"
import { findHorseStanding, standingGround, type HorseStanding } from "../horse-standing"
import { tileToWorldX, tileToWorldZ, worldToTileX, worldToTileZ, type GameMap } from "../map/types"

/** The shrine sits in its own glade a real detour off the road. The map lays
 * nothing for the standing: the people find a lane of open ground themselves. */
function fixture(): { map: GameMap; standing: HorseStanding } {
  const width = 30, depth = 30
  const branch = [...Array.from({ length: 20 }, (_, i) => ({ x: 10, z: 4 + i })), { x: 11, z: 23 }]
  const map: GameMap = { width, depth, tiles: Array.from({ length: width * depth }, () => "grass"),
    road: Array.from({ length: width }, (_, x) => ({ x, z: 4 })),
    buildings: [{ id: "shrine", label: "Shrine", x: 12, z: 22, w: 3, d: 3, height: 1, color: "#888", roofColor: "#888" }],
    site: { hovelId: "shrine", junction: 10, branch, door: { x: 11, z: 23 } } }
  for (const p of map.road!) map.tiles[p.z * width + p.x] = "path"
  for (const p of branch.slice(1)) map.tiles[p.z * width + p.x] = "track"
  return { map, standing: findHorseStanding(map)! }
}
const besideLane = (map: GameMap, standing: HorseStanding, p: { x: number; z: number }) => {
  const tile = { x: worldToTileX(map, p.x), z: worldToTileZ(map, p.z) }
  return standingGround(standing).some(q => q.x === tile.x && q.z === tile.z) && !standing.lane.some(q => q.x === tile.x && q.z === tile.z)
}

describe("enclave parking", () => {
  it.each([["knight", "horse", 0], ["wagon", "horse", -cartOffset("horse") * 1.5], ["donkey cart", "donkey", -cartOffset("donkey") * 1.5], ["handcart", "hand", -cartOffset("hand") * 1.5]] as const)(
    "leaves the %s a tile off the lane of the horse-standing, whichever way it was travelling", (_, puller, wheelbase) => {
    for (const direction of [1, -1] as const) {
      const { map, standing } = fixture(), progress = 10 - direction * 0.5
      const plan = enclaveParking(map, standing, progress, direction, wheelbase, puller, 1.5, [], { trees: [] })
      expect(plan).not.toBeNull()
      const { parked, entry, exit, returnProgress } = plan!
      expect(besideLane(map, standing, parked.hitch)).toBe(true)
      expect(convoyClear(map, parked, puller, 1.5, true)).toBe(true)
      // The ride starts on the road lane, climbs the track, turns out along the lane and ends at the stand.
      const near = (a: { x: number; z: number }, b: { x: number; z: number }) => { expect(a.x).toBeCloseTo(b.x); expect(a.z).toBeCloseTo(b.z) }
      near(entry[0], convoyPoint(map, progress, 1.5, direction))
      near(entry.at(-1)!, parked.hitch)
      const fork = standing.lane[0], mouth = standing.lane[1]
      const passes = (t: { x: number; z: number }) => entry.some(p => Math.hypot(p.x - tileToWorldX(map, t.x), p.z - tileToWorldZ(map, t.z)) < 0.6)
      expect(passes(fork)).toBe(true)
      expect(passes(mouth)).toBe(true)
      // Nothing beyond the fork is ridden: the line at the door is never driven through.
      expect(entry.every(p => Math.abs(p.x - tileToWorldX(map, 10)) > 0.3 || p.z <= tileToWorldZ(map, fork.z) + 0.3)).toBe(true)
      // Leaving rejoins the road just past the fork, still travelling the same way.
      near(exit[0], parked.hitch)
      near(exit.at(-1)!, convoyPoint(map, returnProgress, 1.5, direction))
      expect((returnProgress - 10) * direction).toBeGreaterThan(0)
      // The wagon only ever rolls forward: its heading turns about smoothly, never flipping in one step.
      let pose = parked, previous = parked.heading
      const length = routeLength(exit)
      for (let d = 0.04; d <= length; d += 0.04) {
        pose = followCart(pose, routePoint(exit, d), wheelbase)
        const turn = Math.abs(Math.atan2(Math.sin(pose.heading - previous), Math.cos(pose.heading - previous)))
        expect(turn).toBeLessThan(0.5)
        previous = pose.heading
      }
    }
  })
  it("fills the stands along the lane: later arrivals take the next free place, nearest the branch first", () => {
    const { map, standing } = fixture(), wheelbase = -cartOffset("horse") * 1.5
    const fork = { x: tileToWorldX(map, standing.lane[0].x), z: tileToWorldZ(map, standing.lane[0].z) }
    const stands: NonNullable<ReturnType<typeof enclaveParking>>[] = []
    for (let i = 0; i < 12; i++) {
      const plan = enclaveParking(map, standing, 9.5, 1, wheelbase, "horse", 1.5, stands.map(s => s.parked), { trees: [] })
      if (!plan) break
      for (const other of stands) expect(Math.hypot(plan.parked.hitch.x - other.parked.hitch.x, plan.parked.hitch.z - other.parked.hitch.z)).toBeGreaterThan(0.8)
      stands.push(plan)
    }
    // Two wagons a tile off the lane at each turn-off, on either side, and a bounded number in all.
    expect(stands.length).toBeGreaterThanOrEqual(4)
    expect(stands.length).toBeLessThan(12)
    const alongLane = (s: typeof stands[number]) => Math.hypot(s.parked.hitch.x - fork.x, s.parked.hitch.z - fork.z)
    for (let i = 1; i < stands.length; i++) expect(alongLane(stands[i])).toBeGreaterThanOrEqual(alongLane(stands[i - 1]) - 1e-6)
    // Once the lane is full the next wagon is sent to the verge.
    expect(enclaveParking(map, standing, 9.5, 1, wheelbase, "horse", 1.5, stands.map(s => s.parked), { trees: [] })).toBeNull()
  })
  it("declines a fork covered by a building, leaving the roadside verge as the fallback", () => {
    const { map, standing } = fixture()
    map.buildings.push({ id: "cross", label: "Cross", x: 10, z: 4, w: 1, d: 1, height: 1, color: "", roofColor: "" })
    expect(enclaveParking(map, standing, 9.5, 1, -cartOffset("horse") * 1.5, "horse", 1.5, [], { trees: [] })).toBeNull()
  })
  it("declines without a standing", () => {
    const { map } = fixture()
    expect(enclaveParking(map, null, 9.5, 1, 0, "horse", 1.5, [], { trees: [] })).toBeNull()
  })
  it("ties the horse to a tree within reach of the stand, but does not need one", () => {
    const { map, standing } = fixture()
    const loose = enclaveParking(map, standing, 9.5, 1, 0, "horse", 1.5, [], { trees: [] })!
    expect(loose.tree).toBeUndefined()
    const tree = { x: loose.parked.hitch.x + 1.5, y: 0.2, z: loose.parked.hitch.z, species: "oak" as const }
    const tied = enclaveParking(map, standing, 9.5, 1, 0, "horse", 1.5, [], { trees: [tree] })!
    expect(tied).not.toBeNull()
    if (tied.tree) expect(Math.hypot(tied.tree.x - tied.parked.hitch.x, tied.tree.z - tied.parked.hitch.z)).toBeLessThanOrEqual(2.5)
  })
})
