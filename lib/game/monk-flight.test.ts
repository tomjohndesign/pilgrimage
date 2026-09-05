import { describe, expect, it } from "vitest"

import { createMonkFlight, FLIGHT_ALTITUDE, FLIGHT_SPEED, stepMonkFlight } from "./monk-flight"
import type { GameMap } from "./map/types"
import { makeRng } from "./rng"

const map: GameMap = { width: 40, depth: 24, tiles: Array(40 * 24).fill("water"), buildings: [] }

describe("rocket-powered monks", () => {
  it("takes off vertically before flying over impassable terrain", () => {
    const rng = makeRng(123)
    const home = { x: 0, y: 0.2, z: 0 }
    const flight = createMonkFlight(home, home, map, rng)
    flight.target = { x: 10, y: 5, z: 10 }
    for (let i = 0; i < 10; i++) stepMonkFlight(flight, map, rng, 0.1)
    expect(flight.y).toBeGreaterThan(0.2)
    expect(flight.x).toBe(0)
    expect(flight.z).toBe(0)
    for (let i = 0; i < 15; i++) stepMonkFlight(flight, map, rng, 0.1)
    expect(flight.y).toBeGreaterThanOrEqual(FLIGHT_ALTITUDE)
    expect(flight.x).toBeGreaterThan(0)
    expect(flight.z).toBeGreaterThan(0)
  })

  it("visits every quadrant across excursions and stays inside a rectangular map", () => {
    const rng = makeRng(42)
    const home = { x: 0, y: 0.2, z: 0 }
    let flight = createMonkFlight(home, home, map, rng)
    const quadrants = new Set<string>()
    for (let i = 0; i < 6000; i++) {
      stepMonkFlight(flight, map, rng, 0.1)
      expect(Math.abs(flight.x)).toBeLessThanOrEqual(map.width / 2 - 0.5)
      expect(Math.abs(flight.z)).toBeLessThanOrEqual(map.depth / 2 - 0.5)
      if (flight.phase === "cruising" || flight.phase === "returning") {
        expect(flight.y).toBeGreaterThanOrEqual(FLIGHT_ALTITUDE)
      }
      quadrants.add(`${Math.sign(flight.x)},${Math.sign(flight.z)}`)
      if (flight.phase === "landed") flight = createMonkFlight(home, home, map, rng)
    }
    for (const quadrant of ["1,1", "1,-1", "-1,1", "-1,-1"]) expect(quadrants.has(quadrant)).toBe(true)
  })

  it("clamps a background-tab delta and never overshoots a destination", () => {
    const home = { x: 0, y: 0.2, z: 0 }
    const flight = createMonkFlight({ ...home, y: 5 }, home, map, makeRng(1))
    flight.phase = "cruising"
    flight.target = { x: 10, y: 5, z: 0 }
    stepMonkFlight(flight, map, makeRng(1), 600)
    expect(flight.x).toBeCloseTo(FLIGHT_SPEED * 0.1)
    flight.target.x = flight.x + 0.01
    const destination = flight.target.x
    stepMonkFlight(flight, map, makeRng(1), 0.1)
    expect(flight.x).toBe(destination)
  })

  it("returns above the shrine before descending, lands exactly, and stays grounded", () => {
    const rng = makeRng(8)
    const start = { x: -5, y: 0.2, z: -3 }
    const home = { x: 2, y: 0.2, z: 3 }
    const flight = createMonkFlight(start, home, map, rng)
    const phases = new Set<string>()
    let landedAt = 0
    for (let frame = 0; frame < 1500; frame++) {
      stepMonkFlight(flight, map, rng, 0.1)
      phases.add(flight.phase)
      if (flight.phase === "returning") expect(flight.y).toBeGreaterThanOrEqual(FLIGHT_ALTITUDE)
      if (flight.phase === "landing") {
        expect(flight.x).toBe(home.x)
        expect(flight.z).toBe(home.z)
        expect(flight.y).toBeGreaterThanOrEqual(home.y)
      }
      if (flight.phase === "landed") { landedAt = frame * 0.1; break }
    }
    expect([...phases]).toEqual(["climbing", "cruising", "returning", "landing", "landed"])
    expect(landedAt).toBeGreaterThan(20)
    expect(landedAt).toBeLessThan(50)
    expect({ x: flight.x, y: flight.y, z: flight.z }).toEqual(home)
    for (let frame = 0; frame < 900; frame++) stepMonkFlight(flight, map, rng, 0.1)
    expect(flight.phase).toBe("landed")
    expect({ x: flight.x, y: flight.y, z: flight.z }).toEqual(home)
  })
})
