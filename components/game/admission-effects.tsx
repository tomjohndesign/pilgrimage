"use client"

import { useEffect, useRef } from "react"
import { useFrame } from "@react-three/fiber"
import * as THREE from "three"
import { createAdmissionAudio } from "@/lib/game/admission-audio"
import { createPaymentFloaters } from "@/lib/game/render/payment-floaters"
import { useSimulationStore } from "@/lib/game/simulation-store"
import type { SimState } from "@/lib/game/sim"

/** A receipt appears at its payer, rises and fades; historical receipts stay silent. */
export function AdmissionEffects({ sim, characterScale }: { sim: SimState; characterScale: number }) {
  const group = useRef<THREE.Group>(null)
  const state = useRef<{ seen: number; floaters: ReturnType<typeof createPaymentFloaters>; audio: ReturnType<typeof createAdmissionAudio> } | null>(null)

  useEffect(() => {
    const root = group.current!
    const audio = createAdmissionAudio()
    const floaters = createPaymentFloaters(root, "admission-payment")
    state.current = { seen: sim.admissionSequence, floaters, audio }
    window.addEventListener("pointerdown", audio.unlock)
    window.addEventListener("keydown", audio.unlock)
    return () => {
      window.removeEventListener("pointerdown", audio.unlock)
      window.removeEventListener("keydown", audio.unlock)
      audio.dispose()
      floaters.dispose()
      state.current = null
    }
  }, [sim])

  useFrame((_, delta) => {
    const live = state.current
    if (!live) return
    const playback = useSimulationStore.getState()
    const dt = playback.paused ? 0 : Math.min(delta, 0.1) * playback.speed
    live.floaters.step(dt)
    for (const payment of sim.admissionPayments) {
      if (payment.id <= live.seen) continue
      live.seen = payment.id
      live.floaters.show(payment, characterScale)
      live.audio.play()
    }
  }, -2)

  return <group ref={group} name="admission-effects" />
}
