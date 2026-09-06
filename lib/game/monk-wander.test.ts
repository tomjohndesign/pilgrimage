import { describe, expect, it } from "vitest"
import { monkWander } from "./monk-wander"
import { DEFAULT_ELEVATION, elevationStep, finishElevation } from "./map/elevation"
import { tileToWorldX, tileToWorldZ, worldToTileX, worldToTileZ, type GameMap } from "./map/types"
import { buildingAt } from "./settlement"

function grounds(): GameMap {
  const map: GameMap = {
    width: 9, depth: 9, tiles: Array(81).fill("grass"),
    buildings: [{ id: "hovel", x: 4, z: 4, w: 1, d: 1, height: 1, label: "Hovel", color: "", roofColor: "" }],
    site: { hovelId: "hovel", door: { x: 4, z: 5 }, junction: 0, branch: [] },
    elevation: { settings: DEFAULT_ELEVATION, height: Array(81).fill(0), corners: [], cliffs: [], slope: [] },
  }
  return map
}

describe("monks wandering around the shrine", () => {
  it("never spawns or chooses a destination on an isolated raised tile", () => {
    const map = grounds()
    map.elevation!.height[5 * 9 + 5] = 2
    finishElevation(map.elevation!, 9, 9, new Uint8Array(81), Array(81).fill(0))
    const wander = monkWander(map)
    expect(wander.spots.length).toBeGreaterThan(10)
    expect(wander.spots.some(p => worldToTileX(map, p.x) === 5 && worldToTileZ(map, p.z) === 5)).toBe(false)
  })

  it("snaps destinations to the grid and routes around buildings, water, woods and cliffs", () => {
    const map = grounds()
    map.elevation!.height[5 * 9 + 5] = 2
    map.tiles[3 * 9 + 4] = "water"
    map.tiles[4 * 9 + 5] = "forest"
    finishElevation(map.elevation!, 9, 9, new Uint8Array(81), Array(81).fill(0))
    const wander = monkWander(map)
    for (const a of [wander.spots[0], wander.spots.at(-1)!]) for (const b of wander.spots) {
      const start = { ...a, x: a.x + 0.24, z: a.z - 0.24 }
      const goal = { ...b, x: b.x - 0.24, z: b.z + 0.24 }
      const path = wander.route(start, goal)
      expect(path.at(-1)).toEqual(b)
      let previous = start
      for (const point of path) {
        let last = worldToTileZ(map, previous.z) * 9 + worldToTileX(map, previous.x)
        for (let tick = 0; tick <= 20; tick++) {
          const x = worldToTileX(map, previous.x + (point.x - previous.x) * tick / 20)
          const z = worldToTileZ(map, previous.z + (point.z - previous.z) * tick / 20)
          const next = z * 9 + x
          expect(buildingAt(map, x, z)).toBeFalsy()
          expect(map.tiles[next]).toBe("grass")
          expect(Number.isFinite(elevationStep(map.elevation, last, next))).toBe(true)
          last = next
        }
        previous = point
      }
    }
  })

  it("allows an elevated destination reached by a continuous slope", () => {
    const map = grounds()
    for (let z = 0; z < 9; z++) for (let x = 0; x < 9; x++) map.elevation!.height[z * 9 + x] = x * 0.2
    finishElevation(map.elevation!, 9, 9, new Uint8Array(81), Array(81).fill(0))
    const wander = monkWander(map)
    const goal = { x: tileToWorldX(map, 7), y: 1.6, z: tileToWorldZ(map, 5) }
    expect(wander.route(wander.spots[0], goal).at(-1)).toMatchObject({ x: goal.x, z: goal.z })
  })

  it("has no wanderers without an accessible shrine door", () => {
    const map = grounds()
    map.tiles[5 * 9 + 4] = "water"
    expect(monkWander(map).spots).toEqual([])
  })
})
