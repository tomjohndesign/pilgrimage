import { describe, expect, it } from "vitest"

import { createEnt, ENT_LEG_HEIGHT, ENT_REST_SECONDS, stepEnt, type EntState } from "./ents"
import type { GameMap } from "../map/types"
import type { TreePlacement } from "./placement"

const placement: TreePlacement = { x: 0, y: 0.2, z: 0, species: "oak" }
const map: GameMap = { width: 30, depth: 30, tiles: Array(900).fill("forest"), buildings: [] }
function ent(): EntState {
  return { x: 0, z: 0, fromX: 0, fromZ: 0, targetX: 0, targetZ: 0, lift: 0, heading: 0, phase: "rooted", elapsed: 0, wait: 60, rng: () => 0.25 }
}
function advance(state: EntState, seconds: number, world = map) {
  for (let i = 0; i < Math.round(seconds * 10); i++) stepEnt(state, world, 0.1)
}

describe("the last march of the ents", () => {
  it("makes approximately one percent of trees eligible, deterministically", () => {
    let count = 0
    for (let i = 0; i < 10000; i++) {
      const first = createEnt(placement, 42, i)
      const again = createEnt(placement, 42, i)
      expect(Boolean(first)).toBe(Boolean(again))
      if (first) {
        count++
        expect(first.wait).toEqual(again!.wait)
        expect(first.wait).toBeGreaterThanOrEqual(0)
        expect(first.wait).toBeLessThan(ENT_REST_SECONDS)
      }
    }
    expect(count).toBeGreaterThan(70)
    expect(count).toBeLessThan(130)
  })

  it("waits a minute, grows legs, walks for thirty seconds, replants, and walks again a minute later", () => {
    const state = ent()
    advance(state, 59)
    expect(state.phase).toBe("rooted")
    expect(state.lift).toBe(0)
    advance(state, 1.1)
    expect(state.phase).toBe("rising")
    advance(state, 3)
    expect(state.phase).toBe("walking")
    expect(state.lift).toBeCloseTo(ENT_LEG_HEIGHT, 1)
    advance(state, 15)
    expect(state.phase).toBe("walking")
    expect(Math.hypot(state.x, state.z)).toBeCloseTo(1.25, 1)
    advance(state, 15.2)
    expect(state.phase).toBe("planting")
    advance(state, 3.1)
    expect(state.phase).toBe("rooted")
    expect(state.lift).toBe(0)
    expect(Math.hypot(state.x, state.z)).toBeCloseTo(2.5)
    expect(state.wait).toBeGreaterThan(ENT_REST_SECONDS - 1)
    expect(state.wait).toBeLessThanOrEqual(ENT_REST_SECONDS)
    const position = [state.x, state.z]
    advance(state, 59)
    expect(state.phase).toBe("rooted")
    expect([state.x, state.z]).toEqual(position)
    advance(state, 1.1)
    expect(state.phase).toBe("rising")
  })

  it("takes a walk when a route is clear instead of randomly skipping the minute", () => {
    const state = ent()
    state.wait = 0
    state.rng = () => 0.9
    stepEnt(state, map, 0.1)
    expect(state.phase).toBe("rising")
  })

  it("stays planted if its walk would cross water, roads, buildings, or the map edge", () => {
    const blockedMaps: GameMap[] = [
      { ...map, tiles: Array(900).fill("water") },
      { ...map, tiles: Array(900).fill("path") },
      { ...map, width: 1, depth: 1, tiles: ["forest"] },
      { ...map, buildings: [{ id: "hovel", label: "Hovel", x: 15, z: 15, w: 3, d: 3, height: 1, color: "", roofColor: "" }] },
    ]
    for (const world of blockedMaps) {
      const state = ent()
      state.wait = 0
      stepEnt(state, world, 0.1)
      expect(state.phase).toBe("rooted")
      expect([state.x, state.z, state.lift]).toEqual([0, 0, 0])
      expect(state.wait).toBe(ENT_REST_SECONDS)
    }
  })
})
