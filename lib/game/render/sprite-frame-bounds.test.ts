import { expect, it } from "vitest"
import * as THREE from "three"
import { spriteFrameBounds } from "./sprite-frame-bounds"

it("measures only the current pose, preserving atlas orientation and depth bytes", () => {
  const data = new Uint8Array(8 * 4 * 4)
  const pixel = (x: number, y: number, packed: number) => data.set([packed >> 8, packed & 255, 255, 255], (y * 8 + x) * 4)
  pixel(1, 0, 49151); pixel(2, 2, 32768); pixel(7, 3, 65534)
  const texture = new THREE.DataTexture(data, 8, 4)
  texture.flipY = true
  const frame = { x: .5, y: 1, z: 0, w: 0 }, bounds = spriteFrameBounds(texture, frame)
  expect(bounds).toMatchObject({ left: .25, right: .75, bottom: .25, top: 1 })
  expect(bounds.near).toBeCloseTo(-.5, 4); expect(bounds.far).toBeCloseTo(0, 4)
  expect(spriteFrameBounds(texture, frame)).toBe(bounds)
  expect(spriteFrameBounds(texture, { ...frame, z: .5 }).near).toBeLessThan(-.99)
  pixel(0, 3, 16384); texture.needsUpdate = true
  expect(spriteFrameBounds(texture, frame)).toMatchObject({ left: 0, bottom: 0 })
  texture.dispose()
})

it("does not treat a transparent frame as a full-size occluder", () => {
  const texture = new THREE.DataTexture(new Uint8Array(4 * 4 * 4), 4, 4)
  const bounds = spriteFrameBounds(texture, { x: 1, y: 1, z: 0, w: 0 })
  expect(bounds.right).toBeLessThanOrEqual(bounds.left)
  expect(bounds.top).toBeLessThanOrEqual(bounds.bottom)
  texture.dispose()
})
