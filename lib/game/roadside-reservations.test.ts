import { expect, it } from "vitest"
import { RoadsideReservations } from "./roadside-reservations"
import { createSim } from "./sim"
import { generateTravelers } from "./travelers"
import type { GameMap } from "./map/types"

it("tracks alms-only reservations, same-tick replacement and release without blocking their owner", () => {
  const map: GameMap = { width: 12, depth: 12, tiles: Array(144).fill("grass"), buildings: [], road: [{ x: 0, z: 6 }, { x: 1, z: 6 }] }
  const [owner, visitor] = [...createSim(generateTravelers(1, 2), map).travelers.values()]
  const index = new RoadsideReservations([owner, visitor]), first = { x: 3.9, y: 0, z: 0 }, second = { x: 8.1, y: 0, z: 0 }
  owner.almsVisit = { beggarId: visitor.id, cycle: 0, spot: first }
  index.update(owner)
  expect(index.occupied(first, visitor.id)).toBe(true)
  expect(index.occupied(first, owner.id)).toBe(false)
  owner.x = -20; owner.z = 20
  expect(index.occupied(first, visitor.id)).toBe(true)
  owner.almsVisit.spot = second; index.update(owner)
  expect(index.occupied(first, visitor.id)).toBe(false)
  expect(index.occupied(second, visitor.id)).toBe(true)
  owner.almsVisit = undefined
  expect(index.occupied(second, visitor.id)).toBe(false)
  owner.musicVisit = { performerId: visitor.id, cycle: 0, spot: first }; index.update(owner)
  expect(index.occupied(first, visitor.id)).toBe(true)
})
