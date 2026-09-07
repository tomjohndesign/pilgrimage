import { expect, it, vi } from "vitest"
import * as THREE from "three"
import { createPaymentFloaters } from "./payment-floaters"
import { paymentLabel } from "./payment-label"

it("uses distinct red resource icons while retaining golden income and piety labels", () => {
  const income = paymentLabel(45), gold = paymentLabel(45, "gold"), wood = paymentLabel(35, "wood"), piety = paymentLabel(45, "cross")
  const colors = (texture: THREE.DataTexture) => {
    const pixels = texture.image.data!
    return Array.from({ length: pixels.length / 4 }, (_, i) => Array.from(pixels.slice(i * 4, i * 4 + 4)).join(","))
  }
  for (const texture of [income, piety]) {
    expect(colors(texture)).toContain("255,216,106,255")
    expect(colors(texture)).not.toContain("255,108,96,255")
  }
  expect(piety.image.data).not.toEqual(income.image.data)
  for (const texture of [gold, wood]) {
    expect(colors(texture)).toContain("255,108,96,255")
    expect(colors(texture)).not.toContain("255,216,106,255")
    expect(texture.magFilter).toBe(THREE.NearestFilter)
  }
  expect(gold.image.width).not.toBe(wood.image.width)
  for (const texture of [income, gold, wood, piety]) texture.dispose()
})

it("rises, fades and reuses receipts with a fresh opacity and texture", () => {
  const root = new THREE.Group(), pool = createPaymentFloaters(root, "test-payment", 1)
  pool.show({ x: 1, y: 2, z: 3, amount: 5 }, 1.5)
  const sprite = root.children[0] as THREE.Sprite
  const startY = sprite.position.y, dispose = vi.spyOn(sprite.material.map!, "dispose")
  pool.step(1.5)
  expect(sprite.position.y).toBeCloseTo(startY + 1.5 * 0.55)
  expect(sprite.material.opacity).toBeGreaterThan(0)
  expect(sprite.material.opacity).toBeLessThan(1)
  pool.show({ x: 4, y: 2, z: 6, amount: 35, resource: "wood" }, 1.5)
  expect(dispose).toHaveBeenCalledOnce()
  expect(sprite.position.y).toBeCloseTo(startY)
  expect(sprite.material.opacity).toBe(1)
  expect(sprite.userData).toMatchObject({ amount: 35, resource: "wood" })
  pool.step(2)
  expect(sprite.visible).toBe(false)
  pool.dispose()
  expect(root.children).toHaveLength(0)
})
