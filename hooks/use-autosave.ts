"use client"

import { useEffect, useRef } from "react"

import type { GameMap } from "@/lib/game/map/types"
import { captureGame } from "@/lib/game/save/capture"
import type { DisplaySettings, WorldSettings } from "@/lib/game/save/settings"
import { storeGameSave } from "@/lib/game/save/storage"
import { samePose, storeViewSnapshot, type ViewSnapshot } from "@/lib/game/save/view"
import type { Settlement } from "@/lib/game/settlement"
import { simRegistry, type SimState } from "@/lib/game/sim"
import { useCameraStore } from "@/lib/game/camera-store"
import { useSimulationStore } from "@/lib/game/simulation-store"
import { viewSnapshotRegistry } from "@/components/game/view-snapshot"

export const AUTOSAVE_INTERVAL_MS = 5000
/** A picture from the same pose is retaken this often, to follow slow changes in the land. */
export const VIEW_SNAPSHOT_REFRESH_MS = 30000

/**
 * Keep the browser's save slot current while a world is being played: a few
 * times a minute, the moment the tab is hidden or the page goes away, and
 * when the game itself closes (an in-app link, Stop, or a new world), which
 * fires neither page event. Nothing is written unless the running simulation
 * belongs to the map on screen, so a world in the middle of being replaced
 * never overwrites the save with a half-built one.
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
  // The world's sim as last seen open: the canvas may drop it from the
  // registry before the closing save below runs.
  const open = useRef<{ road: GameMap["road"] | undefined; sim: SimState | null } | null>(null)
  if (input.enabled) open.current = { road: input.road, sim: simRegistry.current }
  const { enabled } = input

  useEffect(() => {
    if (!enabled) return
    let pictured: { camera: ViewSnapshot["camera"]; at: number } | null = null
    // What the last leaving save wrote; a second one with nothing changed is skipped.
    let left: unknown[] | null = null
    const save = (leaving: boolean, source = latest.current, fallbackSim: SimState | null = null) => {
      const { seed, settings, settlement, road } = source
      const sim = [simRegistry.current, fallbackSim].find(candidate => candidate && road && candidate.world.road === road)
      if (seed === null || !sim || !road) return
      const state = [sim, sim.time, seed, settings, settlement, road, useCameraStore.getState(), useSimulationStore.getState()]
      if (leaving && left && state.every((value, index) => value === left![index])) return
      left = null
      const saved = captureGame({ seed, settings, settlement, sim })
      if (!storeGameSave(saved)) return
      if (leaving) left = state
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
    const whenHidden = () => {
      if (document.visibilityState === "hidden") final()
      else left = null
    }
    const timer = window.setInterval(periodic, AUTOSAVE_INTERVAL_MS)
    window.addEventListener("pagehide", final)
    document.addEventListener("visibilitychange", whenHidden)
    return () => {
      window.clearInterval(timer)
      window.removeEventListener("pagehide", final)
      document.removeEventListener("visibilitychange", whenHidden)
      // The game is closing inside the app (a link, Stop). A world being
      // replaced by another is abandoned instead, so it is not written over
      // the next one; the usual guard still holds. StrictMode's mount-time
      // rerun never reaches here, since the world opens after mounting.
      const last = open.current
      if (!last || latest.current.road !== last.road) return
      try {
        save(true, latest.current, last.sim)
      } catch {
        /* A renderer already torn down must not break navigation. */
      }
    }
  }, [enabled])
}
