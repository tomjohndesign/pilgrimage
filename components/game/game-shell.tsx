"use client"

import dynamic from "next/dynamic"
import { useEffect, useMemo, useState } from "react"

import { useCameraStore } from "@/lib/game/camera-store"
import { loadSavedSeed } from "@/lib/game/seed-storage"
import { generateTravelers } from "@/lib/game/travelers"
import {
  DEFAULT_CLEARING_COUNT,
  DEFAULT_DARK_FOREST_COUNT,
  DEFAULT_FOREST_COVERAGE,
  DEFAULT_GLADE_COUNT,
  DEFAULT_MAP_WIDTH,
  generateMap,
} from "@/lib/game/map/generate-map"

import { GameHud } from "./game-hud"
import { MusicPlayer } from "./music-player"

/**
 * WebGL has no meaningful server render, and three.js touches browser globals on
 * import, so the canvas is client-only. The HUD is plain DOM and renders normally.
 */
const GameCanvas = dynamic(() => import("./game-canvas").then((m) => m.GameCanvas), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center">
      <span className="font-display text-[10px] uppercase tracking-[3px] text-gold">
        Surveying the land…
      </span>
    </div>
  ),
})

/** Map tuning knobs, in HUD units (coverage is a percentage for URL cleanliness). */
export interface MapSettings {
  /** Map edge length in tiles; maps are square. */
  size: number
  /** % of the map left as forest after the glades are carved. */
  coverage: number
  /** Number of open grass glades carved out of the forest. */
  glades: number
  /** Number of small forest-floor clearings scattered through the woods. */
  clearings: number
  /** How many dark forests stand in the road's way. */
  darkForests: number
  /** How many travelers walk the road — the traffic level. */
  traffic: number
  /** Base walking speed in tiles per second. */
  walkSpeed: number
}

export const DEFAULT_SETTINGS: MapSettings = {
  size: DEFAULT_MAP_WIDTH,
  coverage: Math.round(DEFAULT_FOREST_COVERAGE * 100),
  glades: DEFAULT_GLADE_COUNT,
  clearings: DEFAULT_CLEARING_COUNT,
  darkForests: DEFAULT_DARK_FOREST_COUNT,
  traffic: 12,
  walkSpeed: 1.5,
}

/**
 * Picking a seed is the one legitimate use of Math.random(): it happens outside
 * the simulation, and everything downstream is deterministic in the result.
 */
function randomSeed(): number {
  return Math.floor(Math.random() * 2 ** 31)
}

export function GameShell({
  initialSeed,
  initialSettings,
}: {
  initialSeed?: number
  initialSettings?: Partial<MapSettings>
}) {
  // With no ?seed= in the URL the seed is chosen client-side in an effect, so
  // the server and client never render from different seeds.
  const [seed, setSeed] = useState<number | null>(initialSeed ?? null)
  const [settings, setSettings] = useState<MapSettings>({
    ...DEFAULT_SETTINGS,
    ...initialSettings,
  })

  useEffect(() => {
    // A seed the player saved takes precedence over a random roll, but never
    // over one named in the URL (that arrives via initialSeed).
    if (seed === null) setSeed(loadSavedSeed() ?? randomSeed())
  }, [seed])

  // Keep seed and tuning in the URL so any map can be bookmarked and revisited.
  useEffect(() => {
    if (seed === null) return
    const query = new URLSearchParams({
      seed: String(seed),
      size: String(settings.size),
      forest: String(settings.coverage),
      glades: String(settings.glades),
      clearings: String(settings.clearings),
      dark: String(settings.darkForests),
      traffic: String(settings.traffic),
      speed: String(settings.walkSpeed),
    })
    window.history.replaceState(null, "", `?${query}`)
  }, [seed, settings])

  const map = useMemo(
    () =>
      seed === null
        ? null
        : generateMap({
            seed,
            width: settings.size,
            depth: settings.size,
            forestCoverage: settings.coverage / 100,
            gladeCount: settings.glades,
            clearingCount: settings.clearings,
            darkForestCount: settings.darkForests,
          }),
    [
      seed,
      settings.size,
      settings.coverage,
      settings.glades,
      settings.clearings,
      settings.darkForests,
    ],
  )

  // Identities live outside the canvas so the HUD can name whoever is selected.
  const travelers = useMemo(
    () => (seed === null ? [] : generateTravelers(seed, settings.traffic)),
    [seed, settings.traffic],
  )

  // The camera's pan clamp follows the loaded map's extent.
  useEffect(() => {
    if (map) useCameraStore.getState().setMapSize(map.width, map.depth)
  }, [map])

  // A new cast of travelers invalidates whoever was selected.
  useEffect(() => {
    useCameraStore.getState().selectTraveler(null)
  }, [travelers])

  return (
    <div className="fixed inset-0 overflow-hidden bg-[#14100a] select-none">
      {map ? (
        <GameCanvas map={map} travelers={travelers} walkSpeed={settings.walkSpeed} />
      ) : (
        <div className="flex h-full w-full items-center justify-center">
          <span className="font-display text-[10px] uppercase tracking-[3px] text-gold">
            Surveying the land…
          </span>
        </div>
      )}
      <GameHud
        map={map}
        seed={seed}
        travelers={travelers}
        settings={settings}
        onSettingsChange={setSettings}
        onReroll={() => setSeed(randomSeed())}
        onSeedChange={setSeed}
      />
      <MusicPlayer />
    </div>
  )
}
