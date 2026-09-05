import { describe, expect, it } from "vitest"

import { generateMap } from "./generate-map"
import { isWoods, TERRAIN } from "./terrain"
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

  it("generates no buildings — building is the player's job", () => {
    for (const seed of SEEDS) {
      expect(generateMap({ seed }).buildings).toEqual([])
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
      // Woods of both kinds: dark forest is forest too, just older.
      const forest = map.tiles.filter(isWoods).length
      expect(forest / map.tiles.length, `seed ${seed} is mostly forest`).toBeGreaterThan(0.5)

      // Compactness: in dense woods, most forest tiles touch other forest tiles.
      let neighbourSum = 0
      for (let z = 0; z < map.depth; z++) {
        for (let x = 0; x < map.width; x++) {
          if (!isWoods(tileAt(map, x, z)!)) continue
          for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const n = tileAt(map, x + dx, z + dz)
            if (n !== null && isWoods(n)) neighbourSum++
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

  it("grows dark forest at the heart of the woods on nearly every seed, clear of the map's ends", () => {
    expect(TERRAIN.darkwood.passable).toBe(false)
    let seedsWithDark = 0
    for (const seed of SEEDS) {
      const map = generateMap({ seed })
      const dark = countTerrain(map, "darkwood")
      // A road that hugs the map's north or south edge leaves no room to
      // stand a bar across it; such seeds legitimately have no dark forest.
      if (dark > 150) seedsWithDark++
      for (let z = 0; z < map.depth; z++) {
        for (let x = 0; x < map.width; x++) {
          if (tileAt(map, x, z) !== "darkwood") continue
          // The road's endpoints sit on the west and east edges; old growth
          // keeps clear of them so the road never *starts* in the dark.
          expect(x, `seed ${seed} dark forest keeps off the west edge`).toBeGreaterThanOrEqual(8)
          expect(x, `seed ${seed} dark forest keeps off the east edge`).toBeLessThan(map.width - 8)
        }
      }
    }
    expect(seedsWithDark).toBeGreaterThanOrEqual(SEEDS.length * 0.9)
  })

  it("grows no dark forest when asked not to", () => {
    const map = generateMap({ seed: 5, darkForestCount: 0 })
    expect(countTerrain(map, "darkwood")).toBe(0)
    expect(map.shortcuts).toEqual([])
  })

  it("routes the road around dark forest instead of through it", () => {
    for (const seed of SEEDS) {
      const map = generateMap({ seed })
      // A road tile with old growth on both flanks is a road *through* the
      // dark forest. Skirting it never produces one.
      let through = 0
      for (const p of map.road!) {
        const flankedX =
          tileAt(map, p.x - 1, p.z) === "darkwood" && tileAt(map, p.x + 1, p.z) === "darkwood"
        const flankedZ =
          tileAt(map, p.x, p.z - 1) === "darkwood" && tileAt(map, p.x, p.z + 1) === "darkwood"
        if (flankedX || flankedZ) through++
      }
      expect(through, `seed ${seed} road skirts the dark forest`).toBeLessThanOrEqual(2)
    }
  })

  it("cuts a shorter track through the dark forest wherever the road detoured", () => {
    let seedsWithTracks = 0
    for (const seed of SEEDS) {
      const map = generateMap({ seed })
      const road = map.road!
      if ((map.shortcuts ?? []).length > 0) seedsWithTracks++
      for (const track of map.shortcuts ?? []) {
        expect(track.entry).toBeLessThan(track.exit)
        expect(track.tiles[0]).toEqual(road[track.entry])
        expect(track.tiles[track.tiles.length - 1]).toEqual(road[track.exit])
        // Meaningfully shorter than the road between the same two tiles.
        expect(track.tiles.length, `seed ${seed} track is a shortcut`).toBeLessThan(
          (track.exit - track.entry + 1) * 0.9,
        )
        let touchesDark = false
        for (let i = 0; i < track.tiles.length; i++) {
          const t = track.tiles[i]
          expect(["track", "path"], `seed ${seed} track is carved`).toContain(tileAt(map, t.x, t.z))
          if (i > 0) {
            const step = Math.abs(t.x - track.tiles[i - 1].x) + Math.abs(t.z - track.tiles[i - 1].z)
            expect(step, `seed ${seed} track step ${i} is to a neighbour`).toBe(1)
          }
          for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            if (tileAt(map, t.x + dx, t.z + dz) === "darkwood") touchesDark = true
          }
        }
        expect(touchesDark, `seed ${seed} track runs through the dark forest`).toBe(true)
      }
    }
    // Nearly every seed grows a dark forest in the road's way; a handful have
    // the road's endpoints too close to the crossing for a track to fit.
    expect(seedsWithTracks).toBeGreaterThanOrEqual(SEEDS.length * 0.8)
  })

  it("keeps the road identical when only forest knobs change", () => {
    for (const seed of SEEDS.slice(0, 10)) {
      // The road runs on its own RNG stream and ignores ordinary forest, so
      // no forest knob may disturb it. Dark forest is the one terrain the
      // road reacts to, so it is switched off here.
      const a = generateMap({
        seed,
        forestCoverage: 0.5,
        gladeCount: 3,
        clearingCount: 0,
        darkForestCount: 0,
      })
      const b = generateMap({
        seed,
        forestCoverage: 0.85,
        gladeCount: 8,
        clearingCount: 20,
        darkForestCount: 0,
      })
      const roadOf = (m: GameMap) =>
        m.tiles.map((t, i) => (t === "path" ? i : -1)).filter((i) => i >= 0)
      expect(roadOf(b), `seed ${seed} road is stable`).toEqual(roadOf(a))
    }
  })
})
