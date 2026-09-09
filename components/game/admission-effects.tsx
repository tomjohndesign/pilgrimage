"use client"

import { useEffect, useRef } from "react"
import { useFrame } from "@react-three/fiber"
import * as THREE from "three"
import { createAdmissionAudio } from "@/lib/game/admission-audio"
import { sceneryDetail } from "@/lib/game/render/scenery-detail"
import { isWorldVisible } from "@/lib/game/render/visibility"
import { createPaymentFloaters, PAYMENT_LIFETIME } from "@/lib/game/render/payment-floaters"
import { useSimulationStore } from "@/lib/game/simulation-store"
import type { RelicProcession } from "@/lib/game/relic-procession"
import type { SimState } from "@/lib/game/sim"

export function AdmissionEffects({ sim, characterScale }: { sim: SimState; characterScale: number }) {
  return <FloatingEffects source={sim} characterScale={characterScale} />
}

export function PietyEffects({ procession, characterScale }: { procession: RelicProcession; characterScale: number }) {
  return <FloatingEffects source={procession} characterScale={characterScale} />
}

/** Stat gains share the same pixel lettering, rise and fade; only payments chime. */
function FloatingEffects({ source, characterScale }: { source: SimState | RelicProcession; characterScale: number }) {
  const piety = "blessings" in source
  const group = useRef<THREE.Group>(null)
  const state = useRef<{ seen: number; floaters: ReturnType<typeof createPaymentFloaters>; audio: ReturnType<typeof createAdmissionAudio> | null } | null>(null)

  useEffect(() => {
    const root = group.current!
    const audio = piety ? null : createAdmissionAudio()
    const floaters = createPaymentFloaters(root, piety ? "piety-gain" : "admission-payment")
    state.current = { seen: "blessings" in source ? source.blessingSequence : source.admissionSequence, floaters, audio }
    if (audio) {
      window.addEventListener("pointerdown", audio.unlock)
      window.addEventListener("keydown", audio.unlock)
    }
    return () => {
      if (audio) {
        window.removeEventListener("pointerdown", audio.unlock)
        window.removeEventListener("keydown", audio.unlock)
        audio.dispose()
      }
      floaters.dispose()
      state.current = null
    }
  }, [source, piety])

  useFrame(({ scene }, delta) => {
    const live = state.current
    if (!live || !group.current) return
    if (sceneryDetail(scene) > 0 || !isWorldVisible(group.current.parent)) {
      if (group.current.visible) live.floaters.step(PAYMENT_LIFETIME)
      group.current.visible = false
      live.seen = "blessings" in source ? source.blessingSequence : source.admissionSequence
      return
    }
    group.current.visible = true
    const playback = useSimulationStore.getState()
    const dt = playback.paused ? 0 : Math.min(delta, 0.1) * playback.speed
    live.floaters.step(dt)
    for (const payment of ("blessings" in source ? source.blessings : source.admissionPayments)) {
      if (payment.id <= live.seen) continue
      live.seen = payment.id
      live.floaters.show(piety ? { ...payment, resource: "cross" } : payment, characterScale)
      live.audio?.play()
    }
  }, -2)

  return <group ref={group} name={piety ? "piety-effects" : "admission-effects"} />
}
