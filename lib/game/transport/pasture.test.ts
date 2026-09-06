import { describe, expect, it } from "vitest"
import { createPasture, pastureRoutes, stepPasture } from "./pasture"
import { tileAt, worldToTileX, worldToTileZ, type GameMap } from "../map/types"

function map(): GameMap {
  return { width: 9, depth: 9, buildings: [], tiles: Array.from({ length: 81 }, (_, i) => i % 9 === 4 ? "path" : "grass") }
}
describe("unhitched draught animals", () => {
  it("cannot choose grass on the opposite side of roads, tracks or water", () => {
    for (const barrier of ["path", "track", "water", "bridge"] as const) {
      const ground = map(); ground.tiles = ground.tiles.map(tile => tile === "path" ? barrier : tile)
      const routes = pastureRoutes(ground, { x: -1, z: 0 })
      expect(routes.length).toBeGreaterThan(1)
      for (const route of routes) for (const tile of route) {
        expect(tile.x).toBeLessThan(4)
        expect(tileAt(ground, tile.x, tile.z)).toBe("grass")
      }
    }
  })
  it("walks and grazes within the adjacent few tiles, then retraces a safe route to the hitch", () => {
    const ground = map(), animal = createPasture({ x: -1, z: 0 }), visited = new Set<string>()
    let walking = 0, grazing = 0
    const check = () => {
      const x = worldToTileX(ground, animal.x), z = worldToTileZ(ground, animal.z)
      expect(tileAt(ground, x, z)).toBe("grass")
      expect(Math.abs(x - 3) + Math.abs(z - 4)).toBeLessThanOrEqual(2)
      visited.add(`${x}:${z}`)
    }
    for (let i = 0; i < 2000; i++) { stepPasture(ground, animal, 0.1, 0.2, false); check(); if (animal.moving) walking++; else grazing++ }
    expect(visited.size).toBeGreaterThan(2); expect(walking).toBeGreaterThan(0); expect(grazing).toBeGreaterThan(0)
    for (let i = 0; i < 1000 && !animal.ready; i++) { stepPasture(ground, animal, 0.1, 0.2, true); check() }
    expect(animal.ready).toBe(true); expect(animal.x).toBe(animal.home.x); expect(animal.z).toBe(animal.home.z)
  })
  it("stays put when grass is unavailable and avoids building footprints", () => {
    const ground = map(); ground.tiles.fill("forest"); ground.tiles[4 * 9 + 3] = "grass"
    const animal = createPasture({ x: -1, z: 0 })
    for (let i = 0; i < 20; i++) stepPasture(ground, animal, 1, 0.2, false)
    expect([animal.x, animal.z]).toEqual([-1, 0])
    ground.tiles.fill("grass"); ground.buildings.push({ id: "hut", label: "Hut", x: 2, z: 3, w: 1, d: 3, height: 1, color: "", roofColor: "" })
    expect(pastureRoutes(ground, animal).flat().some(t => t.x === 2 && t.z >= 3 && t.z <= 5)).toBe(false)
  })
})
