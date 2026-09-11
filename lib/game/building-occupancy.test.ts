import { describe, expect, it } from "vitest"
import { occupiedBuildingIds, sameIds } from "./building-occupancy"
import type { GameMap } from "./map/types"
import type { SimState, SimTraveler } from "./sim"

const person = (employer: string | null, home: string | null) => ({ employer, home }) as SimTraveler

describe("occupied buildings", () => {
  const map: GameMap = { width: 10, depth: 10, tiles: Array(100).fill("grass"), buildings: [
    { id: "cell", buildType: "monk-shelter", label: "Monks’ shelter", x: 1, z: 1, w: 3, d: 2, height: .6, color: "tan", roofColor: "tan" },
    { id: "house", buildType: "house", label: "House", x: 5, z: 1, w: 2, d: 2, height: .7, color: "tan", roofColor: "tan" },
    { id: "stall", buildType: "market", label: "Market stall", x: 1, z: 5, w: 3, d: 2, height: .65, color: "tan", roofColor: "tan" },
  ] }
  const sim = (travelers: SimTraveler[], monks: { home?: string }[] = []): Pick<SimState, "travelers" | "joinedMonks"> => ({
    travelers: new Map(travelers.map((t, id) => [id, t])),
    joinedMonks: new Map(monks.map((monk, id) => [id, monk as SimState["joinedMonks"] extends Map<number, infer M> ? M : never])),
  })

  it("counts workers, residents and the founding brothers' shelter", () => {
    expect([...occupiedBuildingIds(sim([]), map)]).toEqual(["cell"])
    expect([...occupiedBuildingIds(sim([person("stall", null), person(null, "house")]), map)].sort()).toEqual(["cell", "house", "stall"])
    expect(occupiedBuildingIds(null, map).size).toBe(0)
  })

  it("counts a later brother's recorded home", () => {
    const cells = { ...map, buildings: [{ ...map.buildings[0], id: "cell-2", z: 8 }] }
    expect([...occupiedBuildingIds(sim([], [{ home: "cell-2" }]), cells)]).toEqual(["cell-2"])
  })

  it("compares membership without order", () => {
    expect(sameIds(new Set(["a", "b"]), new Set(["b", "a"]))).toBe(true)
    expect(sameIds(new Set(["a"]), new Set(["a", "b"]))).toBe(false)
    expect(sameIds(new Set(["a"]), new Set(["b"]))).toBe(false)
  })
})
