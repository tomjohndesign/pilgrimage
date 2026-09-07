"use client"

import { useRef, useState } from "react"
import { useFrame } from "@react-three/fiber"
import { useCameraStore } from "@/lib/game/camera-store"
import { unitInterior } from "@/lib/game/building-interior"
import type { GameMap } from "@/lib/game/map/types"
import { monkPositionRegistry } from "@/lib/game/monks"
import { simRegistry } from "@/lib/game/sim"

/** Follow moving units; only entering/leaving an interior triggers a render. */
export function useUnitInterior(map: GameMap) {
  const [interior, setInterior] = useState<string | null>(null)
  const previous = useRef<string | null>(null)
  useFrame(() => {
    const selection = useCameraStore.getState().selection
    const unit = selection?.kind === "traveler" ? simRegistry.current?.travelers.get(selection.id)
      : selection?.kind === "monk" ? monkPositionRegistry.current?.get(selection.id) : undefined
    const next = unitInterior(map, unit)
    if (next !== previous.current) { previous.current = next; setInterior(next) }
  })
  return interior
}
