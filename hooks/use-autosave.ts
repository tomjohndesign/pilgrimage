"use client"

import { useEffect, useRef } from "react"

import type { GameMap } from "@/lib/game/map/types"
import { captureGame } from "@/lib/game/save/capture"
import type { DisplaySettings, WorldSettings } from "@/lib/game/save/settings"
import { storeGameSave } from "@/lib/game/save/storage"
import { samePose, storeViewSnapshot, type ViewSnapshot } from "@/lib/game/save/view"
import type { Settlement } from "@/lib/game/settlement"
import { simRegistry } from "@/lib/game/sim"
import { viewSnapshotRegistry } from "@/components/game/view-snapshot"

export const AUTOSAVE_INTERVAL_MS = 5000
/** A picture from the same pose is retaken this often, to follow slow changes in the land. */
export const VIEW_SNAPSHOT_REFRESH_MS = 30000

/**
 * Keep the browser's save slot current while a world is being played: a few
 * times a minute, and the moment the tab is hidden or the page goes away.
 * Nothing is written unless the running simulation belongs to the map on
 * screen, so a world in the middle of being replaced never overwrites the
 * save with a half-built one.
 *
 * Each save also keeps the picture of the land under the camera that the
 * next reload paints first: whenever the camera has moved since the last one,
 * else now and then. The periodic picture is taken by the next frame's own
 * render; the final one, as the page goes away, renders a frame to get it.
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
    let pictured: { camera: ViewSnapshot["camera"]; at: number } | null = null
    const save = (leaving: boolean) => {
      const { seed, settings, settlement, road } = latest.current
      const sim = simRegistry.current
      if (seed === null || !sim || !road || sim.world.road !== road) return
      const saved = captureGame({ seed, settings, settlement, sim })
      if (!storeGameSave(saved)) return
      const snapshots = viewSnapshotRegistry.current
      if (!snapshots) return
      // A new world restarts this effect, so only the pose and age can make it stale.
      if (!leaving && pictured && samePose(pictured.camera, saved.camera) && Date.now() - pictured.at < VIEW_SNAPSHOT_REFRESH_MS) return
      const keep = (view: ViewSnapshot | null) => {
        if (view && storeViewSnapshot(view)) pictured = { camera: view.camera, at: Date.now() }
      }
      if (leaving) keep(snapshots.now(saved.world))
      else snapshots.request(saved.world, keep)
    }
    const periodic = () => save(false)
    const final = () => save(true)
    const whenHidden = () => { if (document.visibilityState === "hidden") final() }
    const timer = window.setInterval(periodic, AUTOSAVE_INTERVAL_MS)
    window.addEventListener("pagehide", final)
    document.addEventListener("visibilitychange", whenHidden)
    return () => {
      window.clearInterval(timer)
      window.removeEventListener("pagehide", final)
      document.removeEventListener("visibilitychange", whenHidden)
    }
  }, [enabled])
}
