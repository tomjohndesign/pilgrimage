import { describe, expect, it } from "vitest"

import { DEFAULT_RELIC_DISTANCE, generateMap, HOVEL_ID, relicDistanceBand } from "./generate-map"
import { TERRAIN } from "./terrain"
import { tileAt, type GameMap } from "./types"

/** Enough seeds to catch structural bugs, few enough to stay fast. */
const SEEDS = Array.from({ length: 40 }, (_, i) => i * 7919 + 1)

/** Maps take real time at the 128×128 floor, so suite-wide loops share them. */
const SWEEP_TIMEOUT = 30_000

/** Default-options maps, shared across tests — nothing mutates them. */
const mapCache = new Map<number, GameMap>()
function mapFor(seed: number): GameMap {
  let map = mapCache.get(seed)
  if (!map) {
    map = generateMap({ seed })
    mapCache.set(seed, map)
  }
  return map
}

/** Forced lake-only maps, shared by the lake tests. */
const lakeCache = new Map<number, GameMap>()
function lakeMapFor(seed: number): GameMap {
  let map = lakeCache.get(seed)
  if (!map) {
    map = generateMap({ seed, lakeCount: 1, riverCount: 0, pondCount: 0 })
    lakeCache.set(seed, map)
  }
  return map
}

function countTerrain(map: GameMap, id: string): number {
  return map.tiles.filter((t) => t === id).length
}

/** True for tiles that carry water — bridges keep the water beneath them. */
function carriesWater(map: GameMap, x: number, z: number): boolean {
  const t = tileAt(map, x, z)
  return t === "water" || t === "bridge"
}

/** Tiles that aren't open water — the denominator for land-share thresholds. */
function landTiles(map: GameMap): number {
  let land = 0
  for (let z = 0; z < map.depth; z++) {
    for (let x = 0; x < map.width; x++) {
      if (!carriesWater(map, x, z)) land++
    }
  }
  return land
}

/** All road tiles (path or bridge) reachable from the west edge, 4-connected. */
function reachablePath(map: GameMap): Set<string> {
  const seen = new Set<string>()
  const queue: Array<[number, number]> = []
  const isRoad = (x: number, z: number) => {
    const t = tileAt(map, x, z)
    return t === "path" || t === "bridge"
  }
  for (let z = 0; z < map.depth; z++) {
    if (isRoad(0, z)) queue.push([0, z])
  }
  while (queue.length) {
    const [x, z] = queue.pop()!
    const key = `${x},${z}`
    if (seen.has(key) || !isRoad(x, z)) continue
    seen.add(key)
    queue.push([x + 1, z], [x - 1, z], [x, z + 1], [x, z - 1])
  }
  return seen
}

function roadReachesEast(map: GameMap): boolean {
  const reached = reachablePath(map)
  for (let z = 0; z < map.depth; z++) {
    if (reached.has(`${map.width - 1},${z}`)) return true
  }
  return false
}

/** 4-connected components of water-carrying tiles, as index lists. */
function waterBodies(map: GameMap): number[][] {
  const seen = new Set<number>()
  const bodies: number[][] = []
  for (let z = 0; z < map.depth; z++) {
    for (let x = 0; x < map.width; x++) {
      const start = z * map.width + x
      if (seen.has(start) || !carriesWater(map, x, z)) continue
      const body = [start]
      seen.add(start)
      for (let q = 0; q < body.length; q++) {
        const bx = body[q] % map.width
        const bz = Math.floor(body[q] / map.width)
        for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = bx + dx
          const nz = bz + dz
          const n = nz * map.width + nx
          if (carriesWater(map, nx, nz) && !seen.has(n)) {
            seen.add(n)
            body.push(n)
          }
        }
      }
      bodies.push(body)
    }
  }
  return bodies
}

describe("generateMap", () => {
  it("is fully determined by its seed", () => {
    const a = generateMap({ seed: 12345 })
    const b = generateMap({ seed: 12345 })
    expect(a.tiles).toEqual(b.tiles)
    expect(a.water).toEqual(b.water)
    expect(a.road).toEqual(b.road)
    expect(a.seed).toBe(12345)
  })

  it("produces different maps for different seeds", () => {
    expect(mapFor(1).tiles).not.toEqual(mapFor(2).tiles)
  })

  it("generates exactly one building, the founded hovel, standing on grass off the road", () => {
    for (const seed of SEEDS) {
      const map = mapFor(seed)
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
  }, SWEEP_TIMEOUT)

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
      const nearest = hovelRoadDistance(mapFor(seed))
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
      const map = mapFor(seed)
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
          // River crossings ride on bridge tiles; everything else is track.
          expect(
            ["track", "bridge"],
            `seed ${seed} branch is track past the junction`,
          ).toContain(terrain)
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
  }, SWEEP_TIMEOUT)

  it("fills the grid with valid terrain, never smaller than 128 a side", () => {
    const map = generateMap({ seed: 99, width: 160, depth: 192 })
    expect(map.width).toBe(160)
    expect(map.depth).toBe(192)
    expect(map.tiles).toHaveLength(160 * 192)
    expect(map.tiles.every((t) => t in TERRAIN)).toBe(true)

    // Requests below the floor clamp up — 128×128 is the absolute minimum.
    const small = generateMap({ seed: 99, width: 24, depth: 40 })
    expect(small.width).toBe(128)
    expect(small.depth).toBe(128)
    expect(small.tiles).toHaveLength(128 * 128)
  }, SWEEP_TIMEOUT)

  it("connects the west edge to the east edge with an unbroken road, every seed", () => {
    for (const seed of SEEDS) {
      expect(roadReachesEast(mapFor(seed)), `seed ${seed} road reaches the east edge`).toBe(true)
    }
  }, SWEEP_TIMEOUT)

  it("returns the road as an unbroken ordered walk, west edge to east edge", () => {
    for (const seed of SEEDS) {
      const map = mapFor(seed)
      const road = map.road!
      expect(road.length, `seed ${seed} has a route`).toBeGreaterThan(0)
      expect(road[0].x, `seed ${seed} starts on the west edge`).toBe(0)
      expect(road[road.length - 1].x, `seed ${seed} ends on the east edge`).toBe(map.width - 1)

      for (let i = 0; i < road.length; i++) {
        // River crossings ride on bridge tiles; everything else is path.
        expect(
          ["path", "bridge"],
          `seed ${seed} route is on road`,
        ).toContain(tileAt(map, road[i].x, road[i].z))
        if (i > 0) {
          const step =
            Math.abs(road[i].x - road[i - 1].x) + Math.abs(road[i].z - road[i - 1].z)
          expect(step, `seed ${seed} step ${i} is to a neighbour`).toBe(1)
        }
      }
    }
  }, SWEEP_TIMEOUT)

  it("is densely forested by default, in one connected mass rather than islands", () => {
    for (const seed of SEEDS) {
      const map = mapFor(seed)
      const forest = countTerrain(map, "forest")
      // Forest dominance is measured against dry land — water legitimately
      // takes its own share of the map.
      expect(forest / landTiles(map), `seed ${seed} is mostly forest`).toBeGreaterThan(0.5)

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
  }, SWEEP_TIMEOUT)

  it("carves open grass glades out of the woods", () => {
    for (const seed of SEEDS) {
      const map = mapFor(seed)
      const grass = countTerrain(map, "grass")
      const land = landTiles(map)
      expect(grass / land, `seed ${seed} has glades`).toBeGreaterThan(0.15)
      expect(grass / land, `seed ${seed} stays forest-dominant`).toBeLessThan(0.5)
    }
  }, SWEEP_TIMEOUT)

  it("threads the woods with clearings and trails", () => {
    for (const seed of SEEDS) {
      const map = mapFor(seed)
      const clearing = countTerrain(map, "clearing")
      expect(clearing, `seed ${seed} has forest-floor passage`).toBeGreaterThan(20)
    }
  }, SWEEP_TIMEOUT)

  it("keeps every passable tile reachable from every other, every seed", () => {
    for (const seed of SEEDS) {
      const map = mapFor(seed)
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
  }, SWEEP_TIMEOUT)

  it("leaves buildable land for settling at default coverage", () => {
    for (const seed of SEEDS) {
      const map = mapFor(seed)
      const buildable = map.tiles.filter((t) => TERRAIN[t].buildable).length
      expect(buildable / map.tiles.length, `seed ${seed} is settleable`).toBeGreaterThan(0.15)
    }
  }, SWEEP_TIMEOUT)

  it("scales forest area with the coverage knob", () => {
    for (const seed of SEEDS.slice(0, 10)) {
      const sparse = generateMap({ seed, forestCoverage: 0.45 })
      const dense = generateMap({ seed, forestCoverage: 0.85 })
      const fraction = (m: GameMap) => countTerrain(m, "forest") / landTiles(m)
      expect(fraction(dense), `seed ${seed} dense > sparse`).toBeGreaterThan(fraction(sparse))
      expect(fraction(dense), `seed ${seed} dense is dense`).toBeGreaterThan(0.6)
      expect(fraction(sparse), `seed ${seed} sparse is sparse`).toBeLessThan(0.5)
    }
  }, SWEEP_TIMEOUT)

  it("scatters more clearings when asked", () => {
    for (const seed of SEEDS.slice(0, 10)) {
      const few = generateMap({ seed, clearingCount: 0 })
      const many = generateMap({ seed, clearingCount: 25 })
      expect(
        countTerrain(many, "clearing"),
        `seed ${seed} clearings scale`,
      ).toBeGreaterThan(countTerrain(few, "clearing"))
    }
  }, SWEEP_TIMEOUT)

  /**
   * Share of the land beside the road that is still forest, over the 4-neighbours
   * of every road tile (other road, track, and water don't count either way).
   * A terrain-blind road would see roughly the map's own forest share here.
   */
  function roadsideForestShare(map: GameMap): number {
    let beside = 0
    let forest = 0
    for (const p of map.road!) {
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const t = tileAt(map, p.x + dx, p.z + dz)
        if (t === null || t === "path" || t === "bridge" || t === "track" || t === "water") continue
        beside++
        if (t === "forest") forest++
      }
    }
    return forest / beside
  }

  it("routes the road through open ground rather than straight through the woods", () => {
    // The road pays to fell forest, so it bends through glades and picks the
    // narrowest belt of trees where it has to cross one: the land beside it
    // is markedly more open than the map as a whole. Per seed this is only a
    // tendency (a glade-poor stretch may leave no cheap way across), so the
    // sweep asserts on the aggregate and allows a few exceptions.
    let openerSeeds = 0
    let roadside = 0
    let mapWide = 0
    for (const seed of SEEDS) {
      const map = mapFor(seed)
      const beside = roadsideForestShare(map)
      const overall = countTerrain(map, "forest") / landTiles(map)
      roadside += beside
      mapWide += overall
      if (beside < overall) openerSeeds++
    }
    expect(openerSeeds, "nearly every road finds opener ground than the map average").toBeGreaterThanOrEqual(
      Math.floor(SEEDS.length * 0.9),
    )
    expect(roadside / SEEDS.length, "roadside is far less wooded than the map").toBeLessThan(
      mapWide / SEEDS.length - 0.15,
    )
  }, SWEEP_TIMEOUT)

  it("keeps the road at a sane length — it seeks open ground, it doesn't wander the map for it", () => {
    for (const seed of SEEDS) {
      const map = mapFor(seed)
      expect(map.road!.length, `seed ${seed} road is not a maze`).toBeLessThan(map.width * 2)
    }
  }, SWEEP_TIMEOUT)

  it("bends the road to meet the glades when the forest changes", () => {
    // The road's dice are its own stream, but its route reacts to the land:
    // with the same seed and a different glade layout it should take a
    // different line. (The same seed with the same forest is byte-identical —
    // see "is fully determined by its seed".)
    let moved = 0
    for (const seed of SEEDS.slice(0, 10)) {
      const a = generateMap({ seed, forestCoverage: 0.5, gladeCount: 3, clearingCount: 0 })
      const b = generateMap({ seed, forestCoverage: 0.85, gladeCount: 8, clearingCount: 20 })
      if (JSON.stringify(a.road) !== JSON.stringify(b.road)) moved++
    }
    expect(moved, "the road follows the land").toBeGreaterThanOrEqual(8)
  }, SWEEP_TIMEOUT)

  it("generates no water when the coverage knob is zero", () => {
    for (const seed of SEEDS.slice(0, 10)) {
      const map = generateMap({ seed, waterCoverage: 0 })
      expect(countTerrain(map, "water"), `seed ${seed} has no water`).toBe(0)
      expect(countTerrain(map, "sand"), `seed ${seed} has no beaches`).toBe(0)
      expect(countTerrain(map, "bridge"), `seed ${seed} has no bridges`).toBe(0)
    }
  }, SWEEP_TIMEOUT)

  it("keeps water from dominating the map", () => {
    for (const seed of SEEDS) {
      const map = mapFor(seed)
      const wet = map.tiles.filter((t) => t === "water" || t === "bridge").length
      expect(wet / map.tiles.length, `seed ${seed} water stays modest`).toBeLessThan(0.16)
    }
  }, SWEEP_TIMEOUT)

  it("never leaves a water body smaller than 10 tiles", () => {
    for (const seed of SEEDS) {
      const map = mapFor(seed)
      for (const body of waterBodies(map)) {
        expect(body.length, `seed ${seed} body size`).toBeGreaterThanOrEqual(10)
      }
    }
  }, SWEEP_TIMEOUT)

  it("ends every river at a map edge or a lake — no inland dead-ends", () => {
    for (const seed of SEEDS) {
      const map = mapFor(seed)
      for (const body of waterBodies(map)) {
        // A body with flowing tiles contains river; it must either touch the
        // map edge or include still (lake) water.
        const hasRiver = body.some((i) => map.water!.flow[i])
        if (!hasRiver) continue
        const touchesEdge = body.some((i) => {
          const x = i % map.width
          const z = Math.floor(i / map.width)
          return x === 0 || z === 0 || x === map.width - 1 || z === map.depth - 1
        })
        const hasLake = body.some(
          (i) => !map.water!.flow[i] && map.tiles[i] === "water",
        )
        expect(touchesEdge || hasLake, `seed ${seed} river ends legally`).toBe(true)
      }
    }
  }, SWEEP_TIMEOUT)

  it("assigns every water tile a depth from 1 (shore) to 3 (deep)", () => {
    for (const seed of SEEDS) {
      const map = mapFor(seed)
      const water = map.water!
      // One aggregated assertion per seed — per-tile expect() calls at this
      // map size are what used to blow the test budget.
      let landWithDepth = 0
      let outOfRange = 0
      let deepShore = 0
      for (let z = 0; z < map.depth; z++) {
        for (let x = 0; x < map.width; x++) {
          const i = z * map.width + x
          if (!carriesWater(map, x, z)) {
            if (water.depth[i] !== 0) landWithDepth++
            continue
          }
          if (water.depth[i] < 1 || water.depth[i] > 3) outOfRange++
          const touchesLand = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dz]) => {
            const t = tileAt(map, x + dx, z + dz)
            return t !== null && !carriesWater(map, x + dx, z + dz)
          })
          if (touchesLand && water.depth[i] !== 1) deepShore++
        }
      }
      expect({ landWithDepth, outOfRange, deepShore }, `seed ${seed} depth field`).toEqual({
        landWithDepth: 0,
        outOfRange: 0,
        deepShore: 0,
      })
    }
  }, SWEEP_TIMEOUT)

  it("flows every river tile in a cardinal direction", () => {
    for (const seed of SEEDS) {
      const map = mapFor(seed)
      for (const [key, dir] of Object.entries(map.water!.flow)) {
        const i = Number(key)
        expect(carriesWater(map, i % map.width, Math.floor(i / map.width))).toBe(true)
        expect(Math.abs(dir[0]) + Math.abs(dir[1]), `seed ${seed} unit flow`).toBe(1)
      }
    }
  }, SWEEP_TIMEOUT)

  it("builds bridges that are short, straight, and over river water only", () => {
    for (const seed of SEEDS) {
      const map = mapFor(seed)
      const bridges = new Set<number>()
      map.tiles.forEach((t, i) => {
        if (t === "bridge") bridges.add(i)
      })
      // Group bridge tiles into 4-connected components.
      const seen = new Set<number>()
      for (const start of bridges) {
        if (seen.has(start)) continue
        const span = [start]
        seen.add(start)
        for (let q = 0; q < span.length; q++) {
          for (const step of [1, -1, map.width, -map.width]) {
            const n = span[q] + step
            if (bridges.has(n) && !seen.has(n)) {
              seen.add(n)
              span.push(n)
            }
          }
        }
        expect(span.length, `seed ${seed} bridge span`).toBeLessThanOrEqual(5)
        const xs = new Set(span.map((i) => i % map.width))
        const zs = new Set(span.map((i) => Math.floor(i / map.width)))
        expect(Math.min(xs.size, zs.size), `seed ${seed} bridge is straight`).toBe(1)
        for (const i of span) {
          expect(map.water!.flow[i], `seed ${seed} bridge sits over a river`).toBeDefined()
        }
      }
    }
  }, SWEEP_TIMEOUT)

  it("grows lakes big enough to be landmarks", () => {
    let bigEnough = 0
    const sample = SEEDS.slice(0, 15)
    for (const seed of sample) {
      const map = lakeMapFor(seed)
      const still = waterBodies(map)
        .map((body) => body.filter((i) => map.tiles[i] === "water" && !map.water!.flow[i]).length)
        .reduce((a, b) => Math.max(a, b), 0)
      // Lakes target 2.5–4.5% of the map; growth can stall, so allow slack.
      if (still >= map.tiles.length * 0.015) bigEnough++
    }
    expect(bigEnough).toBeGreaterThanOrEqual(Math.ceil(sample.length * 0.8))
  }, SWEEP_TIMEOUT)

  it("rings lakes with sand beaches", () => {
    let lakeSeeds = 0
    for (const seed of SEEDS.slice(0, 20)) {
      const map = lakeMapFor(seed)
      const lakeTiles = map.tiles.filter(
        (t, i) => t === "water" && !map.water!.flow[i],
      ).length
      if (lakeTiles === 0) continue
      lakeSeeds++
      expect(countTerrain(map, "sand"), `seed ${seed} lake has a beach`).toBeGreaterThan(0)
      // Every remaining sand tile sits within the two-ring beach band of some
      // water (the road may pave parts over, the repair pass may reforest).
      let strandedSand = 0
      for (let z = 0; z < map.depth; z++) {
        for (let x = 0; x < map.width; x++) {
          if (tileAt(map, x, z) !== "sand") continue
          let nearWater = false
          for (let dz = -2; dz <= 2; dz++) {
            for (let dx = -2; dx <= 2; dx++) {
              const i = (z + dz) * map.width + (x + dx)
              if (tileAt(map, x + dx, z + dz) !== null && map.water!.depth[i] > 0) {
                nearWater = true
              }
            }
          }
          if (!nearWater) strandedSand++
        }
      }
      expect(strandedSand, `seed ${seed} sand stays near water`).toBe(0)
    }
    expect(lakeSeeds, "forced lakes actually generate").toBeGreaterThan(16)
  }, SWEEP_TIMEOUT)

  it("deposits sand bars on the inside of river bends", () => {
    let seedsWithBars = 0
    const sample = SEEDS.slice(0, 15)
    for (const seed of sample) {
      const map = generateMap({ seed, riverCount: 1, lakeCount: 0, pondCount: 0 })
      // With no lakes there are no beach rings, so any sand is a point bar —
      // and every bar must hug the river.
      let bars = 0
      let stranded = 0
      for (let z = 0; z < map.depth; z++) {
        for (let x = 0; x < map.width; x++) {
          if (tileAt(map, x, z) !== "sand") continue
          bars++
          let hugsRiver = false
          for (let dz = -1; dz <= 1; dz++) {
            for (let dx = -1; dx <= 1; dx++) {
              const i = (z + dz) * map.width + (x + dx)
              if (tileAt(map, x + dx, z + dz) !== null && map.water!.depth[i] > 0) {
                hugsRiver = true
              }
            }
          }
          if (!hugsRiver) stranded++
        }
      }
      if (bars > 0) seedsWithBars++
      expect(stranded, `seed ${seed} bars hug the river`).toBe(0)
    }
    // Wandering rivers bend constantly; nearly every seed should deposit bars.
    expect(seedsWithBars).toBeGreaterThanOrEqual(Math.ceil(sample.length * 0.8))
  }, SWEEP_TIMEOUT)

  it("keeps the road connected across forced rivers", () => {
    for (const seed of SEEDS.slice(0, 15)) {
      const map = generateMap({ seed, riverCount: 2 })
      expect(roadReachesEast(map), `seed ${seed} road crosses the rivers`).toBe(true)
    }
  }, SWEEP_TIMEOUT)
})
