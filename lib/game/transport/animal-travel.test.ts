import { describe, expect, it } from "vitest"
import { animalTravel, hitchedAnimalTravel, transportPhase } from "./animal-travel"
import { alignCart } from "./follow"
import { createPasture, stepPasture } from "./pasture"
import { parseAsciiMap } from "../map/prototype-map"

describe("backward animal steps", () => {
  it("corrects a stale backward facing when an animal rejoins its cart", () => {
    for (let heading = -Math.PI; heading < Math.PI; heading += Math.PI / 8) {
      const cart = alignCart({ x: 3, z: -2 }, heading, 1.5)
      for (const direction of [1, -1]) {
        const dx = Math.sin(heading) * direction, dz = Math.cos(heading) * direction
        const stale = animalTravel(heading + Math.PI, dx, dz)
        expect(Math.cos(stale.heading - heading)).toBeCloseTo(-1)
        const travel = hitchedAnimalTravel(cart, stale)
        expect(Math.cos(travel.heading - heading)).toBeCloseTo(1)
        expect(travel.reversing).toBe(direction === -1)
      }
      const stopped = hitchedAnimalTravel(cart, animalTravel(heading + Math.PI, 0, 0))
      expect(Math.cos(stopped.heading - heading)).toBeCloseTo(1)
    }
  })
  it("preserves forward and backward turns away from the cart", () => {
    const cart = alignCart({ x: 0, z: 0 }, 0, 1)
    for (const heading of [-Math.PI / 3, 0, Math.PI / 3]) for (const reversing of [false, true]) {
      const travel = { heading, reversing }
      expect(hitchedAnimalTravel(cart, travel)).toEqual(travel)
    }
  })
  it("uses the axle-to-hitch direction when bridge guidance rotates the cart body", () => {
    const cart = { ...alignCart({ x: 0, z: 0 }, 0, 1), heading: Math.PI * 0.75, bridgeGuided: true }
    expect(hitchedAnimalTravel(cart, { heading: 0, reversing: false })).toEqual({ heading: 0, reversing: false })
    const corrected = hitchedAnimalTravel(cart, { heading: Math.PI, reversing: true })
    expect(Math.cos(corrected.heading)).toBeCloseTo(1)
    expect(corrected.reversing).toBe(false)
  })
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
