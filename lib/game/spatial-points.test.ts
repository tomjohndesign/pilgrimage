import { expect, it } from "vitest"
import { makeRng } from "./rng"
import { SpatialPoints } from "./spatial-points"

it("makes new reservations visible immediately while preserving encounter order", () => {
  const first = { x: 3.99, z: 0 }, second = { x: 4.01, z: 0 }
  const index = new SpatialPoints([first])
  index.add(second)
  expect(index.firstWithin(4, 0, 1)).toBe(first)
  expect(index.firstWithin(4, 0, 1, point => point !== first)).toBe(second)
})

it("matches ordered population scans across negative coordinates, bucket edges and empty neighborhoods", () => {
  const rng = makeRng(12345)
  const people = Array.from({ length: 6000 }, (_, id) => ({ id, x: rng() * 512 - 256, z: rng() * 512 - 256 }))
  const index = new SpatialPoints(people)
  for (let i = 0; i < 500; i++) {
    const x = rng() * 540 - 270, z = rng() * 540 - 270, radius = rng() * 8
    expect(index.firstWithin(x, z, radius)).toBe(people.find(p => Math.hypot(p.x - x, p.z - z) < radius))
  }
  const boundary = [{ x: 4, z: 0 }, { x: -4, z: 0 }]
  expect(new SpatialPoints(boundary).firstWithin(0, 0, 4)).toBeUndefined()
  expect(new SpatialPoints(boundary).firstWithin(0, 0, 4.01)).toBe(boundary[0])
})


it("keeps live movement and original ordering correct across repeated cell crossings", () => {
  const rng = makeRng(72)
  const animals = Array.from({ length: 6000 }, (_, id) => ({ id, x: rng() * 512 - 256, z: rng() * 512 - 256 }))
  const index = new SpatialPoints(animals)
  for (let tick = 0; tick < 1000; tick++) {
    const animal = animals[Math.floor(rng() * animals.length)], x = animal.x, z = animal.z
    animal.x += rng() * 40 - 20; animal.z += rng() * 40 - 20
    index.relocate(animal, x, z)
    for (const point of [animal, { x, z }]) {
      expect(index.firstWithin(point.x, point.z, 5)).toBe(animals.find(other => Math.hypot(other.x - point.x, other.z - point.z) < 5))
    }
  }
  const ordered = [{ x: -5, z: -5 }, { x: 5, z: 5 }], together = new SpatialPoints(ordered)
  ordered[0].x = ordered[0].z = 5
  together.relocate(ordered[0], -5, -5)
  expect(together.firstWithin(5, 5, .1)).toBe(ordered[0])
})
