"use client"

import { TerrainTiles } from "../game/terrain-tiles"
import type { GameMap } from "@/lib/game/map/types"

import { Suspense, useEffect, useMemo, useRef, useState } from "react"

import { EnvironmentField } from "@/components/game/environment"
import { PreviewCanvas } from "@/components/preview-canvas"
import { BOULDER_SIZES, ENVIRONMENT_KINDS, type EnvironmentPlacement } from "@/lib/game/environment/elements"

const GROUND: GameMap = { width: 20, depth: 9, buildings: [], tiles: Array(180).fill("grass") }

const SPECIMENS = [
  ...ENVIRONMENT_KINDS.map((kind, i) => ({ kind, x: i * 1.65 - 7, boulderSize: undefined })),
  ...BOULDER_SIZES.map((boulderSize, i) => ({ kind: "boulder" as const, x: 4.5 + i * 2.8, boulderSize })),
]

/** Three variations of each ground detail in the same lighting as the map. */
export function EnvironmentLineup({ seed, view }: { seed: number; view: number }) {
  const container = useRef<HTMLDivElement>(null)
  const [zoom, setZoom] = useState(40)
  useEffect(() => {
    if (!container.current) return
    const observer = new ResizeObserver(([entry]) => setZoom(Math.min(40, entry.contentRect.width / 19)))
    observer.observe(container.current)
    return () => observer.disconnect()
  }, [])
  const placements = useMemo<EnvironmentPlacement[]>(() => SPECIMENS.flatMap(({ kind, x, boulderSize }, i) =>
    [0, 1, 2].map((variant) => ({
      kind, x, boulderSize, y: 0.05, z: (variant - 1) * (boulderSize ? 2.5 : 1.25),
      scale: 0.8 + variant * 0.1, yaw: variant * 1.7, brightness: 1,
      seed: seed + i * 31 + variant * 7,
    })),
  ), [seed])
  return (
    <div ref={container} className="h-full w-full">
      <PreviewCanvas zoom={zoom} view={view}>
        <Suspense fallback={null}><group position={[0, -.15, 0]}><TerrainTiles map={GROUND} showGrid vegetation={false} slab={false} /></group></Suspense>
        <EnvironmentField placements={placements} />
      </PreviewCanvas>
    </div>
  )
}
