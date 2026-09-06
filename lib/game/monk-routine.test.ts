import { describe, expect, it } from "vitest"
import { buildingStepAllowed, containsTile, shrineGates } from "./building-navigation"
import { activityClip } from "./base-person/activity"
import { monkWander } from "./monk-wander"
import { createMonkRoutine, stepMonkRoutine } from "./monk-routine"
import { makeRng } from "./rng"
import { settlementRoute } from "./settlement-route"
import { worldToTileX, worldToTileZ, type GameMap } from "./map/types"

function shrineMap(): GameMap {
  return {
    width: 11, depth: 11, tiles: Array(121).fill("grass"),
    buildings: [{ id: "shrine", x: 4, z: 4, w: 3, d: 3, height: 1, label: "Shrine", color: "", roofColor: "" }],
    site: { hovelId: "shrine", door: { x: 5, z: 7 }, junction: 0, branch: [] },
  }
}

describe("grid routes through shrine doors", () => {
  it("crosses each wall only at its gate, in either direction", () => {
    const map = shrineMap(), shrine = map.buildings[0]
    for (let z = 3; z <= 7; z++) for (let x = 3; x <= 7; x++) {
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const a = { x, z }, b = { x: x + dx, z: z + dz }
        if (containsTile(shrine, a) === containsTile(shrine, b)) continue
        const gate = shrineGates(shrine).some(g => JSON.stringify(g.inside) === JSON.stringify(containsTile(shrine, a) ? a : b) &&
          JSON.stringify(g.outside) === JSON.stringify(containsTile(shrine, a) ? b : a))
        expect(buildingStepAllowed(map, map.buildings, a, b, true)).toBe(gate)
      }
    }
  })

  it("does not allow ordinary routes into closed buildings or across the relic table", () => {
    const map = shrineMap()
    expect(settlementRoute(map, map.buildings, { x: 5, z: 7 }, { x: 5, z: 6 })).toBeNull()
    expect(settlementRoute(map, map.buildings, { x: 5, z: 7 }, { x: 5, z: 5 }, false, true)).toBeNull()
    expect(settlementRoute(map, map.buildings, { x: 5, z: 7 }, { x: 5, z: 6 }, false, true)).toEqual([{ x: 5, z: 7 }, { x: 5, z: 6 }])
    map.buildings[0].id = "inn"
    expect(settlementRoute(map, map.buildings, { x: 5, z: 7 }, { x: 5, z: 6 }, false, true)).toBeNull()
  })

  it("gives every monk repeated prayers inside, with grid walking and exits through gates", () => {
    const map = shrineMap(), shrine = map.buildings[0], grounds = monkWander(map), rng = makeRng(42)
    const monks = Array.from({ length: 4 }, (_, i) => createMonkRoutine(grounds, i, rng))
    expect(new Set(monks.map(m => JSON.stringify(m.prayerSpot))).size).toBe(4)
    for (const monk of monks) {
      let prayers = 0, exits = 0
      for (let tick = 0; tick < 5000; tick++) {
        const was = monk.activity
        const from = { x: worldToTileX(map, monk.x), z: worldToTileZ(map, monk.z) }
        stepMonkRoutine(monk, grounds, rng, 1, 0.1)
        const to = { x: worldToTileX(map, monk.x), z: worldToTileZ(map, monk.z) }
        const tx = monk.x + map.width / 2 - 0.5, tz = monk.z + map.depth / 2 - 0.5
        expect(Math.min(Math.abs(tx - Math.round(tx)), Math.abs(tz - Math.round(tz)))).toBeLessThan(1e-8)
        if (from.x !== to.x || from.z !== to.z) expect(buildingStepAllowed(map, map.buildings, from, to, true)).toBe(true)
        if (containsTile(shrine, from) && !containsTile(shrine, to)) exits++
        if (monk.activity === "praying") {
          expect(containsTile(shrine, to)).toBe(true)
          expect(activityClip(monk.activity, false)).toBe("praying")
          if (was !== "praying") prayers++
        }
      }
      expect(prayers).toBeGreaterThan(2)
      expect(exits).toBeGreaterThan(2)
    }
  })

  it("holds position and prayer time while paused", () => {
    const grounds = monkWander(shrineMap()), rng = makeRng(1), monk = createMonkRoutine(grounds, 0, rng)
    for (let i = 0; i < 1000 && monk.activity !== "praying"; i++) stepMonkRoutine(monk, grounds, rng, 1, 0.1)
    expect(monk.activity).toBe("praying")
    const before = structuredClone(monk)
    stepMonkRoutine(monk, grounds, rng, 1, 0)
    expect(monk).toEqual(before)
  })
})
