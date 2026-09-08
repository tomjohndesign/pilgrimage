import { describe, expect, it } from "vitest"
import { parseAsciiMap } from "../map/prototype-map"
import type { GameMap } from "../map/types"
import { CHARACTER_PIXEL_SIZE } from "../render/pixel-scale"
import { GROWTH_ATLAS_COLUMNS, GROWTH_CELL_PIXELS, GROWTH_SPRITE_SIZE, groundGrowthField } from "./ground-growth"

const meadow = (seed = 42): GameMap => ({ ...parseAsciiMap(Array(48).fill(".".repeat(48))), seed })
function plants(map: GameMap) {
  const field = groundGrowthField(map), out = []
  for (let z = 0; z < field.height; z++) for (let x = 0; x < field.width; x++) {
    const i = (z * field.width + x) * 4
    if (!field.data[i + 3]) continue
    out.push({
      x: ((x + field.origin[0]) * GROWTH_CELL_PIXELS + field.data[i]) * CHARACTER_PIXEL_SIZE + map.width / 2,
      z: ((z + field.origin[1]) * GROWTH_CELL_PIXELS + field.data[i + 1]) * CHARACTER_PIXEL_SIZE + map.depth / 2,
      family: Math.floor(field.data[i + 2] / GROWTH_ATLAS_COLUMNS),
    })
  }
  return out
}

describe("continuous ground growth", () => {
  it("reproduces a world seed with compact placement records and changes with the seed", () => {
    const map = meadow(), before = structuredClone(map), field = groundGrowthField(map)
    expect(groundGrowthField(map)).toEqual(field)
    expect(groundGrowthField(meadow(43)).data).not.toEqual(field.data)
    expect(map).toEqual(before)
    expect(field.data.length).toBeLessThan(map.tiles.length * 16)
  })

  it("allows whole plant sprites and connected colonies to span terrain cells", () => {
    const rich = plants(meadow()).filter(p => p.family > 0)
    expect(rich.length).toBeGreaterThan(300)
    const radius = GROWTH_SPRITE_SIZE / 2
    const crossing = rich.filter(p => Math.floor(p.x - radius) !== Math.floor(p.x + radius) || Math.floor(p.z - radius) !== Math.floor(p.z + radius))
    expect(crossing.length).toBeGreaterThan(rich.length * .6)
    const columns = new Set(rich.map(p => Math.floor(p.x)))
    expect(columns.size).toBeGreaterThan(30)
    // Adjacent vegetation continues across boundaries instead of leaving a
    // clear rectangular border around every three-tile image repeat.
    const neighbours = rich.filter(a => rich.some(b => Math.floor(a.x) !== Math.floor(b.x) && Math.hypot(a.x - b.x, a.z - b.z) < .7))
    expect(neighbours.length).toBeGreaterThan(rich.length * .3)
  })

  it("favours creeping leaves beside woods and water, and flowers in open meadow", () => {
    const counts = { open: [0, 0, 0, 0], forest: [0, 0, 0, 0], shore: [0, 0, 0, 0] }
    for (const seed of [0, 1, 2, 3, 4, 5, 42, 99]) {
      for (const habitat of ["open", "forest", "shore"] as const) {
        const map = meadow(seed)
        if (habitat !== "open") for (let z = 0; z < 48; z++) for (let x = 0; x < 16; x++) {
          map.tiles[z * 48 + x] = habitat === "forest" ? "forest" : "water"
        }
        const growth = plants(map)
        if (habitat === "open") {
          // Flowers remain present even in seeds whose broad colony field
          // favours meadow grass rather than a dedicated flower patch.
          const rich = growth.filter(p => p.family > 0)
          expect(rich.filter(p => p.family === 3).length).toBeGreaterThan(rich.length * .12)
        }
        for (const p of growth) if (p.x >= 17 && p.x < 20) counts[habitat][p.family]++
      }
    }
    expect(counts.forest[2]).toBeGreaterThan(counts.open[2])
    expect(counts.shore[2]).toBeGreaterThan(counts.open[2])
    expect(counts.forest[3]).toBeLessThan(counts.open[3])
  })

  it("keeps full rich-plant footprints off roads, water and building plots", () => {
    const map = meadow()
    for (let x = 0; x < 48; x++) map.tiles[20 * 48 + x] = "path"
    for (let z = 0; z < 48; z++) map.tiles[z * 48 + 30] = "water"
    map.buildings.push({ id: "test", label: "Plot", x: 10, z: 10, w: 4, d: 4, height: 1, color: "#aaaaaa", roofColor: "#aaaaaa" })
    for (const p of plants(map).filter(p => p.family > 0)) {
      const radius = GROWTH_SPRITE_SIZE / 2
      for (let z = Math.floor(p.z - radius); z <= Math.floor(p.z + radius); z++) for (let x = Math.floor(p.x - radius); x <= Math.floor(p.x + radius); x++) {
        expect(map.tiles[z * map.width + x]).toBe("grass")
        expect(x >= 10 && x < 14 && z >= 10 && z < 14).toBe(false)
      }
    }
  })
})
