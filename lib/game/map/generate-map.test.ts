import { describe, expect, it } from "vitest"

import { DEFAULT_RELIC_DISTANCE, generateMap, HOVEL_ID, relicDistanceBand } from "./generate-map"
import { TERRAIN } from "./terrain"
import { tileAt, type GameMap } from "./types"

/** Enough seeds to catch structural bugs, few enough to stay fast. */
const SEEDS = Array.from({ length: 40 }, (_, i) => i * 7919 + 1)

function countTerrain(map: GameMap, id: string): number {
  return map.tiles.filter((t) => t === id).length
}

/** All path tiles reachable from the west edge, walking 4-connected path only. */
function reachablePath(map: GameMap): Set<string> {
  const seen = new Set<string>()
  const queue: Array<[number, number]> = []
  for (let z = 0; z < map.depth; z++) {
    if (tileAt(map, 0, z) === "path") queue.push([0, z])
  }
  while (queue.length) {
    const [x, z] = queue.pop()!
    const key = `${x},${z}`
    if (seen.has(key) || tileAt(map, x, z) !== "path") continue
    seen.add(key)
    queue.push([x + 1, z], [x - 1, z], [x, z + 1], [x, z - 1])
  }
  return seen
}

describe("generateMap", () => {
  it("is fully determined by its seed", () => {
    const a = generateMap({ seed: 12345 })
    const b = generateMap({ seed: 12345 })
    expect(a.tiles).toEqual(b.tiles)
    expect(a.seed).toBe(12345)
  })

  it("produces different maps for different seeds", () => {
    const a = generateMap({ seed: 1 })
    const b = generateMap({ seed: 2 })
    expect(a.tiles).not.toEqual(b.tiles)
  })

  it("generates exactly one building, the founded hovel, standing on grass off the road", () => {
    for (const seed of SEEDS) {
      const map = generateMap({ seed })
      expect(map.buildings.map((b) => b.id), `seed ${seed} has only the hovel`).toEqual([HOVEL_ID])
      const hovel = map.buildings[0]
      expect(map.site?.hovelId).toBe(HOVEL_ID)
      for (let dz = -1; dz <= hovel.d; dz++) {
        for (let dx = -1; dx <= hovel.w; dx++) {
          const terrain = tileAt(map, hovel.x + dx, hovel.z + dz)
          const inFootprint = dx >= 0 && dx < hovel.w && dz >= 0 && dz < hovel.d
          if (inFootprint) {
            expect(terrain, `seed ${seed} hovel stands on grass`).toBe("grass")
          } else {
            // The ring is grass except where the track arrives at the door.
            expect(["grass", "track"], `seed ${seed} hovel has breathing room`).toContain(terrain)
          }
        }
      }
    }
  })

  /** Grid distance from the hovel's footprint to the nearest road tile. */
  function hovelRoadDistance(map: GameMap): number {
    const hovel = map.buildings[0]
    let nearest = Infinity
    for (const p of map.road!) {
      for (let dz = 0; dz < hovel.d; dz++) {
        for (let dx = 0; dx < hovel.w; dx++) {
          nearest = Math.min(nearest, Math.abs(p.x - hovel.x - dx) + Math.abs(p.z - hovel.z - dz))
        }
      }
    }
    return nearest
  }

  it("sites the hovel a real detour off the road — inside the distance band", () => {
    const band = relicDistanceBand(DEFAULT_RELIC_DISTANCE)
    for (const seed of SEEDS) {
      const nearest = hovelRoadDistance(generateMap({ seed }))
      expect(nearest, `seed ${seed} not too close`).toBeGreaterThanOrEqual(band.min)
      expect(nearest, `seed ${seed} not too far`).toBeLessThanOrEqual(band.max)
    }
  })

  it("moves the hovel further out when asked", () => {
    for (const seed of SEEDS.slice(0, 10)) {
      const near = hovelRoadDistance(generateMap({ seed, relicDistance: 8 }))
      const far = hovelRoadDistance(generateMap({ seed, relicDistance: 32 }))
      expect(far, `seed ${seed} far > near`).toBeGreaterThan(near)
      expect(near).toBeLessThanOrEqual(relicDistanceBand(8).max)
      expect(far).toBeGreaterThanOrEqual(relicDistanceBand(32).min)
    }
  })

  it("cuts one unbroken track from a mid-road junction to the hovel's door", () => {
    for (const seed of SEEDS) {
      const map = generateMap({ seed })
      const { junction, branch, door } = map.site!
      const road = map.road!
      const hovel = map.buildings[0]

      // The fork is never on the road's outermost stretches.
      expect(junction, `seed ${seed} junction not at west end`).toBeGreaterThanOrEqual(road.length * 0.1 - 1)
      expect(junction, `seed ${seed} junction not at east end`).toBeLessThanOrEqual(road.length * 0.9)
      expect(branch[0], `seed ${seed} branch starts at the junction`).toEqual(road[junction])
      expect(branch[branch.length - 1], `seed ${seed} branch ends at the door`).toEqual(door)

      // The door touches the footprint but is not inside it.
      const touching =
        door.x >= hovel.x - 1 &&
        door.x <= hovel.x + hovel.w &&
        door.z >= hovel.z - 1 &&
        door.z <= hovel.z + hovel.d
      const inside =
        door.x >= hovel.x && door.x < hovel.x + hovel.w && door.z >= hovel.z && door.z < hovel.z + hovel.d
      expect(touching && !inside, `seed ${seed} door is adjacent to the hovel`).toBe(true)

      for (let i = 0; i < branch.length; i++) {
        const terrain = tileAt(map, branch[i].x, branch[i].z)
        expect(terrain !== null && TERRAIN[terrain].passable, `seed ${seed} branch is walkable`).toBe(true)
        const onHovel =
          branch[i].x >= hovel.x &&
          branch[i].x < hovel.x + hovel.w &&
          branch[i].z >= hovel.z &&
          branch[i].z < hovel.z + hovel.d
        expect(onHovel, `seed ${seed} branch does not cross the hovel`).toBe(false)
        if (i > 0) {
          const step = Math.abs(branch[i].x - branch[i - 1].x) + Math.abs(branch[i].z - branch[i - 1].z)
          expect(step, `seed ${seed} branch step ${i} is to a neighbour`).toBe(1)
          expect(terrain, `seed ${seed} branch is track past the junction`).toBe("track")
        }
      }
    }
  })

  it("founds a hovel even on a map with no glades to speak of", () => {
    const map = generateMap({ seed: 7, forestCoverage: 0.98, gladeCount: 1, clearingCount: 0 })
    const hovel = map.buildings[0]
    expect(hovel).toBeDefined()
    expect(tileAt(map, hovel.x, hovel.z)).toBe("grass")
    expect(map.site!.branch.length).toBeGreaterThan(1)
  })

  it("sites the hovel on small maps too, scaling the band down", () => {
    for (const seed of SEEDS.slice(0, 10)) {
      const map = generateMap({ seed, width: 32, depth: 32 })
      expect(map.buildings).toHaveLength(1)
      expect(map.site!.branch.length).toBeGreaterThan(1)
    }
  })

  it("fills the grid with valid terrain at the requested size", () => {
    const map = generateMap({ seed: 99, width: 24, depth: 40 })
    expect(map.width).toBe(24)
    expect(map.depth).toBe(40)
    expect(map.tiles).toHaveLength(24 * 40)
    expect(map.tiles.every((t) => t in TERRAIN)).toBe(true)
  })

  it("connects the west edge to the east edge with an unbroken road, every seed", () => {
    for (const seed of SEEDS) {
      const map = generateMap({ seed })
      const reached = reachablePath(map)
      expect(reached.size, `seed ${seed} has a road`).toBeGreaterThan(0)

      let reachesEast = false
      for (let z = 0; z < map.depth; z++) {
        if (reached.has(`${map.width - 1},${z}`)) reachesEast = true
      }
      expect(reachesEast, `seed ${seed} road reaches the east edge`).toBe(true)
    }
  })

  it("returns the road as an unbroken ordered walk, west edge to east edge", () => {
    for (const seed of SEEDS) {
      const map = generateMap({ seed })
      const road = map.road!
      expect(road.length, `seed ${seed} has a route`).toBeGreaterThan(0)
      expect(road[0].x, `seed ${seed} starts on the west edge`).toBe(0)
      expect(road[road.length - 1].x, `seed ${seed} ends on the east edge`).toBe(map.width - 1)

      for (let i = 0; i < road.length; i++) {
        expect(tileAt(map, road[i].x, road[i].z), `seed ${seed} route is on path`).toBe("path")
        if (i > 0) {
          const step =
            Math.abs(road[i].x - road[i - 1].x) + Math.abs(road[i].z - road[i - 1].z)
          expect(step, `seed ${seed} step ${i} is to a neighbour`).toBe(1)
        }
      }
    }
  })

  it("is densely forested by default, in one connected mass rather than islands", () => {
    for (const seed of SEEDS) {
      const map = generateMap({ seed })
      const forest = countTerrain(map, "forest")
      expect(forest / map.tiles.length, `seed ${seed} is mostly forest`).toBeGreaterThan(0.5)

      // Compactness: in dense woods, most forest tiles touch other forest tiles.
      let neighbourSum = 0
      for (let z = 0; z < map.depth; z++) {
        for (let x = 0; x < map.width; x++) {
          if (tileAt(map, x, z) !== "forest") continue
          for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            if (tileAt(map, x + dx, z + dz) === "forest") neighbourSum++
          }
        }
      }
      expect(neighbourSum / forest, `seed ${seed} forest is compact`).toBeGreaterThan(2.5)
    }
  })

  it("carves open grass glades out of the woods", () => {
    for (const seed of SEEDS) {
      const map = generateMap({ seed })
      const grass = countTerrain(map, "grass")
      expect(grass / map.tiles.length, `seed ${seed} has glades`).toBeGreaterThan(0.15)
      expect(grass / map.tiles.length, `seed ${seed} stays forest-dominant`).toBeLessThan(0.5)
    }
  })

  it("threads the woods with clearings and trails", () => {
    for (const seed of SEEDS) {
      const map = generateMap({ seed })
      const clearing = countTerrain(map, "clearing")
      expect(clearing, `seed ${seed} has forest-floor passage`).toBeGreaterThan(20)
    }
  })

  it("keeps every passable tile reachable from every other, every seed", () => {
    for (const seed of SEEDS) {
      const map = generateMap({ seed })
      const passable = map.tiles.filter((t) => TERRAIN[t].passable).length

      // Flood-fill from any passable tile; it must reach all passable land.
      const seen = new Uint8Array(map.tiles.length)
      const start = map.tiles.findIndex((t) => TERRAIN[t].passable)
      const queue = [start]
      seen[start] = 1
      let reached = 0
      while (queue.length) {
        const i = queue.pop()!
        reached++
        const x = i % map.width
        const z = Math.floor(i / map.width)
        for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const terrain = tileAt(map, x + dx, z + dz)
          if (terrain === null || !TERRAIN[terrain].passable) continue
          const n = (z + dz) * map.width + (x + dx)
          if (!seen[n]) {
            seen[n] = 1
            queue.push(n)
          }
        }
      }
      expect(reached, `seed ${seed} passable land is one region`).toBe(passable)
    }
  })

  it("leaves buildable land for settling at default coverage", () => {
    for (const seed of SEEDS) {
      const map = generateMap({ seed })
      const buildable = map.tiles.filter((t) => TERRAIN[t].buildable).length
      expect(buildable / map.tiles.length, `seed ${seed} is settleable`).toBeGreaterThan(0.15)
    }
  })

  it("scales forest area with the coverage knob", () => {
    for (const seed of SEEDS.slice(0, 10)) {
      const sparse = generateMap({ seed, forestCoverage: 0.45 })
      const dense = generateMap({ seed, forestCoverage: 0.85 })
      const fraction = (m: GameMap) => countTerrain(m, "forest") / m.tiles.length
      expect(fraction(dense), `seed ${seed} dense > sparse`).toBeGreaterThan(fraction(sparse))
      expect(fraction(dense), `seed ${seed} dense is dense`).toBeGreaterThan(0.6)
      expect(fraction(sparse), `seed ${seed} sparse is sparse`).toBeLessThan(0.5)
    }
  })

  it("scatters more clearings when asked", () => {
    for (const seed of SEEDS.slice(0, 10)) {
      const few = generateMap({ seed, clearingCount: 0 })
      const many = generateMap({ seed, clearingCount: 25 })
      expect(
        countTerrain(many, "clearing"),
        `seed ${seed} clearings scale`,
      ).toBeGreaterThan(countTerrain(few, "clearing"))
    }
  })

  it("keeps the road identical when only forest knobs change", () => {
    for (const seed of SEEDS.slice(0, 10)) {
      // The road runs on its own RNG stream with no forest waypoints, so no
      // forest knob may disturb it.
      const a = generateMap({ seed, forestCoverage: 0.5, gladeCount: 3, clearingCount: 0 })
      const b = generateMap({ seed, forestCoverage: 0.85, gladeCount: 8, clearingCount: 20 })
      const roadOf = (m: GameMap) =>
        m.tiles.map((t, i) => (t === "path" ? i : -1)).filter((i) => i >= 0)
      expect(roadOf(b), `seed ${seed} road is stable`).toEqual(roadOf(a))
    }
  })
})
