"use client"

import { useEffect, useRef } from "react"
import { useFrame } from "@react-three/fiber"
import * as THREE from "three"
import { createAdmissionAudio } from "@/lib/game/admission-audio"
import { paymentLabel } from "@/lib/game/render/payment-label"
import { CHARACTER_PIXEL_SIZE } from "@/lib/game/render/pixel-scale"
import { useSimulationStore } from "@/lib/game/simulation-store"
import type { SimState } from "@/lib/game/sim"

const LIFETIME = 2
const POOL_SIZE = 32
type Floater = { sprite: THREE.Sprite; age: number; baseY: number }

/** A receipt appears at its payer, rises and fades; historical receipts stay silent. */
export function AdmissionEffects({ sim, characterScale }: { sim: SimState; characterScale: number }) {
  const group = useRef<THREE.Group>(null)
  const state = useRef<{ seen: number; floaters: Floater[]; audio: ReturnType<typeof createAdmissionAudio> } | null>(null)

  useEffect(() => {
    const root = group.current!
    const audio = createAdmissionAudio()
    const floaters = Array.from({ length: POOL_SIZE }, () => {
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthTest: false, depthWrite: false, toneMapped: false }))
      sprite.name = "admission-payment"
      sprite.visible = false
      sprite.renderOrder = 1000
      sprite.raycast = () => {}
      root.add(sprite)
      return { sprite, age: LIFETIME, baseY: 0 }
    })
    state.current = { seen: sim.admissionSequence, floaters, audio }
    window.addEventListener("pointerdown", audio.unlock)
    window.addEventListener("keydown", audio.unlock)
    return () => {
      window.removeEventListener("pointerdown", audio.unlock)
      window.removeEventListener("keydown", audio.unlock)
      audio.dispose()
      for (const { sprite } of floaters) { root.remove(sprite); sprite.material.map?.dispose(); sprite.material.dispose() }
      state.current = null
    }
  }, [sim])

  useFrame((_, delta) => {
    const live = state.current
    if (!live) return
    const playback = useSimulationStore.getState()
    const dt = playback.paused ? 0 : Math.min(delta, 0.1) * playback.speed
    for (const floater of live.floaters) {
      floater.age += dt
      floater.sprite.visible = floater.age < LIFETIME
      floater.sprite.position.y = floater.baseY + floater.age * 0.55
      floater.sprite.material.opacity = Math.min(1, Math.max(0, (LIFETIME - floater.age) / 0.65))
    }
    for (const payment of sim.admissionPayments) {
      if (payment.id <= live.seen) continue
      live.seen = payment.id
      const floater = live.floaters.find(f => f.age >= LIFETIME) ?? live.floaters.reduce((a, b) => a.age > b.age ? a : b)
      floater.age = 0
      floater.baseY = payment.y + 0.9 * characterScale
      const texture = paymentLabel(payment.amount)
      floater.sprite.material.map?.dispose()
      floater.sprite.material.map = texture
      floater.sprite.material.needsUpdate = true
      floater.sprite.material.opacity = 1
      floater.sprite.scale.set(texture.image.width * CHARACTER_PIXEL_SIZE * characterScale, texture.image.height * CHARACTER_PIXEL_SIZE * characterScale, 1)
      floater.sprite.position.set(payment.x, floater.baseY, payment.z)
      floater.sprite.visible = true
      floater.sprite.userData.amount = payment.amount
      live.audio.play()
    }
  }, -2)

  return <group ref={group} name="admission-effects" />
}
