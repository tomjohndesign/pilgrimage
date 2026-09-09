"use client"

import { useMemo } from "react"
import { WATER_SOURCE_ATLAS, WATER_SOURCE_FRAME, WATER_SOURCE_KINDS, type WaterSourcePlacement } from "@/lib/game/water-sources/assets"
import { ScenerySpriteField } from "./environment-sprites"
import { SceneAssetBoundary } from "./scene-assets"

/** Shared scenery sprites for placed water sources and the asset gallery. */
export function WaterSources({ placements }: { placements: (WaterSourcePlacement & { idColor?: readonly [number, number, number] })[] }) {
  const sprites = useMemo(() => placements.map(p => ({ ...p, yaw: -p.yaw, brightness: 1, row: WATER_SOURCE_KINDS.indexOf(p.kind) })), [placements])
  return <SceneAssetBoundary><ScenerySpriteField placements={sprites} atlas={WATER_SOURCE_ATLAS} frame={WATER_SOURCE_FRAME} /></SceneAssetBoundary>
}
