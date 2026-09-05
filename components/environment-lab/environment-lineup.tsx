"use client"

import { useEffect, useMemo, useRef, useState } from "react"

import { EnvironmentField } from "@/components/game/environment"
import { PreviewCanvas } from "@/components/preview-canvas"
import { ENVIRONMENT_KINDS, type EnvironmentPlacement } from "@/lib/game/environment/elements"

/** Three variations of each ground detail in the same lighting as the map. */
export function EnvironmentLineup({ seed, view }: { seed: number; view: number }) {
  const container = useRef<HTMLDivElement>(null)
  const [zoom, setZoom] = useState(54)
  useEffect(() => {
    if (!container.current) return
    const observer = new ResizeObserver(([entry]) => setZoom(Math.min(54, entry.contentRect.width / 11.5)))
    observer.observe(container.current)
    return () => observer.disconnect()
  }, [])
  const placements = useMemo<EnvironmentPlacement[]>(() => ENVIRONMENT_KINDS.flatMap((kind, i) =>
    [0, 1, 2].map((variant) => ({
      kind, x: (i - (ENVIRONMENT_KINDS.length - 1) / 2) * 1.65, y: 0.05, z: (variant - 1) * 1.25,
      scale: 0.8 + variant * 0.1, yaw: variant * 1.7, brightness: 1,
      seed: seed + i * 31 + variant * 7,
    })),
  ), [seed])
  return (
    <div ref={container} className="h-full w-full">
      <PreviewCanvas zoom={zoom} view={view}>
        <mesh position={[0, -0.04, 0]}>
          <boxGeometry args={[ENVIRONMENT_KINDS.length * 1.65 + 0.25, 0.18, 4]} />
          <meshLambertMaterial color="#77864b" />
        </mesh>
        <EnvironmentField placements={placements} />
      </PreviewCanvas>
    </div>
  )
}
