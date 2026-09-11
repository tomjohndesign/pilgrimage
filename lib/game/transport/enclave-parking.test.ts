import { describe, expect, it } from "vitest"
import { enclaveParking, ENCLAVE_FIELD_RADIUS } from "./enclave-parking"
import { cartOffset } from "./assets"
import { convoyClear, convoyPoint } from "./navigation"
import { followCart } from "./follow"
import { routeLength, routePoint } from "./roadside"
import { tileToWorldX, tileToWorldZ, type GameMap } from "../map/types"

/** The shrine sits in its own glade a real detour off the road. */
function fixture(): GameMap {
  const width = 30, depth = 24
  const branch = [...Array.from({ length: 14 }, (_, i) => ({ x: 10, z: 4 + i })), { x: 11, z: 17 }]
  const map: GameMap = { width, depth, tiles: Array.from({ length: width * depth }, () => "grass"),
    road: Array.from({ length: width }, (_, x) => ({ x, z: 4 })),
    buildings: [{ id: "shrine", label: "Shrine", x: 12, z: 16, w: 3, d: 3, height: 1, color: "#888", roofColor: "#888" }],
    site: { hovelId: "shrine", junction: 10, branch, door: { x: 11, z: 17 } } }
  for (const p of map.road!) map.tiles[p.z * width + p.x] = "path"
  for (const p of branch.slice(1)) map.tiles[p.z * width + p.x] = "track"
  return map
}
const door = (map: GameMap) => ({ x: tileToWorldX(map, map.site!.door.x), z: tileToWorldZ(map, map.site!.door.z) })

describe("enclave parking", () => {
  it.each([["knight", "horse", 0], ["wagon", "horse", -cartOffset("horse") * 1.5], ["donkey cart", "donkey", -cartOffset("donkey") * 1.5], ["handcart", "hand", -cartOffset("hand") * 1.5]] as const)(
    "leaves the %s standing on grass beside the shrine, whichever way it was travelling", (_, puller, wheelbase) => {
    for (const direction of [1, -1] as const) {
      const map = fixture(), progress = 10 - direction * 0.5
      const plan = enclaveParking(map, progress, direction, wheelbase, puller, 1.5, [], { trees: [] })
      expect(plan).not.toBeNull()
      const { parked, entry, exit, returnProgress } = plan!
      expect(Math.hypot(parked.hitch.x - door(map).x, parked.hitch.z - door(map).z)).toBeLessThanOrEqual(ENCLAVE_FIELD_RADIUS)
      expect(Math.abs(parked.hitch.z - tileToWorldZ(map, 4))).toBeGreaterThan(8)
      expect(convoyClear(map, parked, puller, 1.5, true)).toBe(true)
      // The ride starts on the road lane, climbs the track and ends at the stand.
      const near = (a: { x: number; z: number }, b: { x: number; z: number }) => { expect(a.x).toBeCloseTo(b.x); expect(a.z).toBeCloseTo(b.z) }
      near(entry[0], convoyPoint(map, progress, 1.5, direction))
      near(entry.at(-1)!, parked.hitch)
      expect(entry.some(p => Math.abs(p.x - tileToWorldX(map, 10)) < 1e-6 && Math.abs(p.z - tileToWorldZ(map, 12)) < 1e-6)).toBe(true)
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
  it("shares the field: a second wagon stands clear of the first", () => {
    const map = fixture(), wheelbase = -cartOffset("horse") * 1.5
    const first = enclaveParking(map, 9.5, 1, wheelbase, "horse", 1.5, [], { trees: [] })!
    const second = enclaveParking(map, 9.5, 1, wheelbase, "horse", 1.5, [first.parked], { trees: [] })
    expect(second).not.toBeNull()
    expect(Math.hypot(second!.parked.hitch.x - first.parked.hitch.x, second!.parked.hitch.z - first.parked.hitch.z)).toBeGreaterThan(1)
  })
  it("declines a fork covered by a building, leaving the roadside verge as the fallback", () => {
    const map = fixture()
    map.buildings.push({ id: "cross", label: "Cross", x: 10, z: 4, w: 1, d: 1, height: 1, color: "", roofColor: "" })
    expect(enclaveParking(map, 9.5, 1, -cartOffset("horse") * 1.5, "horse", 1.5, [], { trees: [] })).toBeNull()
  })
  it("declines when there is no grass to stand on around the shrine", () => {
    const map = fixture()
    map.tiles = map.tiles.map(t => t === "grass" ? "water" : t)
    expect(enclaveParking(map, 9.5, 1, 0, "horse", 1.5, [], { trees: [] })).toBeNull()
  })
  it("ties the horse to a tree within reach of the stand, but does not need one", () => {
    const map = fixture()
    const loose = enclaveParking(map, 9.5, 1, 0, "horse", 1.5, [], { trees: [] })!
    expect(loose.tree).toBeUndefined()
    const tree = { x: loose.parked.hitch.x + 1.5, y: 0.2, z: loose.parked.hitch.z, species: "oak" as const }
    const tied = enclaveParking(map, 9.5, 1, 0, "horse", 1.5, [], { trees: [tree] })!
    expect(tied).not.toBeNull()
    if (tied.tree) expect(Math.hypot(tied.tree.x - tied.parked.hitch.x, tied.tree.z - tied.parked.hitch.z)).toBeLessThanOrEqual(2.5)
  })
})
