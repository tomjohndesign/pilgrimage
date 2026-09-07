import { describe, expect, it } from "vitest"
import { animalTravel, transportPhase } from "./animal-travel"
import { createPasture, stepPasture } from "./pasture"
import { parseAsciiMap } from "../map/prototype-map"

describe("backward animal steps", () => {
  it("keeps its facing when walking toward a target behind it, in every direction", () => {
    for (let heading = -Math.PI; heading < Math.PI; heading += Math.PI / 8) {
      const backwards = animalTravel(heading, -Math.sin(heading), -Math.cos(heading))
      expect(backwards.reversing).toBe(true)
      expect(Math.cos(backwards.heading - heading)).toBeCloseTo(1, 10)
      expect(animalTravel(heading, Math.sin(heading), Math.cos(heading)).reversing).toBe(false)
    }
  })
  it("replays the same distance-driven stride backward across the loop boundary", () => {
    expect(transportPhase(0.05, 0.1, 1, true)).toBeCloseTo(0.95)
    expect(transportPhase(0.95, 0.1, 1, false)).toBeCloseTo(0.05)
  })
  it("backs a grazing animal toward its hitch without turning around", () => {
    const map = parseAsciiMap(Array(9).fill(".........")), animal = createPasture({ x: 0, z: 0 })
    animal.z = 1
    stepPasture(map, animal, 0.1, 0.2, true)
    expect(animal.z).toBeLessThan(1)
    expect(animal.heading).toBeCloseTo(0)
    expect(animal.reversing).toBe(true)
  })
})
