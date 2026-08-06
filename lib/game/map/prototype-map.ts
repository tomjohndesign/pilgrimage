import { TERRAIN_CHARS, type TerrainId } from "./terrain"
import type { BuildingDef, GameMap } from "./types"

/**
 * The prototype map, authored as ASCII so it stays hand-editable.
 *
 *   .  clear land (grass)     ,  bare earth (the plaza floor)
 *   =  road                   F  forest
 *   ^  hills
 *
 * The road enters from the west edge at z=17, runs east, turns north at x=9,
 * then runs east again along z=12 through the plaza and off the east edge.
 * Every row must be exactly as wide as the first — `parseAsciiMap` enforces it.
 */
export const PROTOTYPE_MAP_ROWS = [
  "................................", // 0
  "..FFFFFF........................", // 1
  ".FFFFFFF........................", // 2
  ".FFFFFF...................^^^^^.", // 3
  "..FFFFFF.................^^^^^^.", // 4
  "..FFFFF..................^^^^^^^", // 5
  "...FFFF...................^^^^^^", // 6
  "...FFF.....................^^^^^", // 7
  "............................^^^^", // 8
  ".................,,,,,,,........", // 9
  ".................,,,,,,,........", // 10
  ".................,,,,,,,........", // 11
  ".........========,,,,,,,========", // 12
  ".........=.......,,,,,,,........", // 13
  ".........=.......,,,,,,,........", // 14
  ".........=.......,,,,,,,........", // 15
  ".........=......................", // 16
  "==========......................", // 17
  "................................", // 18
  "................................", // 19
  "................................", // 20
  "................................", // 21
  "................................", // 22
  "................................", // 23
  "........................FFFFFF..", // 24
  ".......................FFFFFFF..", // 25
  ".......................FFFFFFFF.", // 26
  "........................FFFFFFF.", // 27
  ".........................FFFFFF.", // 28
  "..........................FFFF..", // 29
  "................................", // 30
  "................................", // 31
]

/**
 * Placeholder structures. Everything is a box for now — the point is to prove
 * the grid-to-world mapping and footprint sizing, not the art.
 * All of these sit inside the plaza (x 17–23, z 9–15), clear of the road at z=12.
 */
export const PROTOTYPE_BUILDINGS: BuildingDef[] = [
  {
    id: "relic",
    label: "Relic Shrine",
    x: 19,
    z: 9,
    w: 2,
    d: 2,
    height: 2.6,
    color: "#d6cbae",
    roofColor: "#a07830",
  },
  {
    id: "inn",
    label: "Inn",
    x: 17,
    z: 14,
    w: 2,
    d: 2,
    height: 1.5,
    color: "#cbb894",
    roofColor: "#8a4b2f",
  },
  {
    id: "chapel",
    label: "Chapel",
    x: 22,
    z: 14,
    w: 1,
    d: 1,
    height: 1.9,
    color: "#d2cbb4",
    roofColor: "#6d5336",
  },
  {
    id: "guard-post",
    label: "Guard Post",
    x: 22,
    z: 10,
    w: 1,
    d: 1,
    height: 1.2,
    color: "#9a7550",
    roofColor: "#5c3f28",
  },
  {
    id: "market",
    label: "Market Stall",
    x: 17,
    z: 10,
    w: 1,
    d: 1,
    height: 0.8,
    color: "#b08a5c",
    roofColor: "#8b1a1a",
  },
]

export function parseAsciiMap(rows: string[], buildings: BuildingDef[] = []): GameMap {
  const width = rows[0].length
  const depth = rows.length
  const tiles: TerrainId[] = new Array(width * depth)

  for (let z = 0; z < depth; z++) {
    const row = rows[z]
    if (row.length !== width) {
      throw new Error(
        `Map row ${z} is ${row.length} chars, expected ${width}. Rows must all be the same width.`,
      )
    }
    for (let x = 0; x < width; x++) {
      const char = row[x]
      const terrain = TERRAIN_CHARS[char]
      if (!terrain) {
        throw new Error(`Unknown map character "${char}" at (${x}, ${z}).`)
      }
      tiles[z * width + x] = terrain
    }
  }

  for (const b of buildings) {
    if (b.x < 0 || b.z < 0 || b.x + b.w > width || b.z + b.d > depth) {
      throw new Error(`Building "${b.id}" footprint falls outside the map.`)
    }
  }

  return { width, depth, tiles, buildings }
}

export const PROTOTYPE_MAP: GameMap = parseAsciiMap(PROTOTYPE_MAP_ROWS, PROTOTYPE_BUILDINGS)
