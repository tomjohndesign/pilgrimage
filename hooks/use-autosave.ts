"use client"

import { useEffect, useRef } from "react"

import type { GameMap } from "@/lib/game/map/types"
import { captureGame } from "@/lib/game/save/capture"
import type { DisplaySettings, WorldSettings } from "@/lib/game/save/settings"
import { storeGameSave } from "@/lib/game/save/storage"
import type { Settlement } from "@/lib/game/settlement"
import { simRegistry } from "@/lib/game/sim"

export const AUTOSAVE_INTERVAL_MS = 5000

/**
 * Keep the browser's save slot current while a world is being played: a few
 * times a minute, and the moment the tab is hidden or the page goes away.
 * Nothing is written unless the running simulation belongs to the map on
 * screen, so a world in the middle of being replaced never overwrites the
 * save with a half-built one.
 */
export function useAutosave(input: {
  enabled: boolean
  seed: number | null
  settings: WorldSettings & Pick<DisplaySettings, "treeModel">
  settlement: Settlement
  road: GameMap["road"] | undefined
}): void {
  const latest = useRef(input)
  latest.current = input
  const { enabled } = input

  useEffect(() => {
    if (!enabled) return
    const save = () => {
      const { seed, settings, settlement, road } = latest.current
      const sim = simRegistry.current
      if (seed === null || !sim || !road || sim.world.road !== road) return
      storeGameSave(captureGame({ seed, settings, settlement, sim }))
    }
    const whenHidden = () => { if (document.visibilityState === "hidden") save() }
    const timer = window.setInterval(save, AUTOSAVE_INTERVAL_MS)
    window.addEventListener("pagehide", save)
    document.addEventListener("visibilitychange", whenHidden)
    return () => {
      window.clearInterval(timer)
      window.removeEventListener("pagehide", save)
      document.removeEventListener("visibilitychange", whenHidden)
    }
  }, [enabled])
}
