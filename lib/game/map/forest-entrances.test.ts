import { describe, expect, it } from "vitest"
import { createFootpaths, foundingRoadStrength, foundingRoadTraffic, regrowFootpaths } from "../footpaths"
import { placeTrees } from "../trees/placement"
import { TREE_SPECIES } from "../trees/species"
import { forestEntrancePlacements, forestTrackTiles, FOREST_WARNING_CLEARANCE } from "./forest-entrances"
import { generateMap } from "./generate-map"
import { tileAt, type GameMap } from "./types"

function fixture(): GameMap {
  const width = 24, depth = 15
  const map: GameMap = { width, depth, tiles: Array(width * depth).fill("grass"), buildings: [], seed: 19 }
  for (let z = 2; z < 13; z++) for (let x = 5; x < 19; x++) map.tiles[z * width + x] = "darkwood"
  const tiles = Array.from({ length: 22 }, (_, i) => ({ x: i + 1, z: 7 }))
  for (const p of tiles) map.tiles[p.z * width + p.x] = "track"
  map.shortcuts = [{ entry: 0, exit: 21, tiles }]
  return map
}

describe("dark forest thresholds", () => {
  it("marks both ends facing outward, off the track and clear of trunks", () => {
    const map = fixture(), signs = forestEntrancePlacements(map)
    expect(signs).toHaveLength(2)
    expect(signs[0].x).toBeLessThan(signs[1].x)
    expect(Math.sin(signs[0].yaw)).toBe(-1)
    expect(Math.sin(signs[1].yaw)).toBe(1)
    const trees = placeTrees(map, TREE_SPECIES)
    for (const sign of signs) {
      expect(tileAt(map, sign.tile.x, sign.tile.z)).not.toBe("track")
      expect(trees.every(t => Math.hypot(t.x - sign.x, t.z - sign.z) >= FOREST_WARNING_CLEARANCE)).toBe(true)
    }
    const dead = trees.filter(t => t.dead).length
    expect(dead).toBeGreaterThan(0)
    expect(dead / trees.filter(t => t.oldGrowth).length).toBeLessThan(.3)
    expect(trees.filter(t => t.dead).every(t => t.oldGrowth)).toBe(true)
    expect(placeTrees(map, TREE_SPECIES)).toEqual(trees)
  })

  it("retains narrow faint tracks after disuse or heavy traffic, while ordinary roads keep their wear", () => {
    const map = fixture(), index = 7 * map.width + 10
    map.tiles[0] = "path"
    map.footpaths = createFootpaths(map)
    expect(forestTrackTiles(map).has(index)).toBe(true)
    map.footpaths.rerouted.add(index)
    map.footpaths.rerouted.add(0)
    regrowFootpaths(map.footpaths, 100)
    expect(foundingRoadStrength(map, index)).toBe(.48)
    expect(foundingRoadStrength(map, 0)).toBe(0)
    map.footpaths.founding.set(index, 1)
    expect(foundingRoadTraffic(map, index, 100)).toBe(2)
    map.footpaths.paved = true
    expect(foundingRoadStrength(map, index)).toBe(1)
  })

  it("places warnings on generated grove approaches without occupying buildings or water", () => {
    for (const seed of [5, 11, 23]) {
      const map = generateMap({ width: 80, depth: 56, seed, darkForestCount: 2 })
      const signs = forestEntrancePlacements(map)
      if (map.darkForests?.length) expect(signs.length).toBeGreaterThan(0)
      for (const sign of signs) {
        expect(["water", "bridge", "path", "track"]).not.toContain(tileAt(map, sign.tile.x, sign.tile.z))
        expect(map.buildings.some(b => sign.tile.x >= b.x && sign.tile.x < b.x + b.w && sign.tile.z >= b.z && sign.tile.z < b.z + b.d)).toBe(false)
      }
    }
  })
})
