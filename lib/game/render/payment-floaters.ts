import * as THREE from "three"
import { CHARACTER_PIXEL_SIZE } from "./pixel-scale"
import { paymentLabel } from "./payment-label"

export const PAYMENT_LIFETIME = 2
export interface FloatingPayment { x: number; y: number; z: number; amount: number; resource?: "gold" | "wood" | "cross"; row?: number }

/** Shared sprite pool, rise and fade for income, piety gains and construction costs. */
export function createPaymentFloaters(root: THREE.Group, name: string, size = 32) {
  const floaters = Array.from({ length: size }, () => {
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthTest: false, depthWrite: false, toneMapped: false }))
    sprite.name = name
    sprite.visible = false
    sprite.renderOrder = 1000
    sprite.raycast = () => {}
    root.add(sprite)
    return { sprite, age: PAYMENT_LIFETIME, baseY: 0 }
  })
  return {
    step(dt: number) {
      for (const floater of floaters) {
        floater.age += dt
        floater.sprite.visible = floater.age < PAYMENT_LIFETIME
        floater.sprite.position.y = floater.baseY + floater.age * 0.55
        floater.sprite.material.opacity = Math.min(1, Math.max(0, (PAYMENT_LIFETIME - floater.age) / 0.65))
      }
    },
    show(payment: FloatingPayment, characterScale: number) {
      const floater = floaters.find(f => f.age >= PAYMENT_LIFETIME) ?? floaters.reduce((a, b) => a.age > b.age ? a : b)
      floater.age = 0
      floater.baseY = payment.y + 0.9 * characterScale + (payment.row ?? 0) * 0.32 * characterScale
      const texture = paymentLabel(payment.amount, payment.resource)
      floater.sprite.material.map?.dispose()
      floater.sprite.material.map = texture
      floater.sprite.material.needsUpdate = true
      floater.sprite.material.opacity = 1
      floater.sprite.scale.set(texture.image.width * CHARACTER_PIXEL_SIZE * characterScale, texture.image.height * CHARACTER_PIXEL_SIZE * characterScale, 1)
      floater.sprite.position.set(payment.x, floater.baseY, payment.z)
      floater.sprite.visible = true
      floater.sprite.userData.amount = payment.amount
      floater.sprite.userData.resource = payment.resource
    },
    dispose() {
      for (const { sprite } of floaters) { root.remove(sprite); sprite.material.map?.dispose(); sprite.material.dispose() }
    },
  }
}
