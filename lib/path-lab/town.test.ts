import { describe, expect, it } from "vitest"
import { buildingEntry } from "../game/building-rotation"
import { BASE_CHARACTER_SCALE, DEFAULT_WALK_SPEED, walkSpeedScale } from "../game/base-person/gait"
import { advanceTown, createTown, residentVisual, setWorkplaceOpen, TOWN_DAY, TOWN_JOBS, TOWN_SETTINGS, TOWN_SITES } from "./town"
import { findRoute, indexAt, routeClear, worldStats } from "./simulation"

describe("staged village", () => {
  it("places every home and workplace on reachable ground, with only the founding road preworn", () => {
    const town = createTown()
    expect(town.people).toHaveLength(12)
    for (const site of TOWN_SITES) {
      const door = buildingEntry(site)
      expect(findRoute(town.world, indexAt(1, 16), indexAt(door.x, door.z), TOWN_SETTINGS)).not.toBeNull()
    }
    expect(worldStats(town.world).traces).toBe(0)
    expect(new Set(town.people.map(person => person.job)).size).toBe(4)
    for (const person of town.people) {
      expect(person.speed).toBeCloseTo(DEFAULT_WALK_SPEED * walkSpeedScale(residentVisual(person).walkStride, BASE_CHARACTER_SCALE))
    }
  })
  it("wears shared routes through recurring work journeys without moving or wearing while paused", () => {
    const town = createTown()
    advanceTown(town, TOWN_DAY * 5)
    expect(town.people.every(person => person.completed >= 5)).toBe(true)
    expect(worldStats(town.world).sharedTravel).toBeGreaterThan(.5)
    expect(worldStats(town.world).permanent).toBeGreaterThan(0)
    town.people.forEach(person => {
      if (person.trip) expect(routeClear(person.trip.route, town.world.blocked)).toBe(true)
    })
    const wear = town.world.wear.slice(), positions = town.people.map(person => [person.x, person.z])
    advanceTown(town, 0)
    expect(town.world.wear).toEqual(wear)
    expect(town.people.map(person => [person.x, person.z])).toEqual(positions)
    expect(town.people.every(person => person.distance === 0)).toBe(true)
  })
  it("stops starting trips to a closed workplace and resumes after reopening", () => {
    const town = createTown()
    setWorkplaceOpen(town, "timber", false)
    for (let second = 0; second < TOWN_DAY * 2; second++) {
      advanceTown(town, 1)
      expect(town.people.every(person => person.target !== "timber")).toBe(true)
    }
    setWorkplaceOpen(town, "timber", true)
    let returned = false
    for (let second = 0; second < TOWN_DAY * 2; second++) {
      advanceTown(town, 1)
      returned ||= town.people.some(person => person.target === "timber")
    }
    expect(returned).toBe(true)
    expect(TOWN_JOBS.woodworker.stops).toContain("timber")
  })
  it("is deterministic across subdivisions and resetting restores the staged scene", () => {
    const one = createTown(), many = createTown()
    advanceTown(one, 10)
    for (let i = 0; i < 100; i++) advanceTown(many, .1)
    expect(one.world.wear).toEqual(many.world.wear)
    expect(one.people.map(p => [p.x, p.z, p.target])).toEqual(many.people.map(p => [p.x, p.z, p.target]))
    expect(createTown().world.time).toBe(0)
  })
})
