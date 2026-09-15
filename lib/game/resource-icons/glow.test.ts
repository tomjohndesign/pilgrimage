import { expect, it } from "vitest"
import { glowIcon } from "./glow"

it("adds translucent light without changing the artwork or filling transparent margins", () => {
  const size = 32, source = new Uint8ClampedArray(size * size * 4), center = (16 * size + 16) * 4
  source.set([140, 100, 60, 255], center)
  const result = glowIcon(source, size, .7)
  expect([...result.slice(center, center + 4)]).toEqual([140, 100, 60, 255])
  expect(result[center + 7]).toBeGreaterThan(0)
  expect(result[center + 7]).toBeLessThan(255)
  expect(result[center + 7]).toBeGreaterThan(result[center + 15])
  expect(result[3]).toBe(0)
  expect(source[center + 7]).toBe(0)
  expect(glowIcon(source, size, 0)).toEqual(source)
})

it("keeps a restrained halo close to the silhouette", () => {
  const size = 32, source = new Uint8ClampedArray(size * size * 4), center = (16 * size + 16) * 4
  source.set([180, 140, 70, 255], center)
  const result = glowIcon(source, size, .35, 2)
  expect(result[center + 7]).toBeGreaterThan(0)
  expect(result[center + 7]).toBeLessThan(50)
  expect(result[center + 15]).toBe(0)
  expect([...result.slice(center, center + 4)]).toEqual([180, 140, 70, 255])
})
