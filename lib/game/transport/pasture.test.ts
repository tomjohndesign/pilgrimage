import { describe, expect, it } from "vitest"
import { createPasture, pastureRoutes, stepPasture } from "./pasture"
import { tileAt, worldToTileX, worldToTileZ, type GameMap } from "../map/types"
import { obstacleDistance, pastureSegmentClear } from "./stall"

function map(): GameMap {
  return { width: 9, depth: 9, buildings: [], tiles: Array.from({ length: 81 }, (_, i) => i % 9 === 4 ? "path" : "grass") }
}
describe("unhitched draught animals", () => {
  it("separates overlapping grazing animals and lets both return to their hitches", () => {
    const ground = map(), animals = [createPasture({ x: -3, z: 0 }, [], .3), createPasture({ x: -1, z: 0 }, [], .3)]
    animals[0].x = -2.1; animals[1].x = -1.9
    for (let i = 0; i < 80; i++) for (const animal of animals) {
      const other = animals.find(a => a !== animal)!
      animal.obstacles = [{ x: other.x, z: other.z, heading: 0, halfWidth: other.clearance, halfLength: other.clearance }]
      stepPasture(ground, animal, .1, .3, true)
    }
    for (const animal of animals) {
      expect(animal.ready).toBe(true)
      expect(animal.x).toBe(animal.home.x)
    }
  })

  it.each(["stall", "building"])("walks out of a newly overlapping %s without crossing other obstacles", kind => {
    const ground = map(), animal = createPasture({ x: -2, z: 0 }, [], .3)
    animal.x = -2.3
    const obstacle = { x: -3, z: 0, heading: 0, halfWidth: .5, halfLength: .5 }
    if (kind === "stall") animal.obstacles = [obstacle]
    else ground.buildings = [{ id: "new", label: "New", x: 1, z: 4, w: 1, d: 1, height: 1, color: "", roofColor: "" }]
    const wall = { x: -2, z: 1, heading: 0, halfWidth: 1, halfLength: .1 }
    animal.obstacles.push(wall)
    for (let i = 0; i < 30; i++) {
      const before = { x: animal.x, z: animal.z }
      stepPasture(ground, animal, .1, .3, true)
      expect(Math.hypot(animal.x - before.x, animal.z - before.z)).toBeLessThanOrEqual(.030001)
      expect(obstacleDistance(animal, obstacle)).toBeGreaterThanOrEqual(obstacleDistance(before, obstacle) - 1e-8)
      expect(pastureSegmentClear(before, animal, [wall], animal.clearance)).toBe(true)
    }
    expect(animal.ready).toBe(true)
    expect(animal.x).toBe(animal.home.x)
  })

  it("reports a newly blocked hitch so the merchant can leave an unusable pitch", () => {
    const ground = map(), animal = createPasture({ x: -2, z: 0 }, [], .3)
    animal.x = -1
    animal.obstacles.push({ ...animal.home, heading: 0, halfWidth: .4, halfLength: .4 })
    for (let i = 0; i < 40; i++) stepPasture(ground, animal, .1, .3, true)
    expect(animal.ready).toBe(false)
    expect(animal.stranded).toBe(true)
  })

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
