"use client"

import dynamic from "next/dynamic"
import { useEffect, useMemo, useState } from "react"

import { useCameraStore } from "@/lib/game/camera-store"
import { loadSavedSeed } from "@/lib/game/seed-storage"
import {
  DEFAULT_CLUSTER_COUNT,
  DEFAULT_FOREST_COVERAGE,
  DEFAULT_GROVE_COUNT,
  DEFAULT_MAP_WIDTH,
  generateMap,
} from "@/lib/game/map/generate-map"

import { GameHud } from "./game-hud"
import { MusicPlayer } from "./music-player"
import { DEFAULT_TREE_DENSITY } from "./trees"

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
  /** % of the map covered by large forest clusters. */
  coverage: number
  /** How many large clusters that coverage is split across. */
  clusters: number
  /** Number of small scattered groves. */
  groves: number
  /** Trees drawn per forest tile. */
  treeDensity: number
}

export const DEFAULT_SETTINGS: MapSettings = {
  size: DEFAULT_MAP_WIDTH,
  coverage: Math.round(DEFAULT_FOREST_COVERAGE * 100),
  clusters: DEFAULT_CLUSTER_COUNT,
  groves: DEFAULT_GROVE_COUNT,
  treeDensity: DEFAULT_TREE_DENSITY,
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
      clusters: String(settings.clusters),
      groves: String(settings.groves),
      trees: String(settings.treeDensity),
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
            clusterCount: settings.clusters,
            groveCount: settings.groves,
          }),
    [seed, settings.size, settings.coverage, settings.clusters, settings.groves],
  )

  // The camera's pan clamp follows the loaded map's extent.
  useEffect(() => {
    if (map) useCameraStore.getState().setMapSize(map.width, map.depth)
  }, [map])

  return (
    <div className="fixed inset-0 overflow-hidden bg-[#14100a] select-none">
      {map ? (
        <GameCanvas map={map} treeDensity={settings.treeDensity} />
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
        settings={settings}
        onSettingsChange={setSettings}
        onReroll={() => setSeed(randomSeed())}
        onSeedChange={setSeed}
      />
      <MusicPlayer />
    </div>
  )
}
