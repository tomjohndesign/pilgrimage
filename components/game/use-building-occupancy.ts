"use client"

import { useEffect, useState } from "react"
import { occupiedBuildingIds, sameIds } from "@/lib/game/building-occupancy"
import type { GameMap } from "@/lib/game/map/types"
import { simRegistry } from "@/lib/game/sim"

/** Poll the running sim, like the HUD does, and only re-render when a building
 * gains or loses its last resident, worker or keeper. */
export function useOccupiedBuildings(map: GameMap): ReadonlySet<string> {
  const [occupied, setOccupied] = useState<ReadonlySet<string>>(() => occupiedBuildingIds(simRegistry.current, map))
  useEffect(() => {
    const read = () => setOccupied(previous => {
      const next = occupiedBuildingIds(simRegistry.current, map)
      return sameIds(previous, next) ? previous : next
    })
    read()
    const timer = setInterval(read, 500)
    return () => clearInterval(timer)
  }, [map])
  return occupied
}
